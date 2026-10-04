import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { loadBackendConfig } from "../src/config.js";
import { buildServer } from "../src/server.js";

describe("marketplace backend", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const config = loadBackendConfig({
      FRONTEND_ORIGIN: "http://localhost:5173",
      SOLANA_CLUSTER: "localnet",
      SOLANA_RPC_URL: "http://127.0.0.1:8899",
      DATABASE_PATH: ":memory:",
      NODE_ENV: "test",
    });
    app = buildServer({ config });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("exposes a health endpoint without wallet authentication", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("does not expose legacy wallet-auth or listing-draft endpoints", async () => {
    const paths = [
      ["/api/auth/challenge", "POST"],
      ["/api/auth/session", "GET"],
      ["/api/auth/logout", "POST"],
      ["/api/listing-drafts", "GET"],
      ["/api/listing-drafts", "POST"],
    ] as const;

    for (const [url, method] of paths) {
      const response = await app.inject({ method, url });
      expect(response.statusCode).toBe(404);
    }
  });
});
