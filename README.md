# Ad Marketplace

A Solana MVP for fixed-price advertising slots. The `ad_marketplace` Anchor
program owns listing state and enforces purchase availability. The existing
course lending program is used only as an example of Anchor module organization;
its source is not part of this project.

## Repository layout

- `programs/ad_marketplace/` — on-chain account state, instructions, events, and
  validation.
- `tests/` — Anchor integration tests for listing, purchase, cancellation, and
  rejected operations.
- `app/` — frontend boundary and responsibilities for the live demo.
- There is no backend in the MVP. A future indexer may read program accounts and
  events for search or notifications, but it must not authorize purchases,
  move funds, or pick a winner.

The on-chain module layout follows the useful pattern in the
[course example](https://github.com/matzayonc/solana-live-course-2026/tree/master/holdup/programs/holdup/src):
public instructions are exposed from `src/lib.rs`, while each handler and its
Anchor account context live in `src/instructions/`.

## MVP behavior

- `create_slot` creates a seller-scoped PDA and stores its fixed price, seller,
  content URI, and `Available` status. Prices are in lamports; zero prices and
  empty or overlong URIs are rejected.
- `buy_slot` reads the price from the PDA, transfers SOL from the signing buyer
  to the stored seller with the System Program, and records the buyer and
  `Sold` status in the same transaction. Only a confirmed on-chain transaction
  counts; concurrent purchases cannot both change the same available listing.
- `cancel_slot` lets the original seller cancel an available listing. Sold and
  cancelled listings cannot be bought or cancelled again.
- The program emits events for listing creation, purchase, and cancellation.

The content URI points to off-chain campaign material. This MVP pays the seller
immediately and does not escrow funds or enforce ad delivery. If a seller
disappears after purchase, the program cannot refund the buyer. Escrow with
explicit release/refund conditions is a possible next step if delivery
protection is required.

There is no marketplace admin instruction. As with a normal Anchor deployment,
the program's upgrade authority can still change the code until that authority
is explicitly revoked. Revocation is irreversible and should only happen after
the deployed program has been reviewed.

## Build and test

Use the provided Solana/Anchor development container or install the Rust,
Solana CLI, and Anchor toolchain. The configured test provider is localnet.

```sh
pnpm install
anchor build
anchor test
```

The tests use a local validator and funded test wallets. They cover the core
atomic state-and-payment flow, reject a repeat purchase, and verify cancellation
and zero-price validation.

## Devnet demo

Set up a Solana wallet funded with devnet SOL, configure the Solana CLI to use
devnet, and replace the placeholder program ID with the address derived from
your generated program keypair. Keep `declare_id!` and both
`[programs.*]` entries in sync. Do not commit wallet or program keypair files.

```sh
mkdir -p target/deploy
solana-keygen new --no-bip39-passphrase -o target/deploy/ad_marketplace-keypair.json
anchor keys sync
solana config set --url devnet
solana airdrop 2
anchor build
anchor deploy --provider.cluster devnet
```

The demo frontend must use the same devnet program ID and RPC cluster. Keep the
transaction signature and open it in
[Solana Explorer](https://explorer.solana.com/?cluster=devnet) to show its
confirmation.

## Permissions and trust boundary

- Only the seller who created a PDA can cancel its available listing.
- Any distinct wallet can buy an available listing at the stored price.
- The program performs the transfer and state update atomically; backend or
  frontend code cannot award the slot by changing local data.
- SOL is paid directly to the seller. Transaction fees and account rent are
  separate from the advertised slot price.
