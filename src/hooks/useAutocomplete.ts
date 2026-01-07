import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../api/client';
import { PrefixTrie } from '../utils/trie';

/**
 * Hook для мгновенного autocomplete
 *
 * Загружает словарь после авторизации (apiReady),
 * строит Trie индекс и выполняет локальный поиск <1ms
 */
export function useAutocomplete(apiReady: boolean) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const trieRef = useRef<PrefixTrie | null>(null);

  // Загрузка словаря ПОСЛЕ авторизации
  useEffect(() => {
    if (!apiReady) return; // Ждём пока API будет готов (initData установлен)

    let cancelled = false;

    async function loadDictionary() {
      try {
        const { words } = await apiClient.getDictionary();
        if (!cancelled) {
          trieRef.current = new PrefixTrie(words);
          setIsLoading(false);
          console.log(`[Autocomplete] Loaded ${words.length} words into Trie`);
        }
      } catch (e) {
        console.error('[Autocomplete] Failed to load dictionary', e);
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadDictionary();
    return () => {
      cancelled = true;
    };
  }, [apiReady]);

  /**
   * Мгновенный поиск по последнему слову ввода
   */
  const search = useCallback((input: string) => {
    console.log('[Autocomplete] search called:', input, 'trie ready:', !!trieRef.current);

    if (!trieRef.current || input.length < 1) {
      setSuggestions([]);
      return;
    }

    // Берём последнее слово для autocomplete
    const words = input.split(/\s+/);
    const lastWord = words[words.length - 1];

    if (lastWord.length >= 1) {
      const results = trieRef.current.search(lastWord, 8);
      console.log('[Autocomplete] search results for', lastWord, ':', results);
      setSuggestions(results);
    } else {
      setSuggestions([]);
    }
  }, []);

  /**
   * Очистить подсказки
   */
  const clear = useCallback(() => {
    setSuggestions([]);
  }, []);

  /**
   * Принудительно перезагрузить словарь
   * (например, после добавления нового файла)
   */
  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      const { words } = await apiClient.getDictionary();
      trieRef.current = new PrefixTrie(words);
      console.log(`[Autocomplete] Reloaded ${words.length} words`);
    } catch (e) {
      console.error('[Autocomplete] Failed to reload dictionary', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    suggestions,
    search,
    clear,
    reload,
    isLoading,
  };
}
