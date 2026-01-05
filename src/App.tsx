import { useEffect, useState, useCallback } from 'react';
import { useTelegram } from './hooks/useTelegram';
import { useFiles } from './hooks/useFiles';
import { apiClient, FileRecord, LinkRecord } from './api/client';
import { CategoryChips } from './components/CategoryChips/CategoryChips';
import { SearchBar } from './components/SearchBar/SearchBar';
import { FileGrid } from './components/FileGrid/FileGrid';
import { LinkList } from './components/LinkCard/LinkCard';
import './styles/global.css';
import styles from './App.module.css';

function App() {
  const { isReady, getInitData, hapticFeedback } = useTelegram();
  const {
    files,
    links,
    stats,
    isLoading,
    error,
    selectedType,
    hasMore,
    filterByType,
    search,
    loadMore,
    refresh,
  } = useFiles();

  const [searchInput, setSearchInput] = useState('');

  // Initialize API with Telegram initData
  useEffect(() => {
    const initData = getInitData();
    if (initData) {
      apiClient.setInitData(initData);
    }
  }, [getInitData]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      search(searchInput);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput, search]);

  // Handle file click
  const handleFileClick = useCallback((file: FileRecord) => {
    hapticFeedback.light();
    // For now, just log. In full implementation, open detail view or send to chat
    console.log('File clicked:', file);
    // TODO: Implement file detail view or send to chat
  }, [hapticFeedback]);

  // Handle link click
  const handleLinkClick = useCallback((link: LinkRecord) => {
    hapticFeedback.light();
    // Open link in browser
    window.open(link.url, '_blank');
  }, [hapticFeedback]);

  // Handle scroll for infinite loading
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const bottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 100;
    if (bottom && hasMore && !isLoading) {
      loadMore();
    }
  }, [hasMore, isLoading, loadMore]);

  // Loading state
  if (!isReady) {
    return (
      <div className={styles.loading}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className={styles.app}>
      {/* Header */}
      <header className={styles.header}>
        <h1 className={styles.title}>T-Cloud</h1>
        <SearchBar
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Поиск по файлам..."
        />
      </header>

      {/* Category chips */}
      <CategoryChips
        stats={stats}
        selectedType={selectedType}
        onSelect={(type) => {
          hapticFeedback.selection();
          filterByType(type);
        }}
      />

      {/* Content */}
      <main className={styles.content} onScroll={handleScroll}>
        {error && (
          <div className={styles.error}>
            <span>❌ {error}</span>
            <button onClick={refresh}>Повторить</button>
          </div>
        )}

        {selectedType === 'link' ? (
          <LinkList links={links} onLinkClick={handleLinkClick} />
        ) : (
          <FileGrid files={files} onFileClick={handleFileClick} />
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div className={styles.loadingMore}>
            <div className="spinner" />
          </div>
        )}

        {/* End of list */}
        {!isLoading && !hasMore && (files.length > 0 || links.length > 0) && (
          <div className={styles.endOfList}>
            Это все файлы
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
