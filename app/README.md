# Frontend

The React/Vite client uses Solana Kit for RPC status checks and Wallet Adapter
for wallet connection and transaction signing. Listing reads and writes go
directly between the browser and the Anchor program; backend sign-in is not
required.

The app loads the generated IDL from `public/idl/ad_marketplace.json`,
discovers Auction and ListingMetadata PDAs from Solana RPC, and supports
listing creation, metadata initialization for older listings, admin KYB
verification, bidding, buyout, and supplier claims. Names and descriptions are
public on-chain metadata. The **My bids** tab includes listings owned by the
connected supplier wallet as well as listings where it currently leads.

A bid that meets or exceeds a listing's buyout price permanently closes the
listing. The bidder pays exactly the configured price; any overage and the
displaced leader's bid are refunded atomically. A zero buyout price disables
this behavior. Completed-cycle settlement remains lazy and occurs only during
a later successful bid or claim transaction.

The integration is restricted to a loopback Localnet RPC and the program ID
configured in `VITE_AUCTION_PROGRAM_ID`. To build and deploy locally, run
`pnpm run anchor:build:localnet` and `pnpm run anchor:deploy:localnet` from the
repository root. The build command syncs the generated IDL into the app. Copy
`.env.example` to `.env`, connect a wallet configured for the local validator,
and start the app from the workspace root with
`pnpm --filter @ad-marketplace/app dev`. The first wallet to initialize the
Localnet config becomes its admin.

Run the app from the workspace root:

```sh
pnpm --filter @ad-marketplace/app dev
```
