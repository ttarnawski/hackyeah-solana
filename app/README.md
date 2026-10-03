# Frontend

This folder is reserved for the demo UI. The intended client connects a wallet,
reads `AdSlot` accounts, and submits `createSlot`, `buySlot`, and `cancelSlot`
transactions directly to the configured Solana cluster using the generated IDL.

The first usable demo should show the transaction signature and wait for
confirmation before displaying a purchase as complete. The on-chain program is
the source of truth; the frontend must not decide whether a listing is still
available or which buyer won.
