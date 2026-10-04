import { createHash, randomBytes, randomUUID } from "node:crypto";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { createSolanaRpc } from "@solana/kit";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { z } from "zod";
import type { BackendConfig } from "./config.js";
import { MarketplaceDatabase, type ListingDraftInput } from "./database.js";

const SESSION_COOKIE = "ad_marketplace_session";
const NONCE_TTL_MS = 5 * 60 * 1000;
const MAX_U64 = (1n << 64n) - 1n;

const rpcUrl = (config: BackendConfig) => config.solanaRpcUrl;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function decodeWalletAddress(walletAddress: string): Uint8Array | null {
  try {
    const decoded = bs58.decode(walletAddress);
    return decoded.length === 32 && bs58.encode(decoded) === walletAddress
      ? decoded
      : null;
  } catch {
    return null;
  }
}

function parseU64(value: string): bigint | null {
  if (!/^(0|[1-9]\d*)$/.test(value)) return null;
  try {
    const amount = BigInt(value);
    return amount <= MAX_U64 ? amount : null;
  } catch {
    return null;
  }
}

function isValidU64(value: string): boolean {
  const amount = parseU64(value);
  return amount !== null && amount > 0n;
}

const walletAddressSchema = z.string().min(32).max(44);
const nonceBodySchema = z.object({ walletAddress: walletAddressSchema });
const verifyBodySchema = z.object({
  walletAddress: walletAddressSchema,
  nonce: z.string().min(32).max(64),
  signature: z.string().min(80).max(100),
});
const lamportsSchema = z
  .string()
  .max(20)
  .refine((value) => isValidU64(value), "Must be a positive u64 lamport value");
const draftSchema = z
  .object({
    title: z.string().trim().min(3).max(100),
    description: z.string().trim().max(3000),
    startingBidLamports: lamportsSchema,
    buyoutPriceLamports: lamportsSchema,
    minIncrementLamports: lamportsSchema,
    endsAt: z.string().datetime({ offset: true }),
  })
  .superRefine((draft, context) => {
    const startingBid = parseU64(draft.startingBidLamports);
    const buyoutPrice = parseU64(draft.buyoutPriceLamports);
    if (
      startingBid !== null &&
      buyoutPrice !== null &&
      buyoutPrice <= startingBid
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["buyoutPriceLamports"],
        message: "Buyout price must be greater than the starting bid",
      });
    }

    const endTime = Date.parse(draft.endsAt);
    if (!Number.isFinite(endTime) || endTime < Date.now() + 60_000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsAt"],
        message: "Auction must end at least one minute in the future",
      });
    }
  });

interface ServerDependencies {
  config: BackendConfig;
  database: MarketplaceDatabase;
}

interface AuthenticatedRequest extends FastifyRequest {
  authenticatedWallet: string | null;
}

function requireFrontendOrigin(
  config: BackendConfig,
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  if (request.headers.origin !== config.frontendOrigin) {
    reply.code(403).send({
      code: "UNTRUSTED_ORIGIN",
      message: "Request origin is not allowed.",
    });
    return false;
  }
  return true;
}

function authMessage(
  config: BackendConfig,
  walletAddress: string,
  nonce: string,
  issuedAt: Date,
  expiresAt: Date,
): string {
  return [
    "Ad Marketplace wallet sign-in",
    `Origin: ${config.frontendOrigin}`,
    `Wallet: ${walletAddress}`,
    `Cluster: ${config.solanaCluster}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
    `Expires At: ${expiresAt.toISOString()}`,
    "Purpose: Authenticate to save off-chain listing drafts.",
    "This message does not authorize a Solana transaction.",
  ].join("\n");
}

export function buildServer({
  config,
  database,
}: ServerDependencies): FastifyInstance {
  const app = Fastify({
    logger: config.nodeEnv !== "test",
    bodyLimit: 64 * 1024,
  });
  const rpc = createSolanaRpc(rpcUrl(config));

  app.decorateRequest("authenticatedWallet", null);
  app.addHook("onClose", async () => {
    database.close();
  });
  app.register(cors, {
    origin: config.frontendOrigin,
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
  });
  app.register(cookie);

  const requireWallet = async (
    request: AuthenticatedRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) {
      reply.code(401).send({
        code: "WALLET_SESSION_REQUIRED",
        message: "Sign in with your wallet to continue.",
      });
      return;
    }

    const walletAddress = database.getSessionWallet(
      hashToken(token),
      Date.now(),
    );
    if (!walletAddress) {
      reply.clearCookie(SESSION_COOKIE, { path: "/" });
      reply.code(401).send({
        code: "WALLET_SESSION_EXPIRED",
        message: "Wallet session is missing or expired.",
      });
      return;
    }

    request.authenticatedWallet = walletAddress;
  };
  const frontendOriginGuard = (
    request: FastifyRequest,
    reply: FastifyReply,
    done: (error?: Error) => void,
  ) => {
    if (requireFrontendOrigin(config, request, reply)) done();
  };

  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/marketplace/status", async () => ({
    cluster: config.solanaCluster,
    auctionProgramConfigured: false,
    bidIndexerEnabled: false,
    cancellationAvailableInApp: false,
  }));

  app.get("/api/solana/status", async (_request, reply) => {
    try {
      const [slot, genesisHash] = await Promise.all([
        rpc.getSlot().send(),
        rpc.getGenesisHash().send(),
      ]);
      return {
        cluster: config.solanaCluster,
        slot: String(slot),
        genesisHash: String(genesisHash),
      };
    } catch (error) {
      app.log.error({ err: error }, "Solana RPC health request failed");
      return reply.code(503).send({
        code: "SOLANA_RPC_UNAVAILABLE",
        message: "The configured Solana RPC endpoint could not be reached.",
      });
    }
  });

  app.post<{ Body: { walletAddress: string } }>(
    "/api/auth/challenge",
    async (request, reply) => {
      if (!requireFrontendOrigin(config, request, reply)) return;

      const parsed = nonceBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          code: "INVALID_WALLET_ADDRESS",
          message: "A valid wallet address is required.",
        });
      }

      if (!decodeWalletAddress(parsed.data.walletAddress)) {
        return reply.code(400).send({
          code: "INVALID_WALLET_ADDRESS",
          message: "Wallet address is not a valid Solana public key.",
        });
      }

      const now = Date.now();
      database.removeExpiredAuthRecords(now);
      const nonce = randomBytes(24).toString("hex");
      const expiresAt = new Date(now + NONCE_TTL_MS);
      const message = authMessage(
        config,
        parsed.data.walletAddress,
        nonce,
        new Date(now),
        expiresAt,
      );
      database.createAuthNonce({
        nonce,
        walletAddress: parsed.data.walletAddress,
        message,
        expiresAt: expiresAt.getTime(),
      });

      reply.header("cache-control", "no-store");
      return {
        nonce,
        message,
        expiresAt: expiresAt.toISOString(),
      };
    },
  );

  app.post<{
    Body: { walletAddress: string; nonce: string; signature: string };
  }>("/api/auth/verify", async (request, reply) => {
    if (!requireFrontendOrigin(config, request, reply)) return;

    const parsed = verifyBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: "INVALID_AUTH_PROOF",
        message: "A valid wallet, nonce, and signature are required.",
      });
    }

    const challenge = database.getAuthNonce(parsed.data.nonce);
    const publicKey = decodeWalletAddress(parsed.data.walletAddress);
    const signature = Buffer.from(parsed.data.signature, "base64");

    if (
      !challenge ||
      challenge.walletAddress !== parsed.data.walletAddress ||
      challenge.expiresAt <= Date.now() ||
      !publicKey ||
      signature.length !== nacl.sign.signatureLength ||
      signature.toString("base64") !== parsed.data.signature ||
      !nacl.sign.detached.verify(
        Buffer.from(challenge.message, "utf8"),
        signature,
        publicKey,
      )
    ) {
      return reply.code(401).send({
        code: "INVALID_AUTH_PROOF",
        message: "Wallet signature is invalid, expired, or already used.",
      });
    }

    const now = Date.now();
    if (
      !database.consumeAuthNonce(
        parsed.data.nonce,
        parsed.data.walletAddress,
        now,
      )
    ) {
      return reply.code(401).send({
        code: "INVALID_AUTH_PROOF",
        message: "Wallet challenge has already been used or expired.",
      });
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = now + config.sessionTtlSeconds * 1000;
    database.createSession(
      hashToken(token),
      parsed.data.walletAddress,
      expiresAt,
    );

    reply.header("cache-control", "no-store").setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: "lax",
      path: "/",
      maxAge: config.sessionTtlSeconds,
    });

    return {
      walletAddress: parsed.data.walletAddress,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  });

  app.get(
    "/api/auth/session",
    { preHandler: requireWallet },
    async (request: AuthenticatedRequest, reply) => {
      if (!request.authenticatedWallet) {
        return reply.code(401).send({ code: "WALLET_SESSION_REQUIRED" });
      }
      return { walletAddress: request.authenticatedWallet };
    },
  );

  app.post("/api/auth/logout", async (request, reply) => {
    if (!requireFrontendOrigin(config, request, reply)) return;

    const token = request.cookies[SESSION_COOKIE];
    if (token) database.removeSession(hashToken(token));
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  app.get(
    "/api/listing-drafts",
    { preHandler: requireWallet },
    async (request: AuthenticatedRequest, reply) => {
      if (!request.authenticatedWallet) {
        return reply.code(401).send({ code: "WALLET_SESSION_REQUIRED" });
      }
      return {
        items: database.listListingDrafts(request.authenticatedWallet),
      };
    },
  );

  app.post<{ Body: ListingDraftInput }>(
    "/api/listing-drafts",
    { preHandler: [frontendOriginGuard, requireWallet] },
    async (request: AuthenticatedRequest, reply) => {
      if (!request.authenticatedWallet) {
        return reply.code(401).send({ code: "WALLET_SESSION_REQUIRED" });
      }

      const parsed = draftSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          code: "INVALID_LISTING_DRAFT",
          message: "Review the listing fields and try again.",
          issues: parsed.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
      }

      const draft = database.createListingDraft(
        randomUUID(),
        request.authenticatedWallet,
        parsed.data,
        new Date().toISOString(),
      );
      return reply.code(201).send({ item: draft });
    },
  );

  app.get("/api/listings", async (_request, reply) =>
    reply.code(503).send({
      code: "AUCTION_PROGRAM_NOT_CONFIGURED",
      message:
        "Active listings are unavailable until the on-chain auction program is deployed.",
    }),
  );

  app.get(
    "/api/me/bids",
    { preHandler: requireWallet },
    async (_request, reply) =>
      reply.code(503).send({
        code: "BID_INDEXER_NOT_CONFIGURED",
        message:
          "Bid history will be available after auction instructions and the chain indexer are configured.",
      }),
  );

  return app;
}
