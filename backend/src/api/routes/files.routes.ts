import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { FilesRepository } from '../../db/repositories/files.repository.js';
import { ThumbnailService } from '../../services/thumbnail.service.js';
import { MediaType } from '../../types/index.js';
import { bot } from '../../bot/index.js';
import { config } from '../../config.js';

const router = Router();
const filesRepo = new FilesRepository();

// Lazy init thumbnail service (bot needs to be initialized first)
let thumbnailService: ThumbnailService | null = null;
function getThumbnailService(): ThumbnailService {
  if (!thumbnailService) {
    thumbnailService = new ThumbnailService(bot, config.botToken);
  }
  return thumbnailService;
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
    limit = '20',
  } = req.query;

  console.log('[Files] GET / for user:', telegramUser.id);

  try {
    const pageNum = parseInt(page as string, 10);
    const limitNum = Math.min(parseInt(limit as string, 10), 100);
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

    res.json({
      items: itemsWithThumbnails,
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
 * Full-text search in files
 */
router.get('/search', async (req, res: Response) => {
  const { telegramUser } = req as AuthenticatedRequest;
  const { q, limit = '50' } = req.query;

  if (!q || typeof q !== 'string') {
    res.status(400).json({ error: 'Query parameter "q" is required' });
    return;
  }

  try {
    const limitNum = Math.min(parseInt(limit as string, 10), 100);
    const files = filesRepo.search(telegramUser.id, q, limitNum);

    res.json({ items: files, total: files.length });
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

// Лимиты для предотвращения бана от Telegram
const MAX_FILES_PER_REQUEST = 20;
const DELAY_BETWEEN_SENDS_MS = 100; // 100ms между отправками

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
      const caption = file.caption || undefined;

      try {
        switch (mediaType) {
          case 'photo':
            await bot.api.sendPhoto(telegramUser.id, file.fileId, { caption });
            break;
          case 'video':
            await bot.api.sendVideo(telegramUser.id, file.fileId, { caption });
            break;
          case 'document':
            await bot.api.sendDocument(telegramUser.id, file.fileId, { caption });
            break;
          case 'audio':
            await bot.api.sendAudio(telegramUser.id, file.fileId, { caption });
            break;
          case 'voice':
            await bot.api.sendVoice(telegramUser.id, file.fileId, { caption });
            break;
          case 'video_note':
            await bot.api.sendVideoNote(telegramUser.id, file.fileId);
            break;
          case 'animation':
            await bot.api.sendAnimation(telegramUser.id, file.fileId, { caption });
            break;
          case 'sticker':
            await bot.api.sendSticker(telegramUser.id, file.fileId);
            break;
          default:
            await bot.api.sendDocument(telegramUser.id, file.fileId, { caption });
        }
        sentFiles.push(id);
        console.log('[Files] Sent file:', file.id, file.fileName);

        // Задержка между отправками (кроме последней)
        if (i < fileIds.length - 1) {
          await delay(DELAY_BETWEEN_SENDS_MS);
        }
      } catch (sendError) {
        console.error('[Files] Error sending file:', id, sendError);
        errors.push(`Failed to send file ${id}`);
      }
    }

    res.json({
      success: true,
      sent: sentFiles,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('[API] Error sending files:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
    const caption = file.caption || undefined;

    // Actually send the file via bot
    switch (mediaType) {
      case 'photo':
        await bot.api.sendPhoto(telegramUser.id, file.fileId, { caption });
        break;
      case 'video':
        await bot.api.sendVideo(telegramUser.id, file.fileId, { caption });
        break;
      case 'document':
        await bot.api.sendDocument(telegramUser.id, file.fileId, { caption });
        break;
      case 'audio':
        await bot.api.sendAudio(telegramUser.id, file.fileId, { caption });
        break;
      case 'voice':
        await bot.api.sendVoice(telegramUser.id, file.fileId, { caption });
        break;
      case 'video_note':
        await bot.api.sendVideoNote(telegramUser.id, file.fileId);
        break;
      case 'animation':
        await bot.api.sendAnimation(telegramUser.id, file.fileId, { caption });
        break;
      case 'sticker':
        await bot.api.sendSticker(telegramUser.id, file.fileId);
        break;
      default:
        await bot.api.sendDocument(telegramUser.id, file.fileId, { caption });
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
 * Delete a file
 */
router.delete('/:id', async (req, res: Response) => {
  const { telegramUser } = req as unknown as AuthenticatedRequest;
  const fileId = parseInt(req.params.id, 10);

  if (isNaN(fileId)) {
    res.status(400).json({ error: 'Invalid file ID' });
    return;
  }

  try {
    const deleted = await filesRepo.delete(fileId, telegramUser.id);

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

export default router;
