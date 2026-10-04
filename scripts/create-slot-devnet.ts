import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import type { AdMarketplace } from "../target/types/ad_marketplace";

const DEVNET_RPC = "https://api.devnet.solana.com";

describe("create_listing on Devnet", () => {
  it("creates a recurring auction listing", async () => {
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

    const supplier = provider.wallet.publicKey;
    const balance = await provider.connection.getBalance(supplier, "confirmed");
    if (balance === 0) {
      throw new Error(
        `The supplier wallet needs Devnet SOL. Fund it with: solana airdrop 2 --url ${DEVNET_RPC}`,
      );
    }

    const listingId = new anchor.BN(Date.now())
      .muln(1_000)
      .addn(Math.floor(Math.random() * 1_000));
    const auction = deriveAuction(supplier, listingId, program.programId);
    const vault = deriveVault(auction, program.programId);
    const existingAuction = await provider.connection.getAccountInfo(
      auction,
      "confirmed",
    );
    if (existingAuction) {
      throw new Error(
        `Listing ${listingId.toString()} already exists; run the example again for a fresh ID.`,
      );
    }

    const kybId = 1_234_567;
    const currentSlot = await provider.connection.getSlot("confirmed");
    const currentBlockTime =
      await provider.connection.getBlockTime(currentSlot);
    if (currentBlockTime === null) {
      throw new Error(
        `No block time is available for Devnet slot ${currentSlot}.`,
      );
    }
    const initialAuctionEndTs = new anchor.BN(currentBlockTime + 86_400);
    const cycleDuration = new anchor.BN(30 * 86_400);
    const title = "Devnet homepage placement";
    const description = "Recurring advertising space on the homepage.";
    const buyoutPrice = new anchor.BN(1_000_000_000);
    const signature = await program.methods
      .createListing(
        listingId,
        kybId,
        title,
        description,
        buyoutPrice,
        initialAuctionEndTs,
        cycleDuration,
      )
      .accountsPartial({
        supplier,
        auction,
        listingMetadata: deriveListingMetadata(auction, program.programId),
        vault,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const createdAuction = await program.account.auction.fetch(
      auction,
      "confirmed",
    );
    assert.equal(createdAuction.supplier.toBase58(), supplier.toBase58());
    assert.equal(createdAuction.listingId.toString(), listingId.toString());
    assert.equal(createdAuction.kybId, kybId);
    assert.equal(createdAuction.cycleNumber.toNumber(), 0);
    assert.equal(
      createdAuction.cycleStartTs.toString(),
      initialAuctionEndTs.toString(),
    );
    assert.equal(
      createdAuction.cycleDuration.toNumber(),
      cycleDuration.toNumber(),
    );

    console.log(
      JSON.stringify(
        {
          cluster: "devnet",
          programId: program.programId.toBase58(),
          signature,
          explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
          auction: auction.toBase58(),
          vault: vault.toBase58(),
          listingId: listingId.toString(),
          initialAuctionEnd: new Date(
            initialAuctionEndTs.toNumber() * 1_000,
          ).toISOString(),
          cycleDuration: cycleDuration.toString(),
        },
        null,
        2,
      ),
    );
  });
});

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

function deriveListingMetadata(
  auction: anchor.web3.PublicKey,
  programId: anchor.web3.PublicKey,
) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("listing_metadata"), auction.toBuffer()],
    programId,
  )[0];
}
