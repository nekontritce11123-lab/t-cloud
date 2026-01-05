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

  // Сохраняем данные до поиска, чтобы восстановить при очистке
  const savedFilesRef = useRef<FileRecord[]>([]);
  const savedLinksRef = useRef<LinkRecord[]>([]);

  // Ref для текущих данных (чтобы не зависеть от files/links в useCallback)
  const currentFilesRef = useRef<FileRecord[]>([]);
  const currentLinksRef = useRef<LinkRecord[]>([]);

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
        const linksData = result.items || [];
        setLinks(linksData);
        setFiles([]);
        setHasMore(false);
        // Сохраняем для восстановления после поиска
        savedLinksRef.current = linksData;
        savedFilesRef.current = [];
      } else {
        const result = await apiClient.getFiles({
          type: type || undefined,
          page: 1,
          limit: 50,
        });
        if (requestId !== currentRequestId.current) return;
        console.log('[useFiles] Files result:', result);
        const filesData = result.items || [];
        setFiles(filesData);
        setLinks([]);
        setHasMore(false);
        // Сохраняем для восстановления после поиска
        savedFilesRef.current = filesData;
        savedLinksRef.current = [];
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

  // Синхронизируем ref с state (для доступа в useCallback без deps)
  useEffect(() => {
    currentFilesRef.current = files;
    currentLinksRef.current = links;
  }, [files, links]);

  // Filter by type - сразу загружает данные
  const filterByType = useCallback((type: CategoryType) => {
    console.log('[useFiles] filterByType:', type);
    setSelectedType(type);
    setSearchQuery('');
    setIsLoading(true);
    loadDataForQuery('', type);
  }, [loadDataForQuery]);

  // Флаг: были ли мы в режиме поиска
  const wasSearchingRef = useRef(false);

  // Search - принимает query и сразу загружает
  const search = useCallback((query: string) => {
    console.log('[useFiles] search called with:', query, 'wasSearching:', wasSearchingRef.current);

    if (query) {
      // Начинаем поиск
      // Сохраняем данные ТОЛЬКО если ещё не были в режиме поиска
      // Используем refs чтобы не зависеть от files/links в deps
      if (!wasSearchingRef.current && (currentFilesRef.current.length > 0 || currentLinksRef.current.length > 0)) {
        savedFilesRef.current = currentFilesRef.current;
        savedLinksRef.current = currentLinksRef.current;
        console.log('[useFiles] Saved data before search:', savedFilesRef.current.length, 'files,', savedLinksRef.current.length, 'links');
      }
      wasSearchingRef.current = true;

      setSearchQuery(query);
      setIsLoading(true);
      setFiles([]);
      setLinks([]);
      loadDataForQuery(query, null);
    } else {
      // Очистка поиска
      setSearchQuery('');

      if (wasSearchingRef.current) {
        // Были в режиме поиска - восстанавливаем сохранённые данные
        console.log('[useFiles] Restoring saved data:', savedFilesRef.current.length, 'files,', savedLinksRef.current.length, 'links');
        wasSearchingRef.current = false;

        if (savedFilesRef.current.length > 0 || savedLinksRef.current.length > 0) {
          // React 18 автоматически батчит эти вызовы
          setFiles(savedFilesRef.current);
          setLinks(savedLinksRef.current);
          setIsLoading(false);
        } else {
          // Нет сохранённых данных - загружаем
          setIsLoading(true);
          loadDataForQuery('', selectedType);
        }
      }
      // Если не были в режиме поиска - ничего не делаем
    }
  }, [loadDataForQuery, selectedType]); // ← БЕЗ files и links!

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
    loadMore: () => {},
    refresh,
    deleteFile,
    deleteLink,
  };
}
