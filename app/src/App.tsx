import { useCallback, useEffect, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { readSolanaRpcStatus, solanaCluster } from "./lib/solana";
import { OnChainAuctions } from "./components/OnChainAuctions";

type Page = "marketplace" | "create" | "bids";

function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export default function App() {
  const { publicKey } = useWallet();
  const walletAddress = publicKey?.toBase58() ?? null;
  const [page, setPage] = useState<Page>("marketplace");
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
            type="button"
          >
            Marketplace
          </button>
          <button
            className={page === "create" ? "nav-link active" : "nav-link"}
            onClick={() => setPage("create")}
            type="button"
          >
            Create listing
          </button>
          <button
            className={page === "bids" ? "nav-link active" : "nav-link"}
            onClick={() => setPage("bids")}
            type="button"
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
          <button
            className="text-button"
            onClick={() => void refreshRpc()}
            type="button"
          >
            Retry
          </button>
        )}
      </section>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">A transparent marketplace for attention</p>
          <h1>Ad space, bid on in the open.</h1>
          <p className="hero-description">
            Listing names, descriptions, buyout terms, bids, and current auction
            state are public on Solana. Leading bids stay in escrow; a buyout
            ends its listing atomically.
          </p>
          <div className="hero-actions">
            <button
              className="primary-button"
              onClick={() => setPage("create")}
              type="button"
            >
              Create a listing
            </button>
            <button
              className="secondary-button"
              onClick={() => setPage("bids")}
              type="button"
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
            <span>Outbid leaders</span>
            <strong>Refunded immediately</strong>
          </div>
          <div className="hero-card-row">
            <span>Buyout</span>
            <strong>Ends listing permanently</strong>
          </div>
          <div className="hero-card-note">
            Transactions require a connected wallet and a deployed Localnet
            program. Metadata is public on-chain.
          </div>
        </div>
      </section>

      {walletAddress && (
        <section className="wallet-panel">
          <div>
            <p className="eyebrow">Connected wallet</p>
            <strong className="wallet-address">{walletAddress}</strong>
          </div>
          <span className="muted-copy">
            Wallet Adapter approves on-chain transactions; no backend sign-in is
            needed.
          </span>
        </section>
      )}

      <OnChainAuctions
        onNavigateToCreate={() => setPage("create")}
        view={page}
      />

      <footer className="footer">
        <span>
          Non-custodial · SOL terms in lamports · Cluster: {solanaCluster}
        </span>
        <span>
          Localnet only · Public listing metadata · Atomic buyout and refund
        </span>
      </footer>
    </main>
  );
}
