import { eq, desc, sql, and, isNull, isNotNull, lt } from 'drizzle-orm';
import { db } from '../index.js';
import { links, NewLink, Link } from '../schema.js';

/**
 * Repository for link operations
 */
export class LinksRepository {
  /**
   * Create a new link record
   */
  async create(data: NewLink): Promise<Link> {
    const result = await db.insert(links).values(data).returning();
    return result[0];
  }

  /**
   * Find link by ID
   */
  async findById(id: number): Promise<Link | null> {
    const result = await db.select().from(links).where(eq(links.id, id)).limit(1);
    return result[0] || null;
  }

  /**
   * Get links for a user (excludes deleted)
   */
  async findByUser(
    userId: number,
    options: { limit?: number; offset?: number } = {}
  ): Promise<{ items: Link[]; total: number }> {
    const { limit = 20, offset = 0 } = options;

    const whereCondition = and(eq(links.userId, userId), isNull(links.deletedAt));

    const items = await db
      .select()
      .from(links)
      .where(whereCondition)
      .orderBy(desc(links.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(links)
      .where(whereCondition);

    return {
      items,
      total: countResult[0]?.count || 0,
    };
  }

  /**
   * Check if URL already exists for user
   */
  async findByUrl(userId: number, url: string): Promise<Link | null> {
    const result = await db
      .select()
      .from(links)
      .where(sql`${links.userId} = ${userId} AND ${links.url} = ${url}`)
      .limit(1);
    return result[0] || null;
  }

  /**
   * Soft delete a link (move to trash)
   */
  async softDelete(id: number, userId: number): Promise<boolean> {
    const result = await db
      .update(links)
      .set({ deletedAt: new Date() })
      .where(and(eq(links.id, id), eq(links.userId, userId), isNull(links.deletedAt)));

    return result.changes > 0;
  }

  /**
   * Soft delete multiple links (move to trash)
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
   * Get deleted links (trash) for a user
   */
  async findDeleted(userId: number): Promise<Link[]> {
    return db
      .select()
      .from(links)
      .where(and(eq(links.userId, userId), isNotNull(links.deletedAt)))
      .orderBy(desc(links.deletedAt));
  }

  /**
   * Get count of non-deleted links for a user
   */
  async getCount(userId: number): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(links)
      .where(and(eq(links.userId, userId), isNull(links.deletedAt)));

    return result[0]?.count || 0;
  }

  /**
   * Get trash count for a user
   */
  async getTrashCount(userId: number): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(links)
      .where(and(eq(links.userId, userId), isNotNull(links.deletedAt)));

    return result[0]?.count || 0;
  }

  /**
   * Restore a link from trash
   */
  async restore(id: number, userId: number): Promise<boolean> {
    const result = await db
      .update(links)
      .set({ deletedAt: null })
      .where(and(eq(links.id, id), eq(links.userId, userId), isNotNull(links.deletedAt)));

    return result.changes > 0;
  }

  /**
   * Permanently delete a link (hard delete)
   */
  async hardDelete(id: number, userId: number): Promise<boolean> {
    const result = await db
      .delete(links)
      .where(and(eq(links.id, id), eq(links.userId, userId)));

    return result.changes > 0;
  }

  /**
   * Delete all links in trash older than specified date
   */
  async cleanupOldDeleted(olderThan: Date): Promise<number> {
    const result = await db
      .delete(links)
      .where(and(isNotNull(links.deletedAt), lt(links.deletedAt, olderThan)));

    return result.changes;
  }
}
