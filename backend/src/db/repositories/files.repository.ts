import { eq, and, desc, sql, isNull, isNotNull, lt, or } from 'drizzle-orm';
import { db, searchFiles as ftsSearch, searchFilesWithSnippets, SearchResult } from '../index.js';
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
   * Get files for a user with optional filtering (excludes deleted)
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

    // Base condition: user's files that are NOT deleted
    const baseCondition = and(eq(files.userId, userId), isNull(files.deletedAt));

    let whereCondition = baseCondition;
    if (mediaType === 'photo') {
      // Фото + изображения отправленные как документы
      whereCondition = and(
        baseCondition,
        or(
          eq(files.mediaType, 'photo'),
          and(
            eq(files.mediaType, 'document'),
            sql`${files.mimeType} LIKE 'image/%'`
          )
        )
      );
    } else if (mediaType === 'video') {
      // Видео + видео отправленные как документы
      whereCondition = and(
        baseCondition,
        or(
          eq(files.mediaType, 'video'),
          and(
            eq(files.mediaType, 'document'),
            sql`${files.mimeType} LIKE 'video/%'`
          )
        )
      );
    } else if (mediaType === 'document') {
      // Документы БЕЗ изображений и видео (они показываются в Фото/Видео)
      whereCondition = and(
        baseCondition,
        eq(files.mediaType, 'document'),
        sql`(${files.mimeType} IS NULL OR (${files.mimeType} NOT LIKE 'image/%' AND ${files.mimeType} NOT LIKE 'video/%'))`
      );
    } else if (mediaType) {
      whereCondition = and(baseCondition, eq(files.mediaType, mediaType));
    }

    const items = await db
      .select()
      .from(files)
      .where(whereCondition)
      .orderBy(desc(files.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(files)
      .where(whereCondition);

    return {
      items,
      total: countResult[0]?.count || 0,
    };
  }

  /**
   * Get files grouped by date (for Timeline) - excludes deleted
   */
  async findByDate(
    userId: number,
    options: { year?: number; month?: number } = {}
  ): Promise<File[]> {
    const whereClause = and(eq(files.userId, userId), isNull(files.deletedAt));

    // TODO: Add date filtering if year/month provided

    return db.select().from(files).where(whereClause).orderBy(desc(files.createdAt));
  }

  /**
   * Full-text search in files (basic)
   */
  search(userId: number, query: string, limit = 50): File[] {
    return ftsSearch(userId, query, limit);
  }

  /**
   * Full-text search with match info (where found, snippet)
   */
  searchWithSnippets(userId: number, query: string, limit = 50): SearchResult[] {
    return searchFilesWithSnippets(userId, query, limit);
  }

  /**
   * Get category statistics for a user (excludes deleted)
   * Images/videos sent as documents are counted in 'photo'/'video' categories
   */
  async getCategoryStats(userId: number): Promise<CategoryStats[]> {
    // Use CASE to reclassify document images/videos
    const result = await db
      .select({
        mediaType: sql<string>`
          CASE
            WHEN ${files.mediaType} = 'document' AND ${files.mimeType} LIKE 'image/%'
            THEN 'photo'
            WHEN ${files.mediaType} = 'document' AND ${files.mimeType} LIKE 'video/%'
            THEN 'video'
            ELSE ${files.mediaType}
          END
        `,
        count: sql<number>`count(*)`,
      })
      .from(files)
      .where(and(eq(files.userId, userId), isNull(files.deletedAt)))
      .groupBy(sql`
        CASE
          WHEN ${files.mediaType} = 'document' AND ${files.mimeType} LIKE 'image/%'
          THEN 'photo'
          WHEN ${files.mediaType} = 'document' AND ${files.mimeType} LIKE 'video/%'
          THEN 'video'
          ELSE ${files.mediaType}
        END
      `);

    return result.map(r => ({
      mediaType: r.mediaType as MediaType,
      count: r.count,
    }));
  }

  /**
   * Soft delete a file (move to trash)
   */
  async softDelete(id: number, userId: number): Promise<boolean> {
    const result = await db
      .update(files)
      .set({ deletedAt: new Date() })
      .where(and(eq(files.id, id), eq(files.userId, userId), isNull(files.deletedAt)));

    return result.changes > 0;
  }

  /**
   * Soft delete multiple files (move to trash)
   */
  async softDeleteMany(ids: number[], userId: number): Promise<number> {
    let deleted = 0;
    for (const id of ids) {
      const success = await this.softDelete(id, userId);
      if (success) deleted++;
    }
    return deleted;
  }

  /**
   * Get deleted files (trash) for a user
   */
  async findDeleted(userId: number): Promise<File[]> {
    return db
      .select()
      .from(files)
      .where(and(eq(files.userId, userId), isNotNull(files.deletedAt)))
      .orderBy(desc(files.deletedAt));
  }

  /**
   * Get trash count for a user
   */
  async getTrashCount(userId: number): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(files)
      .where(and(eq(files.userId, userId), isNotNull(files.deletedAt)));

    return result[0]?.count || 0;
  }

  /**
   * Restore a file from trash
   */
  async restore(id: number, userId: number): Promise<boolean> {
    const result = await db
      .update(files)
      .set({ deletedAt: null })
      .where(and(eq(files.id, id), eq(files.userId, userId), isNotNull(files.deletedAt)));

    return result.changes > 0;
  }

  /**
   * Permanently delete a file (hard delete)
   */
  async hardDelete(id: number, userId: number): Promise<boolean> {
    const result = await db
      .delete(files)
      .where(and(eq(files.id, id), eq(files.userId, userId)));

    return result.changes > 0;
  }

  /**
   * Delete all files in trash older than specified date
   */
  async cleanupOldDeleted(olderThan: Date): Promise<number> {
    const result = await db
      .delete(files)
      .where(and(isNotNull(files.deletedAt), lt(files.deletedAt, olderThan)));

    return result.changes;
  }
}
