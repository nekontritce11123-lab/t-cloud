import { useEffect, useState, useCallback } from 'react';
import { useTelegram } from './hooks/useTelegram';
import { useFiles } from './hooks/useFiles';
import { apiClient, FileRecord, LinkRecord } from './api/client';
import { CategoryChips } from './components/CategoryChips/CategoryChips';
import { SearchBar } from './components/SearchBar/SearchBar';
import { FileGrid } from './components/FileGrid/FileGrid';
import { Timeline } from './components/Timeline/Timeline';
import { LinkList } from './components/LinkCard/LinkCard';
import { TrashView } from './components/TrashView/TrashView';
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
    trashCount,
    isLoading,
    error,
    selectedType,
    searchQuery,
    hasMore,
    filterByType,
    search,
    loadMore,
    refresh,
  } = useFiles(apiReady);

  const [searchInput, setSearchInput] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
  const [selectedLinks, setSelectedLinks] = useState<Set<number>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectionType, setSelectionType] = useState<'files' | 'links'>('files');
  const [isDeleting, setIsDeleting] = useState(false);

  // Лимит на выбор
  const MAX_SELECTED_ITEMS = 20;

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
    // Если searchInput пустой - сбрасываем поиск сразу без debounce
    if (!searchInput) {
      search('');
      return;
    }

    const timer = setTimeout(() => {
      search(searchInput);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput, search]);

  // Управление главной кнопкой
  useEffect(() => {
    const filesCount = selectedFiles.size;
    const linksCount = selectedLinks.size;
    const totalCount = filesCount + linksCount;

    if (totalCount > 0) {
      if (selectionType === 'files' && filesCount > 0) {
        // Для файлов показываем кнопку "Отправить"
        mainButton.show(
          `Отправить (${filesCount})`,
          handleSendSelected
        );
      } else if (selectionType === 'links' && linksCount > 0) {
        // Для ссылок показываем кнопку "Удалить"
        mainButton.show(
          `Удалить (${linksCount})`,
          handleDeleteSelected
        );
      }
    } else {
      mainButton.hide();
    }
  }, [selectedFiles.size, selectedLinks.size, selectionType]);

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

  // Удалить выбранные элементы
  const handleDeleteSelected = useCallback(async () => {
    if (isDeleting) return;

    const filesCount = selectedFiles.size;
    const linksCount = selectedLinks.size;

    if (filesCount === 0 && linksCount === 0) return;

    setIsDeleting(true);
    hapticFeedback.medium();

    try {
      // Удаляем файлы
      if (filesCount > 0) {
        const fileIds = Array.from(selectedFiles);
        await apiClient.deleteFiles(fileIds);
      }

      // Удаляем ссылки
      if (linksCount > 0) {
        const linkIds = Array.from(selectedLinks);
        await apiClient.deleteLinks(linkIds);
      }

      hapticFeedback.success();

      // Выход из режима выбора
      setIsSelectionMode(false);
      setSelectedFiles(new Set());
      setSelectedLinks(new Set());
      mainButton.hide();

      // Обновляем данные
      refresh();
    } catch (error) {
      console.error('Error deleting items:', error);
      hapticFeedback.error();
    } finally {
      setIsDeleting(false);
    }
  }, [selectedFiles, selectedLinks, isDeleting, hapticFeedback, mainButton, refresh]);

  // Handle file click - обычное нажатие отправляет один файл
  const handleFileClick = useCallback(async (file: FileRecord) => {
    hapticFeedback.light();

    if (isSelectionMode && selectionType === 'files') {
      // В режиме выбора - toggle выбор
      setSelectedFiles(prev => {
        const next = new Set(prev);
        if (next.has(file.id)) {
          next.delete(file.id);
        } else {
          // Проверяем лимит
          if (next.size >= MAX_SELECTED_ITEMS) {
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
  }, [hapticFeedback, isSelectionMode, selectionType, close]);

  // Handle long press - включает режим выбора файлов
  const handleFileLongPress = useCallback((file: FileRecord) => {
    hapticFeedback.medium();
    setIsSelectionMode(true);
    setSelectionType('files');
    setSelectedFiles(new Set([file.id]));
    setSelectedLinks(new Set());
  }, [hapticFeedback]);

  // Handle link click
  const handleLinkClick = useCallback((link: LinkRecord) => {
    hapticFeedback.light();

    if (isSelectionMode && selectionType === 'links') {
      // В режиме выбора - toggle выбор
      setSelectedLinks(prev => {
        const next = new Set(prev);
        if (next.has(link.id)) {
          next.delete(link.id);
        } else {
          // Проверяем лимит
          if (next.size >= MAX_SELECTED_ITEMS) {
            hapticFeedback.warning();
            return prev;
          }
          next.add(link.id);
        }
        return next;
      });
    } else {
      // Обычный режим - открываем ссылку
      window.open(link.url, '_blank');
    }
  }, [hapticFeedback, isSelectionMode, selectionType]);

  // Handle long press on link - включает режим выбора ссылок
  const handleLinkLongPress = useCallback((link: LinkRecord) => {
    hapticFeedback.medium();
    setIsSelectionMode(true);
    setSelectionType('links');
    setSelectedLinks(new Set([link.id]));
    setSelectedFiles(new Set());
  }, [hapticFeedback]);

  // Выход из режима выбора
  const exitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedFiles(new Set());
    setSelectedLinks(new Set());
    mainButton.hide();
  }, [mainButton]);

  // Handle scroll for infinite loading
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const bottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 100;
    if (bottom && hasMore && !isLoading) {
      loadMore();
    }
  }, [hasMore, isLoading, loadMore]);

  // Подсказка для поиска (из первого результата)
  const searchHint = searchQuery && files.length > 0 && files[0].matchedField && files[0].matchedSnippet
    ? { field: files[0].matchedField, snippet: files[0].matchedSnippet }
    : searchQuery && links.length > 0 && links[0].matchedField && links[0].matchedSnippet
    ? { field: links[0].matchedField, snippet: links[0].matchedSnippet }
    : null;

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
            <span>Выбрано: {selectionType === 'files' ? selectedFiles.size : selectedLinks.size}</span>
            {selectionType === 'files' && selectedFiles.size > 0 && (
              <button onClick={handleDeleteSelected} className={styles.deleteBtn}>🗑️</button>
            )}
          </div>
        ) : (
          <>
            <h1 className={styles.title}>T-Cloud</h1>
            <SearchBar
              value={searchInput}
              onChange={setSearchInput}
              placeholder="Искать по имени, подписи..."
              hint={searchHint}
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
          trashCount={trashCount}
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

        {/* Показываем спиннер при загрузке если нет файлов */}
        {isLoading && files.length === 0 && links.length === 0 && selectedType !== 'trash' ? (
          <div className={styles.loadingMore}>
            <div className="spinner" />
          </div>
        ) : selectedType === 'trash' ? (
          <TrashView
            onRestore={refresh}
            hapticFeedback={hapticFeedback}
          />
        ) : selectedType === 'link' ? (
          <LinkList
            links={links}
            onLinkClick={handleLinkClick}
            onLinkLongPress={handleLinkLongPress}
            selectedLinks={selectedLinks}
            isSelectionMode={isSelectionMode && selectionType === 'links'}
          />
        ) : searchQuery ? (
          /* При поиске показываем файлы и ссылки */
          <>
            {files.length > 0 && (
              <FileGrid
                files={files}
                onFileClick={handleFileClick}
                onFileLongPress={handleFileLongPress}
                selectedFiles={selectedFiles}
                isSelectionMode={isSelectionMode}
                searchQuery={searchQuery}
              />
            )}
            {links.length > 0 && (
              <LinkList
                links={links}
                onLinkClick={handleLinkClick}
                onLinkLongPress={handleLinkLongPress}
                selectedLinks={selectedLinks}
                isSelectionMode={isSelectionMode && selectionType === 'links'}
              />
            )}
            {files.length === 0 && links.length === 0 && !isLoading && (
              <div className={styles.empty}>
                <span className={styles.emptyIcon}>🔍</span>
                <p>Ничего не найдено</p>
                <p className={styles.emptyHint}>По запросу "{searchQuery}" ничего не найдено</p>
              </div>
            )}
          </>
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

        {/* Loading indicator for pagination */}
        {isLoading && files.length > 0 && (
          <div className={styles.loadingMore}>
            <div className="spinner" />
          </div>
        )}

        {/* End of list */}
        {!isLoading && !hasMore && selectedType !== 'trash' && (files.length > 0 || links.length > 0) && (
          <div className={styles.endOfList}>
            Это все файлы
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
