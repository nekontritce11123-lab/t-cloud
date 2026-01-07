import { Bot } from 'grammy';
import { MediaType } from '../types/index.js';

/**
 * Service for generating thumbnail URLs for Mini App
 */
export class ThumbnailService {
  private bot: Bot;
  private botToken: string;

  constructor(bot: Bot, botToken: string) {
    this.bot = bot;
    this.botToken = botToken;
  }

  /**
   * Get download URL for a file via Telegram API
   * URL is valid for at least 1 hour
   */
  async getFileUrl(fileId: string): Promise<string | null> {
    try {
      const file = await this.bot.api.getFile(fileId);

      if (!file.file_path) {
        return null;
      }

      // Build download URL
      return `https://api.telegram.org/file/bot${this.botToken}/${file.file_path}`;
    } catch (error) {
      console.error('[ThumbnailService] Failed to get file URL:', error);
      return null;
    }
  }

  /**
   * Get thumbnail URL for a file
   * For photos: always use main file (better quality, Telegram compresses anyway)
   * For videos/docs: use thumbnail if available
   */
  async getThumbnailUrl(
    thumbnailFileId: string | null | undefined,
    mainFileId: string,
    mediaType: MediaType
  ): Promise<string | null> {
    // No thumbnails needed for these types
    if (['voice', 'sticker'].includes(mediaType)) {
      return null;
    }

    // For photos: always use main file for better quality
    // Telegram's thumbnails are only ~90px which looks bad in grid
    if (mediaType === 'photo') {
      return this.getFileUrl(mainFileId);
    }

    // For other media: try thumbnail first
    if (thumbnailFileId) {
      const thumbUrl = await this.getFileUrl(thumbnailFileId);
      if (thumbUrl) return thumbUrl;
    }

    return null;
  }

  /**
   * Get placeholder icon URL for types without preview
   */
  getPlaceholderUrl(mediaType: MediaType): string {
    const placeholders: Record<MediaType, string> = {
      photo: '/icons/photo.svg',
      video: '/icons/video.svg',
      document: '/icons/document.svg',
      audio: '/icons/audio.svg',
      voice: '/icons/voice.svg',
      video_note: '/icons/video-note.svg',
      link: '/icons/link.svg',
    };

    return placeholders[mediaType] || '/icons/file.svg';
  }
}
