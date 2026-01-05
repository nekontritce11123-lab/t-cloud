import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient, FileRecord, LinkRecord, CategoryStats } from '../api/client';
import { CategoryType } from '../components/CategoryChips/CategoryChips';

export function useFiles(apiReady = true) {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [links, setLinks] = useState<LinkRecord[]>([]);
  const [stats, setStats] = useState<CategoryStats[]>([]);
  const [trashCount, setTrashCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<CategoryType>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasMore, setHasMore] = useState(false);

  // Ref для отслеживания текущего запроса (для отмены устаревших)
  const currentRequestId = useRef(0);

  // Универсальная функция загрузки данных
  const loadDataForQuery = useCallback(async (query: string, type: CategoryType) => {
    if (!apiReady) return;

    const requestId = ++currentRequestId.current;
    console.log('[useFiles] loadDataForQuery called, query:', query, 'type:', type, 'requestId:', requestId);

    setIsLoading(true);
    setError(null);

    try {
      if (query && query.trim()) {
        // Search both files and links in parallel
        const [filesResult, linksResult] = await Promise.all([
          apiClient.searchFiles(query),
          apiClient.searchLinks(query),
        ]);
        // Проверяем что это актуальный запрос
        if (requestId !== currentRequestId.current) {
          console.log('[useFiles] Ignoring stale response', requestId);
          return;
        }
        console.log('[useFiles] Search result - files:', filesResult, 'links:', linksResult);
        setFiles(filesResult.items || []);
        setLinks(linksResult.items || []);
        setHasMore(false);
      } else if (type === 'trash') {
        // Load trash - handled separately by TrashView component
        if (requestId !== currentRequestId.current) return;
        setFiles([]);
        setLinks([]);
        setHasMore(false);
      } else if (type === 'link') {
        const result = await apiClient.getLinks({ page: 1, limit: 50 });
        if (requestId !== currentRequestId.current) return;
        console.log('[useFiles] Links result:', result);
        setLinks(result.items || []);
        setFiles([]);
        setHasMore(false);
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
        setHasMore(false);
      }
    } catch (err) {
      if (requestId !== currentRequestId.current) return;
      console.error('[useFiles] Error:', err);
      setError('Не удалось загрузить файлы');
    } finally {
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

  // Filter by type - сразу загружает данные
  const filterByType = useCallback((type: CategoryType) => {
    console.log('[useFiles] filterByType:', type);
    setSelectedType(type);
    setSearchQuery('');
    loadDataForQuery('', type);
  }, [loadDataForQuery]);

  // Search - для debounced ввода
  const search = useCallback((query: string) => {
    console.log('[useFiles] search called with:', query);
    setSearchQuery(query);
    // При пустом query - загружаем по текущему типу
    // При непустом query - ищем по всем типам
    loadDataForQuery(query, query ? null : selectedType);
  }, [loadDataForQuery, selectedType]);

  // Мгновенная очистка поиска (для кнопки X)
  // ВАЖНО: Сначала загружаем данные, потом очищаем query
  const clearSearch = useCallback(async () => {
    console.log('[useFiles] clearSearch called');

    // Отменяем любые pending запросы
    const requestId = ++currentRequestId.current;

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
      setHasMore(false);
    } catch (err) {
      if (requestId !== currentRequestId.current) return;
      console.error('[useFiles] clearSearch error:', err);
      setError('Не удалось загрузить файлы');
    } finally {
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

  // Delete file
  const deleteFile = useCallback(async (id: number) => {
    await apiClient.deleteFile(id);
    setFiles(prev => prev.filter(f => f.id !== id));
    loadStats();
  }, [loadStats]);

  // Delete link
  const deleteLink = useCallback(async (id: number) => {
    await apiClient.deleteLink(id);
    setLinks(prev => prev.filter(l => l.id !== id));
  }, []);

  return {
    files,
    links,
    stats,
    trashCount,
    isLoading,
    error,
    selectedType,
    searchQuery,
    hasMore,
    filterByType,
    search,
    clearSearch,
    loadMore: () => {},
    refresh,
    deleteFile,
    deleteLink,
  };
}
