import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

export interface AuthNonce {
  nonce: string;
  walletAddress: string;
  message: string;
  expiresAt: number;
}

export interface ListingDraftInput {
  title: string;
  description: string;
  imageUrl: string | null;
  startingBidLamports: string;
  buyoutPriceLamports: string;
  minIncrementLamports: string;
  endsAt: string;
}

export interface ListingDraft extends ListingDraftInput {
  id: string;
  ownerWallet: string;
  createdAt: string;
}

interface ListingDraftRow {
  id: string;
  owner_wallet: string;
  title: string;
  description: string;
  image_url: string | null;
  starting_bid_lamports: string;
  buyout_price_lamports: string;
  min_increment_lamports: string;
  ends_at: string;
  created_at: string;
}

const schema = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS auth_nonces (
    nonce TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    message TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS auth_sessions_expiry
    ON auth_sessions(expires_at);

  CREATE TABLE IF NOT EXISTS listing_drafts (
    id TEXT PRIMARY KEY,
    owner_wallet TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    image_url TEXT,
    starting_bid_lamports TEXT NOT NULL,
    buyout_price_lamports TEXT NOT NULL,
    min_increment_lamports TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS listing_drafts_owner_created
    ON listing_drafts(owner_wallet, created_at DESC);

  CREATE TABLE IF NOT EXISTS indexed_bid_events (
    signature TEXT NOT NULL,
    event_index INTEGER NOT NULL,
    listing_address TEXT NOT NULL,
    bidder_wallet TEXT NOT NULL,
    amount_lamports TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (
      event_type IN ('bid_placed', 'buyout_executed', 'auction_settled', 'refund_claimed')
    ),
    slot INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (signature, event_index)
  );

  CREATE INDEX IF NOT EXISTS indexed_bid_events_wallet
    ON indexed_bid_events(bidder_wallet, slot DESC);

  CREATE TABLE IF NOT EXISTS indexer_state (
    name TEXT PRIMARY KEY,
    last_finalized_slot TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

function mapListingDraft(row: ListingDraftRow): ListingDraft {
  return {
    id: row.id,
    ownerWallet: row.owner_wallet,
    title: row.title,
    description: row.description,
    imageUrl: row.image_url,
    startingBidLamports: row.starting_bid_lamports,
    buyoutPriceLamports: row.buyout_price_lamports,
    minIncrementLamports: row.min_increment_lamports,
    endsAt: row.ends_at,
    createdAt: row.created_at,
  };
}

export class MarketplaceDatabase {
  private readonly database: Database.Database;

  constructor(path: string) {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }

    this.database = new Database(path);
    if (path !== ":memory:") {
      this.database.pragma("journal_mode = WAL");
    }
    this.database.exec(schema);
  }

  removeExpiredAuthRecords(now: number): void {
    const remove = this.database.transaction(() => {
      this.database
        .prepare("DELETE FROM auth_nonces WHERE expires_at <= ?")
        .run(now);
      this.database
        .prepare("DELETE FROM auth_sessions WHERE expires_at <= ?")
        .run(now);
    });
    remove();
  }

  createAuthNonce(record: AuthNonce): void {
    this.database
      .prepare(
        `INSERT INTO auth_nonces (nonce, wallet_address, message, expires_at)
         VALUES (@nonce, @walletAddress, @message, @expiresAt)`,
      )
      .run(record);
  }

  getAuthNonce(nonce: string): AuthNonce | undefined {
    const row = this.database
      .prepare(
        `SELECT nonce, wallet_address AS walletAddress, message, expires_at AS expiresAt
         FROM auth_nonces
         WHERE nonce = ?`,
      )
      .get(nonce);

    return row as AuthNonce | undefined;
  }

  consumeAuthNonce(nonce: string, walletAddress: string, now: number): boolean {
    const result = this.database
      .prepare(
        `DELETE FROM auth_nonces
         WHERE nonce = ? AND wallet_address = ? AND expires_at > ?`,
      )
      .run(nonce, walletAddress, now);
    return result.changes === 1;
  }

  createSession(
    tokenHash: string,
    walletAddress: string,
    expiresAt: number,
  ): void {
    this.database
      .prepare(
        `INSERT INTO auth_sessions (token_hash, wallet_address, expires_at)
         VALUES (?, ?, ?)`,
      )
      .run(tokenHash, walletAddress, expiresAt);
  }

  getSessionWallet(tokenHash: string, now: number): string | undefined {
    const row = this.database
      .prepare(
        `SELECT wallet_address AS walletAddress
         FROM auth_sessions
         WHERE token_hash = ? AND expires_at > ?`,
      )
      .get(tokenHash, now) as { walletAddress: string } | undefined;

    return row?.walletAddress;
  }

  removeSession(tokenHash: string): void {
    this.database
      .prepare("DELETE FROM auth_sessions WHERE token_hash = ?")
      .run(tokenHash);
  }

  createListingDraft(
    id: string,
    ownerWallet: string,
    input: ListingDraftInput,
    createdAt: string,
  ): ListingDraft {
    this.database
      .prepare(
        `INSERT INTO listing_drafts (
          id,
          owner_wallet,
          title,
          description,
          image_url,
          starting_bid_lamports,
          buyout_price_lamports,
          min_increment_lamports,
          ends_at,
          created_at
        ) VALUES (
          @id,
          @ownerWallet,
          @title,
          @description,
          @imageUrl,
          @startingBidLamports,
          @buyoutPriceLamports,
          @minIncrementLamports,
          @endsAt,
          @createdAt
        )`,
      )
      .run({ id, ownerWallet, ...input, createdAt });

    return {
      id,
      ownerWallet,
      ...input,
      createdAt,
    };
  }

  listListingDrafts(ownerWallet: string): ListingDraft[] {
    const rows = this.database
      .prepare(
        `SELECT
          id,
          owner_wallet,
          title,
          description,
          image_url,
          starting_bid_lamports,
          buyout_price_lamports,
          min_increment_lamports,
          ends_at,
          created_at
         FROM listing_drafts
         WHERE owner_wallet = ?
         ORDER BY created_at DESC`,
      )
      .all(ownerWallet) as ListingDraftRow[];

    return rows.map(mapListingDraft);
  }

  close(): void {
    this.database.close();
  }
}
