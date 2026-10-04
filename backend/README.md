# Backend

This is a small Fastify + SQLite service for wallet-authenticated off-chain
listing drafts and the future chain indexer read model.

## Current behavior

- Wallet sign-in uses a short-lived, one-use nonce signed with the connected
  wallet. The backend verifies the signature and stores only a hash of a random
  session token. It never receives or stores a private key.
- Listing drafts store presentation metadata and proposed auction terms.
  Lamport values are persisted as decimal strings to preserve u64 precision.
- Active listings and bid history return explicit not-configured responses
  until the Anchor program is deployed and an indexer is configured. The
  backend has no bid, buyout, settlement, refund, or cancellation write
  endpoint.
- The future indexer tables are projections only. They cannot accept bids or
  select a winner.

## Run

Copy `.env.example` to `.env`, then run from the workspace root:

```sh
pnpm --filter @ad-marketplace/backend dev
```

SQLite data is written to `backend/data/marketplace.sqlite`, which is ignored
by Git.
