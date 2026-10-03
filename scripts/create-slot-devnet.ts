import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import { AdMarketplace } from "../target/types/ad_marketplace";

const DEVNET_RPC = "https://api.devnet.solana.com";

describe("create_slot on Devnet", () => {
  it("creates and verifies a listing", async () => {
    const provider = anchor.AnchorProvider.env();
    if (new URL(provider.connection.rpcEndpoint).origin !== DEVNET_RPC) {
      throw new Error(`This example only runs on ${DEVNET_RPC}.`);
    }
    anchor.setProvider(provider);

    const program = anchor.workspace.adMarketplace as Program<AdMarketplace>;
    const programAccount = await provider.connection.getAccountInfo(
      program.programId,
      "confirmed",
    );
    if (!programAccount?.executable) {
      throw new Error(
        `Program ${program.programId.toBase58()} is not deployed on Devnet.`,
      );
    }

    const seller = provider.wallet.publicKey;
    const balance = await provider.connection.getBalance(seller, "confirmed");
    if (balance === 0) {
      throw new Error(
        `The seller wallet needs Devnet SOL. Fund it with: solana airdrop 2 --url ${DEVNET_RPC}`,
      );
    }

    const slotId = new anchor.BN(Date.now())
      .muln(1_000)
      .addn(Math.floor(Math.random() * 1_000));
    const adSlot = deriveAdSlot(seller, slotId, program.programId);
    const existingSlot = await provider.connection.getAccountInfo(
      adSlot,
      "confirmed",
    );
    if (existingSlot) {
      throw new Error(
        `Slot ${slotId.toString()} already exists; run the example again for a fresh ID.`,
      );
    }

    const priceLamports = new anchor.BN(100_000_000);
    const contentUri = `https://example.com/campaign/devnet-${slotId.toString()}`;
    const signature = await program.methods
      .createSlot(slotId, priceLamports, contentUri)
      .accountsPartial({
        seller,
        adSlot,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const createdSlot = await program.account.adSlot.fetch(adSlot, "confirmed");
    assert.equal(createdSlot.seller.toBase58(), seller.toBase58());
    assert.equal(createdSlot.slotId.toString(), slotId.toString());

    console.log(
      JSON.stringify(
        {
          cluster: "devnet",
          programId: program.programId.toBase58(),
          signature,
          explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
          adSlot: adSlot.toBase58(),
          slotId: slotId.toString(),
          priceLamports: priceLamports.toString(),
        },
        null,
        2,
      ),
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
