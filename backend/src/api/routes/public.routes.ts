import { Router, Request, Response } from 'express';
import { sqlite, deactivateExpiredShares } from '../../db/index.js';
import { FilesRepository } from '../../db/repositories/files.repository.js';
import { ThumbnailService } from '../../services/thumbnail.service.js';
import { bot } from '../../bot/index.js';
import { config } from '../../config.js';

const router = Router();
const filesRepo = new FilesRepository();

const BOT_USERNAME = process.env.BOT_USERNAME || 'FC_Cloud_Bot';
const WEB_URL = process.env.WEB_URL || 'https://api.factchain-traker.online';
const MAX_WEB_DOWNLOAD_SIZE = 50 * 1024 * 1024; // 50 MB limit for web downloads

// Simple in-memory rate limiter
const rateLimits: Record<string, { count: number; resetAt: number }> = {};
const RATE_LIMIT_VIEW = { max: 100, windowMs: 60 * 1000 }; // 100 req/min for viewing
const RATE_LIMIT_DOWNLOAD = { max: 10, windowMs: 60 * 1000 }; // 10 req/min for downloading

function getRateLimitKey(ip: string, action: 'view' | 'download'): string {
  return `${ip}:${action}`;
}

function isRateLimited(ip: string, action: 'view' | 'download'): boolean {
  const limits = action === 'download' ? RATE_LIMIT_DOWNLOAD : RATE_LIMIT_VIEW;
  const key = getRateLimitKey(ip, action);
  const now = Date.now();

  if (!rateLimits[key] || rateLimits[key].resetAt < now) {
    rateLimits[key] = { count: 0, resetAt: now + limits.windowMs };
  }

  rateLimits[key].count++;
  return rateLimits[key].count > limits.max;
}

// Get client IP
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

// Escape HTML to prevent XSS
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Format file size
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

// Get file type icon (emoji for simplicity)
function getFileTypeIcon(mediaType: string, mimeType?: string | null): string {
  if (mediaType === 'photo') return '🖼️';
  if (mediaType === 'video' || mediaType === 'video_note') return '🎬';
  if (mediaType === 'audio') return '🎵';
  if (mediaType === 'voice') return '🎤';
  if (mimeType?.includes('pdf')) return '📕';
  if (mimeType?.includes('zip') || mimeType?.includes('rar') || mimeType?.includes('7z')) return '📦';
  return '📄';
}

// Calculate time remaining until expiry
function getTimeRemaining(expiresAt: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = expiresAt - now;
  if (diff <= 0) return 'Истекла';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч`;
  return `${Math.floor(diff / 86400)} дн`;
}

interface ShareRow {
  id: number;
  file_id: number;
  owner_id: number;
  token: string;
  max_recipients: number | null;
  expires_at: number | null;
  use_count: number;
  is_active: number;
  created_at: number;
}

interface FileRow {
  id: number;
  user_id: number;
  file_id: string;
  file_unique_id: string;
  media_type: string;
  mime_type: string | null;
  file_name: string | null;
  file_size: number | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  thumbnail_file_id: string | null;
  caption: string | null;
  deleted_at: number | null;
}

// Get share and file data
function getShareData(token: string): { share: ShareRow; file: FileRow } | null {
  deactivateExpiredShares();

  const share = sqlite.prepare(`
    SELECT * FROM file_shares
    WHERE token = ? AND is_active = 1
  `).get(token) as ShareRow | undefined;

  if (!share) return null;

  // Check if expired
  if (share.expires_at && share.expires_at < Math.floor(Date.now() / 1000)) {
    return null;
  }

  // Check if max recipients reached
  if (share.max_recipients !== null && share.use_count >= share.max_recipients) {
    return null;
  }

  const file = sqlite.prepare(`
    SELECT * FROM files WHERE id = ?
  `).get(share.file_id) as FileRow | undefined;

  if (!file || file.deleted_at) {
    return null;
  }

  return { share, file };
}

// Log download
function logDownload(shareId: number, downloadType: string, ip: string, userAgent: string): void {
  try {
    sqlite.prepare(`
      INSERT INTO share_downloads (share_id, download_type, ip_address, user_agent)
      VALUES (?, ?, ?, ?)
    `).run(shareId, downloadType, ip, userAgent);
  } catch (e) {
    console.error('[Public] Failed to log download:', e);
  }
}

/**
 * GET /share/:token
 * Render HTML page with file preview
 */
router.get('/:token', async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  if (isRateLimited(ip, 'view')) {
    res.status(429).send('Too many requests. Please try again later.');
    return;
  }

  const { token } = req.params;
  const data = getShareData(token);

  if (!data) {
    res.status(404).send(renderErrorPage('Ссылка недействительна', 'Файл не найден или ссылка истекла.'));
    return;
  }

  const { share, file } = data;

  // Log view
  logDownload(share.id, 'web_view', ip, req.headers['user-agent'] || '');

  const fileName = file.file_name || 'Файл';
  const fileSize = file.file_size ? formatFileSize(file.file_size) : '';
  const fileIcon = getFileTypeIcon(file.media_type, file.mime_type);
  const canDownload = !file.file_size || file.file_size <= MAX_WEB_DOWNLOAD_SIZE;
  const previewUrl = `${WEB_URL}/share/${token}/preview`;
  const downloadUrl = `${WEB_URL}/share/${token}/download`;
  const telegramUrl = `https://t.me/${BOT_USERNAME}?start=share_${token}`;

  // Expiry info
  let expiryInfo = '';
  if (share.expires_at) {
    expiryInfo = `Истекает через ${getTimeRemaining(share.expires_at)}`;
  }

  // Downloads info
  let downloadsInfo = '';
  if (share.max_recipients !== null) {
    downloadsInfo = `Скачано: ${share.use_count}/${share.max_recipients}`;
  }

  res.send(renderSharePage({
    token,
    fileName,
    fileSize,
    fileIcon,
    mediaType: file.media_type,
    mimeType: file.mime_type,
    caption: file.caption,
    previewUrl,
    downloadUrl,
    telegramUrl,
    canDownload,
    expiryInfo,
    downloadsInfo,
  }));
});

/**
 * GET /share/:token/info
 * Get JSON metadata for the shared file
 */
router.get('/:token/info', async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  if (isRateLimited(ip, 'view')) {
    res.status(429).json({ error: 'Rate limit exceeded' });
    return;
  }

  const { token } = req.params;
  const data = getShareData(token);

  if (!data) {
    res.status(404).json({ error: 'Share not found or expired' });
    return;
  }

  const { share, file } = data;

  res.json({
    fileName: file.file_name,
    fileSize: file.file_size,
    mediaType: file.media_type,
    mimeType: file.mime_type,
    caption: file.caption,
    expiresAt: share.expires_at,
    maxRecipients: share.max_recipients,
    useCount: share.use_count,
    canDownload: !file.file_size || file.file_size <= MAX_WEB_DOWNLOAD_SIZE,
  });
});

/**
 * GET /share/:token/preview
 * Get preview image for OG tags
 */
router.get('/:token/preview', async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  if (isRateLimited(ip, 'view')) {
    res.status(429).send('Too many requests');
    return;
  }

  const { token } = req.params;
  const data = getShareData(token);

  if (!data) {
    res.status(404).send('Not found');
    return;
  }

  const { file } = data;

  // Get thumbnail URL
  const thumbnailService = new ThumbnailService(bot, config.botToken);
  const thumbnailUrl = await thumbnailService.getThumbnailUrl(
    file.thumbnail_file_id,
    file.file_id,
    file.media_type as any
  );

  if (thumbnailUrl) {
    res.redirect(thumbnailUrl);
  } else {
    // Return a default placeholder image
    res.status(404).send('No preview available');
  }
});

/**
 * GET /share/:token/download
 * Download the file (proxy through backend)
 */
router.get('/:token/download', async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  if (isRateLimited(ip, 'download')) {
    res.status(429).send('Too many download requests. Please try again later.');
    return;
  }

  const { token } = req.params;
  const data = getShareData(token);

  if (!data) {
    res.status(404).send('File not found or link expired');
    return;
  }

  const { share, file } = data;

  // Check file size limit
  if (file.file_size && file.file_size > MAX_WEB_DOWNLOAD_SIZE) {
    res.status(400).send(`File too large for web download. Maximum size: ${formatFileSize(MAX_WEB_DOWNLOAD_SIZE)}. Please use Telegram to download.`);
    return;
  }

  try {
    

    // Get file from Telegram
    const telegramFile = await bot.api.getFile(file.file_id);
    if (!telegramFile.file_path) {
      res.status(500).send('Failed to get file from Telegram');
      return;
    }

    // Get file URL
    const fileUrl = `https://api.telegram.org/file/bot${config.botToken}/${telegramFile.file_path}`;

    // Fetch file
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
      res.status(500).send('Failed to download file from Telegram');
      return;
    }

    // Log download and increment use count
    logDownload(share.id, 'web_download', ip, req.headers['user-agent'] || '');
    sqlite.prepare(`
      UPDATE file_shares SET use_count = use_count + 1, updated_at = unixepoch()
      WHERE id = ?
    `).run(share.id);

    // Set headers
    const fileName = file.file_name || `file_${file.id}`;
    const mimeType = file.mime_type || 'application/octet-stream';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    if (file.file_size) {
      res.setHeader('Content-Length', file.file_size);
    }

    // Stream file to response
    const reader = fileResponse.body?.getReader();
    if (!reader) {
      res.status(500).send('Failed to read file');
      return;
    }

    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    };

    await pump();
  } catch (error) {
    console.error('[Public] Download error:', error);
    res.status(500).send('Download failed');
  }
});

// Render share page HTML
function renderSharePage(params: {
  token: string;
  fileName: string;
  fileSize: string;
  fileIcon: string;
  mediaType: string;
  mimeType: string | null;
  caption: string | null;
  previewUrl: string;
  downloadUrl: string;
  telegramUrl: string;
  canDownload: boolean;
  expiryInfo: string;
  downloadsInfo: string;
}): string {
  const isImage = params.mediaType === 'photo';
  const isVideo = params.mediaType === 'video' || params.mediaType === 'video_note';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(params.fileName)} - FC-Cloud</title>
  <meta property="og:title" content="${escapeHtml(params.fileName)} - FC-Cloud">
  <meta property="og:description" content="${params.caption ? escapeHtml(params.caption.slice(0, 200)) : 'Скачать файл, отправленный через FC-Cloud'}">
  <meta property="og:image" content="${params.previewUrl}">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary_large_image">
  <style>
    :root {
      --bg: #18222d;
      --bg-secondary: #232e3c;
      --text: #ffffff;
      --text-secondary: #8e99a4;
      --accent: #5288c1;
      --favorite: #FFD700;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 20px;
    }
    .container {
      max-width: 500px;
      width: 100%;
      background: var(--bg-secondary);
      border-radius: 16px;
      overflow: hidden;
    }
    .header {
      padding: 16px;
      text-align: center;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .logo {
      font-size: 20px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .logo svg {
      width: 24px;
      height: 24px;
      color: var(--accent);
    }
    .preview {
      width: 100%;
      aspect-ratio: 16/9;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.3);
      overflow: hidden;
    }
    .preview img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .preview-icon {
      font-size: 64px;
    }
    .info {
      padding: 20px;
    }
    .file-name {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 4px;
      word-break: break-word;
    }
    .file-meta {
      color: var(--text-secondary);
      font-size: 14px;
    }
    .caption {
      margin-top: 12px;
      padding: 12px;
      background: rgba(0,0,0,0.2);
      border-radius: 8px;
      font-size: 14px;
      line-height: 1.5;
    }
    .download-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 16px;
      margin-top: 16px;
      background: var(--accent);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: opacity 0.2s;
    }
    .download-btn:hover {
      opacity: 0.9;
    }
    .download-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .download-btn svg {
      width: 20px;
      height: 20px;
    }
    .share-info {
      margin-top: 12px;
      display: flex;
      justify-content: center;
      gap: 16px;
      color: var(--text-secondary);
      font-size: 13px;
    }
    .cta {
      margin-top: 24px;
      padding: 20px;
      background: rgba(82, 136, 193, 0.1);
      border-radius: 12px;
      text-align: center;
    }
    .cta-title {
      font-weight: 600;
      margin-bottom: 8px;
    }
    .cta-text {
      font-size: 14px;
      color: var(--text-secondary);
      margin-bottom: 16px;
    }
    .telegram-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
      background: #0088cc;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      text-decoration: none;
      transition: opacity 0.2s;
    }
    .telegram-btn:hover {
      opacity: 0.9;
    }
    .no-download {
      margin-top: 16px;
      padding: 12px;
      background: rgba(255,107,107,0.1);
      border-radius: 8px;
      text-align: center;
      color: #ff6b6b;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
        </svg>
        FC-Cloud
      </div>
    </div>

    <div class="preview">
      ${isImage || isVideo
        ? `<img src="${params.previewUrl}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">`
        : ''
      }
      <span class="preview-icon" ${isImage || isVideo ? 'style="display:none"' : ''}>${params.fileIcon}</span>
    </div>

    <div class="info">
      <div class="file-name">${escapeHtml(params.fileName)}</div>
      <div class="file-meta">${params.fileSize}${params.mimeType ? ' • ' + escapeHtml(params.mimeType.split('/')[1] || params.mimeType) : ''}</div>

      ${params.caption ? `<div class="caption">${escapeHtml(params.caption)}</div>` : ''}

      ${params.canDownload
        ? `<a href="${params.downloadUrl}" class="download-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Скачать файл
          </a>`
        : `<div class="no-download">
            Файл слишком большой для скачивания через браузер.<br>
            Используйте Telegram для загрузки.
          </div>`
      }

      ${params.expiryInfo || params.downloadsInfo
        ? `<div class="share-info">
            ${params.expiryInfo ? `<span>${params.expiryInfo}</span>` : ''}
            ${params.downloadsInfo ? `<span>${params.downloadsInfo}</span>` : ''}
          </div>`
        : ''
      }

      <div class="cta">
        <div class="cta-title">Хотите своё облако?</div>
        <div class="cta-text">Храните и делитесь файлами через FC-Cloud</div>
        <a href="${params.telegramUrl}" class="telegram-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.944 0A12 12 0 1 0 24 12 12.01 12.01 0 0 0 11.944 0zm5.768 7.93l-1.975 9.413c-.15.664-.55.82-1.115.51l-3.056-2.254-1.474 1.42c-.163.163-.3.3-.614.3l.22-3.106 5.643-5.1c.246-.22-.054-.342-.382-.124l-6.978 4.392-3.006-.938c-.653-.205-.667-.653.137-.967l11.744-4.527c.545-.198 1.022.132.856.963z"/>
          </svg>
          Открыть в Telegram
        </a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// Render error page
function renderErrorPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - FC-Cloud</title>
  <style>
    :root {
      --bg: #18222d;
      --text: #ffffff;
      --text-secondary: #8e99a4;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
      text-align: center;
    }
    .icon { font-size: 64px; margin-bottom: 16px; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    p { color: var(--text-secondary); }
  </style>
</head>
<body>
  <div class="icon">❌</div>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(message)}</p>
</body>
</html>`;
}

export default router;
