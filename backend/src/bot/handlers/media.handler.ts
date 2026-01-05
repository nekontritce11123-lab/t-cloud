import { Bot, Context } from 'grammy';
import { IngestionService, getMediaEmoji, formatFileSize } from '../../services/ingestion.service.js';
import { FilesRepository } from '../../db/repositories/files.repository.js';
import { UsersRepository } from '../../db/repositories/users.repository.js';

/**
 * Setup handlers for all media types
 */
export function setupMediaHandlers(bot: Bot<Context>): void {
  const ingestionService = new IngestionService();
  const filesRepo = new FilesRepository();
  const usersRepo = new UsersRepository();

  // Universal handler for all media types
  bot.on(
    [
      'message:photo',
      'message:video',
      'message:document',
      'message:audio',
      'message:voice',
      'message:video_note',
      'message:animation',
      'message:sticker',
    ],
    async (ctx) => {
      const msg = ctx.message;
      const userId = ctx.from?.id;

      if (!userId) return;

      // Ensure user exists in DB
      await usersRepo.upsert({
        id: userId,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name,
        username: ctx.from.username,
        language_code: ctx.from.language_code,
      });

      // Extract media metadata
      const media = ingestionService.extractMedia(msg);
      if (!media) {
        await ctx.reply('❌ Не удалось обработать файл');
        return;
      }

      // Try to save to database
      const savedFile = await filesRepo.create({
        userId,
        fileId: media.fileId,
        fileUniqueId: media.fileUniqueId,
        originalMessageId: msg.message_id,
        chatId: msg.chat.id,
        mediaType: media.mediaType,
        mimeType: media.mimeType,
        fileName: media.fileName,
        fileSize: media.fileSize,
        duration: media.duration,
        width: media.width,
        height: media.height,
        thumbnailFileId: media.thumbnailFileId,
        caption: media.caption,
        forwardFromName: media.forwardFromName,
        forwardFromChatTitle: media.forwardFromChatTitle,
      });

      if (!savedFile) {
        // Duplicate file
        await ctx.reply('📁 Этот файл уже сохранён');
        return;
      }

      // Build response message
      const emoji = getMediaEmoji(media.mediaType);
      const lines: string[] = [`${emoji} Сохранено!`];

      if (media.fileName) {
        lines.push(`📝 ${media.fileName}`);
      }
      if (media.fileSize) {
        lines.push(`📦 ${formatFileSize(media.fileSize)}`);
      }
      if (media.forwardFromName) {
        lines.push(`👤 От: ${media.forwardFromName}`);
      }
      if (media.forwardFromChatTitle) {
        lines.push(`📢 Из: ${media.forwardFromChatTitle}`);
      }

      await ctx.reply(lines.join('\n'));
    }
  );
}
