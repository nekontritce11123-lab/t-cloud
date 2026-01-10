import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useTelegram } from './hooks/useTelegram';
import { useFiles } from './hooks/useFiles';
import { useSearchHistory } from './hooks/useSearchHistory';
import { useAutocomplete } from './hooks/useAutocomplete';
import { parseSearchInput, tagsToQueryParams, SearchTag } from './utils/searchTagParser';
import { toggleInSet } from './shared/utils';
import { formatFileSize } from './shared/formatters';
import { COOLDOWN_MS } from './constants/config';
import { apiClient, FileRecord, LinkRecord } from './api/client';
import { CategoryChips } from './components/CategoryChips/CategoryChips';
import { SearchBar } from './components/SearchBar/SearchBar';
import { FileGrid } from './components/FileGrid/FileGrid';
import { Timeline } from './components/Timeline/Timeline';
import { LinkList } from './components/LinkCard/LinkCard';
import { TrashView } from './components/TrashView/TrashView';
import { FileViewer } from './components/FileViewer/FileViewer';
import { StatsSheet } from './components/StatsSheet';
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
    sharedCount,
    linksCount,
    isLoading,
    error,
    selectedType,
    searchQuery,
    filterByType,
    search,
    clearSearch,
    refresh,
  } = useFiles(apiReady);

  // История поиска
  const { history: searchHistory, addToHistory, removeFromHistory, clearHistory } = useSearchHistory();

  // Autocomplete (мгновенные подсказки из словаря) - загружается ПОСЛЕ авторизации
  // Словарь перезагружается при смене секции для релевантных подсказок
  const { suggestions, search: autocompleteSearch, clear: clearSuggestions } = useAutocomplete(apiReady, selectedType);

  // Локальное состояние для инпута (для отзывчивости при вводе)
  const [searchInput, setSearchInput] = useState('');
  const [searchTags, setSearchTags] = useState<SearchTag[]>([]);
  const [senders, setSenders] = useState<{ names: string[]; chats: string[] }>({ names: [], chats: [] });
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Ref для актуального значения searchTags - избегаем stale closure в debounce
  const searchTagsRef = useRef<SearchTag[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
  const [selectedLinks, setSelectedLinks] = useState<Set<number>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectionType, setSelectionType] = useState<'files' | 'links'>('files');
  const [isDeleting, setIsDeleting] = useState(false);
  const [sentFiles, setSentFiles] = useState<Record<number, number>>({});
  const [sendingFileId, setSendingFileId] = useState<number | null>(null); // Защита от двойного клика
  const [viewingFileIndex, setViewingFileIndex] = useState<number | null>(null); // Индекс файла для просмотра
  const [isStatsOpen, setIsStatsOpen] = useState(false); // Stats sheet открыт
  const contentRef = useRef<HTMLElement>(null); // Ref для scroll контейнера (используется в Timeline для auto-scroll)

  // Вычисляем viewingFile из индекса
  const viewingFile = viewingFileIndex !== null ? files[viewingFileIndex] : null;

  // Статистика для stats bar
  const totalFiles = files.length;
  const totalSize = useMemo(() =>
    files.reduce((sum, f) => sum + (f.fileSize ?? 0), 0),
    [files]
  );

  // Навигация в FileViewer
  const hasPrev = viewingFileIndex !== null && viewingFileIndex > 0;
  const hasNext = viewingFileIndex !== null && viewingFileIndex < files.length - 1;
  const positionLabel = viewingFileIndex !== null && files.length > 1
    ? `${viewingFileIndex + 1} из ${files.length}`
    : '';

  // Соседние файлы для carousel-анимации
  const prevFile = viewingFileIndex !== null && viewingFileIndex > 0
    ? files[viewingFileIndex - 1]
    : undefined;
  const nextFile = viewingFileIndex !== null && viewingFileIndex < files.length - 1
    ? files[viewingFileIndex + 1]
    : undefined;

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

  // Глобальная блокировка контекстного меню на карточках (capture phase)
  useEffect(() => {
    const blockContextMenu = (e: Event) => {
      const target = e.target as HTMLElement;
      // Блокируем только на карточках файлов и кнопках
      if (target.closest('[data-file-id]') || target.closest('button')) {
        e.preventDefault();
        return false;
      }
    };
    document.addEventListener('contextmenu', blockContextMenu, true);
    return () => document.removeEventListener('contextmenu', blockContextMenu, true);
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

  // Загрузка списка отправителей для автодополнения
  useEffect(() => {
    if (apiReady) {
      apiClient.getSenders()
        .then(setSenders)
        .catch(err => console.error('Failed to load senders:', err));
    }
  }, [apiReady]);

  // Синхронизируем ref с state для использования в debounce (избегаем stale closure)
  useEffect(() => {
    searchTagsRef.current = searchTags;
  }, [searchTags]);

  // Конвертирует теги в фильтры для API
  const getFiltersFromTags = useCallback((tags: SearchTag[]) => {
    if (tags.length === 0) return undefined;
    const params = tagsToQueryParams(tags);
    // Конвертируем строковые значения в нужные типы
    return {
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      sizeMin: params.sizeMin ? parseInt(params.sizeMin, 10) : undefined,
      sizeMax: params.sizeMax ? parseInt(params.sizeMax, 10) : undefined,
      from: params.from,
      chat: params.chat,
    };
  }, []);

  // Обработчик ввода с debounce и парсингом тегов
  const handleSearchChange = useCallback((value: string) => {
    // Парсим теги только из завершённых слов (заканчивающихся пробелом)
    // Это предотвращает преждевременное создание тегов при вводе "1" -> "1MB"
    const endsWithSpace = value.endsWith(' ');

    if (endsWithSpace && value.trim()) {
      // Парсим только если ввод заканчивается пробелом
      const parsed = parseSearchInput(value.trim());

      if (parsed.tags.length > 0) {
        // Добавляем найденные теги
        const newTags = [...searchTags, ...parsed.tags];
        setSearchTags(newTags);
        // Оставляем только текст (без пробела в конце)
        setSearchInput(parsed.text);

        // Очищаем предыдущий таймер
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }

        // Сразу ищем с фильтрами
        debounceTimerRef.current = setTimeout(() => {
          const filters = getFiltersFromTags(newTags);
          if (parsed.text.trim() === '' && newTags.length === 0) {
            clearSearch();
          } else {
            search(parsed.text, filters);
          }
        }, 300);
        return;
      }
    }

    // Обычный ввод без создания тегов
    setSearchInput(value);

    // Мгновенный autocomplete (локально, <1ms)
    if (value.trim()) {
      autocompleteSearch(value);
    } else {
      clearSuggestions();
    }

    // Очищаем предыдущий таймер
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce для поиска с текущими тегами (400ms)
    // Используем searchTagsRef.current чтобы избежать stale closure
    debounceTimerRef.current = setTimeout(() => {
      const currentTags = searchTagsRef.current;
      const filters = getFiltersFromTags(currentTags);
      if (value.trim() === '' && currentTags.length === 0) {
        clearSearch();
      } else {
        search(value, filters);
      }
    }, 400);
  }, [search, clearSearch, getFiltersFromTags, autocompleteSearch, clearSuggestions]); // searchTags убран - используем ref

  // Удаление тега - перезапускаем поиск с оставшимися тегами
  const handleTagRemove = useCallback((tagId: string) => {
    // Отменяем pending debounce чтобы старый поиск не перезатёр результат
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Вычисляем новые теги
    const newTags = searchTags.filter(t => t.id !== tagId);
    setSearchTags(newTags);

    // Запускаем поиск ПОСЛЕ setState (не внутри callback)
    const filters = getFiltersFromTags(newTags);
    if (searchInput.trim() === '' && newTags.length === 0) {
      clearSearch();
    } else {
      search(searchInput, filters);
    }
  }, [searchInput, searchTags, search, clearSearch, getFiltersFromTags]);

  // Создание тега напрямую (для автодополнения с пробелами в имени)
  // cleanedText - текст БЕЗ "от:/из:" префикса, переданный из SearchBar
  const handleCreateTag = useCallback((type: 'from' | 'chat', value: string, cleanedText: string) => {
    // Отменяем pending debounce чтобы избежать race condition
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const newTag: SearchTag = {
      id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      label: type === 'from' ? `От: ${value}` : `Из: ${value}`,
      value,
      raw: `${type === 'from' ? 'от' : 'из'}:${value}`,
    };

    // Очищаем инпут от "от:..." или "из:..."
    setSearchInput(cleanedText);

    // Вычисляем новые теги
    const newTags = [...searchTags, newTag];
    setSearchTags(newTags);

    // Запускаем поиск ПОСЛЕ setState (не внутри callback)
    const filters = getFiltersFromTags(newTags);
    search(cleanedText, filters);
  }, [search, searchTags, getFiltersFromTags]);

  // Мгновенная очистка поиска по крестику (сохраняем в историю)
  const handleClearSearch = useCallback(() => {
    // Сохраняем текущий запрос в историю перед очисткой
    if (searchInput.trim().length >= 2) {
      addToHistory(searchInput.trim());
    }
    // Очищаем таймер debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setSearchInput('');
    setSearchTags([]);
    clearSearch();
    clearSuggestions();
  }, [clearSearch, searchInput, addToHistory, clearSuggestions]);

  // Обработчик выбора подсказки autocomplete
  const handleSuggestionSelect = useCallback((word: string) => {
    // Заменяем последнее слово и сразу ищем
    const words = searchInput.split(/\s+/);
    words[words.length - 1] = word;
    const newQuery = words.join(' ');

    setSearchInput(newQuery);
    clearSuggestions();

    // Сразу запускаем поиск
    const currentTags = searchTagsRef.current;
    const filters = getFiltersFromTags(currentTags);
    search(newQuery, filters);
    addToHistory(newQuery);
  }, [searchInput, search, addToHistory, clearSuggestions, getFiltersFromTags]);

  // Управление главной кнопкой (только для отправки файлов)
  useEffect(() => {
    const filesCount = selectedFiles.size;

    // mainButton только для отправки файлов, удаление через кнопку корзины сверху
    if (selectionType === 'files' && filesCount > 0) {
      mainButton.show(
        `Отправить (${filesCount})`,
        handleSendSelected
      );
    } else {
      mainButton.hide();
    }
  }, [selectedFiles.size, selectionType]);

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

    try {
      const result = await apiClient.sendFiles(fileIds);

      // Маркируем ТОЛЬКО успешно отправленные
      if (result.sent && result.sent.length > 0) {
        markAsSent(result.sent);
        hapticFeedback.success();
      }

      // Проверяем на VOICE_MESSAGES_FORBIDDEN (кружки/голосовые)
      if (result.errors?.some(e => e.includes('VOICE_FORBIDDEN'))) {
        alert('Не удалось отправить кружок/голосовое.\n\nВключите в настройках Telegram:\nКонфиденциальность → Голосовые сообщения → Все');
      } else if (result.errors && result.errors.length > 0) {
        // Логируем другие ошибки
        console.warn('[App] Some files failed to send:', result.errors);
      }

      // Выход из режима выбора если хоть что-то отправилось
      if (result.sent && result.sent.length > 0) {
        setIsSelectionMode(false);
        setSelectedFiles(new Set());
        mainButton.hide();
      } else {
        // Ничего не отправилось - показываем ошибку
        hapticFeedback.error();
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
      setSelectedFiles(prev => toggleInSet(prev, file.id));
    } else {
      // Обычный режим - открываем просмотр файла по индексу
      const index = files.findIndex(f => f.id === file.id);
      setViewingFileIndex(index >= 0 ? index : null);
    }
  }, [hapticFeedback, isSelectionMode, selectionType, files]);

  // Навигация в FileViewer
  const handleViewerNavigate = useCallback((direction: 'prev' | 'next') => {
    if (viewingFileIndex === null) return;
    const newIndex = direction === 'prev'
      ? Math.max(0, viewingFileIndex - 1)
      : Math.min(files.length - 1, viewingFileIndex + 1);
    setViewingFileIndex(newIndex);
  }, [viewingFileIndex, files.length]);

  // Handlers для StatsSheet
  const handleCategoryClick = useCallback((category: string) => {
    setIsStatsOpen(false);
    filterByType(category as any);
  }, [filterByType]);

  const handleSourceClick = useCallback((source: string) => {
    setIsStatsOpen(false);
    setSearchInput(`от:${source}`);
    search(`от:${source}`);
  }, [search]);

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
      setViewingFileIndex(null); // Закрываем просмотр после отправки
    } catch (error) {
      console.error('Error sending file:', error);
      hapticFeedback.error();
      // Показываем сообщение об ошибке
      const errMsg = (error as Error).message;
      let message: string;
      if (errMsg === 'FILE_UNAVAILABLE') {
        message = 'Файл недоступен';
      } else if (errMsg === 'VOICE_FORBIDDEN') {
        message = 'Не удалось отправить кружок/голосовое.\n\nВключите в настройках Telegram:\nКонфиденциальность → Голосовые сообщения → Все';
      } else {
        message = 'Не удалось отправить файл';
      }
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
      setSelectedLinks(prev => toggleInSet(prev, link.id));
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

  // Выбрать range файлов (для drag selection) - ДОБАВЛЯЕТ к существующему выделению
  const handleSelectRange = useCallback((fileIds: number[]) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      for (const id of fileIds) {
        next.add(id);
      }
      return next;
    });
  }, []);

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
      {/* Stats Badge - fixed position */}
      <div
        className={styles.statsBar}
        onClick={() => setIsStatsOpen(true)}
        onDoubleClick={clearCooldown}
        title="Double-click to reset cooldown"
      >
        {isLoading ? '-- • --' : `${totalFiles} • ${formatFileSize(totalSize)}`}
      </div>

      {/* Header */}
      <header className={styles.header}>
        <SearchBar
          value={searchInput}
          onChange={handleSearchChange}
          onClear={handleClearSearch}
          onSearch={addToHistory}
          placeholder="Имя, подпись, сегодня, .pdf..."
          history={searchHistory}
          onHistorySelect={addToHistory}
          onHistoryRemove={removeFromHistory}
          onHistoryClear={clearHistory}
          tags={searchTags}
          onTagRemove={handleTagRemove}
          onCreateTag={handleCreateTag}
          senders={senders}
          suggestions={suggestions}
          onSuggestionSelect={handleSuggestionSelect}
        />
      </header>

      {/* CategoryChips */}
      <CategoryChips
        stats={stats}
        selectedType={selectedType}
        onSelect={(type) => {
          hapticFeedback.selection();
          filterByType(type);
        }}
        trashCount={trashCount}
        sharedCount={sharedCount}
        linksCount={linksCount}
        disabledTypes={isSelectionMode ? (selectedType === 'trash' ? 'not-trash' : 'trash') : undefined}
      />

      {/* Selection header - только для НЕ-trash секций */}
      {isSelectionMode && selectedType !== 'trash' && (
        <div className={styles.selectionHeader}>
          <button onClick={exitSelectionMode} className={styles.cancelBtn}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
          <span className={styles.selectionCount}>Выбрано: {selectionType === 'files' ? selectedFiles.size : selectedLinks.size}</span>
          <div className={styles.selectionActions}>
            {((selectionType === 'files' && selectedFiles.size > 0) ||
              (selectionType === 'links' && selectedLinks.size > 0)) && (
              <button onClick={handleDeleteSelected} className={styles.deleteBtn} disabled={isDeleting}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <main className={styles.content} ref={contentRef}>
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
            searchQuery={searchQuery}
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
        ) : selectedType === 'shared' ? (
          files.length > 0 ? (
            <FileGrid
              files={files}
              onFileClick={handleFileClick}
              onFileLongPress={handleFileLongPress}
              selectedFiles={selectedFiles}
              isSelectionMode={isSelectionMode}
              searchQuery=""
              isOnCooldown={isOnCooldown}
            />
          ) : isLoading ? (
            <div className={styles.loadingMore}>
              <div className="spinner" />
            </div>
          ) : (
            <div className={styles.empty}>
              <div className={styles.emptyIconWrapper}>
                <svg className={styles.emptySearchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
              </div>
              <h3 className={styles.emptyTitle}>Нет общих файлов</h3>
              <p className={styles.emptyHint}>Здесь будут файлы, которыми вы поделились</p>
            </div>
          )
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
                <div className={styles.emptyIconWrapper}>
                  <svg className={styles.emptySearchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                </div>
                <h3 className={styles.emptyTitle}>Ничего не найдено</h3>
                <p className={styles.emptyQuery}>«{searchQuery}»</p>
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
            onSelectRange={handleSelectRange}
            hapticFeedback={hapticFeedback}
            scrollContainerRef={contentRef}
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
          prevFile={prevFile}
          nextFile={nextFile}
          hasPrev={hasPrev}
          hasNext={hasNext}
          positionLabel={positionLabel}
          onNavigate={handleViewerNavigate}
          onClose={() => setViewingFileIndex(null)}
          onSend={handleSendFromViewer}
          isOnCooldown={isOnCooldown(viewingFile.id)}
          isSending={sendingFileId === viewingFile.id}
          searchQuery={searchQuery}
        />
      )}

      {/* StatsSheet modal */}
      <StatsSheet
        isOpen={isStatsOpen}
        onClose={() => setIsStatsOpen(false)}
        files={files}
        stats={stats}
        trashCount={trashCount}
        onCategoryClick={handleCategoryClick}
        onSourceClick={handleSourceClick}
      />
    </div>
  );
}

export default App;
