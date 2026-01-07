// Telegram User from initData
export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

// Media types supported by T-Cloud
export type MediaType =
  | 'photo'
  | 'video'
  | 'document'
  | 'audio'
  | 'voice'
  | 'video_note'
  | 'link';

// Extracted media metadata from Telegram message
export interface ExtractedMedia {
  fileId: string;
  fileUniqueId: string;
  mediaType: MediaType;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  duration?: number;
  width?: number;
  height?: number;
  thumbnailFileId?: string;
  caption?: string;
  forwardFromName?: string;
  forwardFromChatTitle?: string;
}

// Parsed link with OpenGraph data
export interface ParsedLink {
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
}

// File record from database
export interface FileRecord {
  id: number;
  userId: number;
  fileId: string;
  fileUniqueId: string;
  originalMessageId: number;
  chatId: number;
  mediaType: MediaType;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  caption?: string | null;
  thumbnailFileId?: string | null;
  forwardFromName?: string | null;
  forwardFromChatTitle?: string | null;
  createdAt: Date;
}

// Link record from database
export interface LinkRecord {
  id: number;
  userId: number;
  url: string;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  siteName?: string | null;
  createdAt: Date;
}

// API response types
export interface FileWithThumbnail extends FileRecord {
  thumbnailUrl?: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
}

export interface CategoryStats {
  mediaType: MediaType;
  count: number;
}
