import { initDatabase } from './db/index.js';
import { startApi } from './api/index.js';
import { startBot, stopBot } from './bot/index.js';
import { startCleanupService, stopCleanupService } from './services/cleanup.service.js';

async function main(): Promise<void> {
  console.log('🚀 Starting T-Cloud Backend...');

  try {
    // 1. Initialize database
    await initDatabase();

    // 2. Start Express API
    await startApi();

    // 3. Start Telegram bot
    await startBot();

    // 4. Start cleanup service (trash auto-delete after 30 days)
    startCleanupService();

    console.log('✅ All systems running!');
  } catch (error) {
    console.error('❌ Failed to start:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  stopCleanupService();
  await stopBot();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down...');
  stopCleanupService();
  await stopBot();
  process.exit(0);
});

// Start the application
main();
