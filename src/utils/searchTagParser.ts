// Smart Tags Parser - распознаёт фильтры в поисковом запросе

export interface SearchTag {
  id: string;
  type: 'date' | 'size' | 'from' | 'chat' | 'extension';
  label: string;
  value: unknown;
  raw: string;
}

// Маппинг расширений на MIME типы
const EXTENSION_TO_MIME: Record<string, string> = {
  // Изображения
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'svg': 'image/svg+xml',
  'bmp': 'image/bmp',
  'ico': 'image/x-icon',
  // Видео
  'mp4': 'video/mp4',
  'mov': 'video/quicktime',
  'avi': 'video/x-msvideo',
  'mkv': 'video/x-matroska',
  'webm': 'video/webm',
  // Аудио
  'mp3': 'audio/mpeg',
  'wav': 'audio/wav',
  'ogg': 'audio/ogg',
  'flac': 'audio/flac',
  'm4a': 'audio/mp4',
  // Документы
  'pdf': 'application/pdf',
  'doc': 'application/msword',
  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'xls': 'application/vnd.ms-excel',
  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'ppt': 'application/vnd.ms-powerpoint',
  'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'txt': 'text/plain',
  'csv': 'text/csv',
  // Архивы
  'zip': 'application/zip',
  'rar': 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  'tar': 'application/x-tar',
  'gz': 'application/gzip',
  // Код
  'json': 'application/json',
  'xml': 'application/xml',
  'html': 'text/html',
  'css': 'text/css',
  'js': 'application/javascript',
};

export interface ParsedSearch {
  text: string;      // Текст для FTS
  tags: SearchTag[]; // Распознанные теги
}

// Генерация уникального ID
let tagIdCounter = 0;
function generateTagId(): string {
  return `tag-${++tagIdCounter}-${Date.now()}`;
}

// Паттерны дат
const DATE_PATTERNS: Array<{
  pattern: RegExp;
  getValue: (match: RegExpMatchArray) => { type: string; date?: string };
  getLabel: (match: RegExpMatchArray) => string;
}> = [
  {
    pattern: /^(сегодня|today)$/i,
    getValue: () => ({ type: 'today' }),
    getLabel: () => 'Сегодня',
  },
  {
    pattern: /^(вчера|yesterday)$/i,
    getValue: () => ({ type: 'yesterday' }),
    getLabel: () => 'Вчера',
  },
  {
    pattern: /^(неделя|week)$/i,
    getValue: () => ({ type: 'week' }),
    getLabel: () => 'Неделя',
  },
  {
    pattern: /^(месяц|month)$/i,
    getValue: () => ({ type: 'month' }),
    getLabel: () => 'Месяц',
  },
  {
    pattern: /^(\d{4}-\d{2}-\d{2})$/,
    getValue: (m) => ({ type: 'exact', date: m[1] }),
    getLabel: (m) => m[1],
  },
  {
    pattern: /^(\d{2})\.(\d{2})\.(\d{4})$/,
    getValue: (m) => ({ type: 'exact', date: `${m[3]}-${m[2]}-${m[1]}` }),
    getLabel: (m) => `${m[1]}.${m[2]}.${m[3]}`,
  },
];

// Парсинг размера в байты
function parseSize(num: number, unit: string): number {
  const multipliers: Record<string, number> = {
    '': 1,
    'b': 1,
    'kb': 1024,
    'mb': 1024 * 1024,
    'gb': 1024 * 1024 * 1024,
  };
  return num * (multipliers[unit.toLowerCase()] || 1);
}

// Форматирование размера для отображения
function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${Math.round(bytes / (1024 * 1024 * 1024))}GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${Math.round(bytes / (1024 * 1024))}MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)}KB`;
  }
  return `${bytes}B`;
}

// Попытка распознать тег из слова
function tryParseTag(word: string): SearchTag | null {
  // Даты
  for (const { pattern, getValue, getLabel } of DATE_PATTERNS) {
    const match = word.match(pattern);
    if (match) {
      return {
        id: generateTagId(),
        type: 'date',
        label: getLabel(match),
        value: getValue(match),
        raw: word,
      };
    }
  }

  // Размеры: >1MB, <500KB, 5MB (единица измерения ОБЯЗАТЕЛЬНА!)
  // Просто "1" или "5" НЕ создаёт тег - нужно "1mb" или "5kb"
  const sizeMatch = word.match(/^([><])?(\d+)(kb|mb|gb)$/i);
  if (sizeMatch) {
    const [, operator, numStr, unit] = sizeMatch;
    const num = parseInt(numStr, 10);
    const bytes = parseSize(num, unit);

    let label: string;
    let value: { min?: number; max?: number; approx?: number };

    if (operator === '>') {
      label = `>${formatSize(bytes)}`;
      value = { min: bytes };
    } else if (operator === '<') {
      label = `<${formatSize(bytes)}`;
      value = { max: bytes };
    } else {
      label = formatSize(bytes);
      // Примерный размер (±50%)
      value = { approx: bytes };
    }

    return {
      id: generateTagId(),
      type: 'size',
      label,
      value,
      raw: word,
    };
  }

  // от:Имя - поиск по forward_from_name
  const fromMatch = word.match(/^(?:от|from):(.+)$/i);
  if (fromMatch) {
    return {
      id: generateTagId(),
      type: 'from',
      label: `От: ${fromMatch[1]}`,
      value: fromMatch[1],
      raw: word,
    };
  }

  // из:Канал - поиск по forward_from_chat_title
  const chatMatch = word.match(/^(?:из|chat):(.+)$/i);
  if (chatMatch) {
    return {
      id: generateTagId(),
      type: 'chat',
      label: `Из: ${chatMatch[1]}`,
      value: chatMatch[1],
      raw: word,
    };
  }

  // Расширения файлов: .jpg, .pdf, jpg, pdf
  const extMatch = word.match(/^\.?([a-z0-9]{2,5})$/i);
  if (extMatch) {
    const ext = extMatch[1].toLowerCase();
    const mimeType = EXTENSION_TO_MIME[ext];
    if (mimeType) {
      return {
        id: generateTagId(),
        type: 'extension',
        label: `.${ext.toUpperCase()}`,
        value: mimeType,
        raw: word,
      };
    }
  }

  return null;
}

// Основная функция парсинга
export function parseSearchInput(input: string): ParsedSearch {
  const words = input.trim().split(/\s+/).filter(Boolean);
  const tags: SearchTag[] = [];
  const textWords: string[] = [];

  for (const word of words) {
    const tag = tryParseTag(word);
    if (tag) {
      tags.push(tag);
    } else {
      textWords.push(word);
    }
  }

  return {
    text: textWords.join(' '),
    tags,
  };
}

// Конвертация тегов в query params для API
export function tagsToQueryParams(tags: SearchTag[]): Record<string, string> {
  const params: Record<string, string> = {};

  for (const tag of tags) {
    switch (tag.type) {
      case 'date': {
        const dateValue = tag.value as { type: string; date?: string };
        const now = new Date();
        let dateFrom: Date;
        let dateTo: Date = now;

        switch (dateValue.type) {
          case 'today':
            dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
          case 'yesterday':
            dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
            dateTo = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
          case 'week':
            dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'month':
            dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          case 'exact':
            dateFrom = new Date(dateValue.date!);
            dateTo = new Date(dateFrom.getTime() + 24 * 60 * 60 * 1000);
            break;
          default:
            continue;
        }

        params.dateFrom = dateFrom.toISOString();
        params.dateTo = dateTo.toISOString();
        break;
      }

      case 'size': {
        const sizeValue = tag.value as { min?: number; max?: number; approx?: number };
        if (sizeValue.min !== undefined) {
          params.sizeMin = String(sizeValue.min);
        }
        if (sizeValue.max !== undefined) {
          params.sizeMax = String(sizeValue.max);
        }
        if (sizeValue.approx !== undefined) {
          // ±50% от указанного размера
          params.sizeMin = String(Math.floor(sizeValue.approx * 0.5));
          params.sizeMax = String(Math.floor(sizeValue.approx * 1.5));
        }
        break;
      }

      case 'from':
        params.from = String(tag.value);
        break;

      case 'chat':
        params.chat = String(tag.value);
        break;

      case 'extension':
        params.mimeType = String(tag.value);
        break;
    }
  }

  return params;
}
