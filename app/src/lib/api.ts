export interface MarketplaceStatus {
  cluster: string;
  auctionProgramConfigured: boolean;
  bidIndexerEnabled: boolean;
  cancellationAvailableInApp: boolean;
}

export interface SolanaRpcStatus {
  cluster: string;
  slot: string;
  genesisHash: string;
}

export interface WalletChallenge {
  nonce: string;
  message: string;
  expiresAt: string;
}

export interface WalletSession {
  walletAddress: string;
}

export interface ListingDraftInput {
  title: string;
  description: string;
  imageUrl: string;
  startingBidLamports: string;
  buyoutPriceLamports: string;
  minIncrementLamports: string;
  endsAt: string;
}

export interface ListingDraft extends Omit<ListingDraftInput, "imageUrl"> {
  id: string;
  ownerWallet: string;
  imageUrl: string | null;
  createdAt: string;
}

interface ApiErrorPayload {
  code?: string;
  message?: string;
  issues?: Array<{ field: string; message: string }>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly issues: Array<{ field: string; message: string }> = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(
      `The backend returned an unreadable response (${response.status}).`,
      response.status,
    );
  }

  if (!response.ok) {
    const error = payload as ApiErrorPayload;
    throw new ApiError(
      error.message ?? `Request failed (${response.status}).`,
      response.status,
      error.code,
      error.issues ?? [],
    );
  }

  return payload as T;
}

export const api = {
  getMarketplaceStatus(): Promise<MarketplaceStatus> {
    return request("/api/marketplace/status");
  },

  getSolanaStatus(): Promise<SolanaRpcStatus> {
    return request("/api/solana/status");
  },

  requestWalletChallenge(walletAddress: string): Promise<WalletChallenge> {
    return request("/api/auth/challenge", {
      method: "POST",
      body: JSON.stringify({ walletAddress }),
    });
  },

  verifyWalletSignature(
    walletAddress: string,
    nonce: string,
    signature: string,
  ): Promise<WalletSession> {
    return request("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ walletAddress, nonce, signature }),
    });
  },

  getWalletSession(): Promise<WalletSession> {
    return request("/api/auth/session");
  },

  logout(): Promise<void> {
    return request("/api/auth/logout", { method: "POST" });
  },

  listMyDrafts(): Promise<{ items: ListingDraft[] }> {
    return request("/api/listing-drafts");
  },

  createListingDraft(
    input: ListingDraftInput,
  ): Promise<{ item: ListingDraft }> {
    return request("/api/listing-drafts", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  getMyBids(): Promise<never> {
    return request("/api/me/bids");
  },
};
