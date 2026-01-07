/**
 * Trie (Prefix Tree) для мгновенного autocomplete
 * Время поиска: O(k) где k = длина префикса
 */

interface TrieNode {
  children: Map<string, TrieNode>;
  words: Set<string>; // Полные слова с этим префиксом
}

export class PrefixTrie {
  private root: TrieNode = { children: new Map(), words: new Set() };
  private wordCount = 0;

  constructor(words?: string[]) {
    if (words) {
      for (const word of words) {
        this.insert(word);
      }
    }
  }

  /**
   * Добавить слово в Trie
   */
  insert(word: string): void {
    if (word.length < 2) return;

    const normalized = this.normalize(word);
    if (normalized.length < 1) return;

    let node = this.root;
    for (const char of normalized) {
      if (!node.children.has(char)) {
        node.children.set(char, { children: new Map(), words: new Set() });
      }
      node = node.children.get(char)!;
      node.words.add(word); // Храним оригинал
    }
    this.wordCount++;
  }

  /**
   * Найти слова по префиксу
   * @param prefix - начало слова
   * @param limit - максимум результатов (default 8)
   * @returns массив слов, отсортированных по длине
   */
  search(prefix: string, limit = 8): string[] {
    if (prefix.length < 1) return [];

    const normalized = this.normalize(prefix);
    if (normalized.length < 1) return [];

    let node = this.root;

    // Идём по дереву до конца префикса
    for (const char of normalized) {
      if (!node.children.has(char)) {
        return []; // Нет слов с таким префиксом
      }
      node = node.children.get(char)!;
    }

    // Возвращаем слова, отсортированные по длине (короткие первые)
    return Array.from(node.words)
      .sort((a, b) => a.length - b.length)
      .slice(0, limit);
  }

  /**
   * Количество слов в Trie
   */
  get size(): number {
    return this.wordCount;
  }

  /**
   * Нормализация текста для поиска
   * - lowercase
   * - удаление диакритиков (ё -> е и т.д.)
   */
  private normalize(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}
