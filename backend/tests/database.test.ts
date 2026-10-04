import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { purgeLegacyDraftStorage } from "../src/database.js";

describe("legacy draft storage cleanup", () => {
  let directory: string | undefined;

  afterEach(() => {
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
      directory = undefined;
    }
  });

  it("drops saved drafts and obsolete wallet-session tables", () => {
    directory = mkdtempSync(join(tmpdir(), "ad-marketplace-draft-cleanup-"));
    const databasePath = join(directory, "marketplace.sqlite");
    const legacyDatabase = new Database(databasePath);
    legacyDatabase.exec(`
      CREATE TABLE listing_drafts (id TEXT PRIMARY KEY, title TEXT NOT NULL);
      INSERT INTO listing_drafts (id, title) VALUES ('legacy', 'Legacy draft');
      CREATE TABLE auth_nonces (nonce TEXT PRIMARY KEY);
      CREATE TABLE auth_sessions (token_hash TEXT PRIMARY KEY);
    `);
    legacyDatabase.close();

    purgeLegacyDraftStorage(databasePath);

    const database = new Database(databasePath);
    try {
      const remainingTables = database
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table'
             AND name IN ('listing_drafts', 'auth_nonces', 'auth_sessions')`,
        )
        .all();
      expect(remainingTables).toEqual([]);
    } finally {
      database.close();
    }
  });
});
