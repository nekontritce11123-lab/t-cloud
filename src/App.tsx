import { useEffect, useState, useCallback, useRef } from 'react';
import { useTelegram } from './hooks/useTelegram';
import { useFiles } from './hooks/useFiles';
import { apiClient, FileRecord, LinkRecord } from './api/client';
import { CategoryChips } from './components/CategoryChips/CategoryChips';
import { SearchBar } from './components/SearchBar/SearchBar';
import { FileGrid } from './components/FileGrid/FileGrid';
import { Timeline } from './components/Timeline/Timeline';
import { LinkList } from './components/LinkCard/LinkCard';
import { TrashView } from './components/TrashView/TrashView';
import { FileViewer } from './components/FileViewer/FileViewer';
import './styles/global.css';
import styles from './App.module.css';

function App() {
  const { isReady, getInitData, hapticFeedback, mainButton } = useTelegram();
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
    filterByType,
    search,
    clearSearch,
    refresh,
  } = useFiles(apiReady);

  // Локальное состояние для инпута (для отзывчивости при вводе)
  const [searchInput, setSearchInput] = useState('');
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
  const [selectedLinks, setSelectedLinks] = useState<Set<number>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectionType, setSelectionType] = useState<'files' | 'links'>('files');
  const [isDeleting, setIsDeleting] = useState(false);
  const [sentFiles, setSentFiles] = useState<Record<number, number>>({});
  const [sendingFileId, setSendingFileId] = useState<number | null>(null); // Защита от двойного клика
  const [viewingFile, setViewingFile] = useState<FileRecord | null>(null); // Файл для просмотра

  const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 часа

  // Загрузка cooldown из localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('t-cloud-sent-files');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Очищаем старые записи (> 24 часов)
        const now = Date.now();
        const cleaned: Record<number, number> = {};
        for (const [id, timestamp] of Object.entries(parsed)) {
          if (now - (timestamp as number) < COOLDOWN_MS) {
            cleaned[parseInt(id)] = timestamp as number;
          }
        }
        setSentFiles(cleaned);
      }
    } catch (e) {
      console.error('Error loading sent files:', e);
    }
  }, []);

  // Проверка cooldown
  const isOnCooldown = useCallback((fileId: number): boolean => {
    const sentAt = sentFiles[fileId];
    if (!sentAt) return false;
    return Date.now() - sentAt < COOLDOWN_MS;
  }, [sentFiles]);

  // Маркировка файла(ов) как отправленного
  const markAsSent = useCallback((fileIds: number | number[]) => {
    const ids = Array.isArray(fileIds) ? fileIds : [fileIds];
    const now = Date.now();

    setSentFiles(prev => {
      const newSentFiles = { ...prev };
      for (const id of ids) {
        newSentFiles[id] = now;
      }
      try {
        localStorage.setItem('t-cloud-sent-files', JSON.stringify(newSentFiles));
      } catch (e) {
        console.error('Error saving sent files:', e);
      }
      return newSentFiles;
    });
  }, []);

  // Очистка cooldown (для отладки)
  const clearCooldown = useCallback(() => {
    setSentFiles({});
    localStorage.removeItem('t-cloud-sent-files');
  }, []);

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

  // Обработчик ввода с debounce
  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);

    // Очищаем предыдущий таймер
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce для поиска
    debounceTimerRef.current = setTimeout(() => {
      if (value.trim() === '') {
        // При пустом значении используем clearSearch чтобы избежать race condition
        clearSearch();
      } else {
        search(value);
      }
    }, 300);
  }, [search, clearSearch]);

  // Мгновенная очистка поиска
  const handleClearSearch = useCallback(() => {
    // Очищаем таймер debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setSearchInput('');
    clearSearch();
  }, [clearSearch]);

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

    // Фильтруем файлы на cooldown
    const fileIds = Array.from(selectedFiles).filter(id => !isOnCooldown(id));

    if (fileIds.length === 0) {
      hapticFeedback.warning();
      return;
    }

    setIsSending(true);
    hapticFeedback.success();

    try {
      const result = await apiClient.sendFiles(fileIds);

      if (result.success) {
        // Маркируем все как отправленные одним вызовом
        markAsSent(result.sent || fileIds);

        // Выход из режима выбора
        setIsSelectionMode(false);
        setSelectedFiles(new Set());
        mainButton.hide();
        // НЕ закрываем приложение
      }
    } catch (error) {
      console.error('Error sending files:', error);
      hapticFeedback.error();
    } finally {
      setIsSending(false);
    }
  }, [selectedFiles, isSending, hapticFeedback, mainButton, isOnCooldown, markAsSent]);

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

  // Handle file click - открываем FileViewer для просмотра
  const handleFileClick = useCallback((file: FileRecord) => {
    hapticFeedback.light();

    if (isSelectionMode && selectionType === 'files') {
      // В режиме выбора - toggle выбор
      setSelectedFiles(prev => {
        const next = new Set(prev);
        if (next.has(file.id)) {
          next.delete(file.id);
        } else {
          next.add(file.id);
        }
        return next;
      });
    } else {
      // Обычный режим - открываем просмотр файла
      setViewingFile(file);
    }
  }, [hapticFeedback, isSelectionMode, selectionType]);

  // Отправить файл из FileViewer
  const handleSendFromViewer = useCallback(async (file: FileRecord) => {
    if (isOnCooldown(file.id)) {
      hapticFeedback.warning();
      return;
    }

    // Защита от двойного клика
    if (sendingFileId !== null) {
      return;
    }

    setSendingFileId(file.id);

    try {
      await apiClient.sendFile(file.id);
      markAsSent(file.id);
      hapticFeedback.success();
      setViewingFile(null); // Закрываем просмотр после отправки
    } catch (error) {
      console.error('Error sending file:', error);
      hapticFeedback.error();
      // Показываем сообщение об ошибке
      const message = (error as Error).message === 'FILE_UNAVAILABLE'
        ? 'Файл недоступен'
        : 'Не удалось отправить файл';
      alert(message);
    } finally {
      setSendingFileId(null);
    }
  }, [hapticFeedback, isOnCooldown, markAsSent, sendingFileId]);

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

  // Выбрать/снять все файлы за день
  const handleSelectDay = useCallback((filesToSelect: FileRecord[], action: 'add' | 'remove') => {
    hapticFeedback.selection();
    setSelectedFiles(prev => {
      const next = new Set(prev);
      for (const file of filesToSelect) {
        if (action === 'add') {
          next.add(file.id);
        } else {
          next.delete(file.id);
        }
      }
      return next;
    });
  }, [hapticFeedback]);

  // Toggle одного файла (для drag selection)
  const handleToggleFile = useCallback((file: FileRecord) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(file.id)) {
        next.delete(file.id);
      } else {
        next.add(file.id);
      }
      return next;
    });
  }, []);

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
              <button onClick={handleDeleteSelected} className={styles.deleteBtn}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            )}
          </div>
        ) : (
          <>
            <h1
              className={styles.title}
              onDoubleClick={clearCooldown}
              title="Double-click to reset cooldown"
            >
              T-Cloud
            </h1>
            <SearchBar
              value={searchInput}
              onChange={handleSearchChange}
              onClear={handleClearSearch}
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
      <main className={styles.content}>
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
            {/* Спиннер при загрузке поиска */}
            {isLoading && files.length === 0 && links.length === 0 && (
              <div className={styles.loadingMore}>
                <div className="spinner" />
              </div>
            )}
            {files.length > 0 && (
              <FileGrid
                files={files}
                onFileClick={handleFileClick}
                onFileLongPress={handleFileLongPress}
                selectedFiles={selectedFiles}
                isSelectionMode={isSelectionMode}
                searchQuery={searchQuery}
                isOnCooldown={isOnCooldown}
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
            isSelectionMode={isSelectionMode && selectionType === 'files'}
            isOnCooldown={isOnCooldown}
            onSelectDay={handleSelectDay}
            onToggleFile={handleToggleFile}
            hapticFeedback={hapticFeedback}
          />
        )}

        {/* Loading indicator for pagination */}
        {isLoading && files.length > 0 && (
          <div className={styles.loadingMore}>
            <div className="spinner" />
          </div>
        )}

        {/* End of list */}
        {!isLoading && selectedType !== 'trash' && (files.length > 0 || links.length > 0) && (
          <div className={styles.endOfList}>
            Это все файлы
          </div>
        )}
      </main>

      {/* FileViewer modal */}
      {viewingFile && (
        <FileViewer
          file={viewingFile}
          onClose={() => setViewingFile(null)}
          onSend={handleSendFromViewer}
          isOnCooldown={isOnCooldown(viewingFile.id)}
          isSending={sendingFileId === viewingFile.id}
        />
      )}
    </div>
  );
}

export default App;
