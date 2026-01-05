import { Bot, Context } from 'grammy';
import { LinkParserService } from '../../services/link-parser.service.js';
import { LinksRepository } from '../../db/repositories/links.repository.js';
import { UsersRepository } from '../../db/repositories/users.repository.js';

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

    // Notify user that we're processing
    const processingMsg = await ctx.reply(`🔗 Обрабатываю ${urls.length} ссылок...`);

    // Parse OpenGraph for each URL
    const parsedLinks = await linkParser.parseMultipleUrls(urls);

    // Save links to database
    const savedCount = { new: 0, duplicate: 0 };

    for (const link of parsedLinks) {
      // Check for duplicate
      const existing = await linksRepo.findByUrl(userId, link.url);
      if (existing) {
        savedCount.duplicate++;
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
      savedCount.new++;
    }

    // Build response
    const lines: string[] = [];

    if (savedCount.new > 0) {
      lines.push(`✅ Сохранено: ${savedCount.new}`);
    }
    if (savedCount.duplicate > 0) {
      lines.push(`📁 Уже сохранены: ${savedCount.duplicate}`);
    }

    // Show saved links
    if (savedCount.new > 0) {
      lines.push('');
      for (const link of parsedLinks.slice(0, 3)) {
        const title = link.title || new URL(link.url).hostname;
        lines.push(`🔗 ${title}`);
      }
      if (parsedLinks.length > 3) {
        lines.push(`... и ещё ${parsedLinks.length - 3}`);
      }
    }

    // Edit the processing message with result
    try {
      await ctx.api.editMessageText(
        ctx.chat.id,
        processingMsg.message_id,
        lines.join('\n')
      );
    } catch {
      // If edit fails, send a new message
      await ctx.reply(lines.join('\n'));
    }
  });
}
