import { api } from "./api";

export type WalletMessageSigner = (message: Uint8Array) => Promise<Uint8Array>;

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
}

export async function authenticateWallet(
  walletAddress: string,
  signMessage: WalletMessageSigner,
): Promise<void> {
  const challenge = await api.requestWalletChallenge(walletAddress);
  const signature = await signMessage(
    new TextEncoder().encode(challenge.message),
  );
  await api.verifyWalletSignature(
    walletAddress,
    challenge.nonce,
    encodeBase64(signature),
  );
}
