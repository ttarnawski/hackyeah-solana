# Ad Marketplace

The repository contains an Anchor program scaffold plus a lightweight frontend
and backend scaffold for a Solana ad-slot auction demo.

## Repository layout

- `programs/ad_marketplace/` — current fixed-price Anchor program. Its on-chain
  implementation is intentionally unchanged by the frontend/backend work.
- `app/` — React/Vite client with Wallet Adapter connection and Solana Kit RPC
  status checks.
- `backend/` — Fastify API with SQLite-backed wallet sessions and listing
  drafts.
- `tests/` — Anchor integration tests for the current fixed-price program.
- `backend/tests/` and `app/src/lib/` — backend and frontend unit tests.

## Current scope and trust boundary

The existing Anchor source is **not yet an escrow auction program**. It does
not implement starting bids, buyout, auction settlement, or bid refunds. The
new UI therefore saves seller-owned metadata drafts, checks the configured
Solana RPC through Kit, and provides explicit unavailable states for on-chain
auction actions and bid history. It does not fabricate transaction successes.

The backend stores draft metadata and, later, may index confirmed program
events/accounts. It never accepts a bid, holds keys or SOL, settles an auction,
or decides who won. Starting bid, buyout price, minimum increment, deadline,
current bidder, escrow, settlement, and refund rules must be enforced by the
future on-chain program. The database can cache those values for search, but
chain state remains authoritative.

The selected auction model is ascending SOL bids with escrow, a fixed-price
buyout, outbid refunds, and permissionless settlement after the end time.
Cancellation is not offered by the frontend or backend. **The current Rust
program still exposes `cancel_slot`; removing or disabling it for direct
on-chain callers requires a later program change.** The existing chain code was
not edited as requested.

Wallet Adapter connection is not backend authentication. Draft writes require
a one-time signed wallet challenge, verified by the API. That signature only
authenticates the off-chain request; Solana transactions still require a
separate wallet approval.

## Install and run

This repo uses a pnpm workspace. From the workspace root:

```sh
pnpm install
```

Copy `backend/.env.example` to `backend/.env` and run the services in separate
terminals:

```sh
pnpm --filter @ad-marketplace/backend dev
pnpm --filter @ad-marketplace/app dev
```

The frontend defaults to Devnet RPC at `https://api.devnet.solana.com`; set
`VITE_SOLANA_RPC_URL` in `app/.env` to use a different endpoint. The backend
defaults to `http://localhost:3001`, and the Vite dev server proxies `/api`.
Drafts are stored locally in `backend/data/marketplace.sqlite`.

## Validation

```sh
pnpm run build:backend
pnpm run build:app
pnpm run test:backend
pnpm run lint
```

The frontend cannot submit real bids or report a winner until a compatible
auction program, generated IDL, deployed program ID, and chain indexer are
provided. The future client will submit program instructions through standard
Solana RPC; those instructions are not custom JSON-RPC methods.
