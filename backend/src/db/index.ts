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

    -- Full-text search virtual table for files
    CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
      file_name,
      caption,
      forward_from_name,
      forward_from_chat_title,
      content='files',
      content_rowid='id',
      tokenize='unicode61 remove_diacritics 2'
    );

    -- Triggers to keep FTS in sync with files table
    CREATE TRIGGER IF NOT EXISTS files_ai AFTER INSERT ON files BEGIN
      INSERT INTO files_fts(rowid, file_name, caption, forward_from_name, forward_from_chat_title)
      VALUES (NEW.id, NEW.file_name, NEW.caption, NEW.forward_from_name, NEW.forward_from_chat_title);
    END;

    CREATE TRIGGER IF NOT EXISTS files_ad AFTER DELETE ON files BEGIN
      INSERT INTO files_fts(files_fts, rowid, file_name, caption, forward_from_name, forward_from_chat_title)
      VALUES ('delete', OLD.id, OLD.file_name, OLD.caption, OLD.forward_from_name, OLD.forward_from_chat_title);
    END;

    CREATE TRIGGER IF NOT EXISTS files_au AFTER UPDATE ON files BEGIN
      INSERT INTO files_fts(files_fts, rowid, file_name, caption, forward_from_name, forward_from_chat_title)
      VALUES ('delete', OLD.id, OLD.file_name, OLD.caption, OLD.forward_from_name, OLD.forward_from_chat_title);
      INSERT INTO files_fts(rowid, file_name, caption, forward_from_name, forward_from_chat_title)
      VALUES (NEW.id, NEW.file_name, NEW.caption, NEW.forward_from_name, NEW.forward_from_chat_title);
    END;
    -- Full-text search virtual table for links
    CREATE VIRTUAL TABLE IF NOT EXISTS links_fts USING fts5(
      url,
      title,
      description,
      site_name,
      content='links',
      content_rowid='id',
      tokenize='unicode61 remove_diacritics 2'
    );

    -- Triggers to keep FTS in sync with links table
    CREATE TRIGGER IF NOT EXISTS links_ai AFTER INSERT ON links BEGIN
      INSERT INTO links_fts(rowid, url, title, description, site_name)
      VALUES (NEW.id, NEW.url, NEW.title, NEW.description, NEW.site_name);
    END;

    CREATE TRIGGER IF NOT EXISTS links_ad AFTER DELETE ON links BEGIN
      INSERT INTO links_fts(links_fts, rowid, url, title, description, site_name)
      VALUES ('delete', OLD.id, OLD.url, OLD.title, OLD.description, OLD.site_name);
    END;

    CREATE TRIGGER IF NOT EXISTS links_au AFTER UPDATE ON links BEGIN
      INSERT INTO links_fts(links_fts, rowid, url, title, description, site_name)
      VALUES ('delete', OLD.id, OLD.url, OLD.title, OLD.description, OLD.site_name);
      INSERT INTO links_fts(rowid, url, title, description, site_name)
      VALUES (NEW.id, NEW.url, NEW.title, NEW.description, NEW.site_name);
    END;
  `);

  console.log('[Database] Initialized successfully');
}

/**
 * Full-text search in files (basic)
 */
export function searchFiles(userId: number, query: string, limit = 50): schema.File[] {
  const stmt = sqlite.prepare(`
    SELECT f.*
    FROM files f
    JOIN files_fts ON f.id = files_fts.rowid
    WHERE f.user_id = ? AND f.deleted_at IS NULL AND files_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `);

  return stmt.all(userId, query, limit) as schema.File[];
}

/**
 * Search result with match info
 */
export interface SearchResult extends schema.File {
  matchedField: 'file_name' | 'caption' | 'forward_from_name' | 'forward_from_chat_title';
  matchedSnippet: string;
}

/**
 * Full-text search with snippets showing where match occurred
 */
export function searchFilesWithSnippets(
  userId: number,
  query: string,
  limit = 50,
  options?: {
    mediaType?: string;
    includeDeleted?: boolean;
  }
): SearchResult[] {
  // Build dynamic WHERE clause
  const conditions = ['f.user_id = ?'];
  const params: any[] = [userId];

  // Handle deleted_at condition
  if (options?.includeDeleted) {
    conditions.push('f.deleted_at IS NOT NULL');
  } else {
    conditions.push('f.deleted_at IS NULL');
  }

  // Add mediaType filter if specified
  if (options?.mediaType) {
    conditions.push('f.media_type = ?');
    params.push(options.mediaType);
  }

  conditions.push('files_fts MATCH ?');
  params.push(query);

  const whereClause = conditions.join(' AND ');

  // FTS5 snippet function: snippet(table, col_idx, start_mark, end_mark, ellipsis, max_tokens)
  const stmt = sqlite.prepare(`
    SELECT
      f.*,
      snippet(files_fts, 0, '**', '**', '...', 10) as snippet_file_name,
      snippet(files_fts, 1, '**', '**', '...', 10) as snippet_caption,
      snippet(files_fts, 2, '**', '**', '...', 10) as snippet_forward,
      snippet(files_fts, 3, '**', '**', '...', 10) as snippet_chat_title
    FROM files f
    JOIN files_fts ON f.id = files_fts.rowid
    WHERE ${whereClause}
    ORDER BY rank
    LIMIT ?
  `);

  params.push(limit);
  const rows = stmt.all(...params) as any[];

  return rows.map(row => {
    // Determine which field matched (check if snippet contains **)
    let matchedField: 'file_name' | 'caption' | 'forward_from_name' | 'forward_from_chat_title' = 'file_name';
    let matchedSnippet = '';

    if (row.snippet_caption && row.snippet_caption.includes('**')) {
      matchedField = 'caption';
      matchedSnippet = row.snippet_caption;
    } else if (row.snippet_file_name && row.snippet_file_name.includes('**')) {
      matchedField = 'file_name';
      matchedSnippet = row.snippet_file_name;
    } else if (row.snippet_forward && row.snippet_forward.includes('**')) {
      matchedField = 'forward_from_name';
      matchedSnippet = row.snippet_forward;
    } else if (row.snippet_chat_title && row.snippet_chat_title.includes('**')) {
      matchedField = 'forward_from_chat_title';
      matchedSnippet = row.snippet_chat_title;
    }

    // Convert snake_case to camelCase for frontend compatibility
    return {
      id: row.id,
      userId: row.user_id,
      fileId: row.file_id,
      fileUniqueId: row.file_unique_id,
      originalMessageId: row.original_message_id,
      chatId: row.chat_id,
      mediaType: row.media_type,
      mimeType: row.mime_type,
      fileName: row.file_name,
      fileSize: row.file_size,
      duration: row.duration,
      width: row.width,
      height: row.height,
      thumbnailFileId: row.thumbnail_file_id,
      caption: row.caption,
      forwardFromName: row.forward_from_name,
      forwardFromChatTitle: row.forward_from_chat_title,
      createdAt: row.created_at,
      matchedField,
      matchedSnippet,
    } as SearchResult;
  });
}


/**
 * Search result with match info for links
 */
export interface LinkSearchResult extends schema.Link {
  matchedField: 'url' | 'title' | 'description' | 'site_name';
  matchedSnippet: string;
}

/**
 * Full-text search in links with snippets
 */
export function searchLinksWithSnippets(userId: number, query: string, limit = 50): LinkSearchResult[] {
  const stmt = sqlite.prepare(`
    SELECT
      l.*,
      snippet(links_fts, 0, '**', '**', '...', 10) as snippet_url,
      snippet(links_fts, 1, '**', '**', '...', 10) as snippet_title,
      snippet(links_fts, 2, '**', '**', '...', 10) as snippet_description,
      snippet(links_fts, 3, '**', '**', '...', 10) as snippet_site_name
    FROM links l
    JOIN links_fts ON l.id = links_fts.rowid
    WHERE l.user_id = ? AND l.deleted_at IS NULL AND links_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `);

  const rows = stmt.all(userId, query, limit) as any[];

  return rows.map(row => {
    let matchedField: 'url' | 'title' | 'description' | 'site_name' = 'url';
    let matchedSnippet = '';

    if (row.snippet_title && row.snippet_title.includes('**')) {
      matchedField = 'title';
      matchedSnippet = row.snippet_title;
    } else if (row.snippet_description && row.snippet_description.includes('**')) {
      matchedField = 'description';
      matchedSnippet = row.snippet_description;
    } else if (row.snippet_url && row.snippet_url.includes('**')) {
      matchedField = 'url';
      matchedSnippet = row.snippet_url;
    } else if (row.snippet_site_name && row.snippet_site_name.includes('**')) {
      matchedField = 'site_name';
      matchedSnippet = row.snippet_site_name;
    }

    return {
      id: row.id,
      userId: row.user_id,
      url: row.url,
      title: row.title,
      description: row.description,
      imageUrl: row.image_url,
      siteName: row.site_name,
      createdAt: row.created_at,
      deletedAt: row.deleted_at,
      matchedField,
      matchedSnippet,
    } as LinkSearchResult;
  });
}

// sqlite instance is kept private, use db for queries
