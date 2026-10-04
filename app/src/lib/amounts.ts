const LAMPORTS_PER_SOL = 1_000_000_000n;

export function solToLamports(value: string, allowZero = false): string {
  const match = /^(0|[1-9]\d*)(?:\.(\d{0,9}))?$/.exec(value.trim());
  if (!match) {
    throw new Error("Enter a SOL amount with at most 9 decimal places.");
  }

  const whole = BigInt(match[1]);
  const fractional = BigInt((match[2] ?? "").padEnd(9, "0") || "0");
  const lamports = whole * LAMPORTS_PER_SOL + fractional;
  if ((!allowZero && lamports <= 0n) || lamports > (1n << 64n) - 1n) {
    throw new Error(
      allowZero
        ? "Amount must be a non-negative value within the Solana u64 range."
        : "Amount must be a positive value within the Solana u64 range.",
    );
  }
  return lamports.toString();
}

export function lamportsToSol(value: string): string {
  const lamports = BigInt(value);
  const whole = lamports / LAMPORTS_PER_SOL;
  const fractional = (lamports % LAMPORTS_PER_SOL)
    .toString()
    .padStart(9, "0")
    .replace(/0+$/, "");
  return fractional ? `${whole}.${fractional}` : whole.toString();
}
