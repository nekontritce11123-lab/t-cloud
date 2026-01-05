import { useState, useEffect, useCallback } from 'react';
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

  // Simple load function
  const loadData = useCallback(async () => {
    if (!apiReady) return;

    console.log('[useFiles] loadData called, searchQuery:', searchQuery, 'selectedType:', selectedType);
    setIsLoading(true);
    setError(null);

    try {
      if (searchQuery && searchQuery.trim()) {
        // Search both files and links in parallel
        const [filesResult, linksResult] = await Promise.all([
          apiClient.searchFiles(searchQuery),
          apiClient.searchLinks(searchQuery),
        ]);
        console.log('[useFiles] Search result - files:', filesResult, 'links:', linksResult);
        setFiles(filesResult.items || []);
        setLinks(linksResult.items || []);
        setHasMore(false);
      } else if (selectedType === 'trash') {
        // Load trash - handled separately by TrashView component
        // Just clear main lists
        setFiles([]);
        setLinks([]);
        setHasMore(false);
      } else if (selectedType === 'link') {
        const result = await apiClient.getLinks({ page: 1, limit: 50 });
        console.log('[useFiles] Links result:', result);
        setLinks(result.items || []);
        setFiles([]);
        setHasMore(false);
      } else {
        const result = await apiClient.getFiles({
          type: selectedType || undefined,
          page: 1,
          limit: 50,
        });
        console.log('[useFiles] Files result:', result);
        setFiles(result.items || []);
        setLinks([]);
        setHasMore(false);
      }
    } catch (err) {
      console.error('[useFiles] Error:', err);
      setError('Не удалось загрузить файлы');
    } finally {
      setIsLoading(false);
    }
  }, [apiReady, selectedType, searchQuery]);

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

  // Load on mount and when dependencies change
  useEffect(() => {
    console.log('[useFiles] useEffect triggered, apiReady:', apiReady);
    if (apiReady) {
      loadData();
      loadStats();
    }
  }, [apiReady, selectedType, searchQuery, loadData, loadStats]);

  // Filter by type
  const filterByType = useCallback((type: CategoryType) => {
    setSelectedType(type);
    setSearchQuery('');
  }, []);

  // Search
  const search = useCallback((query: string) => {
    console.log('[useFiles] search called with:', query);
    setSearchQuery(query);
    if (query) {
      // При новом поиске - очищаем и показываем спиннер
      setIsLoading(true);
      setFiles([]);
      setLinks([]);
      setSelectedType(null);
    }
    // При очистке поиска (query пустой) - просто меняем searchQuery,
    // loadData загрузит файлы и обновит состояние
    // loadData будет вызван автоматически через useEffect когда searchQuery изменится
  }, []);

  // Refresh
  const refresh = useCallback(() => {
    loadData();
    loadStats();
  }, [loadData, loadStats]);

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
