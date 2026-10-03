import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { SystemProgram, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";
import { AdMarketplace } from "../target/types/ad_marketplace";

describe("ad_marketplace", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.adMarketplace as Program<AdMarketplace>;
  const connection = provider.connection;
  const seller = provider.wallet.publicKey;
  const buyer = Keypair.generate();

  before(async () => {
    const signature = await connection.requestAirdrop(
      buyer.publicKey,
      2 * LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(signature, "confirmed");
  });

  it("creates and sells a slot atomically, then rejects a second buyer", async () => {
    const slotId = new anchor.BN(1);
    const priceLamports = new anchor.BN(LAMPORTS_PER_SOL / 10);
    const adSlot = deriveAdSlot(seller, slotId, program.programId);

    await program.methods
      .createSlot(slotId, priceLamports, "https://example.com/campaign/1")
      .accountsPartial({
        seller,
        adSlot,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const sellerBalanceBefore = await connection.getBalance(seller);

    await program.methods
      .buySlot(slotId)
      .accountsPartial({
        buyer: buyer.publicKey,
        adSlot,
        seller,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    const sellerBalanceAfter = await connection.getBalance(seller);
    const purchasedSlot = await program.account.adSlot.fetch(adSlot);

    assert.equal(
      sellerBalanceAfter - sellerBalanceBefore,
      priceLamports.toNumber(),
    );
    assert.equal(purchasedSlot.seller.toBase58(), seller.toBase58());
    assert.equal(purchasedSlot.buyer?.toBase58(), buyer.publicKey.toBase58());
    assert.deepEqual(purchasedSlot.status, { sold: {} });

    await expectInstructionFailure(
      program.methods
        .buySlot(slotId)
        .accountsPartial({
          buyer: buyer.publicKey,
          adSlot,
          seller,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc(),
      "SlotNotAvailable",
    );
  });

  it("allows the seller to cancel an available slot and prevents its purchase", async () => {
    const slotId = new anchor.BN(2);
    const priceLamports = new anchor.BN(LAMPORTS_PER_SOL / 10);
    const adSlot = deriveAdSlot(seller, slotId, program.programId);

    await program.methods
      .createSlot(slotId, priceLamports, "https://example.com/campaign/2")
      .accountsPartial({
        seller,
        adSlot,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .cancelSlot(slotId)
      .accountsPartial({ seller, adSlot })
      .rpc();

    const cancelledSlot = await program.account.adSlot.fetch(adSlot);
    assert.deepEqual(cancelledSlot.status, { cancelled: {} });

    await expectInstructionFailure(
      program.methods
        .buySlot(slotId)
        .accountsPartial({
          buyer: buyer.publicKey,
          adSlot,
          seller,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc(),
      "SlotNotAvailable",
    );
  });

  it("rejects a zero-price listing", async () => {
    const slotId = new anchor.BN(3);
    const adSlot = deriveAdSlot(seller, slotId, program.programId);

    await expectInstructionFailure(
      program.methods
        .createSlot(slotId, new anchor.BN(0), "https://example.com/campaign/3")
        .accountsPartial({
          seller,
          adSlot,
          systemProgram: SystemProgram.programId,
        })
        .rpc(),
      "InvalidPrice",
    );
  });
});

function deriveAdSlot(
  seller: anchor.web3.PublicKey,
  slotId: anchor.BN,
  programId: anchor.web3.PublicKey,
) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("ad_slot"),
      seller.toBuffer(),
      slotId.toArrayLike(Buffer, "le", 8),
    ],
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
