import {
  AnchorProvider,
  BN,
  BorshAccountsCoder,
  Program,
  type Idl,
} from "@anchor-lang/core";
import type { AnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, type Connection } from "@solana/web3.js";
import { solanaCluster, solanaRpcUrl } from "./solana";

export const LOCALNET_PROGRAM_ID =
  "5dKLaVXqzR6Ja4GpkfseLCuPGDdnUFZ4cs6YkUSzMTdF";

const IDL_PATH = `${import.meta.env.BASE_URL}idl/ad_marketplace.json`;
const REQUIRED_INSTRUCTIONS = [
  "initialize_config",
  "create_listing",
  "verify_supplier_kyb",
  "place_bid",
  "claim_funds",
];
const U64_MAX = (1n << 64n) - 1n;
const I64_MAX = (1n << 63n) - 1n;
const textEncoder = new TextEncoder();

interface RawAuctionAccountData {
  supplier: PublicKey;
  listing_id: BN;
  kyb_id: number;
  is_kyb_verified: boolean;
  cycle_number: BN;
  cycle_start_ts: BN;
  cycle_duration: BN;
  current_highest_bid: BN;
  current_winner: PublicKey;
  ad_url: number[] | Uint8Array;
  ad_url_len: number;
  supplier_claimable: BN;
}

interface ConfigAccountData {
  admin: PublicKey;
}

export interface OnChainAuction {
  address: string;
  supplier: string;
  listingId: string;
  kybId: number;
  isKybVerified: boolean;
  cycleNumber: string;
  cycleStartTs: string;
  cycleDuration: string;
  currentHighestBid: string;
  currentWinner: string | null;
  adUrl: string;
  supplierClaimable: string;
}

export interface AuctionSnapshot {
  programId: string;
  admin: string | null;
  auctions: OnChainAuction[];
}

export class AuctionProgramNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuctionProgramNotReadyError";
  }
}

export function createListingId(
  nowMilliseconds = Date.now(),
  random = Math.random(),
): string {
  if (
    !Number.isSafeInteger(nowMilliseconds) ||
    nowMilliseconds < 0 ||
    !Number.isFinite(random) ||
    random < 0 ||
    random >= 1
  ) {
    throw new Error("Could not generate a valid listing ID.");
  }
  return (
    BigInt(nowMilliseconds) * 1_000_000n +
    BigInt(Math.floor(random * 1_000_000))
  ).toString();
}

export function encodeU64LittleEndian(value: string | bigint): Uint8Array {
  const integer = parseUnsignedInteger(value, "Listing ID", U64_MAX);
  const bytes = new Uint8Array(8);
  let remainder = integer;
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number(remainder & 0xffn);
    remainder >>= 8n;
  }
  return bytes;
}

export function deriveConfigPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("config")],
    programId,
  )[0];
}

export function deriveAuctionPda(
  supplier: PublicKey,
  listingId: string | bigint,
  programId: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      textEncoder.encode("auction"),
      supplier.toBytes(),
      encodeU64LittleEndian(listingId),
    ],
    programId,
  )[0];
}

export function deriveVaultPda(
  auction: PublicKey,
  programId: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("vault"), auction.toBytes()],
    programId,
  )[0];
}

export async function fetchAuctionSnapshot(
  connection: Connection,
): Promise<AuctionSnapshot> {
  const { idl, programId } = await loadProgramDefinition();
  await requireDeployedProgram(connection, programId);

  const coder = new BorshAccountsCoder(idl);
  const [auctionAccounts, configInfo] = await Promise.all([
    connection.getProgramAccounts(programId, {
      commitment: "confirmed",
      filters: [{ memcmp: coder.memcmp("Auction") }],
    }),
    connection.getAccountInfo(deriveConfigPda(programId), "confirmed"),
  ]);

  const auctions = auctionAccounts.map(({ pubkey, account }) => {
    const auction = coder.decode<RawAuctionAccountData>(
      "Auction",
      account.data,
    );
    return mapRawAuctionAccount(pubkey, auction);
  });

  const admin = configInfo
    ? coder
        .decode<ConfigAccountData>("Config", configInfo.data)
        .admin.toBase58()
    : null;

  auctions.sort((left, right) => {
    const leftId = BigInt(left.listingId);
    const rightId = BigInt(right.listingId);
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  });

  return { programId: programId.toBase58(), admin, auctions };
}

export function mapRawAuctionAccount(
  address: PublicKey,
  auction: RawAuctionAccountData,
): OnChainAuction {
  const adUrlBytes = auction.ad_url;
  if (
    (!Array.isArray(adUrlBytes) && !(adUrlBytes instanceof Uint8Array)) ||
    !Number.isInteger(auction.ad_url_len) ||
    auction.ad_url_len < 0 ||
    auction.ad_url_len > adUrlBytes.length
  ) {
    throw new Error(`Auction ${address.toBase58()} has invalid ad URL data.`);
  }

  return {
    address: address.toBase58(),
    supplier: auction.supplier.toBase58(),
    listingId: auction.listing_id.toString(),
    kybId: auction.kyb_id,
    isKybVerified: auction.is_kyb_verified,
    cycleNumber: auction.cycle_number.toString(),
    cycleStartTs: auction.cycle_start_ts.toString(),
    cycleDuration: auction.cycle_duration.toString(),
    currentHighestBid: auction.current_highest_bid.toString(),
    currentWinner: auction.current_winner.equals(SystemProgram.programId)
      ? null
      : auction.current_winner.toBase58(),
    adUrl: new TextDecoder().decode(
      Uint8Array.from(adUrlBytes).subarray(0, auction.ad_url_len),
    ),
    supplierClaimable: auction.supplier_claimable.toString(),
  };
}

export async function initializeAdminConfig(
  connection: Connection,
  wallet: AnchorWallet,
): Promise<string> {
  const { program, programId } = await getWalletProgram(connection, wallet);
  return program.methods
    .initializeConfig()
    .accountsPartial({
      config: deriveConfigPda(programId),
      admin: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function createOnChainListing(
  connection: Connection,
  wallet: AnchorWallet,
  input: {
    listingId: string;
    kybId: number;
    initialAuctionEndTs: string;
    cycleDurationSeconds: string;
  },
): Promise<string> {
  const listingId = parseUnsignedInteger(
    input.listingId,
    "Listing ID",
    U64_MAX,
  );
  if (
    !Number.isInteger(input.kybId) ||
    input.kybId < 1_000_000 ||
    input.kybId > 9_999_999
  ) {
    throw new Error("KYB ID must be between 1000000 and 9999999.");
  }
  const initialAuctionEndTs = parseUnsignedInteger(
    input.initialAuctionEndTs,
    "Initial auction end",
    I64_MAX,
  );
  if (initialAuctionEndTs === 0n) {
    throw new Error("Initial auction end must be a positive timestamp.");
  }
  const cycleDuration = parseUnsignedInteger(
    input.cycleDurationSeconds,
    "Cycle duration",
    I64_MAX,
  );
  if (cycleDuration === 0n) {
    throw new Error("Cycle duration must be greater than zero.");
  }

  const { program, programId } = await getWalletProgram(connection, wallet);
  const auction = deriveAuctionPda(wallet.publicKey, listingId, programId);
  const vault = deriveVaultPda(auction, programId);

  return program.methods
    .createListing(
      new BN(listingId.toString()),
      input.kybId,
      new BN(initialAuctionEndTs.toString()),
      new BN(cycleDuration.toString()),
    )
    .accountsPartial({
      auction,
      vault,
      supplier: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function setSupplierKybVerified(
  connection: Connection,
  wallet: AnchorWallet,
  auctionAddress: PublicKey,
  isVerified: boolean,
): Promise<string> {
  const { program, programId } = await getWalletProgram(connection, wallet);
  return program.methods
    .verifySupplierKyb(isVerified)
    .accountsPartial({
      config: deriveConfigPda(programId),
      auction: auctionAddress,
      admin: wallet.publicKey,
    })
    .rpc();
}

export async function placeOnChainBid(
  connection: Connection,
  wallet: AnchorWallet,
  auction: OnChainAuction,
  bidAmountLamports: string,
  adUrl: string,
): Promise<string> {
  const bidAmount = parseUnsignedInteger(
    bidAmountLamports,
    "Bid amount",
    U64_MAX,
  );
  if (bidAmount === 0n) {
    throw new Error("Bid amount must be greater than zero.");
  }
  if (textEncoder.encode(adUrl).length > 128) {
    throw new Error("Ad URL must be no more than 128 bytes.");
  }

  const { program, programId } = await getWalletProgram(connection, wallet);
  const auctionAddress = new PublicKey(auction.address);
  const vault = deriveVaultPda(auctionAddress, programId);
  const previousWinner = auction.currentWinner
    ? new PublicKey(auction.currentWinner)
    : wallet.publicKey;

  return program.methods
    .placeBid(new BN(bidAmount.toString()), adUrl)
    .accountsPartial({
      auction: auctionAddress,
      vault,
      bidder: wallet.publicKey,
      previousWinner,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function claimSupplierFunds(
  connection: Connection,
  wallet: AnchorWallet,
  auction: OnChainAuction,
): Promise<string> {
  const { program, programId } = await getWalletProgram(connection, wallet);
  const auctionAddress = new PublicKey(auction.address);
  return program.methods
    .claimFunds()
    .accountsPartial({
      auction: auctionAddress,
      vault: deriveVaultPda(auctionAddress, programId),
      supplier: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

async function getWalletProgram(
  connection: Connection,
  wallet: AnchorWallet,
): Promise<{ program: Program<Idl>; programId: PublicKey }> {
  const { idl, programId } = await loadProgramDefinition();
  await requireDeployedProgram(connection, programId);

  const provider = new AnchorProvider(connection, wallet, {
    ...AnchorProvider.defaultOptions(),
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  return { program: new Program<Idl>(idl, provider), programId };
}

async function loadProgramDefinition(): Promise<{
  idl: Idl;
  programId: PublicKey;
}> {
  assertLocalnetConfiguration();
  const programId = readProgramId();
  const response = await fetch(IDL_PATH, { cache: "no-store" });
  if (!response.ok) {
    throw new AuctionProgramNotReadyError(
      "The generated Anchor IDL is missing. Run `anchor build` and `pnpm sync:anchor-idl` from the repository root.",
    );
  }

  let rawIdl: unknown;
  try {
    rawIdl = await response.json();
  } catch {
    throw new AuctionProgramNotReadyError(
      "The generated Anchor IDL could not be parsed. Rebuild and sync the IDL.",
    );
  }
  if (!isIdl(rawIdl)) {
    throw new AuctionProgramNotReadyError(
      "The generated Anchor IDL is invalid. Rebuild and sync the IDL.",
    );
  }
  if (rawIdl.address !== programId.toBase58()) {
    throw new AuctionProgramNotReadyError(
      `IDL address ${rawIdl.address} does not match configured Localnet program ${programId.toBase58()}.`,
    );
  }

  const availableInstructions = new Set(
    rawIdl.instructions.map((instruction) => instruction.name),
  );
  const missingInstructions = REQUIRED_INSTRUCTIONS.filter(
    (instruction) => !availableInstructions.has(instruction),
  );
  if (missingInstructions.length > 0) {
    throw new AuctionProgramNotReadyError(
      `The generated Anchor IDL is out of date (missing ${missingInstructions.join(", ")}). Run \`anchor build\` and \`pnpm sync:anchor-idl\`.`,
    );
  }

  return { idl: rawIdl, programId };
}

async function requireDeployedProgram(
  connection: Connection,
  programId: PublicKey,
): Promise<void> {
  const programAccount = await connection.getAccountInfo(
    programId,
    "confirmed",
  );
  if (!programAccount?.executable) {
    throw new AuctionProgramNotReadyError(
      `Auction program ${programId.toBase58()} is not deployed to the configured Localnet validator.`,
    );
  }
}

function readProgramId(): PublicKey {
  const configured =
    import.meta.env.VITE_AUCTION_PROGRAM_ID?.trim() || LOCALNET_PROGRAM_ID;
  try {
    return new PublicKey(configured);
  } catch {
    throw new AuctionProgramNotReadyError(
      "VITE_AUCTION_PROGRAM_ID is not a valid Solana public key.",
    );
  }
}

function assertLocalnetConfiguration(): void {
  if (solanaCluster !== "localnet") {
    throw new AuctionProgramNotReadyError(
      "On-chain auction actions are currently restricted to Localnet.",
    );
  }

  let hostname: string;
  try {
    hostname = new URL(solanaRpcUrl).hostname;
  } catch {
    throw new AuctionProgramNotReadyError(
      "VITE_SOLANA_RPC_URL must be a valid Localnet RPC URL.",
    );
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname)) {
    throw new AuctionProgramNotReadyError(
      "On-chain auction actions require a loopback Localnet RPC endpoint.",
    );
  }
}

function isIdl(value: unknown): value is Idl {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.address === "string" &&
    typeof candidate.metadata === "object" &&
    candidate.metadata !== null &&
    Array.isArray(candidate.instructions) &&
    Array.isArray(candidate.accounts)
  );
}

function parseUnsignedInteger(
  value: string | bigint,
  label: string,
  maximum: bigint,
): bigint {
  if (
    (typeof value === "string" && !/^\d+$/.test(value)) ||
    (typeof value === "bigint" && value < 0n)
  ) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  const integer = typeof value === "bigint" ? value : BigInt(value);
  if (integer > maximum) {
    throw new Error(`${label} is outside the supported on-chain range.`);
  }
  return integer;
}
