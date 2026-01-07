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

    try {
      const hasFilters = filters && (filters.dateFrom || filters.dateTo || filters.sizeMin || filters.sizeMax || filters.from || filters.chat);

      if ((query && query.trim()) || hasFilters) {
        // Определяем параметры поиска в зависимости от категории
        const isTrash = type === 'trash';
        const searchType = (type === 'trash' || type === 'link' || type === null) ? undefined : type;

        // Search files with filters
        const filesResult = await apiClient.searchFiles(query || '', {
          type: searchType,
          deleted: isTrash,
          ...filters,
        });

        // Search links only if not trash and no tag filters (tags don't apply to links)
        const linksResult = type !== 'trash' && !hasFilters && query && query.trim()
          ? await apiClient.searchLinks(query)
          : { items: [] };

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
      const [statsResult, trashFilesCount, trashLinksCount] = await Promise.all([
        apiClient.getFileStats(),
        apiClient.getTrashFilesCount(),
        apiClient.getTrashLinksCount(),
      ]);
      console.log('[useFiles] Stats:', statsResult);
      setStats(statsResult || []);
      setTrashCount(trashFilesCount.count + trashLinksCount.count);
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
    console.log('[useFiles] clearSearch called');

    // Отменяем любые pending запросы
    const requestId = ++currentRequestId.current;

    // Очищаем фильтры
    currentFiltersRef.current = undefined;

    setIsLoading(true);
    setError(null);

    try {
      // Загружаем данные ДО очистки searchQuery
      const typeForApi = selectedType === 'trash' ? undefined : selectedType;
      const result = await apiClient.getFiles({
        type: typeForApi || undefined,
        page: 1,
        limit: 50,
      });

      // Проверяем актуальность
      if (requestId !== currentRequestId.current) return;

      // Данные пришли - теперь безопасно очищать query и обновлять files
      setFiles(result.items || []);
      setLinks([]);
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
