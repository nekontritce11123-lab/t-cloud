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
 * Add multiple items to a Set - returns new Set
 */
export function addToSet<T>(set: Set<T>, items: T[]): Set<T> {
  const next = new Set(set);
  for (const item of items) {
    next.add(item);
  }
  return next;
}

/**
 * Remove multiple items from a Set - returns new Set
 */
export function removeFromSet<T>(set: Set<T>, items: T[]): Set<T> {
  const next = new Set(set);
  for (const item of items) {
    next.delete(item);
  }
  return next;
}
