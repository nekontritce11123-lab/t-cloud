import { Bot, GrammyError, HttpError } from 'grammy';
import { config } from '../config.js';
import { setupMediaHandlers } from './handlers/media.handler.js';
import { setupTextHandlers } from './handlers/text.handler.js';
import { setupRetrievalHandlers } from './handlers/retrieval.handler.js';
import { FilesRepository } from '../db/repositories/files.repository.js';
import { MediaType } from '../types/index.js';
import {
  getShareByToken,
  getFileForShare,
  hasRecipientReceivedShare,
  recordShareRecipient,
  type FileShare,
  type FileForShare,
} from '../db/index.js';

// Create bot instance
export const bot = new Bot(config.botToken);

/**
 * Validate share token and return validation result
 */
interface ShareValidationResult {
  valid: boolean;
  error?: string;
  share?: FileShare;
  file?: FileForShare;
}

function validateShare(token: string, recipientId: number): ShareValidationResult {
  // Get share by token
  const share = getShareByToken(token);
  if (!share) {
    return { valid: false, error: '❌ Ссылка недействительна или истекла' };
  }

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (share.expires_at !== null && share.expires_at <= now) {
    return { valid: false, error: '❌ Срок действия ссылки истёк' };
  }

  // Check max recipients limit
  if (share.max_recipients !== null && share.use_count >= share.max_recipients) {
    return { valid: false, error: '❌ Лимит получателей исчерпан' };
  }

  // Check if recipient is owner
  if (share.owner_id === recipientId) {
    return { valid: false, error: '⚠️ Это ваш собственный файл' };
  }

  // Check if already received
  if (hasRecipientReceivedShare(share.id, recipientId)) {
    return { valid: false, error: '⚠️ Вы уже получили этот файл' };
  }

  // Get file
  const file = getFileForShare(share.file_id);
  if (!file) {
    return { valid: false, error: '❌ Файл не найден' };
  }

  // Check if file deleted
  if (file.deleted_at !== null) {
    return { valid: false, error: '❌ Файл был удалён владельцем' };
  }

  return { valid: true, share, file };
}

/**
 * Get send method by file_id prefix
 * Telegram file_id prefixes indicate the actual file type:
 * - AgAC = photo (compressed)
 * - BQA = document
 * - BAA = video
 * - CQA = audio
 * - AwA = voice
 * - DQA = video_note
 */
function getSendMethodByFileId(fileId: string, fallbackMediaType: string): string {
  const prefix = fileId.substring(0, 2);

  if (prefix === 'Ag') return 'photo';
  if (prefix === 'BA') return 'video';
  if (prefix === 'BQ') return 'document';
  if (prefix === 'CQ') return 'audio';
  if (prefix === 'Aw') return 'voice';
  if (prefix === 'DQ') return 'video_note';

  // Fallback to saved media_type
  return fallbackMediaType;
}

/**
 * Send file to user based on file_id prefix (not media_type)
 * This fixes the issue where files sent as documents (e.g., PNG without compression)
 * have media_type='photo' but file_id is for document
 */
async function sendFileToUser(
  ctx: any,
  file: FileForShare,
  caption?: string
): Promise<void> {
  // Determine send method by file_id prefix, not by media_type
  const sendMethod = getSendMethodByFileId(file.file_id, file.media_type);

  switch (sendMethod) {
    case 'photo':
      await ctx.replyWithPhoto(file.file_id, { caption });
      break;
    case 'video':
      await ctx.replyWithVideo(file.file_id, { caption });
      break;
    case 'document':
      await ctx.replyWithDocument(file.file_id, { caption });
      break;
    case 'audio':
      await ctx.replyWithAudio(file.file_id, { caption });
      break;
    case 'voice':
      await ctx.replyWithVoice(file.file_id, { caption });
      break;
    case 'video_note':
      await ctx.replyWithVideoNote(file.file_id);
      break;
    default:
      // Safe fallback - document works for all types
      await ctx.replyWithDocument(file.file_id, { caption });
  }
}

/**
 * Setup all bot handlers
 */
export function setupBot(): void {
  // Share handler - must be BEFORE main /start handler
  bot.command('start', async (ctx, next) => {
    const payload = ctx.match;

    // If no payload or not a share link, pass to next handler
    if (!payload || !payload.startsWith('share_')) {
      await next();
      return;
    }

    const recipientId = ctx.from?.id;
    if (!recipientId) {
      await ctx.reply('❌ Не удалось определить пользователя');
      return;
    }

    const token = payload.replace('share_', '');
    console.log(`[Bot] Share link opened: token=${token}, recipient=${recipientId}`);

    // Validate share
    const validation = validateShare(token, recipientId);
    if (!validation.valid) {
      await ctx.reply(validation.error!);
      return;
    }

    const { share, file } = validation;
    if (!share || !file) {
      await ctx.reply('❌ Файл не найден');
      return;
    }

    // Send file directly (no preview button)
    try {
      await sendFileToUser(ctx, file, file.caption || undefined);

      // Record recipient and increment use_count
      recordShareRecipient(share.id, recipientId);

      console.log(`[Bot] File shared successfully: file=${file.id}, recipient=${recipientId}`);
    } catch (error) {
      console.error('[Bot] Error sending shared file:', error);
      await ctx.reply('❌ Ошибка при отправке файла. Попробуйте позже.');
    }
  });

  // Callback query handler for claiming shared files
  bot.callbackQuery(/^claim_(.+)$/, async (ctx) => {
    const token = ctx.match[1];
    const recipientId = ctx.from?.id;

    if (!recipientId) {
      await ctx.answerCallbackQuery({ text: '❌ Ошибка авторизации', show_alert: true });
      return;
    }

    console.log(`[Bot] Claim request: token=${token}, recipient=${recipientId}`);

    // Validate share again (in case something changed)
    const validation = validateShare(token, recipientId);
    if (!validation.valid) {
      await ctx.answerCallbackQuery({ text: validation.error!, show_alert: true });
      return;
    }

    const { share, file } = validation;
    if (!share || !file) {
      await ctx.answerCallbackQuery({ text: '❌ Файл не найден', show_alert: true });
      return;
    }

    try {
      // Send the file
      await sendFileToUser(ctx, file, file.caption || undefined);

      // Record recipient and increment use_count
      recordShareRecipient(share.id, recipientId);

      console.log(`[Bot] File shared successfully: file=${file.id}, recipient=${recipientId}`);
      await ctx.answerCallbackQuery({ text: '✅ Файл отправлен!' });
    } catch (error) {
      console.error('[Bot] Error sending shared file:', error);
      await ctx.answerCallbackQuery({ text: '❌ Ошибка при отправке файла', show_alert: true });
    }
  });

  // /start command (main)
  bot.command('start', async (ctx) => {
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '📁 Открыть хранилище',
            web_app: { url: config.miniAppUrl },
          },
        ],
      ],
    };

    await ctx.reply(
      '👋 Добро пожаловать в T-Cloud!\n\n' +
        '📤 Пересылайте мне файлы, фото, видео, документы или ссылки.\n' +
        '🗂 Я сохраню их и автоматически отсортирую.\n' +
        '🔍 Открывайте Mini App для поиска и просмотра.',
      { reply_markup: keyboard }
    );
  });

  // /help command
  bot.command('help', async (ctx) => {
    await ctx.reply(
      '📖 Как пользоваться T-Cloud:\n\n' +
        '1️⃣ Пересылайте мне любые файлы\n' +
        '2️⃣ Отправляйте ссылки — я сохраню их с превью\n' +
        '3️⃣ Открывайте Mini App для просмотра\n' +
        '4️⃣ Ищите файлы по имени, подписи или отправителю\n\n' +
        '📌 Команды:\n' +
        '/start — Главное меню\n' +
        '/stats — Статистика хранилища\n' +
        '/get <id> — Получить файл по ID'
    );
  });

  // /stats command
  bot.command('stats', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    // TODO: Implement stats from repository
    await ctx.reply(
      '📊 Статистика хранилища:\n\n' +
        '🖼 Фото: 0\n' +
        '🎬 Видео: 0\n' +
        '📄 Документы: 0\n' +
        '🔗 Ссылки: 0\n' +
        '🎵 Аудио: 0'
    );
  });

  // Handle web_app_data from Mini App
  bot.on('message:web_app_data', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    try {
      const data = JSON.parse(ctx.message.web_app_data.data);
      console.log('[Bot] Received web_app_data:', data);

      if (data.action === 'send_files' && Array.isArray(data.files)) {
        const filesRepo = new FilesRepository();

        for (const fileInfo of data.files) {
          const file = await filesRepo.findById(fileInfo.id);

          if (!file || file.userId !== userId) {
            console.log('[Bot] File not found or not owned:', fileInfo.id);
            continue;
          }

          // Send the file based on media type
          const mediaType = file.mediaType as MediaType;
          const caption = file.caption || undefined;

          try {
            switch (mediaType) {
              case 'photo':
                await ctx.replyWithPhoto(file.fileId, { caption });
                break;
              case 'video':
                await ctx.replyWithVideo(file.fileId, { caption });
                break;
              case 'document':
                await ctx.replyWithDocument(file.fileId, { caption });
                break;
              case 'audio':
                await ctx.replyWithAudio(file.fileId, { caption });
                break;
              case 'voice':
                await ctx.replyWithVoice(file.fileId, { caption });
                break;
              case 'video_note':
                await ctx.replyWithVideoNote(file.fileId);
                break;
              default:
                await ctx.replyWithDocument(file.fileId, { caption });
            }
            console.log('[Bot] Sent file:', file.id, file.fileName);
          } catch (sendError) {
            console.error('[Bot] Error sending file:', sendError);
          }
        }
      }
    } catch (parseError) {
      console.error('[Bot] Error parsing web_app_data:', parseError);
    }
  });

  // Setup handlers
  setupMediaHandlers(bot);
  setupTextHandlers(bot);
  setupRetrievalHandlers(bot);

  // Error handling
  bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`[Bot] Error handling update ${ctx.update.update_id}:`);

    const e = err.error;
    if (e instanceof GrammyError) {
      console.error('[Bot] Grammy error:', e.description);
    } else if (e instanceof HttpError) {
      console.error('[Bot] HTTP error:', e);
    } else {
      console.error('[Bot] Unknown error:', e);
    }
  });
}

/**
 * Start the bot
 */
export async function startBot(): Promise<void> {
  setupBot();

  // Set bot commands
  await bot.api.setMyCommands([
    { command: 'start', description: 'Открыть хранилище' },
    { command: 'stats', description: 'Статистика хранилища' },
    { command: 'help', description: 'Помощь' },
  ]);

  // Start polling
  bot.start({
    onStart: (botInfo) => {
      console.log(`[Bot] Started as @${botInfo.username}`);
    },
  });
}

/**
 * Stop the bot
 */
export async function stopBot(): Promise<void> {
  await bot.stop();
  console.log('[Bot] Stopped');
}
