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

// Format duration
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
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
  const videoStreamUrl = `${WEB_URL}/share/${token}/video-stream`;
  const telegramUrl = `https://t.me/${BOT_USERNAME}?start=share_${token}`;
  const duration = file.duration ? formatDuration(file.duration) : '';

  // Expiry info
  let expiryInfo = '';
  if (share.expires_at) {
    expiryInfo = getTimeRemaining(share.expires_at);
  }

  // Downloads info
  let downloadsInfo = '';
  if (share.max_recipients !== null) {
    downloadsInfo = `${share.use_count}/${share.max_recipients}`;
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
    videoStreamUrl,
    telegramUrl,
    canDownload,
    expiryInfo,
    downloadsInfo,
    duration,
    width: file.width,
    height: file.height,
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
 * GET /share/:token/video-stream
 * Stream video for inline playback on share page
 */
router.get('/:token/video-stream', async (req: Request, res: Response) => {
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

  // Only allow video files
  if (!['video', 'video_note'].includes(file.media_type)) {
    res.status(400).send('Not a video file');
    return;
  }

  try {
    // Get file from Telegram
    const telegramFile = await bot.api.getFile(file.file_id);
    if (!telegramFile.file_path) {
      res.status(500).send('Failed to get file');
      return;
    }

    // Get file URL
    const fileUrl = `https://api.telegram.org/file/bot${config.botToken}/${telegramFile.file_path}`;

    // Fetch video
    const videoResponse = await fetch(fileUrl);
    if (!videoResponse.ok || !videoResponse.body) {
      res.status(502).send('Failed to fetch video');
      return;
    }

    // Set headers for streaming
    res.setHeader('Content-Type', file.mime_type || 'video/mp4');
    const contentLength = videoResponse.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    // Stream the video
    const reader = videoResponse.body.getReader();

    const pump = async (): Promise<void> => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (res.destroyed) {
            reader.cancel();
            break;
          }
          res.write(Buffer.from(value));
        }
        res.end();
      } catch (streamError) {
        console.error('[Public] Stream error:', streamError);
        if (!res.destroyed) {
          res.end();
        }
      }
    };

    await pump();
  } catch (error) {
    console.error('[Public] Video stream error:', error);
    if (!res.headersSent) {
      res.status(500).send('Stream failed');
    }
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
  videoStreamUrl: string;
  telegramUrl: string;
  canDownload: boolean;
  expiryInfo: string;
  downloadsInfo: string;
  duration: string;
  width: number | null;
  height: number | null;
}): string {
  const isImage = params.mediaType === 'photo';
  const isVideo = params.mediaType === 'video' || params.mediaType === 'video_note';
  const isAudio = params.mediaType === 'audio' || params.mediaType === 'voice';

  // Calculate aspect ratio for video
  const aspectRatio = params.width && params.height
    ? `${params.width} / ${params.height}`
    : '16 / 9';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(params.fileName)} - FC-Cloud</title>
  <meta property="og:title" content="${escapeHtml(params.fileName)} - FC-Cloud">
  <meta property="og:description" content="${params.caption ? escapeHtml(params.caption.slice(0, 200)) : 'Скачать файл через FC-Cloud'}">
  <meta property="og:image" content="${params.previewUrl}">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary_large_image">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0d1117 0%, #161b22 50%, #0d1117 100%);
      color: #e6edf3;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 16px;
    }

    .page {
      width: 100%;
      max-width: 1200px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    /* Header */
    .header {
      text-align: center;
      padding: 12px 0;
    }

    .logo {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-size: 20px;
      font-weight: 700;
      color: #e6edf3;
      text-decoration: none;
    }

    .logo svg {
      width: 28px;
      height: 28px;
      color: #58a6ff;
    }

    /* Glass Card */
    .card {
      background: rgba(22, 27, 34, 0.8);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(240, 246, 252, 0.1);
      border-radius: 16px;
      overflow: hidden;
    }

    /* Media Section */
    .media {
      position: relative;
      background: #010409;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 200px;
    }

    .media-image {
      width: 100%;
      height: auto;
      max-height: 70vh;
      object-fit: contain;
      display: block;
    }

    /* Video Player */
    .video-container {
      position: relative;
      width: 100%;
      background: #010409;
    }

    .video-player {
      width: 100%;
      display: block;
      max-height: 70vh;
    }

    .play-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.4);
      cursor: pointer;
      transition: background 0.2s;
    }

    .play-overlay:hover {
      background: rgba(0, 0, 0, 0.3);
    }

    .play-overlay.hidden {
      display: none;
    }

    .play-button {
      width: 72px;
      height: 72px;
      background: rgba(255, 255, 255, 0.95);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      transition: transform 0.2s;
    }

    .play-overlay:hover .play-button {
      transform: scale(1.05);
    }

    .play-button svg {
      width: 32px;
      height: 32px;
      color: #0d1117;
      margin-left: 4px;
    }

    /* File Icon Preview */
    .file-icon-preview {
      padding: 48px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }

    .file-icon-preview .icon {
      font-size: 64px;
      line-height: 1;
    }

    .file-icon-preview .type {
      font-size: 13px;
      font-weight: 500;
      color: #8b949e;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    /* Info Section */
    .info {
      padding: 20px;
    }

    .file-header {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 12px;
    }

    .file-icon {
      font-size: 28px;
      line-height: 1;
      flex-shrink: 0;
    }

    .file-details {
      flex: 1;
      min-width: 0;
    }

    .file-name {
      font-size: 18px;
      font-weight: 600;
      color: #e6edf3;
      word-break: break-word;
      line-height: 1.3;
    }

    .file-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 6px;
      font-size: 13px;
      color: #8b949e;
    }

    .file-meta span {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .file-meta .dot {
      width: 3px;
      height: 3px;
      background: #484f58;
      border-radius: 50%;
    }

    /* Caption */
    .caption {
      margin-top: 16px;
      padding: 14px 16px;
      background: rgba(110, 118, 129, 0.1);
      border-left: 3px solid #58a6ff;
      border-radius: 0 8px 8px 0;
      font-size: 14px;
      line-height: 1.6;
      color: #c9d1d9;
      white-space: pre-wrap;
      word-break: break-word;
    }

    /* Download Button */
    .download-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      padding: 14px 20px;
      margin-top: 16px;
      background: linear-gradient(135deg, #238636 0%, #2ea043 100%);
      color: #ffffff;
      border: none;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s;
    }

    .download-btn:hover {
      background: linear-gradient(135deg, #2ea043 0%, #3fb950 100%);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(46, 160, 67, 0.3);
    }

    .download-btn:active {
      transform: translateY(0);
    }

    .download-btn svg {
      width: 20px;
      height: 20px;
    }

    /* Share Stats */
    .share-stats {
      display: flex;
      justify-content: center;
      gap: 20px;
      margin-top: 14px;
      padding-top: 14px;
      border-top: 1px solid rgba(240, 246, 252, 0.1);
    }

    .stat {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: #8b949e;
    }

    .stat svg {
      width: 14px;
      height: 14px;
      opacity: 0.7;
    }

    /* No Download */
    .no-download {
      margin-top: 16px;
      padding: 14px;
      background: rgba(248, 81, 73, 0.1);
      border: 1px solid rgba(248, 81, 73, 0.2);
      border-radius: 10px;
      text-align: center;
      color: #f85149;
      font-size: 13px;
      line-height: 1.5;
    }

    /* CTA Card */
    .cta {
      background: rgba(22, 27, 34, 0.6);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(240, 246, 252, 0.1);
      border-radius: 12px;
      padding: 20px;
      text-align: center;
    }

    .cta-text {
      font-size: 14px;
      color: #8b949e;
      margin-bottom: 14px;
    }

    .telegram-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
      background: #2AABEE;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s;
    }

    .telegram-btn:hover {
      background: #229ED9;
      transform: translateY(-1px);
    }

    .telegram-btn svg {
      width: 18px;
      height: 18px;
    }

    /* Desktop Layout */
    @media (min-width: 768px) {
      body {
        padding: 24px;
      }

      .page {
        gap: 20px;
      }

      .logo {
        font-size: 22px;
      }

      .logo svg {
        width: 32px;
        height: 32px;
      }

      .card {
        border-radius: 20px;
      }

      .media {
        min-height: 300px;
      }

      .info {
        padding: 28px;
      }

      .file-name {
        font-size: 22px;
      }

      .file-meta {
        font-size: 14px;
      }

      .download-btn {
        padding: 16px 24px;
        font-size: 16px;
      }
    }

    @media (min-width: 1024px) {
      .main-content {
        display: grid;
        grid-template-columns: 1.4fr 1fr;
        gap: 20px;
        align-items: start;
      }

      .media-card {
        position: sticky;
        top: 24px;
      }

      .media {
        min-height: 400px;
        border-radius: 20px;
      }

      .video-player {
        max-height: 80vh;
      }

      .media-image {
        max-height: 80vh;
      }

      .info-card {
        display: flex;
        flex-direction: column;
      }

      .info {
        flex: 1;
        display: flex;
        flex-direction: column;
      }

      .file-name {
        font-size: 24px;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="header">
      <a href="https://t.me/${BOT_USERNAME}" class="logo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
        </svg>
        FC-Cloud
      </a>
    </header>

    <div class="main-content">
      <!-- Media Card -->
      <div class="card media-card">
        ${isVideo ? `
        <div class="video-container">
          <video
            class="video-player"
            id="videoPlayer"
            poster="${params.previewUrl}"
            preload="metadata"
            controls
            playsinline
            style="aspect-ratio: ${aspectRatio};"
          >
            <source src="${params.videoStreamUrl}" type="${params.mimeType || 'video/mp4'}">
          </video>
          <div class="play-overlay" id="playOverlay" onclick="playVideo()">
            <div class="play-button">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </div>
        </div>
        ` : isImage ? `
        <div class="media">
          <img
            class="media-image"
            src="${params.previewUrl}"
            alt="${escapeHtml(params.fileName)}"
            onerror="this.parentElement.innerHTML='<div class=\\'file-icon-preview\\'><span class=\\'icon\\'>${params.fileIcon}</span><span class=\\'type\\'>Изображение недоступно</span></div>'"
          >
        </div>
        ` : `
        <div class="media">
          <div class="file-icon-preview">
            <span class="icon">${params.fileIcon}</span>
            <span class="type">${params.mimeType ? escapeHtml(params.mimeType.split('/')[1] || params.mimeType) : 'Файл'}</span>
          </div>
        </div>
        `}
      </div>

      <!-- Info Card -->
      <div class="card info-card">
        <div class="info">
          <div class="file-header">
            <span class="file-icon">${params.fileIcon}</span>
            <div class="file-details">
              <div class="file-name">${escapeHtml(params.fileName)}</div>
              <div class="file-meta">
                ${params.fileSize ? `<span>${params.fileSize}</span>` : ''}
                ${params.fileSize && params.duration ? '<span class="dot"></span>' : ''}
                ${params.duration ? `<span>${params.duration}</span>` : ''}
                ${(params.fileSize || params.duration) && params.mimeType ? '<span class="dot"></span>' : ''}
                ${params.mimeType ? `<span>${escapeHtml(params.mimeType.split('/')[1] || params.mimeType)}</span>` : ''}
              </div>
            </div>
          </div>

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
                Файл слишком большой для браузера.<br>
                Скачайте через Telegram.
              </div>`
          }

          ${params.expiryInfo || params.downloadsInfo
            ? `<div class="share-stats">
                ${params.expiryInfo ? `
                <div class="stat">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  ${params.expiryInfo}
                </div>` : ''}
                ${params.downloadsInfo ? `
                <div class="stat">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  ${params.downloadsInfo}
                </div>` : ''}
              </div>`
            : ''
          }
        </div>
      </div>
    </div>

    <!-- CTA -->
    <div class="cta">
      <div class="cta-text">Хотите своё облако для файлов?</div>
      <a href="${params.telegramUrl}" class="telegram-btn">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.944 0A12 12 0 1 0 24 12 12.01 12.01 0 0 0 11.944 0zm5.768 7.93l-1.975 9.413c-.15.664-.55.82-1.115.51l-3.056-2.254-1.474 1.42c-.163.163-.3.3-.614.3l.22-3.106 5.643-5.1c.246-.22-.054-.342-.382-.124l-6.978 4.392-3.006-.938c-.653-.205-.667-.653.137-.967l11.744-4.527c.545-.198 1.022.132.856.963z"/>
        </svg>
        Открыть в Telegram
      </a>
    </div>
  </div>

  ${isVideo ? `
  <script>
    const video = document.getElementById('videoPlayer');
    const overlay = document.getElementById('playOverlay');

    function playVideo() {
      video.play();
      overlay.classList.add('hidden');
    }

    video.addEventListener('pause', () => {
      if (video.currentTime > 0) {
        overlay.classList.remove('hidden');
      }
    });

    video.addEventListener('play', () => {
      overlay.classList.add('hidden');
    });

    video.addEventListener('ended', () => {
      overlay.classList.remove('hidden');
    });
  </script>
  ` : ''}
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
