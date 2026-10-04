import { describe, expect, it } from "vitest";
import { lamportsToSol, solToLamports } from "./amounts";

describe("SOL and lamport conversion", () => {
  it("converts decimal SOL without floating-point rounding", () => {
    expect(solToLamports("1.000000001")).toBe("1000000001");
    expect(solToLamports("0.05")).toBe("50000000");
    expect(lamportsToSol("1000000001")).toBe("1.000000001");
  });

  it("rejects invalid precision and non-positive amounts", () => {
    expect(() => solToLamports("0.0000000001")).toThrow();
    expect(() => solToLamports("0")).toThrow();
    expect(() => solToLamports("-1")).toThrow();
    expect(solToLamports("0", true)).toBe("0");
  });
});
