import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Users table
export const users = sqliteTable('users', {
  id: integer('id').primaryKey(), // Telegram user_id
  firstName: text('first_name').notNull(),
  lastName: text('last_name'),
  username: text('username'),
  languageCode: text('language_code'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`(unixepoch())`)
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .default(sql`(unixepoch())`)
    .notNull(),
});

// Files table - main storage for all media
export const files = sqliteTable('files', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),

  // Telegram file identifiers
  fileId: text('file_id').notNull(),
  fileUniqueId: text('file_unique_id').notNull(),
  originalMessageId: integer('original_message_id').notNull(),
  chatId: integer('chat_id').notNull(),

  // Media metadata
  mediaType: text('media_type').notNull(), // photo, video, document, audio, voice, video_note, animation, sticker
  mimeType: text('mime_type'),
  fileName: text('file_name'),
  fileSize: integer('file_size'),

  // Media dimensions/duration
  duration: integer('duration'),
  width: integer('width'),
  height: integer('height'),

  // Thumbnail
  thumbnailFileId: text('thumbnail_file_id'),

  // Content
  caption: text('caption'),

  // Forward info (for search)
  forwardFromName: text('forward_from_name'),
  forwardFromChatTitle: text('forward_from_chat_title'),

  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`(unixepoch())`)
    .notNull(),

  // Soft delete
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
}, (table) => ({
  // Unique constraint for deduplication
  userFileUniqueIdx: uniqueIndex('idx_files_user_unique').on(table.userId, table.fileUniqueId),
  // Index for filtering by type
  userTypeIdx: index('idx_files_user_type').on(table.userId, table.mediaType),
  // Index for timeline (sorting by date)
  userDateIdx: index('idx_files_user_date').on(table.userId, table.createdAt),
}));

// Links table - saved URLs with OpenGraph data
export const links = sqliteTable('links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),

  // URL and OpenGraph metadata
  url: text('url').notNull(),
  title: text('title'),
  description: text('description'),
  imageUrl: text('image_url'),
  siteName: text('site_name'),

  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`(unixepoch())`)
    .notNull(),

  // Soft delete
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
}, (table) => ({
  userDateIdx: index('idx_links_user_date').on(table.userId, table.createdAt),
}));

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
export type Link = typeof links.$inferSelect;
export type NewLink = typeof links.$inferInsert;
