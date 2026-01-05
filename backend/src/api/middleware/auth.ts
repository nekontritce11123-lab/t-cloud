import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../../config.js';
import { TelegramUser } from '../../types/index.js';

export interface AuthenticatedRequest extends Request {
  telegramUser: TelegramUser;
}

/**
 * Validates Telegram Mini App initData
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(initData: string): TelegramUser | null {
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');

    if (!hash) {
      return null;
    }

    // Remove hash from params for validation
    urlParams.delete('hash');

    // Sort params alphabetically and create data-check-string
    const dataCheckArr: string[] = [];
    urlParams.sort();
    urlParams.forEach((value, key) => {
      dataCheckArr.push(`${key}=${value}`);
    });
    const dataCheckString = dataCheckArr.join('\n');

    // Create secret key
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(config.botToken)
      .digest();

    // Calculate hash
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // Validate hash
    if (calculatedHash !== hash) {
      return null;
    }

    // Check auth_date (not older than 24 hours)
    const authDate = urlParams.get('auth_date');
    if (authDate) {
      const authTimestamp = parseInt(authDate, 10);
      const now = Math.floor(Date.now() / 1000);
      if (now - authTimestamp > 86400) {
        return null; // Data is older than 24 hours
      }
    }

    // Parse user data
    const userStr = urlParams.get('user');
    if (!userStr) {
      return null;
    }

    const user = JSON.parse(userStr) as TelegramUser;
    return user;
  } catch (error) {
    console.error('[Auth] Validation error:', error);
    return null;
  }
}

/**
 * Express middleware for Telegram authentication
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const initData = req.headers['x-telegram-init-data'] as string;

  if (!initData) {
    res.status(401).json({ error: 'Missing X-Telegram-Init-Data header' });
    return;
  }

  const user = validateInitData(initData);

  if (!user) {
    res.status(401).json({ error: 'Invalid or expired init data' });
    return;
  }

  (req as AuthenticatedRequest).telegramUser = user;
  next();
}

/**
 * Development-only middleware that accepts user ID in header
 * Use only for local development!
 */
export function devAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // First try real validation
  const initData = req.headers['x-telegram-init-data'] as string;

  if (initData) {
    const user = validateInitData(initData);
    if (user) {
      (req as AuthenticatedRequest).telegramUser = user;
      next();
      return;
    }
  }

  // Fallback to dev user ID header
  const devUserId = req.headers['x-dev-user-id'] as string;
  if (devUserId) {
    (req as AuthenticatedRequest).telegramUser = {
      id: parseInt(devUserId, 10),
      first_name: 'Dev',
      last_name: 'User',
      username: 'devuser',
      language_code: 'ru',
    };
    next();
    return;
  }

  res.status(401).json({ error: 'Authentication required' });
}
