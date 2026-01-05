import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { LinksRepository } from '../../db/repositories/links.repository.js';
import { searchLinksWithSnippets } from '../../db/index.js';

const router = Router();
const linksRepo = new LinksRepository();

/**
 * GET /api/links
 * Get links for the authenticated user
 */
router.get('/', async (req, res: Response) => {
  const { telegramUser } = req as AuthenticatedRequest;
  const { page = '1', limit = '20' } = req.query;

  try {
    const pageNum = parseInt(page as string, 10);
    const limitNum = Math.min(parseInt(limit as string, 10), 100);
    const offset = (pageNum - 1) * limitNum;

    const result = await linksRepo.findByUser(telegramUser.id, {
      limit: limitNum,
      offset,
    });

    res.json({
      items: result.items,
      total: result.total,
      page: pageNum,
      totalPages: Math.ceil(result.total / limitNum),
    });
  } catch (error) {
    console.error('[API] Error fetching links:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/links/trash
 * Get deleted links (trash) for the authenticated user
 */
router.get('/trash', async (req, res: Response) => {
  const { telegramUser } = req as AuthenticatedRequest;

  console.log('[Links] GET /trash for user:', telegramUser.id);

  try {
    const links = await linksRepo.findDeleted(telegramUser.id);
    console.log('[Links] Found', links.length, 'links in trash');
    res.json({ items: links, total: links.length });
  } catch (error) {
    console.error('[API] Error fetching trash:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/links/trash/count
 * Get count of links in trash
 */
router.get('/trash/count', async (req, res: Response) => {
  const { telegramUser } = req as AuthenticatedRequest;

  try {
    const count = await linksRepo.getTrashCount(telegramUser.id);
    res.json({ count });
  } catch (error) {
    console.error('[API] Error fetching trash count:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * GET /api/links/search
 * Full-text search in links
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
    const links = searchLinksWithSnippets(telegramUser.id, q, limitNum);
    res.json({ items: links, total: links.length });
  } catch (error) {
    console.error('[API] Error searching links:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/links/delete-many
 * Soft delete multiple links (move to trash)
 */
router.post('/delete-many', async (req, res: Response) => {
  const { telegramUser } = req as unknown as AuthenticatedRequest;
  const { linkIds } = req.body as { linkIds: number[] };

  if (!Array.isArray(linkIds) || linkIds.length === 0) {
    res.status(400).json({ error: 'linkIds array is required' });
    return;
  }

  if (linkIds.length > 100) {
    res.status(400).json({ error: 'Maximum 100 links per request' });
    return;
  }

  try {
    const deletedCount = await linksRepo.softDeleteMany(linkIds, telegramUser.id);
    res.json({ success: true, deleted: deletedCount });
  } catch (error) {
    console.error('[API] Error deleting links:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/links/:id
 * Get a single link by ID
 */
router.get('/:id', async (req, res: Response) => {
  const { telegramUser } = req as unknown as AuthenticatedRequest;
  const linkId = parseInt(req.params.id, 10);

  if (isNaN(linkId)) {
    res.status(400).json({ error: 'Invalid link ID' });
    return;
  }

  try {
    const link = await linksRepo.findById(linkId);

    if (!link || link.userId !== telegramUser.id) {
      res.status(404).json({ error: 'Link not found' });
      return;
    }

    res.json(link);
  } catch (error) {
    console.error('[API] Error fetching link:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/links/:id
 * Soft delete a link (move to trash)
 */
router.delete('/:id', async (req, res: Response) => {
  const { telegramUser } = req as unknown as AuthenticatedRequest;
  const linkId = parseInt(req.params.id, 10);

  if (isNaN(linkId)) {
    res.status(400).json({ error: 'Invalid link ID' });
    return;
  }

  try {
    const deleted = await linksRepo.softDelete(linkId, telegramUser.id);

    if (!deleted) {
      res.status(404).json({ error: 'Link not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[API] Error deleting link:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/links/:id/restore
 * Restore a link from trash
 */
router.post('/:id/restore', async (req, res: Response) => {
  const { telegramUser } = req as unknown as AuthenticatedRequest;
  const linkId = parseInt(req.params.id, 10);

  if (isNaN(linkId)) {
    res.status(400).json({ error: 'Invalid link ID' });
    return;
  }

  try {
    const restored = await linksRepo.restore(linkId, telegramUser.id);

    if (!restored) {
      res.status(404).json({ error: 'Link not found in trash' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[API] Error restoring link:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/links/:id/permanent
 * Permanently delete a link (hard delete)
 */
router.delete('/:id/permanent', async (req, res: Response) => {
  const { telegramUser } = req as unknown as AuthenticatedRequest;
  const linkId = parseInt(req.params.id, 10);

  if (isNaN(linkId)) {
    res.status(400).json({ error: 'Invalid link ID' });
    return;
  }

  try {
    const deleted = await linksRepo.hardDelete(linkId, telegramUser.id);

    if (!deleted) {
      res.status(404).json({ error: 'Link not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[API] Error permanently deleting link:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
