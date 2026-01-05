import { FilesRepository } from '../db/repositories/files.repository.js';
import { LinksRepository } from '../db/repositories/links.repository.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // Run every 24 hours

const filesRepo = new FilesRepository();
const linksRepo = new LinksRepository();

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Clean up trash - delete files and links older than 30 days
 */
async function cleanupTrash(): Promise<void> {
  const olderThan = new Date(Date.now() - THIRTY_DAYS_MS);

  console.log('[Cleanup] Starting trash cleanup, deleting items older than:', olderThan.toISOString());

  try {
    const deletedFiles = await filesRepo.cleanupOldDeleted(olderThan);
    const deletedLinks = await linksRepo.cleanupOldDeleted(olderThan);

    if (deletedFiles > 0 || deletedLinks > 0) {
      console.log(`[Cleanup] Deleted ${deletedFiles} files and ${deletedLinks} links from trash`);
    } else {
      console.log('[Cleanup] No old items to delete');
    }
  } catch (error) {
    console.error('[Cleanup] Error during trash cleanup:', error);
  }
}

/**
 * Start the cleanup service
 */
export function startCleanupService(): void {
  // Run immediately on startup
  cleanupTrash();

  // Then run every 24 hours
  cleanupInterval = setInterval(cleanupTrash, CLEANUP_INTERVAL_MS);

  console.log('[Cleanup] Cleanup service started (runs every 24 hours)');
}

/**
 * Stop the cleanup service
 */
export function stopCleanupService(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('[Cleanup] Cleanup service stopped');
  }
}
