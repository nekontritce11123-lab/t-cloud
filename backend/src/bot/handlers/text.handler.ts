import { Bot, Context } from 'grammy';
import { LinkParserService } from '../../services/link-parser.service.js';
import { LinksRepository } from '../../db/repositories/links.repository.js';
import { UsersRepository } from '../../db/repositories/users.repository.js';

// Реакция для ссылок (как в media.handler.ts)
type TelegramReaction = '👍' | '❤' | '🔥' | '🎉' | '👏' | '😁' | '🤩' | '👀' | '🙏' | '💯';
const LINK_REACTION: TelegramReaction = '💯';

/**
 * Setup handlers for text messages (for URL extraction)
 */
export function setupTextHandlers(bot: Bot<Context>): void {
  const linkParser = new LinkParserService();
  const linksRepo = new LinksRepository();
  const usersRepo = new UsersRepository();

  // Handle text messages with URLs
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text;
    const userId = ctx.from?.id;

    if (!userId) return;

    // Extract URLs from text
    const urls = linkParser.extractUrls(text);

    if (urls.length === 0) {
      // No URLs found, ignore the message
      return;
    }

    // Ensure user exists in DB
    await usersRepo.upsert({
      id: userId,
      first_name: ctx.from.first_name,
      last_name: ctx.from.last_name,
      username: ctx.from.username,
      language_code: ctx.from.language_code,
    });

    // Parse OpenGraph for each URL
    const parsedLinks = await linkParser.parseMultipleUrls(urls);

    // Save links to database
    let savedNew = 0;
    let duplicates = 0;

    for (const link of parsedLinks) {
      // Check for duplicate
      const existing = await linksRepo.findByUrl(userId, link.url);
      if (existing) {
        duplicates++;
        continue;
      }

      await linksRepo.create({
        userId,
        url: link.url,
        title: link.title,
        description: link.description,
        imageUrl: link.imageUrl,
        siteName: link.siteName,
      });
      savedNew++;
    }

    // Реакция вместо сообщения (как для файлов)
    try {
      if (savedNew > 0) {
        await ctx.react(LINK_REACTION);
      } else if (duplicates > 0) {
        await ctx.react('👀'); // Уже сохранено
      }
    } catch {
      // Fallback если реакции не поддерживаются
      if (savedNew > 0) {
        await ctx.reply(`🔗 Сохранено: ${savedNew}`);
      } else if (duplicates > 0) {
        await ctx.reply('📁 Уже сохранены');
      }
    }
  });
}
