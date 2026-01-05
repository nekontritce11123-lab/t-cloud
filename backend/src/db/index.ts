import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sql } from 'drizzle-orm';
import path from 'path';
import { fileURLToPath } from 'url';
import * as schema from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/tcloud.db');

// Create SQLite connection
const sqlite = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// Create Drizzle ORM instance
export const db = drizzle(sqlite, { schema });

/**
 * Initialize database tables and FTS
 */
export async function initDatabase(): Promise<void> {
  console.log('[Database] Initializing...');

  // Create tables if not exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT,
      username TEXT,
      language_code TEXT,
      created_at INTEGER DEFAULT (unixepoch()) NOT NULL,
      updated_at INTEGER DEFAULT (unixepoch()) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      file_id TEXT NOT NULL,
      file_unique_id TEXT NOT NULL,
      original_message_id INTEGER NOT NULL,
      chat_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      mime_type TEXT,
      file_name TEXT,
      file_size INTEGER,
      duration INTEGER,
      width INTEGER,
      height INTEGER,
      thumbnail_file_id TEXT,
      caption TEXT,
      forward_from_name TEXT,
      forward_from_chat_title TEXT,
      created_at INTEGER DEFAULT (unixepoch()) NOT NULL,
      UNIQUE(user_id, file_unique_id)
    );

    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      url TEXT NOT NULL,
      title TEXT,
      description TEXT,
      image_url TEXT,
      site_name TEXT,
      created_at INTEGER DEFAULT (unixepoch()) NOT NULL
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_files_user_type ON files(user_id, media_type);
    CREATE INDEX IF NOT EXISTS idx_files_user_date ON files(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_links_user_date ON links(user_id, created_at DESC);

    -- Full-text search virtual table
    CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
      file_name,
      caption,
      forward_from_name,
      content='files',
      content_rowid='id',
      tokenize='unicode61 remove_diacritics 2'
    );

    -- Triggers to keep FTS in sync with files table
    CREATE TRIGGER IF NOT EXISTS files_ai AFTER INSERT ON files BEGIN
      INSERT INTO files_fts(rowid, file_name, caption, forward_from_name)
      VALUES (NEW.id, NEW.file_name, NEW.caption, NEW.forward_from_name);
    END;

    CREATE TRIGGER IF NOT EXISTS files_ad AFTER DELETE ON files BEGIN
      INSERT INTO files_fts(files_fts, rowid, file_name, caption, forward_from_name)
      VALUES ('delete', OLD.id, OLD.file_name, OLD.caption, OLD.forward_from_name);
    END;

    CREATE TRIGGER IF NOT EXISTS files_au AFTER UPDATE ON files BEGIN
      INSERT INTO files_fts(files_fts, rowid, file_name, caption, forward_from_name)
      VALUES ('delete', OLD.id, OLD.file_name, OLD.caption, OLD.forward_from_name);
      INSERT INTO files_fts(rowid, file_name, caption, forward_from_name)
      VALUES (NEW.id, NEW.file_name, NEW.caption, NEW.forward_from_name);
    END;
  `);

  console.log('[Database] Initialized successfully');
}

/**
 * Full-text search in files
 */
export function searchFiles(userId: number, query: string, limit = 50): schema.File[] {
  const stmt = sqlite.prepare(`
    SELECT f.*
    FROM files f
    JOIN files_fts ON f.id = files_fts.rowid
    WHERE f.user_id = ? AND files_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `);

  return stmt.all(userId, query, limit) as schema.File[];
}

// sqlite instance is kept private, use db for queries
