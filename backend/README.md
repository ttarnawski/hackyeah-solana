# Backend

The Fastify service provides health and configured Solana RPC status checks.
Active listing reads and transactions are handled directly by the frontend
through Solana RPC and the Anchor program.

## Data handling

The backend does not authenticate wallets or create, read, or store listing
drafts. At startup it drops any legacy `listing_drafts`, `auth_nonces`, and
`auth_sessions` tables from the configured SQLite database. No new listing or
draft data is written to SQLite.

## Run

Copy `.env.example` to `.env`, then run from the workspace root:

```sh
pnpm --filter @ad-marketplace/backend dev
```

The default health endpoint is `http://127.0.0.1:3001/api/health`. The Solana
status endpoint reads the configured Localnet RPC at `/api/solana/status`.
