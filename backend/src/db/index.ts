import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sql } from 'drizzle-orm';
import path from 'path';
import { fileURLToPath } from 'url';
import * as schema from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/tcloud.db');

// Create SQLite connection
const sqlite: InstanceType<typeof Database> = new Database(dbPath);

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

    -- File sharing tables
    CREATE TABLE IF NOT EXISTS file_shares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      token TEXT NOT NULL UNIQUE,
      max_recipients INTEGER DEFAULT NULL,
      expires_at INTEGER DEFAULT NULL,
      use_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_shares_token ON file_shares(token);
    CREATE INDEX IF NOT EXISTS idx_shares_owner ON file_shares(owner_id);
    CREATE INDEX IF NOT EXISTS idx_shares_file ON file_shares(file_id);

    CREATE TABLE IF NOT EXISTS share_recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      share_id INTEGER NOT NULL REFERENCES file_shares(id) ON DELETE CASCADE,
      recipient_id INTEGER NOT NULL,
      received_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(share_id, recipient_id)
    );

    CREATE INDEX IF NOT EXISTS idx_recipients_share ON share_recipients(share_id);
  `);

  console.log('[Database] Initialized successfully');
}

/**
 * Search result with match info
 */
export interface SearchResult extends schema.File {
  matchedField: 'file_name' | 'caption' | 'forward_from_name' | 'forward_from_chat_title';
  matchedSnippet: string;
}

/**
 * Search options for files
 */
export interface FileSearchOptions {
  mediaType?: string;
  includeDeleted?: boolean;
  // Date filters (unix timestamps)
  dateFrom?: number;
  dateTo?: number;
  // Size filters (bytes)
  sizeMin?: number;
  sizeMax?: number;
  // Sender filters
  fromName?: string;
  fromChat?: string;
  // MIME type filter (for file extension search)
  mimeType?: string;
}

/**
 * Escape FTS5 special characters and add prefix matching
 * "мем" -> "\"мем\"*" найдёт "мемный"
 */
function escapeFtsQueryWithPrefix(q: string): string {
  return q
    .split(/\s+/)
    .filter(Boolean)
    .map(word => `"${word.replace(/"/g, '""')}"*`)
    .join(' ');
}

/**
 * Full-text search with snippets showing where match occurred
 */
export function searchFilesWithSnippets(
  userId: number,
  query: string,
  limit = 50,
  options?: FileSearchOptions
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

  // Add mediaType filter if specified (with effective type classification)
  // photo includes document+image/*, video includes document+video/*
  // document EXCLUDES image/* and video/*
  if (options?.mediaType) {
    if (options.mediaType === 'photo') {
      conditions.push(`(f.media_type = 'photo' OR (f.media_type = 'document' AND f.mime_type LIKE 'image/%'))`);
    } else if (options.mediaType === 'video') {
      conditions.push(`(f.media_type = 'video' OR (f.media_type = 'document' AND f.mime_type LIKE 'video/%'))`);
    } else if (options.mediaType === 'document') {
      conditions.push(`f.media_type = 'document' AND (f.mime_type IS NULL OR (f.mime_type NOT LIKE 'image/%' AND f.mime_type NOT LIKE 'video/%'))`);
    } else {
      conditions.push('f.media_type = ?');
      params.push(options.mediaType);
    }
  }

  // Date filters
  if (options?.dateFrom !== undefined) {
    conditions.push('f.created_at >= ?');
    params.push(options.dateFrom);
  }
  if (options?.dateTo !== undefined) {
    conditions.push('f.created_at < ?');
    params.push(options.dateTo);
  }

  // Size filters
  if (options?.sizeMin !== undefined) {
    conditions.push('f.file_size >= ?');
    params.push(options.sizeMin);
  }
  if (options?.sizeMax !== undefined) {
    conditions.push('f.file_size <= ?');
    params.push(options.sizeMax);
  }

  // Sender filters (case-insensitive LIKE)
  if (options?.fromName) {
    conditions.push('LOWER(f.forward_from_name) LIKE LOWER(?)');
    params.push(`%${options.fromName}%`);
  }
  if (options?.fromChat) {
    conditions.push('LOWER(f.forward_from_chat_title) LIKE LOWER(?)');
    params.push(`%${options.fromChat}%`);
  }

  // MIME type filter (for file extension search, e.g., "image/jpeg" for .jpg)
  if (options?.mimeType) {
    conditions.push('f.mime_type = ?');
    params.push(options.mimeType);
  }

  // Text query handling - supports prefix search
  const trimmedQuery = query?.trim().toLowerCase() || '';
  const hasFtsQuery = trimmedQuery.length > 0;

  // Для коротких запросов (1-2 символа) используем LIKE - FTS требует минимум 3 символа для prefix
  const useSimpleLike = trimmedQuery.length > 0 && trimmedQuery.length < 3;

  let sql: string;
  let rows: any[];

  if (useSimpleLike) {
    // LIKE поиск для коротких запросов (1-2 символа)
    const likePattern = `%${trimmedQuery}%`;
    const likeConditions = [...conditions];
    const likeParams = [...params];

    likeConditions.push(`(
      LOWER(f.file_name) LIKE ?
      OR LOWER(f.caption) LIKE ?
      OR LOWER(f.forward_from_name) LIKE ?
      OR LOWER(f.forward_from_chat_title) LIKE ?
    )`);
    likeParams.push(likePattern, likePattern, likePattern, likePattern);

    const whereClause = likeConditions.join(' AND ');

    sql = `
      SELECT
        f.*,
        NULL as snippet_file_name,
        NULL as snippet_caption,
        NULL as snippet_forward,
        NULL as snippet_chat_title
      FROM files f
      WHERE ${whereClause}
      ORDER BY f.created_at DESC
      LIMIT ?
    `;

    likeParams.push(limit);
    const stmt = sqlite.prepare(sql);
    rows = stmt.all(...likeParams) as any[];
  } else if (hasFtsQuery) {
    // FTS5 поиск с prefix matching для запросов 3+ символов
    conditions.push('files_fts MATCH ?');
    params.push(escapeFtsQueryWithPrefix(trimmedQuery));

    const whereClause = conditions.join(' AND ');

    // FTS5 snippet function: snippet(table, col_idx, start_mark, end_mark, ellipsis, max_tokens)
    sql = `
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
    `;

    params.push(limit);
    const stmt = sqlite.prepare(sql);
    rows = stmt.all(...params) as any[];
  } else {
    // No text query - just filter by other conditions
    const whereClause = conditions.join(' AND ');

    sql = `
      SELECT
        f.*,
        NULL as snippet_file_name,
        NULL as snippet_caption,
        NULL as snippet_forward,
        NULL as snippet_chat_title
      FROM files f
      WHERE ${whereClause}
      ORDER BY f.created_at DESC
      LIMIT ?
    `;

    params.push(limit);
    const stmt = sqlite.prepare(sql);
    rows = stmt.all(...params) as any[];
  }

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
  const trimmedQuery = query?.trim() || '';

  // Пустой запрос - пустой результат
  if (!trimmedQuery) {
    return [];
  }

  // Экранируем запрос для FTS5 (как и для файлов)
  const ftsQuery = escapeFtsQueryWithPrefix(trimmedQuery);

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

  const rows = stmt.all(userId, ftsQuery, limit) as any[];

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

/**
 * Options for dictionary generation
 */
export interface DictionaryOptions {
  mediaType?: string;      // Filter by media type (photo, video, document, etc.)
  includeLinks?: boolean;  // Include words from links
}

/**
 * Получить все уникальные слова из файлов пользователя для autocomplete
 * С опциональной фильтрацией по типу медиа
 */
export function getUserDictionary(userId: number, options?: DictionaryOptions): string[] {
  const wordSet = new Set<string>();

  // Если секция "link" - получаем только слова из ссылок
  if (options?.mediaType === 'link') {
    const linksStmt = sqlite.prepare(`
      SELECT title, description, site_name
      FROM links
      WHERE user_id = ? AND deleted_at IS NULL
    `);

    const linkRows = linksStmt.all(userId) as {
      title: string | null;
      description: string | null;
      site_name: string | null;
    }[];

    for (const row of linkRows) {
      const texts = [row.title, row.description, row.site_name].filter(Boolean).join(' ');
      const words = texts.toLowerCase().match(/[\p{L}\d]{2,}/gu) || [];
      words.forEach(w => wordSet.add(w));
    }

    return Array.from(wordSet).sort();
  }

  // Helper для извлечения расширений файлов из имени
  const extractExtensions = (fileName: string | null): string[] => {
    if (!fileName) return [];
    const extMatch = fileName.toLowerCase().match(/\.\w{2,5}$/);
    return extMatch ? [extMatch[0]] : [];
  };

  // Для файлов - строим динамический SQL с фильтром по типу
  let sql = `
    SELECT file_name, caption, forward_from_name, forward_from_chat_title
    FROM files
    WHERE user_id = ? AND deleted_at IS NULL
  `;
  const params: any[] = [userId];

  if (options?.mediaType && options.mediaType !== 'shared') {
    // Фильтруем по типу (с учётом логики photo включает document+image/*)
    if (options.mediaType === 'photo') {
      sql += ` AND (media_type = 'photo' OR (media_type = 'document' AND mime_type LIKE 'image/%'))`;
    } else if (options.mediaType === 'video') {
      sql += ` AND (media_type = 'video' OR (media_type = 'document' AND mime_type LIKE 'video/%'))`;
    } else if (options.mediaType === 'document') {
      // Документы без изображений и видео
      sql += ` AND media_type = 'document' AND (mime_type IS NULL OR (mime_type NOT LIKE 'image/%' AND mime_type NOT LIKE 'video/%'))`;
    } else {
      sql += ` AND media_type = ?`;
      params.push(options.mediaType);
    }
  }

  const filesStmt = sqlite.prepare(sql);
  const fileRows = filesStmt.all(...params) as {
    file_name: string | null;
    caption: string | null;
    forward_from_name: string | null;
    forward_from_chat_title: string | null;
  }[];

  for (const row of fileRows) {
    const texts = [
      row.file_name,
      row.caption,
      row.forward_from_name,
      row.forward_from_chat_title
    ].filter(Boolean).join(' ');

    const words = texts.toLowerCase().match(/[\p{L}\d]{2,}/gu) || [];
    words.forEach(w => wordSet.add(w));

    // Добавляем расширения файлов для автодополнения (.pdf, .jpg и т.д.)
    extractExtensions(row.file_name).forEach(ext => wordSet.add(ext));
  }

  // Добавляем слова из ссылок если не указан конкретный тип файлов
  if (options?.includeLinks || !options?.mediaType) {
    const linksStmt = sqlite.prepare(`
      SELECT title, description, site_name
      FROM links
      WHERE user_id = ? AND deleted_at IS NULL
    `);

    const linkRows = linksStmt.all(userId) as {
      title: string | null;
      description: string | null;
      site_name: string | null;
    }[];

    for (const row of linkRows) {
      const texts = [row.title, row.description, row.site_name].filter(Boolean).join(' ');
      const words = texts.toLowerCase().match(/[\p{L}\d]{2,}/gu) || [];
      words.forEach(w => wordSet.add(w));
    }
  }

  return Array.from(wordSet).sort();
}

// Export sqlite for raw queries (needed for share handlers)
export { sqlite };

/**
 * Share types
 */
export interface FileShare {
  id: number;
  file_id: number;
  owner_id: number;
  token: string;
  max_recipients: number | null;
  expires_at: number | null;
  use_count: number;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface ShareRecipient {
  id: number;
  share_id: number;
  recipient_id: number;
  received_at: number;
}

export interface FileForShare {
  id: number;
  file_id: string;
  file_unique_id: string;
  original_message_id: number;
  chat_id: number;
  file_name: string | null;
  file_size: number | null;
  caption: string | null;
  media_type: string;
  mime_type: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  thumbnail_file_id: string | null;
  forward_from_name: string | null;
  forward_from_chat_title: string | null;
  deleted_at: number | null;
}

/**
 * Get share by token
 */
export function getShareByToken(token: string): FileShare | null {
  const stmt = sqlite.prepare(`
    SELECT * FROM file_shares
    WHERE token = ? AND is_active = 1
  `);
  return stmt.get(token) as FileShare | null;
}

/**
 * Get file for share (with necessary fields for sending)
 */
export function getFileForShare(fileId: number): FileForShare | null {
  const stmt = sqlite.prepare(`
    SELECT
      id, file_id, file_unique_id, original_message_id, chat_id,
      file_name, file_size, caption, media_type, mime_type,
      duration, width, height, thumbnail_file_id,
      forward_from_name, forward_from_chat_title, deleted_at
    FROM files
    WHERE id = ?
  `);
  return stmt.get(fileId) as FileForShare | null;
}

/**
 * Check if recipient already received this share
 */
export function hasRecipientReceivedShare(shareId: number, recipientId: number): boolean {
  const stmt = sqlite.prepare(`
    SELECT 1 FROM share_recipients
    WHERE share_id = ? AND recipient_id = ?
  `);
  return stmt.get(shareId, recipientId) !== undefined;
}

/**
 * Record that recipient received the share and increment use_count
 * Auto-deactivates the share if max_recipients limit is reached
 */
export function recordShareRecipient(shareId: number, recipientId: number): void {
  const insertStmt = sqlite.prepare(`
    INSERT INTO share_recipients (share_id, recipient_id)
    VALUES (?, ?)
  `);
  const updateStmt = sqlite.prepare(`
    UPDATE file_shares
    SET use_count = use_count + 1, updated_at = unixepoch()
    WHERE id = ?
  `);
  // Auto-deactivate if limit reached
  const deactivateIfLimitReached = sqlite.prepare(`
    UPDATE file_shares
    SET is_active = 0, updated_at = unixepoch()
    WHERE id = ? AND max_recipients IS NOT NULL AND use_count >= max_recipients
  `);

  insertStmt.run(shareId, recipientId);
  updateStmt.run(shareId);
  deactivateIfLimitReached.run(shareId);
}

/**
 * Copy a file to another user's cloud (for share recipients)
 * - If file already exists (by file_unique_id) - do nothing
 * - If file is in trash - restore it
 * - Otherwise create a new copy
 */
export function copyFileToUser(
  sourceFile: FileForShare,
  recipientId: number
): { created: boolean; restored: boolean; fileId?: number } {
  // Check if user already has this file (including deleted ones)
  const existingStmt = sqlite.prepare(`
    SELECT id, deleted_at FROM files
    WHERE user_id = ? AND file_unique_id = ?
  `);
  const existing = existingStmt.get(recipientId, sourceFile.file_unique_id) as
    { id: number; deleted_at: number | null } | undefined;

  if (existing) {
    if (existing.deleted_at) {
      // File is in trash - restore it and update created_at to now
      // (so it appears at the top of the recipient's timeline, not at the sender's original date)
      const restoreStmt = sqlite.prepare(`
        UPDATE files SET deleted_at = NULL, created_at = unixepoch() WHERE id = ?
      `);
      restoreStmt.run(existing.id);
      return { created: false, restored: true, fileId: existing.id };
    }
    // Active file already exists
    return { created: false, restored: false };
  }

  // Create a copy for the recipient
  const insertStmt = sqlite.prepare(`
    INSERT INTO files (
      user_id, file_id, file_unique_id, original_message_id, chat_id,
      media_type, mime_type, file_name, file_size, duration, width, height,
      caption, thumbnail_file_id, forward_from_name, forward_from_chat_title
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = insertStmt.run(
    recipientId,
    sourceFile.file_id,
    sourceFile.file_unique_id,
    sourceFile.original_message_id,
    sourceFile.chat_id,
    sourceFile.media_type,
    sourceFile.mime_type,
    sourceFile.file_name,
    sourceFile.file_size,
    sourceFile.duration,
    sourceFile.width,
    sourceFile.height,
    sourceFile.caption,
    sourceFile.thumbnail_file_id,
    sourceFile.forward_from_name,
    sourceFile.forward_from_chat_title
  );

  return { created: true, restored: false, fileId: result.lastInsertRowid as number };
}

/**
 * Deactivate all expired shares
 * Should be called periodically (e.g., on API requests)
 */
export function deactivateExpiredShares(): number {
  const stmt = sqlite.prepare(`
    UPDATE file_shares
    SET is_active = 0, updated_at = unixepoch()
    WHERE is_active = 1 AND expires_at IS NOT NULL AND expires_at <= unixepoch()
  `);
  const result = stmt.run();
  return result.changes;
}
