import { Bot, GrammyError, HttpError } from 'grammy';
import { config } from '../config.js';
import { setupMediaHandlers } from './handlers/media.handler.js';
import { setupTextHandlers } from './handlers/text.handler.js';
import { setupRetrievalHandlers } from './handlers/retrieval.handler.js';

// Create bot instance
export const bot = new Bot(config.botToken);

/**
 * Setup all bot handlers
 */
export function setupBot(): void {
  // /start command
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
