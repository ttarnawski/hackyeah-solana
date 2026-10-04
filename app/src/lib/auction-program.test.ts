import { BN } from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  createListingId,
  deriveAuctionPda,
  deriveConfigPda,
  deriveVaultPda,
  encodeU64LittleEndian,
  LOCALNET_PROGRAM_ID,
  mapRawAuctionAccount,
} from "./auction-program";

const programId = new PublicKey(LOCALNET_PROGRAM_ID);
const textEncoder = new TextEncoder();

describe("auction program address helpers", () => {
  it("encodes u64 values as eight little-endian bytes", () => {
    expect([...encodeU64LittleEndian(42n)]).toEqual([42, 0, 0, 0, 0, 0, 0, 0]);
    expect([...encodeU64LittleEndian((1n << 64n) - 1n)]).toEqual(
      Array<number>(8).fill(255),
    );
    expect(() => encodeU64LittleEndian(-1n)).toThrow();
    expect(() => encodeU64LittleEndian(1n << 64n)).toThrow();
  });

  it("derives the config, auction, and vault PDAs from their program seeds", () => {
    const supplier = new PublicKey("11111111111111111111111111111111");
    const listingId = 42n;
    const auction = PublicKey.findProgramAddressSync(
      [
        textEncoder.encode("auction"),
        supplier.toBytes(),
        Uint8Array.of(42, 0, 0, 0, 0, 0, 0, 0),
      ],
      programId,
    )[0];

    expect(deriveConfigPda(programId)).toEqual(
      PublicKey.findProgramAddressSync(
        [textEncoder.encode("config")],
        programId,
      )[0],
    );
    expect(deriveAuctionPda(supplier, listingId, programId)).toEqual(auction);
    expect(deriveVaultPda(auction, programId)).toEqual(
      PublicKey.findProgramAddressSync(
        [textEncoder.encode("vault"), auction.toBytes()],
        programId,
      )[0],
    );
  });

  it("generates deterministic, valid listing IDs", () => {
    expect(createListingId(1_700_000_000_000, 0.123456)).toBe(
      "1700000000000123456",
    );
    expect(() => createListingId(1_700_000_000_000, Number.NaN)).toThrow();
    expect(() => createListingId(1_700_000_000_000, 1)).toThrow();
  });

  it("maps raw snake-case Anchor account fields into the UI snapshot", () => {
    const supplier = new PublicKey("11111111111111111111111111111111");
    const adUrl = "https://example.com/ad.png";
    const adUrlBytes = new TextEncoder().encode(adUrl);
    const rawAuction = {
      supplier,
      listing_id: new BN("1791077069850938306"),
      kyb_id: 1_234_567,
      is_kyb_verified: true,
      cycle_number: new BN(0),
      cycle_start_ts: new BN(1_800_000_000),
      cycle_duration: new BN(2_592_000),
      current_highest_bid: new BN(0),
      current_winner: PublicKey.default,
      ad_url: Array.from(adUrlBytes).concat(
        Array<number>(128 - adUrlBytes.length).fill(0),
      ),
      ad_url_len: adUrlBytes.length,
      supplier_claimable: new BN(0),
    };

    expect(mapRawAuctionAccount(programId, rawAuction)).toEqual({
      address: programId.toBase58(),
      supplier: supplier.toBase58(),
      listingId: "1791077069850938306",
      kybId: 1_234_567,
      isKybVerified: true,
      cycleNumber: "0",
      cycleStartTs: "1800000000",
      cycleDuration: "2592000",
      currentHighestBid: "0",
      currentWinner: null,
      adUrl,
      supplierClaimable: "0",
    });
    expect(() =>
      mapRawAuctionAccount(programId, { ...rawAuction, ad_url_len: 129 }),
    ).toThrow("invalid ad URL data");
  });
});
