import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { LinksRepository } from '../../db/repositories/links.repository.js';

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
 * Delete a link
 */
router.delete('/:id', async (req, res: Response) => {
  const { telegramUser } = req as unknown as AuthenticatedRequest;
  const linkId = parseInt(req.params.id, 10);

  if (isNaN(linkId)) {
    res.status(400).json({ error: 'Invalid link ID' });
    return;
  }

  try {
    const deleted = await linksRepo.delete(linkId, telegramUser.id);

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

export default router;
