# Frontend

The React/Vite client uses Solana Kit for RPC reads and the Wallet Adapter UI
for wallet connection and message signing. The backend sign-in message only
authenticates off-chain draft requests; it does not approve a Solana
transaction.

The app connects directly to the Localnet Anchor program through Wallet
Adapter. It loads the IDL copied to `app/public/idl/ad_marketplace.json`,
discovers auction accounts from Solana RPC, and supports listing creation,
admin KYB verification, bidding, and supplier claims. A saved draft remains
off-chain and is not an active listing. Current account state is available in
the UI; historical bid activity requires an indexer and is not shown.

The integration is restricted to a loopback Localnet RPC and the program ID
configured in `VITE_AUCTION_PROGRAM_ID`. Buyouts and cancellation are not
implemented; a buyout value in a saved draft is metadata only.

To build and deploy locally, start `solana-test-validator --reset`, then run
`pnpm run anchor:build:localnet` and `pnpm run anchor:deploy:localnet` from the
repository root. The build command syncs the generated IDL into the app. Copy
`.env.example` to `.env`, connect a wallet configured for the local validator,
and start the app from the repository root with
`pnpm --filter @ad-marketplace/app dev`. The first wallet to initialize the
Localnet config becomes its admin.

Run the app from the workspace root:

```sh
pnpm --filter @ad-marketplace/app dev
```
