import { Message } from '@grammyjs/types';
import { ExtractedMedia, MediaType } from '../types/index.js';

/**
 * Service for extracting metadata from Telegram messages
 */
export class IngestionService {
  /**
   * Main method to extract media from a message
   */
  extractMedia(msg: Message): ExtractedMedia | null {
    if (msg.photo) {
      return this.extractPhoto(msg);
    }
    if (msg.video) {
      return this.extractVideo(msg);
    }
    if (msg.document) {
      return this.extractDocument(msg);
    }
    if (msg.audio) {
      return this.extractAudio(msg);
    }
    if (msg.voice) {
      return this.extractVoice(msg);
    }
    if (msg.video_note) {
      return this.extractVideoNote(msg);
    }
    if (msg.animation) {
      return this.extractAnimation(msg);
    }
    if (msg.sticker) {
      return this.extractSticker(msg);
    }

    return null;
  }

  /**
   * Photo - array of PhotoSize, take the highest quality
   * Telegram sends photos in increasing sizes: ~90px, ~320px, ~800px, original
   */
  private extractPhoto(msg: Message): ExtractedMedia {
    const photos = msg.photo!;
    // Last element is the highest quality (for sending)
    const bestPhoto = photos[photos.length - 1];

    // For thumbnail: use medium size (~320px) if available, better quality for preview
    // photos[0] = ~90px (too small), photos[1] = ~320px (good for preview)
    let thumbPhoto = photos[0]; // fallback to smallest
    if (photos.length >= 3) {
      // Use second element (~320px) for better quality thumbnails
      thumbPhoto = photos[1];
    } else if (photos.length === 2) {
      // If only 2 sizes, use smaller one for thumb
      thumbPhoto = photos[0];
    }

    return {
      fileId: bestPhoto.file_id,
      fileUniqueId: bestPhoto.file_unique_id,
      mediaType: 'photo',
      fileSize: bestPhoto.file_size,
      width: bestPhoto.width,
      height: bestPhoto.height,
      thumbnailFileId: thumbPhoto?.file_id,
      caption: msg.caption,
      ...this.extractForwardInfo(msg),
    };
  }

  /**
   * Video
   */
  private extractVideo(msg: Message): ExtractedMedia {
    const video = msg.video!;

    return {
      fileId: video.file_id,
      fileUniqueId: video.file_unique_id,
      mediaType: 'video',
      mimeType: video.mime_type,
      fileName: video.file_name,
      fileSize: video.file_size,
      duration: video.duration,
      width: video.width,
      height: video.height,
      thumbnailFileId: video.thumbnail?.file_id,
      caption: msg.caption,
      ...this.extractForwardInfo(msg),
    };
  }

  /**
   * Document - any files
   */
  private extractDocument(msg: Message): ExtractedMedia {
    const doc = msg.document!;

    return {
      fileId: doc.file_id,
      fileUniqueId: doc.file_unique_id,
      mediaType: 'document',
      mimeType: doc.mime_type,
      fileName: doc.file_name,
      fileSize: doc.file_size,
      thumbnailFileId: doc.thumbnail?.file_id,
      caption: msg.caption,
      ...this.extractForwardInfo(msg),
    };
  }

  /**
   * Audio (music with metadata)
   */
  private extractAudio(msg: Message): ExtractedMedia {
    const audio = msg.audio!;
    const fileName = audio.file_name ||
      `${audio.performer || 'Unknown'} - ${audio.title || 'Unknown'}.mp3`;

    return {
      fileId: audio.file_id,
      fileUniqueId: audio.file_unique_id,
      mediaType: 'audio',
      mimeType: audio.mime_type,
      fileName,
      fileSize: audio.file_size,
      duration: audio.duration,
      thumbnailFileId: audio.thumbnail?.file_id,
      caption: msg.caption,
      ...this.extractForwardInfo(msg),
    };
  }

  /**
   * Voice (voice messages)
   */
  private extractVoice(msg: Message): ExtractedMedia {
    const voice = msg.voice!;

    return {
      fileId: voice.file_id,
      fileUniqueId: voice.file_unique_id,
      mediaType: 'voice',
      mimeType: voice.mime_type,
      fileSize: voice.file_size,
      duration: voice.duration,
      caption: msg.caption,
      ...this.extractForwardInfo(msg),
    };
  }

  /**
   * Video Note (circle videos)
   */
  private extractVideoNote(msg: Message): ExtractedMedia {
    const videoNote = msg.video_note!;

    return {
      fileId: videoNote.file_id,
      fileUniqueId: videoNote.file_unique_id,
      mediaType: 'video_note',
      fileSize: videoNote.file_size,
      duration: videoNote.duration,
      width: videoNote.length, // video_note uses length for size
      height: videoNote.length,
      thumbnailFileId: videoNote.thumbnail?.file_id,
      ...this.extractForwardInfo(msg),
    };
  }

  /**
   * Animation (GIF)
   */
  private extractAnimation(msg: Message): ExtractedMedia {
    const animation = msg.animation!;

    return {
      fileId: animation.file_id,
      fileUniqueId: animation.file_unique_id,
      mediaType: 'animation',
      mimeType: animation.mime_type,
      fileName: animation.file_name,
      fileSize: animation.file_size,
      duration: animation.duration,
      width: animation.width,
      height: animation.height,
      thumbnailFileId: animation.thumbnail?.file_id,
      caption: msg.caption,
      ...this.extractForwardInfo(msg),
    };
  }

  /**
   * Sticker
   */
  private extractSticker(msg: Message): ExtractedMedia {
    const sticker = msg.sticker!;

    return {
      fileId: sticker.file_id,
      fileUniqueId: sticker.file_unique_id,
      mediaType: 'sticker',
      fileSize: sticker.file_size,
      width: sticker.width,
      height: sticker.height,
      thumbnailFileId: sticker.thumbnail?.file_id,
      ...this.extractForwardInfo(msg),
    };
  }

  /**
   * Extract forward information from message
   */
  private extractForwardInfo(msg: Message): Pick<ExtractedMedia, 'forwardFromName' | 'forwardFromChatTitle'> {
    const result: Pick<ExtractedMedia, 'forwardFromName' | 'forwardFromChatTitle'> = {};

    // New API uses forward_origin
    if (msg.forward_origin) {
      const origin = msg.forward_origin;

      if (origin.type === 'user') {
        const user = origin.sender_user;
        result.forwardFromName = [user.first_name, user.last_name]
          .filter(Boolean)
          .join(' ');
      } else if (origin.type === 'channel') {
        result.forwardFromChatTitle = origin.chat.title;
      } else if (origin.type === 'chat') {
        result.forwardFromChatTitle = origin.sender_chat.title;
      } else if (origin.type === 'hidden_user') {
        result.forwardFromName = origin.sender_user_name;
      }
    }

    return result;
  }
}

/**
 * Get emoji for media type
 */
export function getMediaEmoji(type: MediaType): string {
  const emojis: Record<MediaType, string> = {
    photo: '🖼',
    video: '🎬',
    document: '📄',
    audio: '🎵',
    voice: '🎤',
    video_note: '⭕',
    animation: '🎞',
    sticker: '🎨',
    link: '🔗',
  };
  return emojis[type] || '📁';
}

/**
 * Format file size in human readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
