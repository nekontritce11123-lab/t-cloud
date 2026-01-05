import { useState, useEffect, useCallback } from 'react';
import { apiClient, FileRecord, LinkRecord, CategoryStats, MediaType } from '../api/client';

export function useFiles() {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [links, setLinks] = useState<LinkRecord[]>([]);
  const [stats, setStats] = useState<CategoryStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<MediaType | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Load files
  const loadFiles = useCallback(async (reset = false) => {
    try {
      setIsLoading(true);
      setError(null);

      const currentPage = reset ? 1 : page;

      if (searchQuery) {
        // Search mode
        const result = await apiClient.searchFiles(searchQuery);
        setFiles(result.items);
        setHasMore(false);
      } else if (selectedType === 'link') {
        // Links
        const result = await apiClient.getLinks({ page: currentPage, limit: 20 });
        if (reset) {
          setLinks(result.items);
        } else {
          setLinks(prev => [...prev, ...result.items]);
        }
        setHasMore(currentPage < result.totalPages);
      } else {
        // Files (with optional type filter)
        const result = await apiClient.getFiles({
          type: selectedType || undefined,
          page: currentPage,
          limit: 20,
        });
        if (reset) {
          setFiles(result.items);
        } else {
          setFiles(prev => [...prev, ...result.items]);
        }
        setHasMore(currentPage < result.totalPages);
      }

      if (reset) {
        setPage(1);
      }
    } catch (err) {
      console.error('Failed to load files:', err);
      setError('Не удалось загрузить файлы');
    } finally {
      setIsLoading(false);
    }
  }, [page, selectedType, searchQuery]);

  // Load stats
  const loadStats = useCallback(async () => {
    try {
      const result = await apiClient.getFileStats();
      setStats(result);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadFiles(true);
    loadStats();
  }, [selectedType, searchQuery]);

  // Load more (pagination)
  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      setPage(prev => prev + 1);
    }
  }, [isLoading, hasMore]);

  // Effect for pagination
  useEffect(() => {
    if (page > 1) {
      loadFiles(false);
    }
  }, [page]);

  // Filter by type
  const filterByType = useCallback((type: MediaType | null) => {
    setSelectedType(type);
    setSearchQuery('');
    setPage(1);
  }, []);

  // Search
  const search = useCallback((query: string) => {
    setSearchQuery(query);
    setSelectedType(null);
    setPage(1);
  }, []);

  // Refresh
  const refresh = useCallback(() => {
    loadFiles(true);
    loadStats();
  }, [loadFiles, loadStats]);

  // Delete file
  const deleteFile = useCallback(async (id: number) => {
    try {
      await apiClient.deleteFile(id);
      setFiles(prev => prev.filter(f => f.id !== id));
      loadStats();
    } catch (err) {
      console.error('Failed to delete file:', err);
      throw err;
    }
  }, [loadStats]);

  // Delete link
  const deleteLink = useCallback(async (id: number) => {
    try {
      await apiClient.deleteLink(id);
      setLinks(prev => prev.filter(l => l.id !== id));
    } catch (err) {
      console.error('Failed to delete link:', err);
      throw err;
    }
  }, []);

  return {
    files,
    links,
    stats,
    isLoading,
    error,
    selectedType,
    searchQuery,
    hasMore,
    filterByType,
    search,
    loadMore,
    refresh,
    deleteFile,
    deleteLink,
  };
}
