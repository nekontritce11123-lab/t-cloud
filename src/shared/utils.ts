import { FileRecord } from '../api/client';

/**
 * Toggle an item in a Set - returns new Set with item added or removed
 * Usage: setSelected(prev => toggleInSet(prev, item.id))
 */
export function toggleInSet<T>(set: Set<T>, item: T): Set<T> {
  const next = new Set(set);
  if (next.has(item)) {
    next.delete(item);
  } else {
    next.add(item);
  }
  return next;
}

/**
 * Extract domain from URL, removing www. prefix
 */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

/**
 * Group files by date field (createdAt or deletedAt)
 * Uses local timezone for date grouping
 */
export function groupByDateField(
  files: FileRecord[],
  dateField: 'createdAt' | 'deletedAt'
): Map<string, FileRecord[]> {
  const groups = new Map<string, FileRecord[]>();

  for (const file of files) {
    const dateValue = dateField === 'createdAt' ? file.createdAt : file.deletedAt;
    if (!dateValue) continue;

    const date = new Date(dateValue);
    // Use local date components for grouping (fixes timezone issues)
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(file);
  }

  return groups;
}
