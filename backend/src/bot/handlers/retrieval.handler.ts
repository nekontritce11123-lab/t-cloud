import { Bot, Context } from 'grammy';
import { FilesRepository } from '../../db/repositories/files.repository.js';
import { MediaType } from '../../types/index.js';

/**
 * Setup handlers for file retrieval (sending files back to user)
 */
export function setupRetrievalHandlers(bot: Bot<Context>): void {
  const filesRepo = new FilesRepository();

  // Callback query for sending file from Mini App
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;

    if (!data.startsWith('send_file:')) return;

    const fileId = parseInt(data.replace('send_file:', ''), 10);
    const userId = ctx.from?.id;

    if (!userId || isNaN(fileId)) {
      await ctx.answerCallbackQuery({ text: 'Ошибка' });
      return;
    }

    const file = await filesRepo.findById(fileId);

    if (!file || file.userId !== userId) {
      await ctx.answerCallbackQuery({ text: 'Файл не найден' });
      return;
    }

    try {
      // Copy message - sends without "Forwarded from" label
      await ctx.api.copyMessage(
        ctx.chat!.id,
        file.chatId,
        file.originalMessageId
      );

      await ctx.answerCallbackQuery({ text: '✅ Отправлено!' });
    } catch (error) {
      console.error('[Retrieval] Copy message failed:', error);

      // Fallback: send by file_id
      try {
        await sendByFileId(ctx, file);
        await ctx.answerCallbackQuery({ text: '✅ Отправлено!' });
      } catch {
        await ctx.answerCallbackQuery({ text: '❌ Не удалось отправить' });
      }
    }
  });

  // Command to get file by ID (for testing)
  bot.command('get', async (ctx) => {
    const fileIdStr = ctx.match;
    const userId = ctx.from?.id;

    if (!fileIdStr || !userId) {
      await ctx.reply('Использование: /get <id файла>');
      return;
    }

    const fileId = parseInt(fileIdStr, 10);
    if (isNaN(fileId)) {
      await ctx.reply('Неверный ID файла');
      return;
    }

    const file = await filesRepo.findById(fileId);

    if (!file || file.userId !== userId) {
      await ctx.reply('Файл не найден');
      return;
    }

    try {
      await ctx.api.copyMessage(ctx.chat.id, file.chatId, file.originalMessageId);
    } catch {
      await sendByFileId(ctx, file);
    }
  });
}

/**
 * Send file by file_id based on media type
 */
async function sendByFileId(
  ctx: Context,
  file: { fileId: string; mediaType: string; caption?: string | null }
): Promise<void> {
  const options = {
    caption: file.caption || undefined,
  };

  switch (file.mediaType as MediaType) {
    case 'photo':
      await ctx.replyWithPhoto(file.fileId, options);
      break;
    case 'video':
      await ctx.replyWithVideo(file.fileId, options);
      break;
    case 'document':
      await ctx.replyWithDocument(file.fileId, options);
      break;
    case 'audio':
      await ctx.replyWithAudio(file.fileId, options);
      break;
    case 'voice':
      await ctx.replyWithVoice(file.fileId, options);
      break;
    case 'video_note':
      await ctx.replyWithVideoNote(file.fileId);
      break;
    default:
      await ctx.replyWithDocument(file.fileId, options);
  }
}
