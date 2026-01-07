import { MediaType } from '../api/client';
import { BYTES_PER_KB, BYTES_PER_MB, TRASH_RETENTION_MS, MS_PER_DAY } from '../constants/config';

/**
 * Format file size in human readable format
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < BYTES_PER_KB) return `${bytes} B`;
  if (bytes < BYTES_PER_MB) return `${(bytes / BYTES_PER_KB).toFixed(1)} KB`;
  return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
}

/**
 * Format duration in MM:SS format
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Вычисляет дни до автоудаления (30 дней с момента удаления)
 */
export function getDaysRemaining(deletedAt: string): number {
  const deleted = new Date(deletedAt);
  const now = new Date();
  const deleteDate = new Date(deleted.getTime() + TRASH_RETENTION_MS);
  const remaining = Math.ceil((deleteDate.getTime() - now.getTime()) / MS_PER_DAY);
  return Math.max(0, remaining);
}

/**
 * Возвращает русское название типа медиа
 */
export function getMediaTypeLabel(type: MediaType): string {
  const labels: Record<MediaType, string> = {
    photo: 'Фото',
    video: 'Видео',
    document: 'Документ',
    audio: 'Аудио',
    voice: 'Голосовое',
    video_note: 'Кружок',
    link: 'Ссылка',
  };
  return labels[type] || type;
}

// Русские названия месяцев в родительном падеже
const MONTHS_RU = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];

/**
 * Форматирование даты с временем
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const fileDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  if (fileDate.getTime() === today.getTime()) {
    return `Сегодня, ${time}`;
  }
  if (fileDate.getTime() === yesterday.getTime()) {
    return `Вчера, ${time}`;
  }

  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Форматирование даты для заголовка группы (без времени)
 * @param dateStr - ISO дата
 * @param prefix - опциональный префикс (например "Удалено")
 */
export function formatDateHeader(dateStr: string, prefix?: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const fileDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const addPrefix = (text: string) => prefix ? `${prefix} ${text.toLowerCase()}` : text;

  if (fileDate.getTime() === today.getTime()) {
    return addPrefix('Сегодня');
  }
  if (fileDate.getTime() === yesterday.getTime()) {
    return addPrefix('Вчера');
  }

  const isCurrentYear = date.getFullYear() === now.getFullYear();
  const dateText = isCurrentYear
    ? `${date.getDate()} ${MONTHS_RU[date.getMonth()]}`
    : `${date.getDate()} ${MONTHS_RU[date.getMonth()]} ${date.getFullYear()}`;

  return prefix ? `${prefix} ${dateText}` : dateText;
}

/**
 * Подсветка всех вхождений поискового запроса в тексте
 * @param text - исходный текст
 * @param query - поисковый запрос
 * @returns текст с подсветкой через <mark> теги
 */
export function highlightMatch(text: string, query?: string): string {
  if (!query || query.length === 0) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}
