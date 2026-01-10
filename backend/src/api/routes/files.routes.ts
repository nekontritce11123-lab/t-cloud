import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { FilesRepository } from '../../db/repositories/files.repository.js';
import { ThumbnailService } from '../../services/thumbnail.service.js';
import { MediaType } from '../../types/index.js';
import { bot } from '../../bot/index.js';
import { config } from '../../config.js';
import { getUserDictionary } from '../../db/index.js';
import {
  PHOTO_CAPTION_LIMIT,
  DEFAULT_CAPTION_LIMIT,
  TEXT_MESSAGE_LIMIT,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SEARCH_LIMIT,
  MAX_PAGE_SIZE,
  MAX_BATCH_SIZE
} from '../../constants.js';

const router = Router();
const filesRepo = new FilesRepository();

// Check if caption fits the limit
function getCaptionForMedia(caption: string | null | undefined, mediaType: string): string | undefined {
  if (!caption) return undefined;
  const limit = mediaType === 'photo' ? PHOTO_CAPTION_LIMIT : DEFAULT_CAPTION_LIMIT;
  if (caption.length <= limit) return caption;
  // Caption too long - will be sent separately
  return undefined;
}

// Check if caption needs to be sent separately
function needsSeparateMessage(caption: string | null | undefined, mediaType: string): boolean {
  if (!caption) return false;
  const limit = mediaType === 'photo' ? PHOTO_CAPTION_LIMIT : DEFAULT_CAPTION_LIMIT;
  return caption.length > limit;
}

// Send long caption as separate text message(s)
async function sendCaptionAsText(chatId: number, caption: string): Promise<void> {
  // Split into chunks if needed
  const chunks: string[] = [];
  let remaining = caption;
  while (remaining.length > 0) {
    if (remaining.length <= TEXT_MESSAGE_LIMIT) {
      chunks.push(remaining);
      break;
    }
    // Find a good break point (newline or space)
    let breakPoint = remaining.lastIndexOf('\n', TEXT_MESSAGE_LIMIT);
    if (breakPoint === -1 || breakPoint < TEXT_MESSAGE_LIMIT / 2) {
      breakPoint = remaining.lastIndexOf(' ', TEXT_MESSAGE_LIMIT);
    }
    if (breakPoint === -1 || breakPoint < TEXT_MESSAGE_LIMIT / 2) {
      breakPoint = TEXT_MESSAGE_LIMIT;
    }
    chunks.push(remaining.substring(0, breakPoint));
    remaining = remaining.substring(breakPoint).trimStart();
  }

  for (const chunk of chunks) {
    await bot.api.sendMessage(chatId, chunk);
  }
}

// Lazy init thumbnail service (bot needs to be initialized first)
let thumbnailService: ThumbnailService | null = null;
function getThumbnailService(): ThumbnailService {
  if (!thumbnailService) {
    thumbnailService = new ThumbnailService(bot, config.botToken);
  }
  return thumbnailService;
}

// Add hasShare flag to files array
function addShareStatus<T extends { id: number }>(
  files: T[],
  userId: number
): (T & { hasShare: boolean })[] {
  const fileIds = files.map(f => f.id);
  const shareSet = filesRepo.getShareStatusBatch(userId, fileIds);
  return files.map(f => ({ ...f, hasShare: shareSet.has(f.id) }));
}

/**
 * GET /api/files
 * Get files for the authenticated user with optional filtering
 */
router.get('/', async (req, res: Response) => {
  const { telegramUser } = req as AuthenticatedRequest;
  const {
    type,
    page = '1',
    limit = String(DEFAULT_PAGE_SIZE),
  } = req.query;

  console.log('[Files] GET / for user:', telegramUser.id);

  try {
    const pageNum = parseInt(page as string, 10);
    const limitNum = Math.min(parseInt(limit as string, 10), MAX_PAGE_SIZE);
    const offset = (pageNum - 1) * limitNum;

    const result = await filesRepo.findByUser(telegramUser.id, {
      mediaType: type as MediaType | undefined,
      limit: limitNum,
      offset,
    });

    console.log('[Files] Found', result.total, 'files, returning', result.items.length);

    // Add thumbnail URLs
    const service = getThumbnailService();
    const itemsWithThumbnails = await Promise.all(
      result.items.map(async (file) => ({
        ...file,
        thumbnailUrl: await service.getThumbnailUrl(
          file.thumbnailFileId,
          file.fileId,
          file.mediaType as MediaType
        ),
      }))
    );

    // Add hasShare flag for instant UI
    const itemsWithShareStatus = addShareStatus(itemsWithThumbnails, telegramUser.id);

    res.json({
      items: itemsWithShareStatus,
      total: result.total,
      page: pageNum,
      totalPages: Math.ceil(result.total / limitNum),
    });
  } catch (error) {
    console.error('[API] Error fetching files:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/files/by-date
 * Get files grouped by date (for Timeline)
 */
router.get('/by-date', async (req, res: Response) => {
  const { telegramUser } = req as AuthenticatedRequest;

  try {
    const files = await filesRepo.findByDate(telegramUser.id);

    // Group by date
    const grouped: Record<string, typeof files> = {};
    for (const file of files) {
      const dateKey = new Date(file.createdAt).toISOString().split('T')[0];
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(file);
    }

    res.json(grouped);
  } catch (error) {
    console.error('[API] Error fetching files by date:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/files/search
 * Full-text search in files with match info and filters
 * Query params:
 *   - q: search query (optional if filters provided)
 *   - limit: max results (optional, default: 50, max: 100)
 *   - type: filter by mediaType (optional)
 *   - deleted: if "true", search in trash (optional)
 *   - dateFrom: ISO date string (optional)
 *   - dateTo: ISO date string (optional)
 *   - sizeMin: min file size in bytes (optional)
 *   - sizeMax: max file size in bytes (optional)
 *   - from: filter by forward_from_name (optional)
 *   - chat: filter by forward_from_chat_title (optional)
 *   - mimeType: filter by MIME type (optional, e.g., "image/jpeg" for .jpg files)
 */
router.get('/search', async (req, res: Response) => {
  const { telegramUser } = req as AuthenticatedRequest;
  const { q, limit = String(DEFAULT_SEARCH_LIMIT), type, deleted, dateFrom, dateTo, sizeMin, sizeMax, from, chat, mimeType } = req.query;

  // At least q or one filter is required
  const hasQuery = q && typeof q === 'string' && q.trim().length > 0;
  const hasFilters = dateFrom || dateTo || sizeMin || sizeMax || from || chat || mimeType;

  if (!hasQuery && !hasFilters) {
    res.status(400).json({ error: 'Query parameter "q" or at least one filter is required' });
    return;
  }

  try {
    const limitNum = Math.min(parseInt(limit as string, 10), MAX_PAGE_SIZE);

    // Build search options
    const searchOptions: {
      mediaType?: string;
      includeDeleted?: boolean;
      dateFrom?: number;
      dateTo?: number;
      sizeMin?: number;
      sizeMax?: number;
      fromName?: string;
      fromChat?: string;
      mimeType?: string;
    } = {};

    if (type && typeof type === 'string') {
      searchOptions.mediaType = type;
    }

    if (deleted === 'true') {
      searchOptions.includeDeleted = true;
    }

    // Date filters - convert ISO strings to unix timestamps
    if (dateFrom && typeof dateFrom === 'string') {
      const d = new Date(dateFrom);
      if (!isNaN(d.getTime())) {
        searchOptions.dateFrom = Math.floor(d.getTime() / 1000);
      }
    }
    if (dateTo && typeof dateTo === 'string') {
      const d = new Date(dateTo);
      if (!isNaN(d.getTime())) {
        searchOptions.dateTo = Math.floor(d.getTime() / 1000);
      }
    }

    // Size filters
    if (sizeMin && typeof sizeMin === 'string') {
      const s = parseInt(sizeMin, 10);
      if (!isNaN(s)) {
        searchOptions.sizeMin = s;
      }
    }
    if (sizeMax && typeof sizeMax === 'string') {
      const s = parseInt(sizeMax, 10);
      if (!isNaN(s)) {
        searchOptions.sizeMax = s;
      }
    }

    // Sender filters
    if (from && typeof from === 'string') {
      searchOptions.fromName = from;
    }
    if (chat && typeof chat === 'string') {
      searchOptions.fromChat = chat;
    }

    // MIME type filter (for file extension search, e.g., .jpg -> image/jpeg)
    if (mimeType && typeof mimeType === 'string') {
      searchOptions.mimeType = mimeType;
    }

    // Use search with snippets to show where match occurred
    const files = filesRepo.searchWithSnippets(
      telegramUser.id,
      hasQuery ? (q as string) : '',
      limitNum,
      searchOptions
    );

    // Add thumbnail URLs
    const service = getThumbnailService();
    const itemsWithThumbnails = await Promise.all(
      files.map(async (file) => ({
        ...file,
        thumbnailUrl: await service.getThumbnailUrl(
          file.thumbnailFileId,
          file.fileId,
          file.mediaType as MediaType
        ),
      }))
    );

    // Add hasShare flag for instant UI
    const itemsWithShareStatus = addShareStatus(itemsWithThumbnails, telegramUser.id);

    res.json({ items: itemsWithShareStatus, total: itemsWithShareStatus.length });
  } catch (error) {
    console.error('[API] Error searching files:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/files/stats
 * Get category statistics
 */
router.get('/stats', async (req, res: Response) => {
  const { telegramUser } = req as AuthenticatedRequest;

  try {
    const stats = await filesRepo.getCategoryStats(telegramUser.id);
    res.json(stats);
  } catch (error) {
    console.error('[API] Error fetching stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/files/senders
 * Get unique senders (forward_from_name and forward_from_chat_title)
 */
router.get('/senders', async (req, res: Response) => {
  const { telegramUser } = req as AuthenticatedRequest;

  try {
    const senders = await filesRepo.getUniqueSenders(telegramUser.id);
    res.json(senders);
  } catch (error) {
    console.error('[API] Error fetching senders:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/files/trash
 * Get deleted files (trash) for the authenticated user
 */
router.get('/trash', async (req, res: Response) => {
  const { telegramUser } = req as AuthenticatedRequest;

  console.log('[Files] GET /trash for user:', telegramUser.id);

  try {
    const files = await filesRepo.findDeleted(telegramUser.id);

    console.log('[Files] Found', files.length, 'files in trash');

    // Add thumbnail URLs
    const service = getThumbnailService();
    const itemsWithThumbnails = await Promise.all(
      files.map(async (file) => ({
        ...file,
        thumbnailUrl: await service.getThumbnailUrl(
          file.thumbnailFileId,
          file.fileId,
          file.mediaType as MediaType
        ),
      }))
    );

    res.json({ items: itemsWithThumbnails, total: itemsWithThumbnails.length });
  } catch (error) {
    console.error('[API] Error fetching trash:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/files/trash/count
 * Get count of files in trash
 */
router.get('/trash/count', async (req, res: Response) => {
  const { telegramUser } = req as AuthenticatedRequest;

  try {
    const count = await filesRepo.getTrashCount(telegramUser.id);
    res.json({ count });
  } catch (error) {
    console.error('[API] Error fetching trash count:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/files/delete-many
 * Soft delete multiple files (move to trash)
 */
router.post('/delete-many', async (req, res: Response) => {
  const { telegramUser } = req as unknown as AuthenticatedRequest;
  const { fileIds } = req.body as { fileIds: number[] };

  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    res.status(400).json({ error: 'fileIds array is required' });
    return;
  }

  if (fileIds.length > MAX_BATCH_SIZE) {
    res.status(400).json({ error: `Maximum ${MAX_BATCH_SIZE} files per request` });
    return;
  }

  try {
    const deletedCount = await filesRepo.softDeleteMany(fileIds, telegramUser.id);
    res.json({ success: true, deleted: deletedCount });
  } catch (error) {
    console.error('[API] Error deleting files:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/files/autocomplete/dictionary
 * Get all unique words from user's files for autocomplete
 * ВАЖНО: Этот роут должен быть ДО /:id, иначе Express матчит "autocomplete" как :id
 */
router.get('/autocomplete/dictionary', async (req, res: Response) => {
  const { telegramUser } = req as AuthenticatedRequest;
  const { type } = req.query;

  try {
    const words = getUserDictionary(telegramUser.id, {
      mediaType: type as string | undefined,
      includeLinks: !type || type === 'link'
    });

    res.json({
      words,
      version: Date.now()
    });
  } catch (error) {
    console.error('[API] Error fetching dictionary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/files/shared
 * Get files that have active share links
 * ВАЖНО: Этот роут должен быть ДО /:id
 */
router.get('/shared', async (req, res: Response) => {
  const { telegramUser } = req as AuthenticatedRequest;

  try {
    const files = await filesRepo.findShared(telegramUser.id);

    // Add thumbnail URLs
    const service = getThumbnailService();
    const itemsWithThumbnails = await Promise.all(
      files.map(async (file) => ({
        ...file,
        thumbnailUrl: await service.getThumbnailUrl(
          file.thumbnailFileId,
          file.fileId,
          file.mediaType as MediaType
        ),
      }))
    );

    // All shared files have hasShare=true by definition
    const itemsWithShareStatus = itemsWithThumbnails.map(f => ({ ...f, hasShare: true }));

    res.json({ items: itemsWithShareStatus, total: itemsWithShareStatus.length });
  } catch (error) {
    console.error('[API] Error fetching shared files:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/files/shared/count
 * Get count of files with active share links
 * ВАЖНО: Этот роут должен быть ДО /:id
 */
router.get('/shared/count', async (req, res: Response) => {
  const { telegramUser } = req as AuthenticatedRequest;

  try {
    const count = await filesRepo.getSharedCount(telegramUser.id);
    res.json({ count });
  } catch (error) {
    console.error('[API] Error fetching shared count:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/files/caption
 * Update caption for one or more files
 */
router.patch('/caption', async (req, res: Response) => {
  const { telegramUser } = req as unknown as AuthenticatedRequest;
  const { fileIds, caption } = req.body as {
    fileIds: number[];
    caption: string | null;
  };

  // Validate fileIds
  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    res.status(400).json({ error: 'fileIds array is required' });
    return;
  }

  if (fileIds.length > MAX_BATCH_SIZE) {
    res.status(400).json({ error: `Maximum ${MAX_BATCH_SIZE} files per request` });
    return;
  }

  // Validate caption (can be null, empty string, or text)
  if (caption !== null && typeof caption !== 'string') {
    res.status(400).json({ error: 'caption must be a string or null' });
    return;
  }

  // Limit caption length
  if (caption && caption.length > DEFAULT_CAPTION_LIMIT) {
    res.status(400).json({
      error: `caption exceeds maximum length of ${DEFAULT_CAPTION_LIMIT}`
    });
    return;
  }

  console.log('[Files] Updating caption for', fileIds.length, 'files, user:', telegramUser.id);

  try {
    const updatedCount = filesRepo.updateCaption(fileIds, telegramUser.id, caption);

    console.log('[Files] Updated caption for', updatedCount, 'files');

    res.json({ success: true, updated: updatedCount });
  } catch (error) {
    console.error('[API] Error updating caption:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/files/:id
 * Get a single file by ID
 */
router.get('/:id', async (req, res: Response) => {
  const { telegramUser } = req as unknown as AuthenticatedRequest;
  const fileId = parseInt(req.params.id, 10);

  if (isNaN(fileId)) {
    res.status(400).json({ error: 'Invalid file ID' });
    return;
  }

  try {
    const file = await filesRepo.findById(fileId);

    if (!file || file.userId !== telegramUser.id) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const service = getThumbnailService();
    const thumbnailUrl = await service.getThumbnailUrl(
      file.thumbnailFileId,
      file.fileId,
      file.mediaType as MediaType
    );

    res.json({ ...file, thumbnailUrl });
  } catch (error) {
    console.error('[API] Error fetching file:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/files/:id/video-url
 * Get streaming URL for video files (video and video_note)
 * URL is valid for ~1 hour from Telegram CDN
 */
router.get('/:id/video-url', async (req, res: Response) => {
  const { telegramUser } = req as unknown as AuthenticatedRequest;
  const fileId = parseInt(req.params.id, 10);

  if (isNaN(fileId)) {
    res.status(400).json({ error: 'Invalid file ID' });
    return;
  }

  try {
    const file = await filesRepo.findById(fileId);

    if (!file || file.userId !== telegramUser.id) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Only allow video and video_note types
    if (!['video', 'video_note'].includes(file.mediaType)) {
      res.status(400).json({ error: 'File is not a video' });
      return;
    }

    const service = getThumbnailService();
    const videoUrl = await service.getFileUrl(file.fileId);

    if (!videoUrl) {
      res.status(410).json({ error: 'VIDEO_UNAVAILABLE' });
      return;
    }

    res.json({
      videoUrl,
      expiresIn: 3600,
      mimeType: file.mimeType || 'video/mp4',
    });
  } catch (error) {
    console.error('[API] Error getting video URL:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/files/:id/video-stream
 * Stream video through our server (bypass CDN blocking in Russia)
 * Auth via query param: ?initData=...
 */
router.get('/:id/video-stream', async (req, res: Response) => {
  const { telegramUser } = req as unknown as AuthenticatedRequest;
  const fileId = parseInt(req.params.id, 10);

  if (isNaN(fileId)) {
    res.status(400).json({ error: 'Invalid file ID' });
    return;
  }

  try {
    const file = await filesRepo.findById(fileId);

    if (!file || file.userId !== telegramUser.id) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (!['video', 'video_note'].includes(file.mediaType)) {
      res.status(400).json({ error: 'File is not a video' });
      return;
    }

    const service = getThumbnailService();
    const videoUrl = await service.getFileUrl(file.fileId);

    if (!videoUrl) {
      res.status(410).json({ error: 'VIDEO_UNAVAILABLE' });
      return;
    }

    console.log('[API] Streaming video:', file.id, file.fileName);

    // Fetch video from Telegram CDN
    const videoResponse = await fetch(videoUrl);

    if (!videoResponse.ok || !videoResponse.body) {
      res.status(502).json({ error: 'Failed to fetch video from CDN' });
      return;
    }

    // Set headers for streaming
    res.setHeader('Content-Type', file.mimeType || 'video/mp4');
    const contentLength = videoResponse.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    // Stream the video using Node.js streams
    const reader = videoResponse.body.getReader();

    const pump = async (): Promise<void> => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Check if client disconnected
          if (res.destroyed) {
            reader.cancel();
            break;
          }

          res.write(Buffer.from(value));
        }
        res.end();
      } catch (streamError) {
        console.error('[API] Stream error:', streamError);
        if (!res.destroyed) {
          res.end();
        }
      }
    };

    await pump();

  } catch (error) {
    console.error('[API] Error streaming video:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Лимиты для предотвращения бана от Telegram
const MAX_FILES_PER_REQUEST = 20;
const DELAY_BETWEEN_SENDS_MS = 300; // 300ms между отправками

// Утилита для задержки
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * POST /api/files/send
 * Send multiple files to user via bot
 */
router.post('/send', async (req, res: Response) => {
  const { telegramUser } = req as unknown as AuthenticatedRequest;
  const { fileIds } = req.body as { fileIds: number[] };

  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    res.status(400).json({ error: 'fileIds array is required' });
    return;
  }

  // Лимит на количество файлов
  if (fileIds.length > MAX_FILES_PER_REQUEST) {
    res.status(400).json({
      error: `Maximum ${MAX_FILES_PER_REQUEST} files per request allowed`
    });
    return;
  }

  console.log('[Files] Sending files to user:', telegramUser.id, 'files:', fileIds);

  try {
    const sentFiles: number[] = [];
    const errors: string[] = [];

    for (let i = 0; i < fileIds.length; i++) {
      const id = fileIds[i];
      const file = await filesRepo.findById(id);

      if (!file || file.userId !== telegramUser.id) {
        errors.push(`File ${id} not found`);
        continue;
      }

      const mediaType = file.mediaType as MediaType;
      const caption = getCaptionForMedia(file.caption, mediaType);
      const sendCaptionSeparately = needsSeparateMessage(file.caption, mediaType);

      try {
        // Всегда используем sendFileByFileId чтобы отправить наш caption из БД
        // (copyMessage отправляет оригинальный caption, игнорируя наш)
        await sendFileByFileId(telegramUser.id, file.fileId, mediaType, caption);
        console.log('[Files] Sent via file_id with caption:', file.id, file.fileName);

        // Отправка длинного caption отдельно (если caption был обрезан)
        if (sendCaptionSeparately && file.caption) {
          await sendCaptionAsText(telegramUser.id, file.caption);
        }

        sentFiles.push(id);

        // Задержка между отправками (кроме последней)
        if (i < fileIds.length - 1) {
          await delay(DELAY_BETWEEN_SENDS_MS);
        }
      } catch (sendError) {
        const errMsg = sendError instanceof Error ? sendError.message : String(sendError);

        if (errMsg.includes('VOICE_MESSAGES_FORBIDDEN')) {
          console.log('[Files] Voice messages forbidden for file:', id);
          errors.push(`VOICE_FORBIDDEN:${id}`);
        } else {
          console.error('[Files] Error sending file:', id, sendError);
          errors.push(`Failed to send file ${id}`);
        }
      }
    }

    res.json({
      success: sentFiles.length === fileIds.length,
      sent: sentFiles,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('[API] Error sending files:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Send file by file_id based on media type
 * If photo/video fails with type mismatch, fallback to document
 */
async function sendFileByFileId(
  chatId: number,
  fileId: string,
  mediaType: MediaType,
  caption?: string
): Promise<void> {
  try {
    switch (mediaType) {
      case 'photo':
        await bot.api.sendPhoto(chatId, fileId, { caption });
        break;
      case 'video':
        await bot.api.sendVideo(chatId, fileId, { caption });
        break;
      case 'document':
        await bot.api.sendDocument(chatId, fileId, { caption });
        break;
      case 'audio':
        await bot.api.sendAudio(chatId, fileId, { caption });
        break;
      case 'voice':
        await bot.api.sendVoice(chatId, fileId, { caption });
        break;
      case 'video_note':
        await bot.api.sendVideoNote(chatId, fileId);
        break;
      default:
        await bot.api.sendDocument(chatId, fileId, { caption });
    }
  } catch (error: unknown) {
    // If photo/video fails with type mismatch, try as document
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes("can't use file of type") && (mediaType === 'photo' || mediaType === 'video')) {
      console.log('[Files] Type mismatch, sending as document instead');
      await bot.api.sendDocument(chatId, fileId, { caption });
    } else {
      throw error;
    }
  }
}

/**
 * POST /api/files/:id/send
 * Send single file to user via bot
 */
router.post('/:id/send', async (req, res: Response) => {
  const { telegramUser } = req as unknown as AuthenticatedRequest;
  const fileId = parseInt(req.params.id, 10);

  if (isNaN(fileId)) {
    res.status(400).json({ error: 'Invalid file ID' });
    return;
  }

  try {
    const file = await filesRepo.findById(fileId);

    if (!file || file.userId !== telegramUser.id) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const mediaType = file.mediaType as MediaType;
    const caption = getCaptionForMedia(file.caption, mediaType);
    const sendCaptionSeparately = needsSeparateMessage(file.caption, mediaType);

    // Всегда используем sendFileByFileId чтобы отправить наш caption из БД
    // (copyMessage отправляет оригинальный caption, игнорируя наш)
    try {
      await sendFileByFileId(telegramUser.id, file.fileId, mediaType, caption);
      console.log('[Files] Sent via file_id with caption:', file.id);
    } catch (sendError) {
      const errMsg = sendError instanceof Error ? sendError.message : String(sendError);
      console.error('[Files] Send failed:', sendError);

      // Проверяем на VOICE_MESSAGES_FORBIDDEN
      if (errMsg.includes('VOICE_MESSAGES_FORBIDDEN')) {
        res.status(403).json({ error: 'VOICE_FORBIDDEN' });
        return;
      }

      res.status(410).json({ error: 'FILE_UNAVAILABLE' });
      return;
    }

    // Send caption as separate message if it was too long
    if (sendCaptionSeparately && file.caption) {
      await sendCaptionAsText(telegramUser.id, file.caption);
    }

    console.log('[Files] Sent file:', file.id, file.fileName);

    res.json({ success: true });
  } catch (error) {
    console.error('[API] Error sending file:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/files/:id
 * Soft delete a file (move to trash)
 */
router.delete('/:id', async (req, res: Response) => {
  const { telegramUser } = req as unknown as AuthenticatedRequest;
  const fileId = parseInt(req.params.id, 10);

  if (isNaN(fileId)) {
    res.status(400).json({ error: 'Invalid file ID' });
    return;
  }

  try {
    const deleted = await filesRepo.softDelete(fileId, telegramUser.id);

    if (!deleted) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[API] Error deleting file:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/files/:id/restore
 * Restore a file from trash
 */
router.post('/:id/restore', async (req, res: Response) => {
  const { telegramUser } = req as unknown as AuthenticatedRequest;
  const fileId = parseInt(req.params.id, 10);

  if (isNaN(fileId)) {
    res.status(400).json({ error: 'Invalid file ID' });
    return;
  }

  try {
    const restored = await filesRepo.restore(fileId, telegramUser.id);

    if (!restored) {
      res.status(404).json({ error: 'File not found in trash' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[API] Error restoring file:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/files/:id/permanent
 * Permanently delete a file (hard delete)
 */
router.delete('/:id/permanent', async (req, res: Response) => {
  const { telegramUser } = req as unknown as AuthenticatedRequest;
  const fileId = parseInt(req.params.id, 10);

  if (isNaN(fileId)) {
    res.status(400).json({ error: 'Invalid file ID' });
    return;
  }

  try {
    const deleted = await filesRepo.hardDelete(fileId, telegramUser.id);

    if (!deleted) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[API] Error permanently deleting file:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
