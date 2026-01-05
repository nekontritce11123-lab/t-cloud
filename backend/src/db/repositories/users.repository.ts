import { eq, sql } from 'drizzle-orm';
import { db } from '../index.js';
import { users, NewUser, User } from '../schema.js';
import { TelegramUser } from '../../types/index.js';

/**
 * Repository for user operations
 */
export class UsersRepository {
  /**
   * Create or update a user from Telegram data
   */
  async upsert(telegramUser: TelegramUser): Promise<User> {
    const existingUser = await this.findById(telegramUser.id);

    if (existingUser) {
      // Update existing user
      await db
        .update(users)
        .set({
          firstName: telegramUser.first_name,
          lastName: telegramUser.last_name,
          username: telegramUser.username,
          languageCode: telegramUser.language_code,
          updatedAt: new Date(),
        })
        .where(eq(users.id, telegramUser.id));

      return this.findById(telegramUser.id) as Promise<User>;
    }

    // Create new user
    const result = await db
      .insert(users)
      .values({
        id: telegramUser.id,
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name,
        username: telegramUser.username,
        languageCode: telegramUser.language_code,
      })
      .returning();

    return result[0];
  }

  /**
   * Find user by ID
   */
  async findById(id: number): Promise<User | null> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0] || null;
  }

  /**
   * Get all users
   */
  async findAll(): Promise<User[]> {
    return db.select().from(users);
  }
}
