import { eq, and, desc, sql } from 'drizzle-orm';
import { db, searchFiles as ftsSearch } from '../index.js';
import { files, NewFile, File } from '../schema.js';
import { MediaType, CategoryStats } from '../../types/index.js';

/**
 * Repository for file operations
 */
export class FilesRepository {
  /**
   * Create a new file record
   * Returns null if duplicate (based on user_id + file_unique_id)
   */
  async create(data: NewFile): Promise<File | null> {
    try {
      const result = await db.insert(files).values(data).returning();
      return result[0] || null;
    } catch (error: any) {
      // Handle unique constraint violation (duplicate)
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.message?.includes('UNIQUE')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Find file by ID
   */
  async findById(id: number): Promise<File | null> {
    const result = await db.select().from(files).where(eq(files.id, id)).limit(1);
    return result[0] || null;
  }

  /**
   * Find file by unique ID for deduplication check
   */
  async findByUniqueId(userId: number, fileUniqueId: string): Promise<File | null> {
    const result = await db
      .select()
      .from(files)
      .where(and(eq(files.userId, userId), eq(files.fileUniqueId, fileUniqueId)))
      .limit(1);
    return result[0] || null;
  }

  /**
   * Get files for a user with optional filtering
   */
  async findByUser(
    userId: number,
    options: {
      mediaType?: MediaType;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ items: File[]; total: number }> {
    const { mediaType, limit = 20, offset = 0 } = options;

    let query = db.select().from(files).where(eq(files.userId, userId));

    if (mediaType) {
      query = db
        .select()
        .from(files)
        .where(and(eq(files.userId, userId), eq(files.mediaType, mediaType)));
    }

    const items = await query.orderBy(desc(files.createdAt)).limit(limit).offset(offset);

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(files)
      .where(
        mediaType
          ? and(eq(files.userId, userId), eq(files.mediaType, mediaType))
          : eq(files.userId, userId)
      );

    return {
      items,
      total: countResult[0]?.count || 0,
    };
  }

  /**
   * Get files grouped by date (for Timeline)
   */
  async findByDate(
    userId: number,
    options: { year?: number; month?: number } = {}
  ): Promise<File[]> {
    let whereClause = eq(files.userId, userId);

    // TODO: Add date filtering if year/month provided

    return db.select().from(files).where(whereClause).orderBy(desc(files.createdAt));
  }

  /**
   * Full-text search in files
   */
  search(userId: number, query: string, limit = 50): File[] {
    return ftsSearch(userId, query, limit);
  }

  /**
   * Get category statistics for a user
   */
  async getCategoryStats(userId: number): Promise<CategoryStats[]> {
    const result = await db
      .select({
        mediaType: files.mediaType,
        count: sql<number>`count(*)`,
      })
      .from(files)
      .where(eq(files.userId, userId))
      .groupBy(files.mediaType);

    return result.map(r => ({
      mediaType: r.mediaType as MediaType,
      count: r.count,
    }));
  }

  /**
   * Delete a file
   */
  async delete(id: number, userId: number): Promise<boolean> {
    const result = await db
      .delete(files)
      .where(and(eq(files.id, id), eq(files.userId, userId)));

    return result.changes > 0;
  }
}
