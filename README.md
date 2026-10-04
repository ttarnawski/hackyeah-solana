# Ad Marketplace

The repository contains an Anchor recurring ad-space auction plus a lightweight
frontend and backend scaffold for a Solana ad-marketplace demo.

## Repository layout

- `programs/ad_marketplace/` — Anchor program with KYB-gated recurring listings,
  escrowed SOL bids, immediate outbid refunds, and supplier claims.
- `app/` — React/Vite client with Wallet Adapter connection and Solana Kit RPC
  status checks.
- `backend/` — Fastify API with SQLite-backed wallet sessions and listing
  drafts.
- `tests/` — Anchor integration tests covering KYB verification, bidding,
  cycle rollover, outbid refunds, and supplier claims.
- `backend/tests/` and `app/src/lib/` — backend and frontend unit tests.

## Current scope and trust boundary

The Anchor program stores a global admin in the `config` PDA and creates
recurring listings in `auction` PDAs. An admin must verify a supplier's KYB
status before the listing accepts bids. The current winning bid is held in a
separate `vault` PDA, not in the auction account. A higher bid immediately
refunds the displaced leader in the same transaction.

Each listing begins in an initial bidding period that closes at the
supplier-chosen timestamp. The initial highest bid becomes
`supplier_claimable` when a later `place_bid` or `claim_funds` instruction
observes that deadline; recurring cycle 1 then starts at that timestamp.
Recurring cycles advance lazily on a later bid or claim. At each cycle end, the
leading bid becomes claimable and the next cycle begins. Only the supplier can
withdraw settled funds with `claim_funds`; bids remain escrowed until
settlement. Listings continue recurring after the initial close; they do not
have a final expiry in the current program. New listings default to 30-day
cycles, with a shorter duration available for tests. No cancellation or buyout
instruction is exposed.

The backend stores seller-owned draft metadata. It never accepts a bid, holds
keys or SOL, settles an auction, or decides who won. The frontend reads and
submits auction instructions directly through Solana RPC and Wallet Adapter.
Since the program stores current auction state rather than a bid event log, the
app shows current winning positions and claimable funds, not historical bids.

The app integration is Localnet-only and reads the generated Anchor IDL from
`app/public/idl/ad_marketplace.json`. Off-chain drafts remain distinct from
on-chain listings. On-chain listings store a supplier, listing ID, KYB ID, and cycle
configuration. Draft campaign descriptions remain private off-chain; the
current winning bidder supplies the ad image URL with their bid.
Buyouts and cancellation are not implemented.

Wallet Adapter connection is not backend authentication. Draft writes require
a one-time signed wallet challenge, verified by the API. That signature only
authenticates the off-chain request; Solana transactions still require a
separate wallet approval.

## Actor journeys and presentation guide

See [docs/README.md](./docs/README.md) for the full actor-by-actor walkthrough,
from wallet connection and JavaScript calls to backend, RPC, Anchor program,
escrow, settlement, and edge cases.

## Install and run

This repo uses a pnpm workspace. From the workspace root:

```sh
pnpm install
```

Copy `backend/.env.example` to `backend/.env` and `app/.env.example` to
`app/.env`, then run the services in separate terminals:

```sh
pnpm --filter @ad-marketplace/backend dev
pnpm --filter @ad-marketplace/app dev
```

The app defaults to Localnet RPC at `http://127.0.0.1:8899` and the program ID
declared for Localnet in `Anchor.toml`. Auction reads and writes are disabled
for non-loopback RPC endpoints. The backend defaults to `http://localhost:3001`,
and the Vite dev server proxies `/api`. Drafts are stored locally in
`backend/data/marketplace.sqlite`.

## Dev container

This repository includes its own Dev Container definition and Dockerfile. Open
this repository itself in VS Code and run **Dev Containers: Reopen in
Container**. The image includes Anchor, Rust, Solana CLI, and Surfpool; the
first container setup installs the pnpm workspace dependencies into
container-only volumes, leaving any Windows `node_modules` untouched. RPC,
WebSocket, backend, and frontend ports are forwarded from the container.
The Vite server listens on the container network so the forwarded frontend is
available from the host at `http://localhost:5173`.

## Validation

```sh
pnpm run build:backend
pnpm run build:app
pnpm run test:backend
pnpm run lint
```

For a Localnet deployment, start Surfpool in a container terminal. The database
file keeps local chain state in the ignored `.surfpool/` directory across
container rebuilds:

```sh
mkdir -p .surfpool
surfpool start --no-deploy --db .surfpool/ad-marketplace.sqlite
```

In another container terminal, build and deploy this workspace's program:

```sh
pnpm run anchor:build:localnet
pnpm run anchor:deploy:localnet
```

Then run these in separate terminals:

```sh
pnpm --filter @ad-marketplace/backend dev
pnpm --filter @ad-marketplace/app dev
```

### Live Localnet demo

Choose a dedicated wallet you control as the KYB admin before selecting
**Initialize Localnet admin**. The first wallet to initialize the config
becomes the admin, and the current program has no admin-transfer instruction.
The deployment upgrade-authority wallet is separate; deploying the program
does not initialize the marketplace admin.

Fund each admin, supplier, and bidder wallet with fake SOL from a container
terminal while Surfpool is running:

```sh
solana airdrop 10 <WALLET_PUBLIC_KEY> --url http://127.0.0.1:8899
solana balance <WALLET_PUBLIC_KEY> --url http://127.0.0.1:8899
```

On the app's **Create listing** page, use the Localnet form at the top to
create an on-chain auction. The lower form only saves a private draft. The
on-chain auction is visible to wallets connected to the same Localnet. The top
form's initial close timestamp controls the first bidding period; it does not
permanently end the listing. The lower draft's title, description, proposed
pricing, and proposed end date are not published or enforced by the current
program. Each bidder supplies the ad image URL with their bid. The admin must
verify the supplier before bids are accepted.

This Localnet is bound to the demo host's loopback address. Wallets on other
computers will resolve `127.0.0.1` to their own computer, not this validator.
For a remote demo, use a shared reachable cluster and update the app's
Localnet-only RPC restriction deliberately.

Keep Solana wallet and program keypairs out of source control. Do not run
`solana-test-validator --reset` alongside the Surfpool Localnet.

`anchor test` runs the headless lifecycle tests against a local validator. They
cover the KYB gate, immediate outbid refunds, lazy cycle settlement, and
supplier withdrawal.
