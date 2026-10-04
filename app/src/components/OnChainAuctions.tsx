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
  createListingId,
  createOnChainListing,
  fetchAuctionSnapshot,
  initializeAdminConfig,
  initializeOnChainListingMetadata,
  placeOnChainBid,
  settleAndPaySupplier,
  setSupplierKybVerified,
  updateOnChainListingMetadata,
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
      if (!walletAddress) return [];
      return auctions.filter(
        (auction) =>
          auction.currentWinner === walletAddress ||
          auction.supplier === walletAddress,
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
    title: string;
    description: string;
    buyoutPriceLamports: string;
    initialAuctionEndTs: string;
    cycleDurationSeconds: string;
  }) =>
    void runTransaction(
      `create-listing:${input.listingId}`,
      `Listing ${input.listingId} and its public details created. It remains unable to accept bids until an admin verifies its supplier.`,
      (wallet) => createOnChainListing(connection, wallet, input),
    );

  const initializeMetadata = (
    auction: OnChainAuction,
    input: {
      title: string;
      description: string;
      buyoutPriceLamports: string;
    },
  ) =>
    void runTransaction(
      `metadata:${auction.address}`,
      `Public details saved for listing ${auction.listingId}.`,
      (wallet) =>
        initializeOnChainListingMetadata(
          connection,
          wallet,
          new PublicKey(auction.address),
          input,
        ),
    );

  const updateMetadata = (
    auction: OnChainAuction,
    input: { title: string; description: string },
  ) =>
    void runTransaction(
      `update-metadata:${auction.address}`,
      `Public details updated for listing ${auction.listingId}.`,
      (wallet) =>
        updateOnChainListingMetadata(
          connection,
          wallet,
          new PublicKey(auction.address),
          input,
        ),
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
      `settle-payout:${auction.address}`,
      `Settled proceeds paid to the supplier for listing ${auction.listingId}.`,
      (wallet) => settleAndPaySupplier(connection, wallet, auction),
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
            <div className="listing-list">
              {visibleAuctions.map((auction) => (
                <AuctionCard
                  adminAddress={snapshotState.snapshot.admin}
                  auction={auction}
                  busy={pendingAction !== null}
                  currentUnixTimestamp={currentUnixTimestamp}
                  key={auction.address}
                  onClaim={claimFunds}
                  onInitializeMetadata={initializeMetadata}
                  onPlaceBid={placeBid}
                  onSetVerified={verifySupplier}
                  onUpdateMetadata={updateMetadata}
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
            <div className="listing-list">
              {visibleAuctions.map((auction) => (
                <AuctionCard
                  adminAddress={snapshotState.snapshot.admin}
                  auction={auction}
                  busy={pendingAction !== null}
                  currentUnixTimestamp={currentUnixTimestamp}
                  key={auction.address}
                  onClaim={claimFunds}
                  onInitializeMetadata={initializeMetadata}
                  onPlaceBid={placeBid}
                  onSetVerified={verifySupplier}
                  onUpdateMetadata={updateMetadata}
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
              <h3>No auctions owned or led by this wallet</h3>
              <p>
                This tab includes every listing created by this wallet and any
                listing where it currently leads. Outbid history is not stored.
              </p>
            </div>
          ) : (
            <div className="listing-list">
              {visibleAuctions.map((auction) => (
                <AuctionCard
                  adminAddress={snapshotState.snapshot.admin}
                  auction={auction}
                  busy={pendingAction !== null}
                  currentUnixTimestamp={currentUnixTimestamp}
                  key={auction.address}
                  onClaim={claimFunds}
                  onInitializeMetadata={initializeMetadata}
                  onPlaceBid={placeBid}
                  onSetVerified={verifySupplier}
                  onUpdateMetadata={updateMetadata}
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
    title: string;
    description: string;
    buyoutPriceLamports: string;
    initialAuctionEndTs: string;
    cycleDurationSeconds: string;
  }) => void;
}

function OnChainListingForm({
  busy,
  walletReady,
  onCreate,
}: OnChainListingFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [buyoutPriceSol, setBuyoutPriceSol] = useState("0");
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
    if (title.trim().length === 0) {
      setValidationError("Enter a listing title.");
      return;
    }
    if (new TextEncoder().encode(title).length > 100) {
      setValidationError("Listing title must be no more than 100 UTF-8 bytes.");
      return;
    }
    if (new TextEncoder().encode(description).length > 3_000) {
      setValidationError(
        "Listing description must be no more than 3000 UTF-8 bytes.",
      );
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

    try {
      onCreate({
        listingId: createListingId(),
        kybId: Number(kybId),
        title,
        description,
        buyoutPriceLamports: solToLamports(buyoutPriceSol, true),
        initialAuctionEndTs: Math.floor(initialAuctionEndMs / 1_000).toString(),
        cycleDurationSeconds: cycleDurationSeconds.toString(),
      });
    } catch (error) {
      setValidationError(errorMessage(error, "Check the listing fields."));
    }
  }

  return (
    <form className="listing-form on-chain-listing-form" onSubmit={submit}>
      <label>
        Public listing name
        <input
          maxLength={100}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Example: Homepage hero placement"
          required
          value={title}
        />
      </label>
      <label>
        Public description
        <textarea
          maxLength={3_000}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Describe the ad placement and what the buyer receives."
          required
          rows={4}
          value={description}
        />
        <span className="input-unit">
          {new TextEncoder().encode(description).length}/3000 UTF-8 bytes
        </span>
      </label>
      <div className="form-row">
        <label>
          Buyout price <span className="input-unit">SOL</span>
          <input
            inputMode="decimal"
            min="0"
            onChange={(event) => setBuyoutPriceSol(event.target.value)}
            required
            step="any"
            type="number"
            value={buyoutPriceSol}
          />
        </label>
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
      </div>
      <div className="form-row">
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
        Listing name and description are public on-chain. Enter 0 SOL to disable
        buyout; a bid at or above the configured price ends the listing
        permanently, charges exactly that price, and refunds any excess. The
        initial auction close starts recurring cycles; the ad image URL comes
        from each bidder.
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
  onInitializeMetadata: (
    auction: OnChainAuction,
    input: {
      title: string;
      description: string;
      buyoutPriceLamports: string;
    },
  ) => void;
  onPlaceBid: (
    auction: OnChainAuction,
    amountSol: string,
    adUrl: string,
  ) => void;
  onSetVerified: (auction: OnChainAuction, isVerified: boolean) => void;
  onUpdateMetadata: (
    auction: OnChainAuction,
    input: { title: string; description: string },
  ) => void;
  walletAddress: string | null;
}

function AuctionCard({
  adminAddress,
  auction,
  busy,
  currentUnixTimestamp,
  onClaim,
  onInitializeMetadata,
  onPlaceBid,
  onSetVerified,
  onUpdateMetadata,
  walletAddress,
}: AuctionCardProps) {
  const [amountSol, setAmountSol] = useState("");
  const [adUrl, setAdUrl] = useState("");
  const [metadataTitle, setMetadataTitle] = useState("");
  const [metadataDescription, setMetadataDescription] = useState("");
  const [metadataBuyoutPriceSol, setMetadataBuyoutPriceSol] = useState("0");
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [editingMetadata, setEditingMetadata] = useState(false);
  const [updatedTitle, setUpdatedTitle] = useState("");
  const [updatedDescription, setUpdatedDescription] = useState("");
  const [updateMetadataError, setUpdateMetadataError] = useState<string | null>(
    null,
  );
  const isAdmin = walletAddress !== null && walletAddress === adminAddress;
  const isSupplier =
    walletAddress !== null && walletAddress === auction.supplier;
  const hasClaimableFunds = BigInt(auction.supplierClaimable) > 0n;
  const isInitialAuction = BigInt(auction.cycleNumber) === 0n;
  const settlementDueAt = isInitialAuction
    ? BigInt(auction.cycleStartTs)
    : BigInt(auction.cycleStartTs) + BigInt(auction.cycleDuration);
  const settlementDue =
    !auction.isClosed && BigInt(currentUnixTimestamp) >= settlementDueAt;
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

  function submitMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMetadataError(null);
    if (metadataTitle.trim().length === 0) {
      setMetadataError("Enter a listing title.");
      return;
    }
    if (new TextEncoder().encode(metadataTitle).length > 100) {
      setMetadataError("Listing title must be no more than 100 UTF-8 bytes.");
      return;
    }
    if (new TextEncoder().encode(metadataDescription).length > 3_000) {
      setMetadataError(
        "Listing description must be no more than 3000 UTF-8 bytes.",
      );
      return;
    }
    try {
      onInitializeMetadata(auction, {
        title: metadataTitle,
        description: metadataDescription,
        buyoutPriceLamports: solToLamports(metadataBuyoutPriceSol, true),
      });
    } catch (error) {
      setMetadataError(errorMessage(error, "Check the listing details."));
    }
  }

  function openMetadataEditor() {
    setUpdatedTitle(auction.title ?? "");
    setUpdatedDescription(auction.description ?? "");
    setUpdateMetadataError(null);
    setEditingMetadata(true);
  }

  function submitMetadataUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUpdateMetadataError(null);
    if (updatedTitle.trim().length === 0) {
      setUpdateMetadataError("Enter a listing title.");
      return;
    }
    if (new TextEncoder().encode(updatedTitle).length > 100) {
      setUpdateMetadataError(
        "Listing title must be no more than 100 UTF-8 bytes.",
      );
      return;
    }
    if (new TextEncoder().encode(updatedDescription).length > 3_000) {
      setUpdateMetadataError(
        "Listing description must be no more than 3000 UTF-8 bytes.",
      );
      return;
    }
    onUpdateMetadata(auction, {
      title: updatedTitle,
      description: updatedDescription,
    });
  }

  return (
    <article className="listing-card auction-card">
      <div className="listing-card-heading">
        <strong>{auction.title ?? `Listing ${auction.listingId}`}</strong>
        <span
          className={
            auction.isClosed
              ? "closed-badge"
              : auction.isKybVerified
                ? "listing-badge"
                : "kyb-pending"
          }
        >
          {auction.isClosed
            ? "BUYOUT COMPLETE"
            : auction.isKybVerified
              ? "KYB VERIFIED"
              : "KYB PENDING"}
        </span>
      </div>
      {auction.description && (
        <p className="auction-description">{auction.description}</p>
      )}
      {isSupplier && auction.metadataInitialized && (
        <div className="auction-metadata-editor">
          {editingMetadata ? (
            <form
              className="listing-form metadata-form"
              onSubmit={submitMetadataUpdate}
            >
              <label>
                Public listing name
                <input
                  maxLength={100}
                  onChange={(event) => setUpdatedTitle(event.target.value)}
                  required
                  value={updatedTitle}
                />
              </label>
              <label>
                Public description
                <textarea
                  maxLength={3_000}
                  onChange={(event) =>
                    setUpdatedDescription(event.target.value)
                  }
                  required
                  rows={3}
                  value={updatedDescription}
                />
                <span className="input-unit">
                  {new TextEncoder().encode(updatedDescription).length}/3000
                  UTF-8 bytes
                </span>
              </label>
              {updateMetadataError && (
                <div className="notice error-notice" role="alert">
                  {updateMetadataError}
                </div>
              )}
              <div className="metadata-edit-actions">
                <button
                  className="primary-button"
                  disabled={busy}
                  type="submit"
                >
                  {busy ? "Waiting for wallet…" : "Save listing details"}
                </button>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setEditingMetadata(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              className="secondary-button auction-metadata-edit-action"
              disabled={busy}
              onClick={openMetadataEditor}
              type="button"
            >
              Edit listing details
            </button>
          )}
        </div>
      )}
      <div className="listing-terms auction-terms">
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
        <span>
          {auction.isClosed
            ? `Buyout ${lamportsToSol(auction.buyoutPriceLamports)} SOL`
            : `Highest ${lamportsToSol(auction.currentHighestBid)} SOL`}
        </span>
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
      {auction.isClosed && (
        <p className="auction-detail">
          This listing has ended permanently. The buyout winner is{" "}
          {auction.currentWinner
            ? shortAddress(auction.currentWinner)
            : "not recorded"}
          .
        </p>
      )}
      {!auction.metadataInitialized && (
        <div className="notice warning-notice">
          <strong>Public listing details are not initialized.</strong>
          <p>
            This listing predates on-chain metadata. Its supplier must publish
            the title, description, and optional buyout before bidding can
            continue.
          </p>
          {isSupplier && (
            <form
              className="listing-form metadata-form"
              onSubmit={submitMetadata}
            >
              <label>
                Public listing name
                <input
                  maxLength={100}
                  onChange={(event) => setMetadataTitle(event.target.value)}
                  required
                  value={metadataTitle}
                />
              </label>
              <label>
                Public description
                <textarea
                  maxLength={3_000}
                  onChange={(event) =>
                    setMetadataDescription(event.target.value)
                  }
                  required
                  rows={3}
                  value={metadataDescription}
                />
              </label>
              <label>
                Buyout price <span className="input-unit">SOL</span>
                <input
                  inputMode="decimal"
                  min="0"
                  onChange={(event) =>
                    setMetadataBuyoutPriceSol(event.target.value)
                  }
                  required
                  step="any"
                  type="number"
                  value={metadataBuyoutPriceSol}
                />
              </label>
              {metadataError && (
                <div className="notice error-notice" role="alert">
                  {metadataError}
                </div>
              )}
              <button className="primary-button" disabled={busy} type="submit">
                {busy ? "Waiting for wallet…" : "Publish listing details"}
              </button>
            </form>
          )}
        </div>
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
      {settlementDue && unsettledBidAmount > 0n && !auction.isClosed && (
        <p className="form-hint">
          The next successful bid will settle this cycle and pay its proceeds to
          the supplier in the same transaction.
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

      {auction.metadataInitialized && !auction.isClosed && (
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
            Bids must exceed the current highest bid. Outbid leaders are
            refunded immediately. Your ad image URL is stored with your bid and
            shown while you are the leader; the limit is 128 UTF-8 bytes.
          </p>
          {BigInt(auction.buyoutPriceLamports) > 0n && (
            <p className="form-hint">
              A bid at or above the {lamportsToSol(auction.buyoutPriceLamports)}{" "}
              SOL buyout permanently ends this listing. Any amount above the
              buyout is refunded in the same transaction.
            </p>
          )}
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
            disabled={
              busy ||
              !walletAddress ||
              !auction.isKybVerified ||
              auction.isClosed ||
              !auction.metadataInitialized
            }
            type="submit"
          >
            {busy ? "Waiting for wallet…" : "Place bid"}
          </button>
        </form>
      )}

      {walletAddress &&
        auction.metadataInitialized &&
        claimableAfterSettlement > 0n && (
          <>
            <p className="form-hint">
              Any connected wallet can trigger this payout; the supplier
              receives the SOL and the caller pays the transaction fee.
            </p>
            <button
              className="secondary-button auction-claim-action"
              disabled={busy}
              onClick={() => onClaim(auction)}
              type="button"
            >
              Settle and pay supplier{" "}
              {lamportsToSol(claimableAfterSettlement.toString())} SOL
            </button>
          </>
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
