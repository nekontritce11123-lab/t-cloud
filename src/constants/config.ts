/**
 * Время в миллисекундах
 */
export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Cooldown после отправки файла (24 часа)
 */
export const COOLDOWN_MS = 24 * MS_PER_HOUR;

/**
 * Время хранения файлов в корзине (30 дней)
 */
export const TRASH_RETENTION_DAYS = 30;
export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * MS_PER_DAY;

/**
 * UI таймеры
 */
export const LONG_PRESS_MS = 500;
export const BLUR_DELAY_MS = 150;

/**
 * Размеры файлов (в байтах)
 */
export const BYTES_PER_KB = 1024;
export const BYTES_PER_MB = BYTES_PER_KB * 1024;
export const BYTES_PER_GB = BYTES_PER_MB * 1024;
