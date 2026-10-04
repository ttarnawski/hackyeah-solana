import { createSolanaRpc } from "@solana/kit";

export const solanaCluster = import.meta.env.VITE_SOLANA_CLUSTER ?? "localnet";
export const solanaRpcUrl =
  import.meta.env.VITE_SOLANA_RPC_URL ?? "http://127.0.0.1:8899";
export const solanaRpc = createSolanaRpc(solanaRpcUrl);

export async function readSolanaRpcStatus() {
  const [slot, genesisHash] = await Promise.all([
    solanaRpc.getSlot().send(),
    solanaRpc.getGenesisHash().send(),
  ]);

  return {
    cluster: solanaCluster,
    slot: String(slot),
    genesisHash: String(genesisHash),
  };
}
