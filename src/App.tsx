import { useEffect, useState, useCallback } from 'react';
import { useTelegram } from './hooks/useTelegram';
import { useFiles } from './hooks/useFiles';
import { apiClient, FileRecord, LinkRecord } from './api/client';
import { CategoryChips } from './components/CategoryChips/CategoryChips';
import { SearchBar } from './components/SearchBar/SearchBar';
import { FileGrid } from './components/FileGrid/FileGrid';
import { Timeline } from './components/Timeline/Timeline';
import { LinkList } from './components/LinkCard/LinkCard';
import './styles/global.css';
import styles from './App.module.css';

function App() {
  const { isReady, getInitData, hapticFeedback, mainButton, close } = useTelegram();
  const [isSending, setIsSending] = useState(false);
  const [apiReady, setApiReady] = useState(false);
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
  } = useFiles(apiReady);

  const [searchInput, setSearchInput] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // Лимит на выбор файлов
  const MAX_SELECTED_FILES = 20;

  // Initialize API with Telegram initData BEFORE loading files
  useEffect(() => {
    if (isReady) {
      const initData = getInitData();
      if (initData) {
        apiClient.setInitData(initData);
      }
      setApiReady(true);
    }
  }, [isReady, getInitData]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      search(searchInput);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput, search]);

  // Управление главной кнопкой
  useEffect(() => {
    if (selectedFiles.size > 0) {
      const count = selectedFiles.size;
      mainButton.show(
        `Отправить (${count})`,
        handleSendSelected
      );
    } else {
      mainButton.hide();
    }
  }, [selectedFiles.size]);

  // Отправить выбранные файлы
  const handleSendSelected = useCallback(async () => {
    if (selectedFiles.size === 0 || isSending) return;

    setIsSending(true);
    hapticFeedback.success();

    try {
      const fileIds = Array.from(selectedFiles);
      const result = await apiClient.sendFiles(fileIds);

      if (result.success) {
        // Выход из режима выбора
        setIsSelectionMode(false);
        setSelectedFiles(new Set());
        mainButton.hide();

        // Закрыть Mini App после отправки
        close();
      }
    } catch (error) {
      console.error('Error sending files:', error);
      hapticFeedback.error();
    } finally {
      setIsSending(false);
    }
  }, [selectedFiles, isSending, hapticFeedback, mainButton, close]);

  // Handle file click - обычное нажатие отправляет один файл
  const handleFileClick = useCallback(async (file: FileRecord) => {
    hapticFeedback.light();

    if (isSelectionMode) {
      // В режиме выбора - toggle выбор
      setSelectedFiles(prev => {
        const next = new Set(prev);
        if (next.has(file.id)) {
          next.delete(file.id);
        } else {
          // Проверяем лимит
          if (next.size >= MAX_SELECTED_FILES) {
            hapticFeedback.warning();
            return prev;
          }
          next.add(file.id);
        }
        return next;
      });
    } else {
      // Обычный режим - отправляем один файл через API
      try {
        await apiClient.sendFile(file.id);
        hapticFeedback.success();
        close();
      } catch (error) {
        console.error('Error sending file:', error);
        hapticFeedback.error();
      }
    }
  }, [hapticFeedback, isSelectionMode, close]);

  // Handle long press - включает режим выбора
  const handleFileLongPress = useCallback((file: FileRecord) => {
    hapticFeedback.medium();
    setIsSelectionMode(true);
    setSelectedFiles(new Set([file.id]));
  }, [hapticFeedback]);

  // Выход из режима выбора
  const exitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedFiles(new Set());
    mainButton.hide();
  }, [mainButton]);

  // Handle link click
  const handleLinkClick = useCallback((link: LinkRecord) => {
    hapticFeedback.light();
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
        {isSelectionMode ? (
          <div className={styles.selectionHeader}>
            <button onClick={exitSelectionMode} className={styles.cancelBtn}>✕</button>
            <span>Выбрано: {selectedFiles.size}</span>
          </div>
        ) : (
          <>
            <h1 className={styles.title}>T-Cloud</h1>
            <SearchBar
              value={searchInput}
              onChange={setSearchInput}
              placeholder="Искать по имени, подписи..."
            />
          </>
        )}
      </header>

      {/* Category chips */}
      {!isSelectionMode && (
        <CategoryChips
          stats={stats}
          selectedType={selectedType}
          onSelect={(type) => {
            hapticFeedback.selection();
            filterByType(type);
          }}
        />
      )}

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
        ) : searchInput ? (
          /* При поиске показываем обычную сетку с результатами */
          <FileGrid
            files={files}
            onFileClick={handleFileClick}
            onFileLongPress={handleFileLongPress}
            selectedFiles={selectedFiles}
            isSelectionMode={isSelectionMode}
            searchQuery={searchInput}
          />
        ) : (
          /* По умолчанию - Timeline с группировкой по датам */
          <Timeline
            files={files}
            onFileClick={handleFileClick}
            onFileLongPress={handleFileLongPress}
            selectedFiles={selectedFiles}
            isSelectionMode={isSelectionMode}
          />
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
