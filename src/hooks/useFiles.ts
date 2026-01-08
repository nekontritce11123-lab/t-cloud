import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient, FileRecord, LinkRecord, CategoryStats } from '../api/client';
import { CategoryType } from '../components/CategoryChips/CategoryChips';

export interface SearchFilters {
  dateFrom?: string;
  dateTo?: string;
  sizeMin?: number;
  sizeMax?: number;
  from?: string;
  chat?: string;
}

export function useFiles(apiReady = true) {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [links, setLinks] = useState<LinkRecord[]>([]);
  const [stats, setStats] = useState<CategoryStats[]>([]);
  const [trashCount, setTrashCount] = useState(0);
  const [sharedCount, setSharedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<CategoryType>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Ref для отслеживания текущего запроса (для отмены устаревших)
  const currentRequestId = useRef(0);

  // Универсальная функция загрузки данных
  const loadDataForQuery = useCallback(async (query: string, type: CategoryType, filters?: SearchFilters) => {
    if (!apiReady) return;

    const requestId = ++currentRequestId.current;
    console.log('[useFiles] loadDataForQuery called, query:', query, 'type:', type, 'filters:', filters, 'requestId:', requestId);

    setIsLoading(true);
    setError(null);
    // Очищаем данные чтобы показался спиннер и не было чёрного экрана при переключении категорий
    setFiles([]);
    setLinks([]);

    try {
      const hasFilters = filters && (filters.dateFrom || filters.dateTo || filters.sizeMin || filters.sizeMax || filters.from || filters.chat);

      if ((query && query.trim()) || hasFilters) {
        const isTrash = type === 'trash';
        const isLinks = type === 'link';

        // Определяем что искать в зависимости от секции
        let filesResult = { items: [] as FileRecord[] };
        let linksResult = { items: [] as LinkRecord[] };

        if (isLinks) {
          // В секции "Ссылки" ищем ТОЛЬКО ссылки
          if (query && query.trim()) {
            linksResult = await apiClient.searchLinks(query);
          }
        } else if (isTrash) {
          // В корзине ищем удалённые файлы
          filesResult = await apiClient.searchFiles(query || '', {
            deleted: true,
            ...filters,
          });
        } else {
          // В остальных секциях ищем ТОЛЬКО файлы (ссылки НЕ ищем)
          const searchType = type || undefined;
          filesResult = await apiClient.searchFiles(query || '', {
            type: searchType,
            ...filters,
          });
        }

        // Проверяем что это актуальный запрос
        if (requestId !== currentRequestId.current) {
          console.log('[useFiles] Ignoring stale response', requestId);
          return;
        }
        console.log('[useFiles] Search result - files:', filesResult, 'links:', linksResult);
        setFiles(filesResult.items || []);
        setLinks(linksResult.items || []);
      } else if (type === 'trash') {
        // Load trash - handled separately by TrashView component
        if (requestId !== currentRequestId.current) return;
        setFiles([]);
        setLinks([]);
      } else if (type === 'link') {
        const result = await apiClient.getLinks({ page: 1, limit: 50 });
        if (requestId !== currentRequestId.current) return;
        console.log('[useFiles] Links result:', result);
        setLinks(result.items || []);
        setFiles([]);
      } else if (type === 'shared') {
        const result = await apiClient.getSharedFiles();
        if (requestId !== currentRequestId.current) return;
        console.log('[useFiles] Shared files result:', result);
        setFiles(result.items || []);
        setLinks([]);
      } else {
        const result = await apiClient.getFiles({
          type: type || undefined,
          page: 1,
          limit: 50,
        });
        if (requestId !== currentRequestId.current) return;
        console.log('[useFiles] Files result:', result);
        setFiles(result.items || []);
        setLinks([]);
      }
    } catch (err) {
      if (requestId !== currentRequestId.current) return;
      console.error('[useFiles] Error:', err);
      setError('Не удалось загрузить файлы');
      // Очищаем данные при ошибке чтобы не показывать старые
      setFiles([]);
      setLinks([]);
    } finally {
      // ВСЕГДА сбрасываем isLoading, иначе он может застрять
      if (requestId === currentRequestId.current) {
        setIsLoading(false);
      }
    }
  }, [apiReady]);

  // Load stats
  const loadStats = useCallback(async () => {
    if (!apiReady) return;
    try {
      const [statsResult, trashFilesCount, trashLinksCount, sharedFilesCount] = await Promise.all([
        apiClient.getFileStats(),
        apiClient.getTrashFilesCount(),
        apiClient.getTrashLinksCount(),
        apiClient.getSharedFilesCount(),
      ]);
      console.log('[useFiles] Stats:', statsResult);
      setStats(statsResult || []);
      setTrashCount(trashFilesCount.count + trashLinksCount.count);
      setSharedCount(sharedFilesCount.count);
    } catch (err) {
      console.error('[useFiles] Stats error:', err);
    }
  }, [apiReady]);

  // Load on mount only
  useEffect(() => {
    console.log('[useFiles] Initial load, apiReady:', apiReady);
    if (apiReady) {
      loadDataForQuery(searchQuery, selectedType);
      loadStats();
    }
  }, [apiReady]); // Только при изменении apiReady!

  // Current filters ref (for filterByType to use)
  const currentFiltersRef = useRef<SearchFilters | undefined>(undefined);

  // Filter by type - сразу загружает данные
  const filterByType = useCallback((type: CategoryType) => {
    console.log('[useFiles] filterByType:', type);
    setSelectedType(type);
    // НЕ очищаем searchQuery - сохраняем поиск при переключении категории
    loadDataForQuery(searchQuery, type, currentFiltersRef.current);
  }, [loadDataForQuery, searchQuery]);

  // Search - для debounced ввода с опциональными фильтрами
  const search = useCallback((query: string, filters?: SearchFilters) => {
    console.log('[useFiles] search called with:', query, 'filters:', filters);
    setSearchQuery(query);
    currentFiltersRef.current = filters;
    // Передаём текущую категорию вместо null
    loadDataForQuery(query, selectedType, filters);
  }, [loadDataForQuery, selectedType]);

  // Мгновенная очистка поиска (для кнопки X)
  // ВАЖНО: Сначала загружаем данные, потом очищаем query
  const clearSearch = useCallback(async () => {
    console.log('[useFiles] clearSearch called, selectedType:', selectedType);

    // Отменяем любые pending запросы
    const requestId = ++currentRequestId.current;

    // Очищаем фильтры
    currentFiltersRef.current = undefined;

    setIsLoading(true);
    setError(null);

    try {
      // Загружаем данные в зависимости от текущей категории
      if (selectedType === 'link') {
        // Для категории "ссылки" загружаем links
        const result = await apiClient.getLinks({ page: 1, limit: 50 });
        if (requestId !== currentRequestId.current) return;
        setLinks(result.items || []);
        setFiles([]);
      } else if (selectedType === 'trash') {
        // Trash обрабатывается отдельно в TrashView
        if (requestId !== currentRequestId.current) return;
        setFiles([]);
        setLinks([]);
      } else if (selectedType === 'shared') {
        // Для категории "Общие" загружаем файлы с активными share-ссылками
        const result = await apiClient.getSharedFiles();
        if (requestId !== currentRequestId.current) return;
        setFiles(result.items || []);
        setLinks([]);
      } else {
        // Для остальных категорий загружаем files
        const result = await apiClient.getFiles({
          type: selectedType || undefined,
          page: 1,
          limit: 50,
        });
        if (requestId !== currentRequestId.current) return;
        setFiles(result.items || []);
        setLinks([]);
      }

      setSearchQuery(''); // Очищаем ПОСЛЕ того как данные готовы
    } catch (err) {
      if (requestId !== currentRequestId.current) return;
      console.error('[useFiles] clearSearch error:', err);
      setError('Не удалось загрузить файлы');
      setFiles([]);
      setLinks([]);
    } finally {
      // ВСЕГДА сбрасываем isLoading для актуального запроса
      if (requestId === currentRequestId.current) {
        setIsLoading(false);
      }
    }
  }, [selectedType]);

  // Refresh - перезагрузка текущего состояния
  const refresh = useCallback(() => {
    loadDataForQuery(searchQuery, selectedType);
    loadStats();
  }, [loadDataForQuery, loadStats, searchQuery, selectedType]);

  return {
    files,
    links,
    stats,
    trashCount,
    sharedCount,
    isLoading,
    error,
    selectedType,
    searchQuery,
    filterByType,
    search,
    clearSearch,
    refresh,
  };
}
