import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 't-cloud-search-history';
const MAX_HISTORY = 6;

export function useSearchHistory() {
  const [history, setHistory] = useState<string[]>([]);

  // Загружаем историю при маунте
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch {
      // Игнорируем ошибки парсинга
    }
  }, []);

  // Добавить запрос в историю
  const addToHistory = useCallback((query: string) => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) return;

    setHistory(prev => {
      // Убираем дубликаты (case-insensitive)
      const filtered = prev.filter(q => q.toLowerCase() !== trimmed.toLowerCase());
      const newHistory = [trimmed, ...filtered].slice(0, MAX_HISTORY);

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
      } catch {
        // Игнорируем ошибки записи
      }

      return newHistory;
    });
  }, []);

  // Удалить запрос из истории
  const removeFromHistory = useCallback((query: string) => {
    setHistory(prev => {
      const filtered = prev.filter(q => q !== query);

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      } catch {
        // Игнорируем ошибки записи
      }

      return filtered;
    });
  }, []);

  // Очистить всю историю
  const clearHistory = useCallback(() => {
    setHistory([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Игнорируем ошибки
    }
  }, []);

  return {
    history,
    addToHistory,
    removeFromHistory,
    clearHistory,
  };
}
