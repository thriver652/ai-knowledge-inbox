import fs from 'node:fs';
import path from 'node:path';
// Node's built-in SQLite: no native module to compile, so `npm install` works on any OS.
import { DatabaseSync } from 'node:sqlite';

// Schema is small enough to live inline. CREATE ... IF NOT EXISTS keeps startup idempotent;
// a real project would use numbered migrations.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS items (
  id            TEXT PRIMARY KEY,
  source_type   TEXT NOT NULL CHECK (source_type IN ('note', 'url')),
  title         TEXT,
  url           TEXT,
  content       TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
  error         TEXT,
  chunk_count   INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_created_at ON items (created_at DESC);

CREATE TABLE IF NOT EXISTS chunks (
  id              TEXT PRIMARY KEY,
  item_id         TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  ordinal         INTEGER NOT NULL,
  text            TEXT NOT NULL,
  embedding       BLOB NOT NULL,      -- Float32Array bytes, L2-normalised
  embedding_model TEXT NOT NULL,      -- vectors from different models are never compared
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_item ON chunks (item_id);
CREATE INDEX IF NOT EXISTS idx_chunks_model ON chunks (embedding_model);
`;

export function openDatabase(dbPath) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

// Run fn inside a transaction; roll back if it throws.
export function transaction(db, fn) {
  return (...args) => {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
}
