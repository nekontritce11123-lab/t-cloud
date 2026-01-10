import { Router, Response } from 'express';
import crypto from 'crypto';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { FilesRepository } from '../../db/repositories/files.repository.js';
import { sqlite, deactivateExpiredShares } from '../../db/index.js';

const router = Router();
const filesRepo = new FilesRepository();

const BOT_USERNAME = process.env.BOT_USERNAME || 'FC_Cloud_Bot';
const WEB_URL = process.env.WEB_URL || 'https://api.factchain-traker.online';

interface FileShare {
  id: number;
  fileId: number;
  ownerId: number;
  token: string;
  maxRecipients: number | null;
  expiresAt: number | null;
  useCount: number;
  isActive: number;
  createdAt: number;
  updatedAt: number;
}

interface ShareRecipient {
  id: number;
  shareId: number;
  recipientId: number;
  receivedAt: number;
}

/**
 * Generate share URL (Telegram bot)
 */
function getShareUrl(token: string): string {
  return `https://t.me/${BOT_USERNAME}?start=share_${token}`;
}

/**
 * Generate web share URL
 */
function getWebShareUrl(token: string): string {
  return `${WEB_URL}/share/${token}`;
}

/**
 * Convert DB row to FileShare object (snake_case to camelCase)
 */
function rowToShare(row: any): FileShare {
  return {
    id: row.id,
    fileId: row.file_id,
    ownerId: row.owner_id,
    token: row.token,
    maxRecipients: row.max_recipients,
    expiresAt: row.expires_at,
    useCount: row.use_count,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Convert DB row to ShareRecipient object
 */
function rowToRecipient(row: any): ShareRecipient {
  return {
    id: row.id,
    shareId: row.share_id,
    recipientId: row.recipient_id,
    receivedAt: row.received_at,
  };
}

/**
 * POST /api/files/:id/share
 * Create a share link for a file
 */
router.post('/:id/share', async (req, res: Response) => {
  const { telegramUser } = req as unknown as AuthenticatedRequest;
  const fileId = parseInt(req.params.id, 10);

  if (isNaN(fileId)) {
    res.status(400).json({ error: 'Invalid file ID' });
    return;
  }

  const { maxRecipients, expiresIn } = req.body as {
    maxRecipients?: number;
    expiresIn?: number; // hours
  };

  try {
    // Check if file exists and belongs to user
    const file = await filesRepo.findById(fileId);

    if (!file || file.userId !== telegramUser.id) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Check if file is deleted
    if (file.deletedAt) {
      res.status(400).json({ error: 'Cannot share deleted file' });
      return;
    }

    // Check if share already exists for this file
    const existingShare = sqlite.prepare(`
      SELECT * FROM file_shares
      WHERE file_id = ? AND owner_id = ? AND is_active = 1
    `).get(fileId, telegramUser.id) as any;

    if (existingShare) {
      // Return existing share
      const share = rowToShare(existingShare);
      res.json({
        share,
        shareUrl: getShareUrl(share.token),
        webUrl: getWebShareUrl(share.token),
        isExisting: true,
      });
      return;
    }

    // Generate unique token
    const token = crypto.randomBytes(12).toString('base64url');

    // Calculate expiration timestamp
    const expiresAt = expiresIn
      ? Math.floor(Date.now() / 1000) + expiresIn * 3600
      : null;

    // Create share
    const result = sqlite.prepare(`
      INSERT INTO file_shares (file_id, owner_id, token, max_recipients, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(fileId, telegramUser.id, token, maxRecipients || null, expiresAt);

    // Get created share
    const newShare = sqlite.prepare(`
      SELECT * FROM file_shares WHERE id = ?
    `).get(result.lastInsertRowid) as any;

    const share = rowToShare(newShare);

    console.log('[Shares] Created share for file:', fileId, 'token:', token);

    res.json({
      share,
      shareUrl: getShareUrl(share.token),
      webUrl: getWebShareUrl(share.token),
      isExisting: false,
    });
  } catch (error) {
    console.error('[API] Error creating share:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/files/:id/share
 * Get share info for a file
 */
router.get('/:id/share', async (req, res: Response) => {
  const { telegramUser } = req as unknown as AuthenticatedRequest;
  const fileId = parseInt(req.params.id, 10);

  if (isNaN(fileId)) {
    res.status(400).json({ error: 'Invalid file ID' });
    return;
  }

  // Cleanup expired shares before fetching
  deactivateExpiredShares();

  try {
    // Check if file exists and belongs to user
    const file = await filesRepo.findById(fileId);

    if (!file || file.userId !== telegramUser.id) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Get share for this file
    const shareRow = sqlite.prepare(`
      SELECT * FROM file_shares
      WHERE file_id = ? AND owner_id = ? AND is_active = 1
    `).get(fileId, telegramUser.id) as any;

    if (!shareRow) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }

    const share = rowToShare(shareRow);

    // Get recipients
    const recipientRows = sqlite.prepare(`
      SELECT * FROM share_recipients
      WHERE share_id = ?
      ORDER BY received_at DESC
    `).all(share.id) as any[];

    const recipients = recipientRows.map(rowToRecipient);

    res.json({
      share,
      shareUrl: getShareUrl(share.token),
      webUrl: getWebShareUrl(share.token),
      recipients,
    });
  } catch (error) {
    console.error('[API] Error getting share:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/shares/:token
 * Delete a share by token
 */
router.delete('/:token', async (req, res: Response) => {
  const { telegramUser } = req as unknown as AuthenticatedRequest;
  const { token } = req.params;

  if (!token) {
    res.status(400).json({ error: 'Token is required' });
    return;
  }

  try {
    // Find share by token
    const shareRow = sqlite.prepare(`
      SELECT * FROM file_shares WHERE token = ?
    `).get(token) as any;

    if (!shareRow) {
      res.status(404).json({ error: 'Share not found' });
      return;
    }

    // Check ownership
    if (shareRow.owner_id !== telegramUser.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Deactivate share (soft delete)
    sqlite.prepare(`
      UPDATE file_shares
      SET is_active = 0, updated_at = unixepoch()
      WHERE id = ?
    `).run(shareRow.id);

    console.log('[Shares] Deleted share:', token);

    res.json({ success: true });
  } catch (error) {
    console.error('[API] Error deleting share:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
