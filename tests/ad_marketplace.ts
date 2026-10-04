import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { Keypair, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import { AdMarketplace } from "../target/types/ad_marketplace";

describe("ad_marketplace initial and recurring auctions", function () {
  this.timeout(120_000);

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.adMarketplace as Program<AdMarketplace>;
  const connection = provider.connection;
  const admin = provider.wallet.publicKey;
  const supplier = Keypair.generate();
  const bidderA = Keypair.generate();
  const bidderB = Keypair.generate();
  const bidderC = Keypair.generate();
  const listingId = new anchor.BN(Date.now())
    .muln(1_000)
    .addn(Math.floor(Math.random() * 1_000));
  const config = deriveConfig(program.programId);
  const auction = deriveAuction(
    supplier.publicKey,
    listingId,
    program.programId,
  );
  const vault = deriveVault(auction, program.programId);

  before(async () => {
    for (const wallet of [supplier, bidderA, bidderB, bidderC]) {
      const signature = await connection.requestAirdrop(
        wallet.publicKey,
        4 * LAMPORTS_PER_SOL,
      );
      await connection.confirmTransaction(signature, "confirmed");
    }
  });

  it("gates bidding on KYB, refunds outbid leaders, rolls cycles, and pays the supplier", async () => {
    await program.methods
      .initializeConfig()
      .accountsPartial({
        config,
        admin,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    assert.equal(
      (await connection.getAccountInfo(config, "confirmed"))?.data.length,
      41,
    );
    const configAccount = await program.account.config.fetch(
      config,
      "confirmed",
    );
    assert.equal(configAccount.admin.toBase58(), admin.toBase58());

    const currentSlot = await connection.getSlot("confirmed");
    const currentBlockTime = await connection.getBlockTime(currentSlot);
    if (currentBlockTime === null) {
      throw new Error(
        `No block time is available for local slot ${currentSlot}.`,
      );
    }
    const initialAuctionEndTs = new anchor.BN(currentBlockTime + 60);

    await expectInstructionFailure(
      program.methods
        .createListing(
          listingId,
          1_234_567,
          new anchor.BN(currentBlockTime),
          new anchor.BN(3),
        )
        .accountsPartial({
          auction,
          vault,
          supplier: supplier.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([supplier])
        .rpc(),
      "InitialAuctionEndMustBeFuture",
    );

    await program.methods
      .createListing(
        listingId,
        1_234_567,
        initialAuctionEndTs,
        new anchor.BN(3),
      )
      .accountsPartial({
        auction,
        vault,
        supplier: supplier.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([supplier])
      .rpc();

    assert.equal(
      (await connection.getAccountInfo(auction, "confirmed"))?.data.length,
      256,
    );
    const initialAuction = await program.account.auction.fetch(
      auction,
      "confirmed",
    );
    assert.equal(initialAuction.cycleNumber.toNumber(), 0);
    assert.equal(
      initialAuction.cycleStartTs.toString(),
      initialAuctionEndTs.toString(),
    );

    await expectInstructionFailure(
      program.methods
        .placeBid(sol(1), "https://example.com/ad-a")
        .accountsPartial({
          auction,
          vault,
          bidder: bidderA.publicKey,
          previousWinner: bidderA.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([bidderA])
        .rpc(),
      "KybNotVerified",
    );

    await program.methods
      .verifySupplierKyb(true)
      .accountsPartial({ config, auction, admin })
      .rpc();

    const bidA = sol(1);
    const bidderABalanceBeforeBid = await connection.getBalance(
      bidderA.publicKey,
      "confirmed",
    );
    await program.methods
      .placeBid(bidA, "https://example.com/ad-a")
      .accountsPartial({
        auction,
        vault,
        bidder: bidderA.publicKey,
        previousWinner: bidderA.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([bidderA])
      .rpc();

    assert.equal(
      bidderABalanceBeforeBid -
        (await connection.getBalance(bidderA.publicKey, "confirmed")),
      bidA.toNumber(),
    );
    assert.equal(
      await connection.getBalance(vault, "confirmed"),
      bidA.toNumber(),
    );

    const bidderABalanceBeforeRefund = await connection.getBalance(
      bidderA.publicKey,
      "confirmed",
    );
    const bidderBBalanceBeforeBid = await connection.getBalance(
      bidderB.publicKey,
      "confirmed",
    );
    const bidB = sol(2);
    await program.methods
      .placeBid(bidB, "https://example.com/ad-b")
      .accountsPartial({
        auction,
        vault,
        bidder: bidderB.publicKey,
        previousWinner: bidderA.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([bidderB])
      .rpc();

    assert.equal(
      bidderBBalanceBeforeBid -
        (await connection.getBalance(bidderB.publicKey, "confirmed")),
      bidB.toNumber(),
    );
    assert.equal(
      (await connection.getBalance(bidderA.publicKey, "confirmed")) -
        bidderABalanceBeforeRefund,
      bidA.toNumber(),
    );
    assert.equal(
      await connection.getBalance(vault, "confirmed"),
      bidB.toNumber(),
    );

    await new Promise((resolve) => setTimeout(resolve, 4_000));
    await advanceSurfpoolClockToTimestamp(
      connection,
      initialAuctionEndTs.toNumber(),
    );

    const bidC = sol(0.5);
    const bidderCBalanceBeforeBid = await connection.getBalance(
      bidderC.publicKey,
      "confirmed",
    );
    await program.methods
      .placeBid(bidC, "https://example.com/ad-c")
      .accountsPartial({
        auction,
        vault,
        bidder: bidderC.publicKey,
        previousWinner: bidderB.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([bidderC])
      .rpc();

    assert.equal(
      bidderCBalanceBeforeBid -
        (await connection.getBalance(bidderC.publicKey, "confirmed")),
      bidC.toNumber(),
    );
    assert.equal(
      await connection.getBalance(vault, "confirmed"),
      bidB.add(bidC).toNumber(),
    );

    const auctionAfterRollover = await program.account.auction.fetch(
      auction,
      "confirmed",
    );
    assert.equal(auctionAfterRollover.cycleNumber.toNumber(), 1);
    assert.equal(
      auctionAfterRollover.cycleStartTs.toString(),
      initialAuctionEndTs.toString(),
    );
    assert.equal(
      auctionAfterRollover.supplierClaimable.toNumber(),
      bidB.toNumber(),
    );
    assert.equal(
      auctionAfterRollover.currentHighestBid.toNumber(),
      bidC.toNumber(),
    );
    assert.equal(
      auctionAfterRollover.currentWinner.toBase58(),
      bidderC.publicKey.toBase58(),
    );
    assert.equal(
      Buffer.from(auctionAfterRollover.adUrl)
        .subarray(0, auctionAfterRollover.adUrlLen)
        .toString("utf8"),
      "https://example.com/ad-c",
    );

    const supplierBalanceBeforeClaim = await connection.getBalance(
      supplier.publicKey,
      "confirmed",
    );
    await program.methods
      .claimFunds()
      .accountsPartial({
        auction,
        vault,
        supplier: supplier.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([supplier])
      .rpc();

    assert.equal(
      (await connection.getBalance(supplier.publicKey, "confirmed")) -
        supplierBalanceBeforeClaim,
      bidB.toNumber(),
    );
    assert.equal(
      await connection.getBalance(vault, "confirmed"),
      bidC.toNumber(),
    );

    const auctionAfterInitialClaim = await program.account.auction.fetch(
      auction,
      "confirmed",
    );
    assert.equal(auctionAfterInitialClaim.supplierClaimable.toNumber(), 0);
    assert.equal(
      auctionAfterInitialClaim.currentHighestBid.toNumber(),
      bidC.toNumber(),
    );

    await advanceSurfpoolClockToTimestamp(
      connection,
      initialAuctionEndTs.toNumber() + 3,
    );
    const bidD = sol(0.75);
    await program.methods
      .placeBid(bidD, "https://example.com/ad-d")
      .accountsPartial({
        auction,
        vault,
        bidder: bidderA.publicKey,
        previousWinner: bidderC.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([bidderA])
      .rpc();

    const auctionAfterRecurringRollover = await program.account.auction.fetch(
      auction,
      "confirmed",
    );
    assert.equal(auctionAfterRecurringRollover.cycleNumber.toNumber(), 2);
    assert.equal(
      auctionAfterRecurringRollover.supplierClaimable.toNumber(),
      bidC.toNumber(),
    );
    assert.equal(
      auctionAfterRecurringRollover.currentHighestBid.toNumber(),
      bidD.toNumber(),
    );
    assert.equal(
      await connection.getBalance(vault, "confirmed"),
      bidC.add(bidD).toNumber(),
    );

    const supplierBalanceBeforeRecurringClaim = await connection.getBalance(
      supplier.publicKey,
      "confirmed",
    );
    await program.methods
      .claimFunds()
      .accountsPartial({
        auction,
        vault,
        supplier: supplier.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([supplier])
      .rpc();
    assert.equal(
      (await connection.getBalance(supplier.publicKey, "confirmed")) -
        supplierBalanceBeforeRecurringClaim,
      bidC.toNumber(),
    );
    assert.equal(
      await connection.getBalance(vault, "confirmed"),
      bidD.toNumber(),
    );
  });
});

async function advanceSurfpoolClockToTimestamp(
  connection: anchor.web3.Connection,
  targetUnixTimestamp: number,
): Promise<void> {
  const currentSlot = await connection.getSlot("confirmed");
  const currentBlockTime = await connection.getBlockTime(currentSlot);
  if (currentBlockTime === null) {
    throw new Error(
      `No block time is available for local slot ${currentSlot}.`,
    );
  }
  if (currentBlockTime >= targetUnixTimestamp) return;

  const absoluteTimestamp = (targetUnixTimestamp + 1) * 1_000;
  if (!Number.isSafeInteger(absoluteTimestamp)) {
    throw new Error(
      "The requested cycle end is outside the supported time range.",
    );
  }
  const response = await fetch(connection.rpcEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "ad-marketplace-test-time-travel",
      method: "surfnet_timeTravel",
      params: [{ absoluteTimestamp }],
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Could not advance Surfpool time (HTTP ${response.status}).`,
    );
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload)) {
    throw new Error("Surfpool returned an invalid time-travel response.");
  }
  if ("error" in payload) {
    const error = payload.error;
    const message =
      isRecord(error) && typeof error.message === "string"
        ? error.message
        : "Unknown JSON-RPC error.";
    throw new Error(`Could not advance Surfpool time: ${message}`);
  }
  if (!("result" in payload)) {
    throw new Error("Surfpool returned an incomplete time-travel response.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sol(amount: number) {
  return new anchor.BN(Math.round(amount * LAMPORTS_PER_SOL));
}

function deriveConfig(programId: anchor.web3.PublicKey) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programId,
  )[0];
}

function deriveAuction(
  supplier: anchor.web3.PublicKey,
  listingId: anchor.BN,
  programId: anchor.web3.PublicKey,
) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("auction"),
      supplier.toBuffer(),
      listingId.toArrayLike(Buffer, "le", 8),
    ],
    programId,
  )[0];
}

function deriveVault(
  auction: anchor.web3.PublicKey,
  programId: anchor.web3.PublicKey,
) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), auction.toBuffer()],
    programId,
  )[0];
}

async function expectInstructionFailure(
  instruction: Promise<unknown>,
  expectedError: string,
) {
  try {
    await instruction;
  } catch (error) {
    assert.include(String(error), expectedError);
    return;
  }

  assert.fail(`Expected instruction to fail with ${expectedError}`);
}
