import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

export function purgeLegacyDraftStorage(path: string): void {
  if (path !== ":memory:" && !existsSync(path)) {
    return;
  }
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const database = new Database(path);
  try {
    database.exec(`
      DROP TABLE IF EXISTS listing_drafts;
      DROP TABLE IF EXISTS auth_nonces;
      DROP TABLE IF EXISTS auth_sessions;
    `);
  } finally {
    database.close();
  }
}
