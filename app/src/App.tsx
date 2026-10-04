import { useCallback, useEffect, useState, type FormEvent } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { ApiError, api, type ListingDraft } from "./lib/api";
import { authenticateWallet } from "./lib/auth";
import { lamportsToSol, solToLamports } from "./lib/amounts";
import { toLocalDateTimeInput } from "./lib/datetime";
import { readSolanaRpcStatus, solanaCluster } from "./lib/solana";
import { OnChainAuctions } from "./components/OnChainAuctions";

type Page = "marketplace" | "create" | "bids";

interface DraftFormValues {
  title: string;
  description: string;
  startingBidSol: string;
  buyoutPriceSol: string;
  minIncrementSol: string;
  endsAt: string;
}

const defaultFormValues: DraftFormValues = {
  title: "",
  description: "",
  startingBidSol: "0.1",
  buyoutPriceSol: "1",
  minIncrementSol: "0.05",
  endsAt: toLocalDateTimeInput(new Date(Date.now() + 24 * 60 * 60 * 1000)),
};

function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function App() {
  const { publicKey, signMessage } = useWallet();
  const walletAddress = publicKey?.toBase58() ?? null;
  const [page, setPage] = useState<Page>("marketplace");
  const [sessionWallet, setSessionWallet] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<ListingDraft[]>([]);
  const [rpcState, setRpcState] = useState<
    | { kind: "loading" }
    | {
        kind: "connected";
        cluster: string;
        slot: string;
        genesisHash: string;
      }
    | { kind: "error"; message: string }
  >({ kind: "loading" });
  const [authBusy, setAuthBusy] = useState(false);
  const [draftsBusy, setDraftsBusy] = useState(false);
  const [draftsError, setDraftsError] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);

  const refreshRpc = useCallback(async () => {
    setRpcState({ kind: "loading" });
    try {
      const status = await readSolanaRpcStatus();
      setRpcState({
        kind: "connected",
        cluster: status.cluster,
        slot: status.slot,
        genesisHash: status.genesisHash,
      });
    } catch {
      setRpcState({
        kind: "error",
        message:
          "Solana RPC could not be reached. Check the configured endpoint.",
      });
    }
  }, []);

  useEffect(() => {
    void refreshRpc();
  }, [refreshRpc]);

  useEffect(() => {
    let active = true;
    setSessionWallet(null);
    setWalletError(null);

    if (!walletAddress) return;

    api
      .getWalletSession()
      .then((session) => {
        if (active && session.walletAddress === walletAddress) {
          setSessionWallet(session.walletAddress);
        }
      })
      .catch((error: unknown) => {
        if (!(error instanceof ApiError) || error.status !== 401) {
          if (active) {
            setWalletError(
              error instanceof Error
                ? error.message
                : "Unable to check wallet sign-in status.",
            );
          }
        }
      });

    return () => {
      active = false;
    };
  }, [walletAddress]);

  useEffect(() => {
    let active = true;
    if (!walletAddress || sessionWallet !== walletAddress) {
      setDrafts([]);
      return;
    }

    setDraftsBusy(true);
    setDraftsError(null);
    api
      .listMyDrafts()
      .then((result) => {
        if (active) setDrafts(result.items);
      })
      .catch((error: unknown) => {
        if (active) {
          setDraftsError(
            error instanceof Error
              ? error.message
              : "Unable to load your drafts.",
          );
        }
      })
      .finally(() => {
        if (active) setDraftsBusy(false);
      });

    return () => {
      active = false;
    };
  }, [walletAddress, sessionWallet]);

  const signIn = useCallback(async () => {
    if (!walletAddress) {
      setWalletError("Connect a wallet before signing in.");
      return;
    }
    if (!signMessage) {
      setWalletError(
        "This wallet does not support message signing required for backend sign-in.",
      );
      return;
    }

    setAuthBusy(true);
    setWalletError(null);
    try {
      await authenticateWallet(walletAddress, signMessage);
      setSessionWallet(walletAddress);
    } catch (error) {
      setWalletError(
        error instanceof Error ? error.message : "Wallet sign-in failed.",
      );
    } finally {
      setAuthBusy(false);
    }
  }, [signMessage, walletAddress]);

  const signOut = useCallback(async () => {
    setWalletError(null);
    try {
      await api.logout();
      setSessionWallet(null);
      setDrafts([]);
    } catch (error) {
      setWalletError(
        error instanceof Error ? error.message : "Wallet sign-out failed.",
      );
    }
  }, []);

  const saveDraft = useCallback(
    async (values: DraftFormValues) => {
      if (!walletAddress || sessionWallet !== walletAddress) {
        throw new Error(
          "Sign in with the connected wallet before saving a draft.",
        );
      }

      const endsAt = new Date(values.endsAt);
      if (!Number.isFinite(endsAt.getTime())) {
        throw new Error("Choose a valid proposed end time for the draft.");
      }

      const result = await api.createListingDraft({
        title: values.title,
        description: values.description,
        startingBidLamports: solToLamports(values.startingBidSol),
        buyoutPriceLamports: solToLamports(values.buyoutPriceSol),
        minIncrementLamports: solToLamports(values.minIncrementSol),
        endsAt: endsAt.toISOString(),
      });
      setDrafts((existing) => [
        result.item,
        ...existing.filter((draft) => draft.id !== result.item.id),
      ]);
      setPage("create");
    },
    [sessionWallet, walletAddress],
  );

  return (
    <main className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#marketplace"
          onClick={() => setPage("marketplace")}
        >
          <span className="brand-mark">A</span>
          <span>
            <strong>Ad Market</strong>
            <small>on Solana</small>
          </span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <button
            className={page === "marketplace" ? "nav-link active" : "nav-link"}
            onClick={() => setPage("marketplace")}
          >
            Marketplace
          </button>
          <button
            className={page === "create" ? "nav-link active" : "nav-link"}
            onClick={() => setPage("create")}
          >
            Create listing
          </button>
          <button
            className={page === "bids" ? "nav-link active" : "nav-link"}
            onClick={() => setPage("bids")}
          >
            My bids
          </button>
        </nav>
        <WalletMultiButton className="wallet-button" />
      </header>

      <section className="network-strip" aria-live="polite">
        <span
          className={`network-dot ${rpcState.kind === "connected" ? "online" : ""}`}
        />
        <span>
          {rpcState.kind === "loading" && `Connecting to ${solanaCluster}…`}
          {rpcState.kind === "error" && rpcState.message}
          {rpcState.kind === "connected" &&
            `${rpcState.cluster} · slot ${rpcState.slot} · RPC connected`}
        </span>
        {rpcState.kind === "connected" && (
          <span className="network-hash" title={rpcState.genesisHash}>
            Genesis {shortAddress(rpcState.genesisHash)}
          </span>
        )}
        {rpcState.kind === "error" && (
          <button className="text-button" onClick={() => void refreshRpc()}>
            Retry
          </button>
        )}
      </section>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">A transparent marketplace for attention</p>
          <h1>Ad space, bid on in the open.</h1>
          <p className="hero-description">
            Recurring ad-space listings and escrowed bids are read directly from
            the configured Localnet program. Draft metadata remains off-chain
            and separate from active listings.
          </p>
          <div className="hero-actions">
            <button
              className="primary-button"
              onClick={() => setPage("create")}
            >
              Prepare a listing
            </button>
            <button
              className="secondary-button"
              onClick={() => setPage("bids")}
            >
              View my bids
            </button>
          </div>
        </div>
        <div className="hero-card">
          <div className="hero-card-top">
            <span className="live-indicator" />
            <span>ON-CHAIN AUCTIONS</span>
            <span className="not-ready">LOCALNET ONLY</span>
          </div>
          <div className="hero-price">Default cycle</div>
          <div className="hero-value">
            30 <span>days</span>
          </div>
          <div className="hero-card-rule" />
          <div className="hero-card-row">
            <span>Escrowed bids</span>
            <strong>Immediate refunds</strong>
          </div>
          <div className="hero-card-row">
            <span>Buyout</span>
            <strong>Not implemented</strong>
          </div>
          <div className="hero-card-note">
            Transactions require a connected wallet and a deployed Localnet
            program.
          </div>
        </div>
      </section>

      {walletError && (
        <div className="notice error-notice" role="alert">
          {walletError}
        </div>
      )}
      {walletAddress && (
        <section className="wallet-panel">
          <div>
            <p className="eyebrow">Connected wallet</p>
            <strong className="wallet-address">{walletAddress}</strong>
          </div>
          {sessionWallet === walletAddress ? (
            <div className="session-actions">
              <span className="session-pill">Backend session verified</span>
              <button className="text-button" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          ) : (
            <button
              className="secondary-button"
              disabled={authBusy || !signMessage}
              onClick={() => void signIn()}
            >
              {authBusy ? "Waiting for wallet…" : "Sign in to save drafts"}
            </button>
          )}
        </section>
      )}

      {page === "marketplace" && (
        <OnChainAuctions
          onNavigateToCreate={() => setPage("create")}
          view="marketplace"
        />
      )}

      {page === "create" && (
        <>
          <OnChainAuctions
            onNavigateToCreate={() => setPage("create")}
            view="create"
          />
          <section className="content-section create-grid">
            <div>
              <div className="section-heading compact-heading">
                <div>
                  <p className="eyebrow">Seller workspace</p>
                  <h2>Prepare an ad listing</h2>
                </div>
              </div>
              <p className="section-copy">
                Drafts are private backend metadata. To show an auction to other
                wallets on this Localnet, create it in the Localnet panel above.
                That on-chain listing does not include this draft&apos;s title,
                description, or draft-only pricing and end date. The current
                winning bidder supplies the ad image URL with their bid.
              </p>
              <ListingDraftForm
                busy={draftsBusy}
                walletReady={
                  sessionWallet === walletAddress && walletAddress !== null
                }
                onSave={saveDraft}
              />
              {draftsError && (
                <div className="notice error-notice" role="alert">
                  {draftsError}
                </div>
              )}
            </div>
            <aside className="drafts-panel">
              <div className="section-heading compact-heading">
                <div>
                  <p className="eyebrow">Stored off-chain</p>
                  <h2>Your drafts</h2>
                </div>
              </div>
              {!walletAddress && (
                <p className="muted-copy">
                  Connect a wallet to see your drafts.
                </p>
              )}
              {walletAddress && sessionWallet !== walletAddress && (
                <p className="muted-copy">
                  Sign in with this wallet to load or save drafts.
                </p>
              )}
              {draftsBusy && <p className="muted-copy">Loading drafts…</p>}
              {sessionWallet === walletAddress &&
                !draftsBusy &&
                drafts.length === 0 && (
                  <p className="muted-copy">No drafts saved for this wallet.</p>
                )}
              <div className="draft-list">
                {drafts.map((draft) => (
                  <article className="draft-card" key={draft.id}>
                    <div className="draft-card-heading">
                      <strong>{draft.title}</strong>
                      <span className="draft-badge">DRAFT</span>
                    </div>
                    <p>{draft.description || "No description added."}</p>
                    <div className="draft-terms">
                      <span>
                        Start {lamportsToSol(draft.startingBidLamports)} SOL
                      </span>
                      <span>
                        Buyout {lamportsToSol(draft.buyoutPriceLamports)} SOL
                      </span>
                    </div>
                    <small>Ends {formatDate(draft.endsAt)}</small>
                  </article>
                ))}
              </div>
            </aside>
          </section>
        </>
      )}

      {page === "bids" && (
        <OnChainAuctions
          onNavigateToCreate={() => setPage("create")}
          view="bids"
        />
      )}

      <footer className="footer">
        <span>
          Non-custodial · SOL terms in lamports · Cluster: {solanaCluster}
        </span>
        <span>
          Localnet only · No buyout or cancellation instruction is available.
        </span>
      </footer>
    </main>
  );
}

interface ListingDraftFormProps {
  busy: boolean;
  walletReady: boolean;
  onSave: (values: DraftFormValues) => Promise<void>;
}

function ListingDraftForm({
  busy,
  walletReady,
  onSave,
}: ListingDraftFormProps) {
  const [values, setValues] = useState(defaultFormValues);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function update<K extends keyof DraftFormValues>(
    field: K,
    value: DraftFormValues[K],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
    setSaved(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    try {
      await onSave(values);
      setSaved(true);
    } catch (cause) {
      if (cause instanceof ApiError && cause.issues.length > 0) {
        setError(cause.issues.map((issue) => issue.message).join(" "));
      } else {
        setError(
          cause instanceof Error ? cause.message : "Could not save draft.",
        );
      }
    }
  }

  return (
    <form className="listing-form" onSubmit={(event) => void submit(event)}>
      <label>
        Listing title
        <input
          maxLength={100}
          minLength={3}
          onChange={(event) => update("title", event.target.value)}
          placeholder="Example: Homepage hero placement"
          required
          value={values.title}
        />
      </label>
      <label>
        Description
        <textarea
          maxLength={3000}
          onChange={(event) => update("description", event.target.value)}
          placeholder="Describe the ad placement and what the buyer receives."
          rows={4}
          value={values.description}
        />
      </label>
      <div className="form-row">
        <label>
          Starting bid <span className="input-unit">SOL</span>
          <input
            inputMode="decimal"
            onChange={(event) => update("startingBidSol", event.target.value)}
            required
            value={values.startingBidSol}
          />
        </label>
        <label>
          Proposed buyout (draft only) <span className="input-unit">SOL</span>
          <input
            inputMode="decimal"
            onChange={(event) => update("buyoutPriceSol", event.target.value)}
            required
            value={values.buyoutPriceSol}
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          Minimum increment <span className="input-unit">SOL</span>
          <input
            inputMode="decimal"
            onChange={(event) => update("minIncrementSol", event.target.value)}
            required
            value={values.minIncrementSol}
          />
        </label>
        <label>
          Proposed auction end (draft only)
          <input
            min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
            onChange={(event) => update("endsAt", event.target.value)}
            required
            type="datetime-local"
            value={values.endsAt}
          />
        </label>
      </div>
      {error && (
        <div className="notice error-notice" role="alert">
          {error}
        </div>
      )}
      {saved && (
        <div className="notice success-notice" role="status">
          Draft saved. It is not an active on-chain listing.
        </div>
      )}
      {!walletReady && (
        <p className="form-hint">
          Connect and sign in with a wallet before saving. No wallet keys leave
          your device.
        </p>
      )}
      <button
        className="primary-button full-width"
        disabled={busy || !walletReady}
        type="submit"
      >
        {busy ? "Saving draft…" : "Save draft"}
      </button>
      <p className="form-hint">
        This form stores off-chain draft details only. Buyouts are not
        implemented; use the Localnet panel above to create an on-chain listing.
      </p>
    </form>
  );
}
