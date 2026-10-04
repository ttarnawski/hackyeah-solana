import { describe, expect, it } from "vitest";
import {
  assertSolanaGenesisHash,
  assertSolanaRpcConfiguration,
  DEVNET_GENESIS_HASH,
} from "./solana";

describe("Solana network configuration", () => {
  it("keeps Localnet restricted to loopback RPC", () => {
    expect(() =>
      assertSolanaRpcConfiguration("localnet", "http://127.0.0.1:8899"),
    ).not.toThrow();
    expect(() =>
      assertSolanaRpcConfiguration("localnet", "https://api.devnet.solana.com"),
    ).toThrow("Localnet requires a loopback RPC endpoint.");
  });

  it("requires HTTPS for Devnet RPC", () => {
    expect(() =>
      assertSolanaRpcConfiguration("devnet", "https://api.devnet.solana.com"),
    ).not.toThrow();
    expect(() =>
      assertSolanaRpcConfiguration("devnet", "http://api.devnet.solana.com"),
    ).toThrow("Devnet requires a non-loopback HTTPS RPC endpoint.");
    expect(() =>
      assertSolanaRpcConfiguration("devnet", "http://127.0.0.1:8899"),
    ).toThrow("Devnet requires a non-loopback HTTPS RPC endpoint.");
  });

  it("rejects unsupported clusters and malformed RPC URLs", () => {
    expect(() =>
      assertSolanaRpcConfiguration(
        "mainnet",
        "https://api.mainnet-beta.solana.com",
      ),
    ).toThrow("VITE_SOLANA_CLUSTER must be either localnet or devnet.");
    expect(() => assertSolanaRpcConfiguration("devnet", "not a URL")).toThrow(
      "VITE_SOLANA_RPC_URL must be a valid URL.",
    );
  });

  it("verifies the RPC genesis hash before using Devnet", () => {
    expect(() =>
      assertSolanaGenesisHash("devnet", DEVNET_GENESIS_HASH),
    ).not.toThrow();
    expect(() => assertSolanaGenesisHash("devnet", "not-devnet")).toThrow(
      "The configured RPC endpoint is not Solana Devnet",
    );
    expect(() =>
      assertSolanaGenesisHash("localnet", "local-validator-genesis"),
    ).not.toThrow();
  });
});
