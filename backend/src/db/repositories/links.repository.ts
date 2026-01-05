import { eq, desc, sql } from 'drizzle-orm';
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
   * Get links for a user
   */
  async findByUser(
    userId: number,
    options: { limit?: number; offset?: number } = {}
  ): Promise<{ items: Link[]; total: number }> {
    const { limit = 20, offset = 0 } = options;

    const items = await db
      .select()
      .from(links)
      .where(eq(links.userId, userId))
      .orderBy(desc(links.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(links)
      .where(eq(links.userId, userId));

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
   * Delete a link
   */
  async delete(id: number, userId: number): Promise<boolean> {
    const result = await db
      .delete(links)
      .where(sql`${links.id} = ${id} AND ${links.userId} = ${userId}`);

    return result.changes > 0;
  }
}
