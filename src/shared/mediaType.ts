import { MediaType } from '../api/client';

/**
 * Determines the visual/effective media type for UI display based on mimeType
 * Documents with image/* mimeType are shown as photos
 * Documents with video/* mimeType are shown as videos
 */
export function getEffectiveMediaType(mediaType: MediaType, mimeType?: string | null): MediaType {
  if (mediaType === 'document' && mimeType) {
    if (mimeType.startsWith('image/')) return 'photo';
    if (mimeType.startsWith('video/')) return 'video';
  }
  return mediaType;
}
