import { createSolanaRpc } from "@solana/kit";

const LOCALNET_RPC_URL = "http://127.0.0.1:8899";
const DEVNET_RPC_URL = "https://api.devnet.solana.com";

export const DEVNET_GENESIS_HASH =
  "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const solanaCluster =
  import.meta.env.VITE_SOLANA_CLUSTER?.trim().toLowerCase() || "localnet";
export const solanaClusterName =
  solanaCluster.length > 0
    ? `${solanaCluster[0].toUpperCase()}${solanaCluster.slice(1)}`
    : "Unknown cluster";
export const solanaRpcUrl =
  import.meta.env.VITE_SOLANA_RPC_URL?.trim() ||
  (solanaCluster === "devnet" ? DEVNET_RPC_URL : LOCALNET_RPC_URL);
export const solanaRpc = createSolanaRpc(solanaRpcUrl);

export function assertSolanaRpcConfiguration(
  cluster: string,
  rpcUrl: string,
): void {
  let endpoint: URL;
  try {
    endpoint = new URL(rpcUrl);
  } catch {
    throw new Error("VITE_SOLANA_RPC_URL must be a valid URL.");
  }

  if (cluster !== "localnet" && cluster !== "devnet") {
    throw new Error("VITE_SOLANA_CLUSTER must be either localnet or devnet.");
  }

  const hostname = endpoint.hostname.toLowerCase();
  const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  if (cluster === "localnet" && !isLoopback) {
    throw new Error("Localnet requires a loopback RPC endpoint.");
  }
  if (cluster === "devnet" && (endpoint.protocol !== "https:" || isLoopback)) {
    throw new Error("Devnet requires a non-loopback HTTPS RPC endpoint.");
  }
}

export function assertSolanaGenesisHash(
  cluster: string,
  genesisHash: string,
): void {
  if (cluster === "devnet" && genesisHash !== DEVNET_GENESIS_HASH) {
    throw new Error(
      "The configured RPC endpoint is not Solana Devnet (genesis hash mismatch).",
    );
  }
}

export async function readSolanaRpcStatus() {
  assertSolanaRpcConfiguration(solanaCluster, solanaRpcUrl);
  const [slot, genesisHash] = await Promise.all([
    solanaRpc.getSlot().send(),
    solanaRpc.getGenesisHash().send(),
  ]);
  assertSolanaGenesisHash(solanaCluster, String(genesisHash));

  return {
    cluster: solanaCluster,
    slot: String(slot),
    genesisHash: String(genesisHash),
  };
}
