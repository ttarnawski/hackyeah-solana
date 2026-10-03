# Frontend

The React/Vite client uses Solana Kit for RPC reads and the Wallet Adapter UI
for wallet connection and message signing. The backend sign-in message only
authenticates off-chain draft requests; it does not approve a Solana
transaction.

The auction transaction client is intentionally disabled until an auction
program and its IDL exist. A saved draft is not an on-chain listing, and the UI
does not report a submitted transaction as a successful bid. Active listings
and bid outcomes must be read from confirmed on-chain state.

The UI/backend expose no cancellation action. The existing Rust program still
contains a cancellation instruction; making cancellation impossible for direct
program callers requires a later on-chain change, which is outside this
frontend/backend implementation.

Run the app from the workspace root:

```sh
pnpm --filter @ad-marketplace/app dev
```
