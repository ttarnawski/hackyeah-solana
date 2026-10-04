import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { loadBackendConfig } from "../src/config.js";
import { MarketplaceDatabase } from "../src/database.js";
import { buildServer } from "../src/server.js";

const frontendOrigin = "http://localhost:5173";

describe("marketplace backend", () => {
  let app: FastifyInstance;
  let keyPair: nacl.SignKeyPair;
  let walletAddress: string;

  beforeEach(async () => {
    const config = loadBackendConfig({
      FRONTEND_ORIGIN: frontendOrigin,
      SOLANA_CLUSTER: "devnet",
      SOLANA_RPC_URL: "http://127.0.0.1:8899",
      DATABASE_PATH: ":memory:",
      SESSION_TTL_SECONDS: "3600",
      NODE_ENV: "test",
    });
    const database = new MarketplaceDatabase(":memory:");
    app = buildServer({ config, database });
    await app.ready();

    keyPair = nacl.sign.keyPair();
    walletAddress = bs58.encode(keyPair.publicKey);
  });

  afterEach(async () => {
    await app.close();
  });

  it("requires a valid wallet signature before creating a private listing draft", async () => {
    const cookie = await authenticate();
    const response = await app.inject({
      method: "POST",
      url: "/api/listing-drafts",
      headers: { origin: frontendOrigin, cookie },
      payload: {
        title: "Homepage placement",
        description: "A draft ad placement.",
        imageUrl: "https://example.com/supplier-image.png",
        startingBidLamports: "100000000",
        buyoutPriceLamports: "1000000000",
        minIncrementLamports: "50000000",
        endsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().item).toMatchObject({
      ownerWallet: walletAddress,
      startingBidLamports: "100000000",
      buyoutPriceLamports: "1000000000",
    });
    expect(response.json().item).not.toHaveProperty("imageUrl");

    const drafts = await app.inject({
      method: "GET",
      url: "/api/listing-drafts",
      headers: { cookie },
    });
    expect(drafts.statusCode).toBe(200);
    expect(drafts.json().items).toHaveLength(1);
  });

  it("rejects replayed wallet challenges and invalid auction terms", async () => {
    const challengeResponse = await app.inject({
      method: "POST",
      url: "/api/auth/challenge",
      headers: { origin: frontendOrigin },
      payload: { walletAddress },
    });
    const challenge = challengeResponse.json() as {
      nonce: string;
      message: string;
    };
    const signature = nacl.sign.detached(
      new TextEncoder().encode(challenge.message),
      keyPair.secretKey,
    );
    const signatureBase64 = Buffer.from(signature).toString("base64");
    const proof = {
      walletAddress,
      nonce: challenge.nonce,
      signature: signatureBase64,
    };
    const verified = await app.inject({
      method: "POST",
      url: "/api/auth/verify",
      headers: { origin: frontendOrigin },
      payload: proof,
    });
    expect(verified.statusCode).toBe(200);

    const replay = await app.inject({
      method: "POST",
      url: "/api/auth/verify",
      headers: { origin: frontendOrigin },
      payload: proof,
    });
    expect(replay.statusCode).toBe(401);

    const cookieHeader = verified.headers["set-cookie"];
    const cookie = (
      Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader
    )?.split(";")[0];
    expect(cookie).toBeDefined();

    const invalidDraft = await app.inject({
      method: "POST",
      url: "/api/listing-drafts",
      headers: { origin: frontendOrigin, cookie },
      payload: {
        title: "Bad auction",
        description: "",
        startingBidLamports: "1000000000",
        buyoutPriceLamports: "100000000",
        minIncrementLamports: "1",
        endsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    });
    expect(invalidDraft.statusCode).toBe(400);
    expect(invalidDraft.json().code).toBe("INVALID_LISTING_DRAFT");
  });

  it("does not expose bid success or cancellation before auction instructions exist", async () => {
    const cookie = await authenticate();

    const bids = await app.inject({
      method: "GET",
      url: "/api/me/bids",
      headers: { cookie },
    });
    expect(bids.statusCode).toBe(503);
    expect(bids.json().code).toBe("BID_INDEXER_NOT_CONFIGURED");

    const cancellation = await app.inject({
      method: "POST",
      url: "/api/listings/fake-address/cancel",
      headers: { origin: frontendOrigin, cookie },
    });
    expect(cancellation.statusCode).toBe(404);
  });

  it("rejects wallet challenges from an untrusted origin", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/challenge",
      headers: { origin: "https://unexpected.example" },
      payload: { walletAddress },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("UNTRUSTED_ORIGIN");
  });

  async function authenticate(): Promise<string> {
    const challengeResponse = await app.inject({
      method: "POST",
      url: "/api/auth/challenge",
      headers: { origin: frontendOrigin },
      payload: { walletAddress },
    });
    expect(challengeResponse.statusCode).toBe(200);

    const challenge = challengeResponse.json() as {
      nonce: string;
      message: string;
    };
    const signature = nacl.sign.detached(
      new TextEncoder().encode(challenge.message),
      keyPair.secretKey,
    );
    const verifyResponse = await app.inject({
      method: "POST",
      url: "/api/auth/verify",
      headers: { origin: frontendOrigin },
      payload: {
        walletAddress,
        nonce: challenge.nonce,
        signature: Buffer.from(signature).toString("base64"),
      },
    });
    expect(verifyResponse.statusCode).toBe(200);

    const setCookie = verifyResponse.headers["set-cookie"];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(
      ";",
    )[0];
    expect(cookie).toBeDefined();
    return cookie!;
  }
});
