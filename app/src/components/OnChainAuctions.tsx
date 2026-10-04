import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { lamportsToSol, solToLamports } from "../lib/amounts";
import { toLocalDateTimeInput } from "../lib/datetime";
import {
  claimSupplierFunds,
  createListingId,
  createOnChainListing,
  fetchAuctionSnapshot,
  initializeAdminConfig,
  placeOnChainBid,
  setSupplierKybVerified,
  type AuctionSnapshot,
  type OnChainAuction,
} from "../lib/auction-program";

type View = "marketplace" | "create" | "bids";

type SnapshotState =
  | { kind: "loading" }
  | { kind: "ready"; snapshot: AuctionSnapshot }
  | { kind: "error"; message: string };

interface OnChainAuctionsProps {
  view: View;
  onNavigateToCreate: () => void;
}

export function OnChainAuctions({
  view,
  onNavigateToCreate,
}: OnChainAuctionsProps) {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const walletAddress = publicKey?.toBase58() ?? null;
  const [currentUnixTimestamp, setCurrentUnixTimestamp] = useState(() =>
    Math.floor(Date.now() / 1_000),
  );
  const [snapshotState, setSnapshotState] = useState<SnapshotState>({
    kind: "loading",
  });
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    const interval = window.setInterval(
      () => setCurrentUnixTimestamp(Math.floor(Date.now() / 1_000)),
      1_000,
    );
    return () => window.clearInterval(interval);
  }, []);

  const refresh = useCallback(async () => {
    setSnapshotState({ kind: "loading" });
    try {
      const snapshot = await fetchAuctionSnapshot(connection);
      setSnapshotState({ kind: "ready", snapshot });
    } catch (error) {
      setSnapshotState({
        kind: "error",
        message: errorMessage(error, "Could not load Localnet auctions."),
      });
    }
  }, [connection]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runTransaction = useCallback(
    async (
      action: string,
      successMessage: string,
      operation: (wallet: NonNullable<typeof anchorWallet>) => Promise<string>,
    ) => {
      if (!anchorWallet) {
        setActionError(
          "Connect a wallet before submitting an on-chain action.",
        );
        setActionSuccess(null);
        return;
      }

      setPendingAction(action);
      setActionError(null);
      setActionSuccess(null);
      try {
        const signature = await operation(anchorWallet);
        setActionSuccess(`${successMessage} Transaction: ${signature}`);
        await refresh();
      } catch (error) {
        setActionError(errorMessage(error, "The transaction failed."));
      } finally {
        setPendingAction(null);
      }
    },
    [anchorWallet, refresh],
  );

  const snapshot =
    snapshotState.kind === "ready" ? snapshotState.snapshot : null;
  const visibleAuctions = useMemo(() => {
    const auctions = snapshot?.auctions ?? [];
    if (view === "create") {
      return auctions.filter((auction) => auction.supplier === walletAddress);
    }
    if (view === "bids") {
      return auctions.filter(
        (auction) =>
          auction.currentWinner === walletAddress ||
          (auction.supplier === walletAddress &&
            BigInt(auction.supplierClaimable) > 0n),
      );
    }
    return auctions;
  }, [snapshot, view, walletAddress]);

  const initializeConfig = () =>
    void runTransaction(
      "initialize-config",
      "Localnet admin config initialized.",
      (wallet) => initializeAdminConfig(connection, wallet),
    );

  const createListing = (input: {
    listingId: string;
    kybId: number;
    initialAuctionEndTs: string;
    cycleDurationSeconds: string;
  }) =>
    void runTransaction(
      `create-listing:${input.listingId}`,
      `Listing ${input.listingId} created. It remains unable to accept bids until an admin verifies its supplier.`,
      (wallet) => createOnChainListing(connection, wallet, input),
    );

  const verifySupplier = (auction: OnChainAuction, isVerified: boolean) =>
    void runTransaction(
      `verify:${auction.address}`,
      isVerified
        ? "Supplier KYB verified."
        : "Supplier KYB verification revoked.",
      (wallet) =>
        setSupplierKybVerified(
          connection,
          wallet,
          new PublicKey(auction.address),
          isVerified,
        ),
    );

  const placeBid = (
    auction: OnChainAuction,
    amountSol: string,
    adUrl: string,
  ) =>
    void runTransaction(
      `bid:${auction.address}`,
      `Bid submitted for listing ${auction.listingId}.`,
      (wallet) =>
        placeOnChainBid(
          connection,
          wallet,
          auction,
          solToLamports(amountSol),
          adUrl,
        ),
    );

  const claimFunds = (auction: OnChainAuction) =>
    void runTransaction(
      `claim:${auction.address}`,
      `Supplier funds claimed for listing ${auction.listingId}.`,
      (wallet) => claimSupplierFunds(connection, wallet, auction),
    );

  const sectionHeading =
    view === "marketplace"
      ? "Available ad auctions"
      : view === "create"
        ? "Create an on-chain listing"
        : "My on-chain positions";

  return (
    <section className="content-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            {view === "bids" ? "Current state from Solana" : "Localnet program"}
          </p>
          <h2>{sectionHeading}</h2>
        </div>
        <div className="section-actions">
          <span className="status-pill">
            {snapshotState.kind === "loading"
              ? "Reading Localnet…"
              : snapshotState.kind === "error"
                ? "Program unavailable"
                : `${snapshotState.snapshot.auctions.length} on-chain listing${snapshotState.snapshot.auctions.length === 1 ? "" : "s"}`}
          </span>
          <button
            className="text-button"
            disabled={
              snapshotState.kind === "loading" || pendingAction !== null
            }
            onClick={() => void refresh()}
            type="button"
          >
            Refresh
          </button>
        </div>
      </div>

      {actionError && (
        <div className="notice error-notice" role="alert">
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div className="notice success-notice" role="status">
          {actionSuccess}
        </div>
      )}

      {snapshotState.kind === "loading" && (
        <div className="empty-state small-empty">
          <h3>Checking the Localnet auction program</h3>
          <p>Loading its generated IDL and current on-chain account state.</p>
        </div>
      )}

      {snapshotState.kind === "error" && (
        <div className="empty-state small-empty">
          <h3>Localnet auctions are not ready</h3>
          <p>{snapshotState.message}</p>
          <p className="muted-copy">
            Check that the configured Localnet RPC is reachable and that the
            deployed program and generated IDL are compatible.
          </p>
          <button
            className="secondary-button"
            onClick={() => void refresh()}
            type="button"
          >
            Retry connection
          </button>
        </div>
      )}

      {snapshotState.kind === "ready" && view === "create" && (
        <div className="on-chain-create">
          {snapshotState.snapshot.admin === null ? (
            <div className="notice warning-notice">
              <strong>No admin config exists on this Localnet.</strong>
              <p>
                Choose a dedicated wallet you control. The first wallet to
                initialize this config becomes the KYB admin, and this program
                has no admin-transfer instruction. Check the connected wallet
                above before approving; only do this on your Localnet.
              </p>
              <button
                className="primary-button"
                disabled={!anchorWallet || pendingAction !== null}
                onClick={initializeConfig}
                type="button"
              >
                {pendingAction === "initialize-config"
                  ? "Waiting for wallet…"
                  : "Initialize Localnet admin"}
              </button>
            </div>
          ) : (
            <>
              <p className="section-copy">
                The listing records the connected supplier wallet and the
                submitted KYB ID. The ID is only a public reference; an admin
                must match both against off-chain KYB records before verifying
                the listing.
              </p>
              <OnChainListingForm
                busy={pendingAction !== null}
                walletReady={anchorWallet !== undefined}
                onCreate={createListing}
              />
            </>
          )}
          {snapshotState.snapshot.admin && (
            <p className="form-hint">
              Program admin: <code>{snapshotState.snapshot.admin}</code>
              {walletAddress === snapshotState.snapshot.admin
                ? " · This wallet can verify suppliers."
                : " · Connect the admin wallet to verify suppliers."}
            </p>
          )}
          <div className="section-heading compact-heading">
            <div>
              <p className="eyebrow">Created by this wallet</p>
              <h3>Your on-chain listings</h3>
            </div>
          </div>
          {walletAddress && visibleAuctions.length > 0 ? (
            <div className="draft-list">
              {visibleAuctions.map((auction) => (
                <AuctionCard
                  adminAddress={snapshotState.snapshot.admin}
                  auction={auction}
                  busy={pendingAction !== null}
                  currentUnixTimestamp={currentUnixTimestamp}
                  key={auction.address}
                  onClaim={claimFunds}
                  onPlaceBid={placeBid}
                  onSetVerified={verifySupplier}
                  walletAddress={walletAddress}
                />
              ))}
            </div>
          ) : (
            <p className="muted-copy">
              {walletAddress
                ? "This wallet has not created an on-chain listing yet."
                : "Connect a wallet to create a Localnet listing."}
            </p>
          )}
        </div>
      )}

      {snapshotState.kind === "ready" && view === "marketplace" && (
        <>
          {visibleAuctions.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">↗</div>
              <h3>No on-chain auctions are available yet</h3>
              <p>
                The program is connected to Localnet, but no listing accounts
                have been created. Create a listing and have the admin verify
                its supplier before it can receive bids.
              </p>
              <button
                className="primary-button"
                onClick={onNavigateToCreate}
                type="button"
              >
                Create a Localnet listing
              </button>
            </div>
          ) : (
            <div className="draft-list">
              {visibleAuctions.map((auction) => (
                <AuctionCard
                  adminAddress={snapshotState.snapshot.admin}
                  auction={auction}
                  busy={pendingAction !== null}
                  currentUnixTimestamp={currentUnixTimestamp}
                  key={auction.address}
                  onClaim={claimFunds}
                  onPlaceBid={placeBid}
                  onSetVerified={verifySupplier}
                  walletAddress={walletAddress}
                />
              ))}
            </div>
          )}
        </>
      )}

      {snapshotState.kind === "ready" && view === "bids" && (
        <>
          {!walletAddress ? (
            <div className="empty-state small-empty">
              <h3>Connect a wallet to view your positions</h3>
              <p>
                The app reads your current highest bids and supplier claimable
                balances directly from Localnet.
              </p>
            </div>
          ) : visibleAuctions.length === 0 ? (
            <div className="empty-state small-empty">
              <h3>No active winning bids or claimable funds</h3>
              <p>
                The program stores current auction state, not a historical bid
                log. Outbid history requires an indexer and is not shown here.
              </p>
            </div>
          ) : (
            <div className="draft-list">
              {visibleAuctions.map((auction) => (
                <AuctionCard
                  adminAddress={snapshotState.snapshot.admin}
                  auction={auction}
                  busy={pendingAction !== null}
                  currentUnixTimestamp={currentUnixTimestamp}
                  key={auction.address}
                  onClaim={claimFunds}
                  onPlaceBid={placeBid}
                  onSetVerified={verifySupplier}
                  walletAddress={walletAddress}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

interface OnChainListingFormProps {
  busy: boolean;
  walletReady: boolean;
  onCreate: (input: {
    listingId: string;
    kybId: number;
    initialAuctionEndTs: string;
    cycleDurationSeconds: string;
  }) => void;
}

function OnChainListingForm({
  busy,
  walletReady,
  onCreate,
}: OnChainListingFormProps) {
  const [kybId, setKybId] = useState("");
  const [cycleDays, setCycleDays] = useState("30");
  const [initialAuctionEndsAt, setInitialAuctionEndsAt] = useState(() =>
    toLocalDateTimeInput(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);
    if (!/^\d{7}$/.test(kybId)) {
      setValidationError("KYB ID must be a 7-digit integer.");
      return;
    }
    const initialAuctionEndMs = new Date(initialAuctionEndsAt).getTime();
    if (
      !Number.isSafeInteger(initialAuctionEndMs) ||
      initialAuctionEndMs < Date.now() + 60_000
    ) {
      setValidationError(
        "Set the initial auction close at least one minute in the future.",
      );
      return;
    }
    if (!/^[1-9]\d*$/.test(cycleDays)) {
      setValidationError(
        "Cycle duration must be a positive whole number of days.",
      );
      return;
    }

    const cycleDurationSeconds = BigInt(cycleDays) * 86_400n;
    if (cycleDurationSeconds > (1n << 63n) - 1n) {
      setValidationError(
        "Cycle duration is outside the supported on-chain range.",
      );
      return;
    }

    onCreate({
      listingId: createListingId(),
      kybId: Number(kybId),
      initialAuctionEndTs: Math.floor(initialAuctionEndMs / 1_000).toString(),
      cycleDurationSeconds: cycleDurationSeconds.toString(),
    });
  }

  return (
    <form className="listing-form on-chain-listing-form" onSubmit={submit}>
      <div className="form-row">
        <label>
          Supplier KYB ID
          <input
            inputMode="numeric"
            maxLength={7}
            minLength={7}
            onChange={(event) => setKybId(event.target.value)}
            pattern="[0-9]{7}"
            placeholder="1000000"
            required
            value={kybId}
          />
        </label>
        <label>
          Initial auction closes
          <input
            min={toLocalDateTimeInput(new Date(Date.now() + 60_000))}
            onChange={(event) => setInitialAuctionEndsAt(event.target.value)}
            required
            type="datetime-local"
            value={initialAuctionEndsAt}
          />
        </label>
      </div>
      <label>
        Recurring cycle duration <span className="input-unit">days</span>
        <input
          inputMode="numeric"
          min="1"
          onChange={(event) => setCycleDays(event.target.value)}
          required
          step="1"
          type="number"
          value={cycleDays}
        />
      </label>
      <p className="form-hint">
        The initial auction settles at its close time. The first recurring cycle
        starts then; later cycles use this duration (default 30 days). The ad
        image URL is supplied with each bid.
      </p>
      {validationError && (
        <div className="notice error-notice" role="alert">
          {validationError}
        </div>
      )}
      {!walletReady && (
        <p className="form-hint">
          Connect a wallet to create a supplier-owned listing.
        </p>
      )}
      <button
        className="primary-button"
        disabled={busy || !walletReady}
        type="submit"
      >
        {busy ? "Waiting for wallet…" : "Create on-chain listing"}
      </button>
    </form>
  );
}

interface AuctionCardProps {
  adminAddress: string | null;
  auction: OnChainAuction;
  busy: boolean;
  currentUnixTimestamp: number;
  onClaim: (auction: OnChainAuction) => void;
  onPlaceBid: (
    auction: OnChainAuction,
    amountSol: string,
    adUrl: string,
  ) => void;
  onSetVerified: (auction: OnChainAuction, isVerified: boolean) => void;
  walletAddress: string | null;
}

function AuctionCard({
  adminAddress,
  auction,
  busy,
  currentUnixTimestamp,
  onClaim,
  onPlaceBid,
  onSetVerified,
  walletAddress,
}: AuctionCardProps) {
  const [amountSol, setAmountSol] = useState("");
  const [adUrl, setAdUrl] = useState("");
  const isAdmin = walletAddress !== null && walletAddress === adminAddress;
  const isSupplier =
    walletAddress !== null && walletAddress === auction.supplier;
  const hasClaimableFunds = BigInt(auction.supplierClaimable) > 0n;
  const isInitialAuction = BigInt(auction.cycleNumber) === 0n;
  const settlementDueAt = isInitialAuction
    ? BigInt(auction.cycleStartTs)
    : BigInt(auction.cycleStartTs) + BigInt(auction.cycleDuration);
  const settlementDue = BigInt(currentUnixTimestamp) >= settlementDueAt;
  const unsettledBidAmount =
    settlementDue && BigInt(auction.currentHighestBid) > 0n
      ? BigInt(auction.currentHighestBid)
      : 0n;
  const claimableAfterSettlement =
    BigInt(auction.supplierClaimable) + unsettledBidAmount;

  function submitBid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onPlaceBid(auction, amountSol, adUrl);
  }

  return (
    <article className="draft-card auction-card">
      <div className="draft-card-heading">
        <strong>Listing {auction.listingId}</strong>
        <span className={auction.isKybVerified ? "draft-badge" : "kyb-pending"}>
          {auction.isKybVerified ? "KYB VERIFIED" : "KYB PENDING"}
        </span>
      </div>
      <div className="draft-terms auction-terms">
        <span>Supplier {shortAddress(auction.supplier)}</span>
        <span>KYB ID {auction.kybId}</span>
        <span>
          {isInitialAuction
            ? "Initial auction"
            : `Cycle ${auction.cycleNumber}`}
        </span>
        <span>
          {isInitialAuction
            ? `Closes ${formatUnixTimestamp(auction.cycleStartTs)}`
            : `Length ${formatDuration(auction.cycleDuration)}`}
        </span>
        <span>Highest {lamportsToSol(auction.currentHighestBid)} SOL</span>
      </div>
      {auction.currentWinner && (
        <p className="auction-detail">
          Current winner: {shortAddress(auction.currentWinner)}
        </p>
      )}
      {auction.adUrl && (
        <p className="auction-detail">
          Current leader&apos;s ad image URL:{" "}
          <span title={auction.adUrl}>{auction.adUrl}</span>
        </p>
      )}
      {hasClaimableFunds && (
        <p className="auction-detail">
          Supplier claimable: {lamportsToSol(auction.supplierClaimable)} SOL
        </p>
      )}
      {settlementDue && unsettledBidAmount > 0n && (
        <p className="auction-detail">
          {isInitialAuction
            ? "Initial auction proceeds pending settlement: "
            : "Completed cycle pending settlement: "}
          {lamportsToSol(unsettledBidAmount.toString())} SOL
        </p>
      )}

      {isAdmin && (
        <button
          className="secondary-button auction-admin-action"
          disabled={busy}
          onClick={() => onSetVerified(auction, !auction.isKybVerified)}
          type="button"
        >
          {auction.isKybVerified
            ? "Revoke supplier KYB"
            : "Verify supplier KYB"}
        </button>
      )}

      <form className="listing-form auction-bid-form" onSubmit={submitBid}>
        <div className="form-row">
          <label>
            Your bid <span className="input-unit">SOL</span>
            <input
              inputMode="decimal"
              min="0.000000001"
              onChange={(event) => setAmountSol(event.target.value)}
              placeholder="0.25"
              required
              step="any"
              type="number"
              value={amountSol}
            />
          </label>
          <label>
            Your ad image URL
            <input
              maxLength={128}
              onChange={(event) => setAdUrl(event.target.value)}
              placeholder="https://example.com/ad-image.png"
              required
              type="url"
              value={adUrl}
            />
          </label>
        </div>
        <p className="form-hint">
          Bids must exceed the current highest bid. Outbid leaders are refunded
          immediately. Your ad image URL is stored with your bid and shown while
          you are the leader; the limit is 128 UTF-8 bytes.
        </p>
        {!auction.isKybVerified && (
          <p className="form-hint">
            Bidding is disabled until an admin verifies this supplier.
          </p>
        )}
        {!walletAddress && (
          <p className="form-hint">Connect a wallet to place a bid.</p>
        )}
        <button
          className="primary-button"
          disabled={busy || !walletAddress || !auction.isKybVerified}
          type="submit"
        >
          {busy ? "Waiting for wallet…" : "Place bid"}
        </button>
      </form>

      {isSupplier && claimableAfterSettlement > 0n && (
        <button
          className="secondary-button auction-claim-action"
          disabled={busy}
          onClick={() => onClaim(auction)}
          type="button"
        >
          Claim {lamportsToSol(claimableAfterSettlement.toString())} SOL
        </button>
      )}
    </article>
  );
}

function shortAddress(address: string): string {
  return `${address.slice(0, 5)}…${address.slice(-5)}`;
}

function formatDuration(durationSeconds: string): string {
  const seconds = BigInt(durationSeconds);
  const days = seconds / 86_400n;
  const remainingSeconds = seconds % 86_400n;
  if (remainingSeconds === 0n) {
    return `${days}d`;
  }
  const hours = remainingSeconds / 3_600n;
  const minutes = (remainingSeconds % 3_600n) / 60n;
  return `${days}d ${hours}h ${minutes}m`;
}

function formatUnixTimestamp(timestampSeconds: string): string {
  const milliseconds = Number(timestampSeconds) * 1_000;
  const date = new Date(milliseconds);
  if (!Number.isSafeInteger(milliseconds) || Number.isNaN(date.getTime())) {
    return "Invalid on-chain timestamp";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
