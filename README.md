# Ad Marketplace

The repository contains an Anchor recurring ad-space auction plus a lightweight
frontend and backend scaffold for a Solana ad-marketplace demo.

## Repository layout

- `programs/ad_marketplace/` — Anchor program with KYB-gated recurring listings,
  escrowed SOL bids, immediate outbid refunds, and supplier payouts.
- `app/` — React/Vite client with Wallet Adapter connection and Solana Kit RPC
  status checks; supports Localnet and Devnet.
- `backend/` — Fastify health and Localnet RPC status API. It removes legacy
  draft and wallet-session tables at startup; it does not store new drafts.
- `tests/` — Anchor integration tests covering KYB verification, bidding,
  metadata edits, cycle rollover payouts, outbid refunds, and buyout closure.
- `backend/tests/` and `app/src/lib/` — backend and frontend unit tests.

## Current scope and trust boundary

The Anchor program stores a global admin in the `config` PDA and creates
recurring listings in `auction` PDAs. An admin must verify a supplier's KYB
status before the listing accepts bids. The current winning bid is held in a
separate `vault` PDA, not in the auction account. A higher bid immediately
refunds the displaced leader in the same transaction.

Each listing begins in an initial bidding period that closes at the
supplier-chosen timestamp. The first cycle is settled lazily by a later
`place_bid` or `claim_funds` instruction. A rollover bid pays the completed
cycle's proceeds to the supplier in that same transaction. If no bid triggers
rollover, any connected wallet can call `claim_funds` to settle and pay the
supplier; that caller pays the transaction fee. The program cannot run itself
at a deadline, so there is no payout until a transaction invokes it. New
listings default to 30-day cycles, and the supplier can set a shorter duration
for testing.

Listing names, descriptions, buyout prices, and terminal status are stored
publicly in a separate `ListingMetadata` PDA, preserving the existing
256-byte `Auction` account layout. The supplier can update the public title and
description after creation, and initialize metadata for an older listing
after upgrading the program. A bid at or above the configured buyout price
refunds the previous leader, accepts the bidder, refunds any overage in the
same transaction, records exactly the buyout price for the supplier, and
permanently closes that listing and its future cycles. Any connected wallet
can trigger the resulting payout with `claim_funds`. A zero buyout price
disables buyout. There is no cancellation instruction.

The backend never accepts a bid, holds keys or SOL, settles an auction, or
decides who won. The frontend reads and submits auction instructions directly
through Solana RPC and Wallet Adapter. Since the program stores current auction
state rather than a bid event log, the app shows current winning positions,
supplier-owned listings, and claimable funds, not historical bids. Listing
metadata is public; no off-chain draft feature remains. On startup the backend
drops legacy SQLite draft and wallet-session tables from the configured
database path.

The app defaults to Localnet and reads the generated Anchor IDL from
`app/public/idl/ad_marketplace.json`. Devnet is supported after deploying the
program; its RPC endpoint is checked against Devnet's genesis hash before
program state is read or a transaction is submitted. Each listing stores its
supplier, listing ID, KYB reference, cycle configuration, and bidder-provided
ad image URL; its public metadata account stores the name, description, buyout
price, and permanent closure state.

## Actors and operations

| Actor             | Operations                                                                            | Requirements and effects                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visitor           | Browse listings; optionally trigger a due supplier payout                             | Public reads need no wallet. A connected wallet can submit a permissionless payout transaction and pays its network fee; listings are visible to users on the same cluster.                                    |
| Supplier          | Create and edit a listing, receive settled proceeds                                   | Signs with the wallet stored as the listing supplier; pays transaction fees and account rent. The supplier supplies a public seven-digit KYB reference, but the program does not verify the business identity. |
| Marketplace admin | Initialize the marketplace once; verify or revoke a supplier's KYB status per listing | The first wallet to call `initialize_config` becomes the admin. KYB review happens off-chain; the admin submits the result on-chain. There is no admin-transfer instruction.                                   |
| Bidder            | Place or raise a bid, attach an ad-image URL, or trigger a buyout                     | Signs each transaction and funds the bid from their wallet. An outbid bidder receives their bid principal immediately, but not the transaction fee they already paid.                                          |
| Operator/deployer | Run Localnet, build and deploy the program, and fund demo wallets                     | The deployment upgrade authority is separate from the marketplace admin and does not automatically receive admin privileges.                                                                                   |

One wallet can act in multiple roles. Connecting through Wallet Adapter makes
the wallet's public key available to the app; it does not expose the private
key or sign transactions automatically. For a write, the JavaScript client
derives the relevant PDAs, prepares an Anchor instruction, and asks the wallet
to approve it. The browser submits the signed transaction directly to Solana
RPC. The program validates it and applies state changes and SOL transfers
atomically. The backend only provides health and RPC-status endpoints; it
does not authenticate wallets, store listings, relay transactions, or handle
funds.

### Typical listing lifecycle

1. **Start the demo.** The operator runs Localnet, deploys the program, starts
   the app and backend, and funds the wallets used by the admin, supplier, and
   bidders. Deployment does not initialize marketplace admin configuration.
2. **Initialize the admin.** The chosen admin wallet signs
   `initialize_config`. Its public key is stored in the Config PDA. Initialize
   this only on a Localnet you control: the current program has no admin
   transfer operation.
3. **Create a listing.** The supplier connects their wallet and submits a
   public title and description, seven-digit KYB reference, initial close
   time, recurring cycle duration, and optional buyout price. The transaction
   creates the Auction and ListingMetadata accounts; the listing is immediately
   public, but bids are rejected until it is verified. There are no off-chain
   drafts. Older listings can have metadata initialized once by their supplier.
4. **Verify the supplier.** The admin checks the supplier wallet and KYB
   reference against their off-chain business records, then signs
   `verify_supplier_kyb(true)` for that listing. The reference is public and
   is not itself proof of identity; do not put private documents or sensitive
   identifiers on-chain.
5. **Bid for the listing.** A bidder enters an amount and their ad-image URL.
   The program requires KYB verification and a bid greater than the current
   high bid. The bid is held in the listing's Vault PDA. A higher bid refunds
   the displaced leader immediately in the same transaction. The app's
   **My bids** view shows the connected wallet's current winning positions and
   listings it owns; it is not a historical bid ledger.
6. **Settle cycles and pay proceeds.** The initial period ends at the
   supplier's configured close time; recurring cycles follow. Deadlines do
   not run a background job. A later bid settles the expired cycle and pays its
   proceeds to the supplier in the same transaction. If no bid triggers
   rollover, any connected wallet can choose **Settle and pay supplier**; that
   transaction settles elapsed cycles and pays the supplier, with the caller
   covering the network fee.
7. **End a listing with buyout.** When enabled, a bid at or above the buyout
   price ends the listing and future cycles permanently. The displaced
   leader's bid and any amount above the buyout price are refunded atomically;
   exactly the buyout price is reserved for the supplier. Any connected wallet
   can submit the payout transaction.

For the full actor-by-actor walkthrough—including account reads, transaction
flow, cycle edge cases, and the backend's role—see
[docs/README.md](./docs/README.md).

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
declared in `Anchor.toml`. Localnet reads and writes require a loopback RPC
endpoint. To use Devnet, set `VITE_SOLANA_CLUSTER=devnet`,
`VITE_SOLANA_RPC_URL=https://api.devnet.solana.com`, and the deployed program
ID in `app/.env`; see [app/README.md](./app/README.md) for deployment and
test-SOL steps. The backend defaults to `http://localhost:3001`, and the Vite
dev server proxies `/api` for health and RPC status checks. It does not persist
listings or drafts.

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
surfpool start --offline --no-deploy --no-tui --no-studio --db .surfpool/ad-marketplace.sqlite
```

Before deploying, verify that Localnet is reachable from the same container
where you will run the deploy command:

```sh
solana slot --url http://127.0.0.1:8899
```

Wait for this command to print a slot. If it reports a connection error, start
or reconnect to Surfpool first; `127.0.0.1` refers to the current container,
not another container or the Windows host.

In another container terminal, build and deploy this workspace's program:

```sh
pnpm run anchor:build:localnet
pnpm run anchor:deploy:localnet
```

If deployment reports `Auto-extend failed: error sending request for url
(http://127.0.0.1:8899/)`, the RPC could not be reached while Anchor was
extending the program account. This is a connectivity failure, not a program
build error. Keep Surfpool running, confirm `solana slot` succeeds from the
deploying container, then rerun `pnpm run anchor:deploy:localnet`. If the log
reports a partial buffer, keep
`target/deploy/ad_marketplace-upgrade-buffer.json`; Anchor can reuse it on the
retry. Do not close that buffer unless you intend to abandon the upgrade.
The Localnet deploy script uses the `processed` commitment and sends program
transactions through the configured JSON-RPC endpoint (`--use-rpc`) rather
than relying on TPU delivery. After interrupting a deploy, stale in-flight
transactions may briefly log `Blockhash not found`; leave the partial buffer
in place and ensure no deploy process remains before retrying.

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

On the app's **Create listing** page, create an on-chain auction and enter its
public name, description, optional buyout price, KYB ID, initial close time,
and recurring cycle duration. The auction and metadata are visible to wallets
connected to the same Localnet. The initial close timestamp settles the first
bidding period; it does not permanently end the listing. A buyout at or above
the configured price does permanently close it, with any excess bid amount
refunded atomically. Each bidder supplies the ad image URL with their bid. The
admin must verify the supplier before bids are accepted. Older listings need
their supplier to publish metadata once before they can accept bids under the
upgraded program.

This Localnet is bound to the demo host's loopback address. Wallets on other
computers will resolve `127.0.0.1` to their own computer, not this validator.
For a Devnet demo, deploy the program and follow the Devnet setup in
[`app/README.md`](./app/README.md). The app validates that its configured RPC is
actually Devnet before it reads or writes auction state.

Keep Solana wallet and program keypairs out of source control. Do not run
`solana-test-validator --reset` alongside the Surfpool Localnet.

`anchor test` runs the headless lifecycle tests against a local validator. They
cover the KYB gate, immediate outbid refunds, lazy cycle settlement, and
supplier withdrawal.
