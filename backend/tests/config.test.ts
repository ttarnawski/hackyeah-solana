import { describe, expect, it } from "vitest";
import { loadBackendConfig } from "../src/config.js";

describe("backend configuration defaults", () => {
  it("uses the workspace Localnet RPC by default", () => {
    const config = loadBackendConfig({ DATABASE_PATH: ":memory:" });

    expect(config.solanaCluster).toBe("localnet");
    expect(config.solanaRpcUrl).toBe("http://127.0.0.1:8899/");
  });
});
