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

  try {
    const pageNum = parseInt(page as string, 10);
    const limitNum = Math.min(parseInt(limit as string, 10), 100);
    const offset = (pageNum - 1) * limitNum;

    const result = await filesRepo.findByUser(telegramUser.id, {
      mediaType: type as MediaType | undefined,
      limit: limitNum,
      offset,
    });

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

/**
 * POST /api/files/:id/send
 * Request to send file back to chat
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

    // Return file info for Mini App to trigger send via callback
    res.json({
      success: true,
      fileId: file.id,
      telegramFileId: file.fileId,
      mediaType: file.mediaType,
    });
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
