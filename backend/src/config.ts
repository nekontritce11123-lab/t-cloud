import 'dotenv/config';

export const config = {
  botToken: process.env.BOT_TOKEN || '',
  miniAppUrl: process.env.MINI_APP_URL || 'http://localhost:5173',
  port: parseInt(process.env.PORT || '3000', 10),
};

// Validate required config
if (!config.botToken) {
  throw new Error('BOT_TOKEN is required in .env file');
}
