import express from 'express';
import cors from 'cors';
import { config } from '../config.js';
import { authMiddleware, devAuthMiddleware } from './middleware/auth.js';
import filesRoutes from './routes/files.routes.js';
import linksRoutes from './routes/links.routes.js';

const app = express();

// CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc)
      if (!origin) {
        callback(null, true);
        return;
      }

      // Allow localhost and common development origins
      if (
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        origin.endsWith('.lhr.life') ||
        origin.includes('ngrok') ||
        origin === config.miniAppUrl
      ) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// Parse JSON bodies
app.use(express.json());

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Choose auth middleware based on environment
const auth = process.env.NODE_ENV === 'production' ? authMiddleware : devAuthMiddleware;

// API routes (require authentication)
app.use('/api/files', auth, filesRoutes);
app.use('/api/links', auth, linksRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[API] Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

/**
 * Start the API server
 */
export function startApi(): Promise<void> {
  return new Promise((resolve) => {
    app.listen(config.port, () => {
      console.log(`[API] Server running on port ${config.port}`);
      resolve();
    });
  });
}

export { app };
