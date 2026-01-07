import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { SearchTag } from '../../utils/searchTagParser';
import styles from './SearchBar.module.css';

// SVG Search Icon (SF Symbols style)
function SearchIcon() {
  return (
    <svg
      className={styles.icon}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

// History icon
function HistoryIcon() {
  return (
    <svg
      className={styles.historyIcon}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

// Person icon for senders
function PersonIcon() {
  return (
    <svg
      className={styles.historyIcon}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M20 21a8 8 0 1 0-16 0" />
    </svg>
  );
}

// Chat icon for channels
function ChatIcon() {
  return (
    <svg
      className={styles.historyIcon}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  onSearch?: (query: string) => void;
  placeholder?: string;
  history?: string[];
  onHistorySelect?: (query: string) => void;
  onHistoryRemove?: (query: string) => void;
  onHistoryClear?: () => void;
  /** Smart tags extracted from search input */
  tags?: SearchTag[];
  onTagRemove?: (tagId: string) => void;
  /** Create a tag directly (for autocomplete). cleanedText is the input without the "от:/из:" prefix */
  onCreateTag?: (type: 'from' | 'chat', value: string, cleanedText: string) => void;
  /** Available senders for autocomplete */
  senders?: { names: string[]; chats: string[] };
  /** Word suggestions from Trie autocomplete */
  suggestions?: string[];
  /** Called when user selects a suggestion */
  onSuggestionSelect?: (word: string) => void;
}


export function SearchBar({
  value,
  onChange,
  onClear,
  onSearch,
  placeholder = 'Поиск...',
  history = [],
  onHistorySelect,
  onHistoryRemove,
  onHistoryClear,
  tags = [],
  onTagRemove,
  onCreateTag,
  senders = { names: [], chats: [] },
  suggestions = [],
  onSuggestionSelect,
}: SearchBarProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Определяем режим автодополнения: 'from' | 'chat' | null
  const autocompleteMode = useMemo(() => {
    // Проверяем последнее слово (регистронезависимо)
    const words = value.split(/\s+/);
    const lastWord = words[words.length - 1] || '';

    // Проверяем от:/from: (любой регистр)
    if (/^(от|from):/i.test(lastWord)) {
      return 'from';
    }
    // Проверяем из:/chat: (любой регистр)
    if (/^(из|chat):/i.test(lastWord)) {
      return 'chat';
    }
    return null;
  }, [value]);

  // Фильтрованные варианты для автодополнения
  const autocompleteOptions = useMemo(() => {
    if (!autocompleteMode) return [];

    const words = value.split(/\s+/);
    const lastWord = words[words.length - 1] || '';
    // Извлекаем текст после "от:" или "из:"
    const searchText = lastWord.replace(/^(от:|from:|из:|chat:)/i, '').toLowerCase();

    const items = autocompleteMode === 'from' ? senders.names : senders.chats;

    if (!searchText) return items.slice(0, 10);

    return items
      .filter(item => item.toLowerCase().includes(searchText))
      .slice(0, 10);
  }, [autocompleteMode, value, senders]);

  // Показываем dropdown автодополнения (от:/из:)
  const showAutocomplete = isFocused && autocompleteMode && autocompleteOptions.length > 0;

  // Показываем word suggestions когда есть текст и suggestions, но НЕ в режиме от:/из:
  const showSuggestions = isFocused && !autocompleteMode && value.length > 0 && suggestions.length > 0;

  // Сбрасываем выбор при изменении suggestions
  useEffect(() => {
    setSelectedSuggestionIdx(-1);
  }, [suggestions]);

  // Показываем историю когда фокус + пустое поле + нет тегов + есть история + нет автодополнения + нет suggestions
  useEffect(() => {
    setShowHistory(isFocused && !value && tags.length === 0 && history.length > 0 && !autocompleteMode && suggestions.length === 0);
  }, [isFocused, value, tags.length, history.length, autocompleteMode, suggestions.length]);

  // Показываем крестик очистки если есть текст или теги
  const showClear = value || tags.length > 0;

  // Закрываем при клике вне
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside, { passive: true });
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClear = useCallback(() => {
    if (onClear) {
      onClear();
    } else {
      onChange('');
    }
  }, [onChange, onClear]);

  const handleHistorySelect = useCallback((query: string) => {
    onChange(query);
    setShowHistory(false);
    onHistorySelect?.(query);
    onSearch?.(query);
  }, [onChange, onHistorySelect, onSearch]);

  const handleHistoryRemove = useCallback((e: React.MouseEvent, query: string) => {
    e.stopPropagation();
    onHistoryRemove?.(query);
  }, [onHistoryRemove]);

  // Выбор из автодополнения - создаём тег напрямую
  const handleAutocompleteSelect = useCallback((item: string) => {
    if (onCreateTag && autocompleteMode) {
      // Убираем "от:" или "из:" из инпута ПЕРЕД созданием тега
      const words = value.split(/\s+/);
      words.pop(); // Убираем неполное слово (от:... или из:...)
      const cleanedText = words.join(' ');

      // Создаём тег с очищенным текстом
      // НЕ вызываем onChange - handleCreateTag уже делает setSearchInput(cleanedText)
      // Двойной вызов создаёт race condition с debounce
      onCreateTag(autocompleteMode, item, cleanedText);
    }
  }, [value, autocompleteMode, onCreateTag]);

  // Выбор word suggestion - заменяем последнее слово
  const handleSuggestionSelect = useCallback((word: string) => {
    const words = value.split(/\s+/);
    words[words.length - 1] = word;
    const newValue = words.join(' ');
    onChange(newValue);
    onSuggestionSelect?.(word);
  }, [value, onChange, onSuggestionSelect]);

  // Обработка клавиатуры для навигации по suggestions
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedSuggestionIdx(i => Math.min(i + 1, suggestions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedSuggestionIdx(i => Math.max(i - 1, -1));
        break;
      case 'Enter':
        if (selectedSuggestionIdx >= 0) {
          e.preventDefault();
          handleSuggestionSelect(suggestions[selectedSuggestionIdx]);
        }
        break;
      case 'Escape':
        setSelectedSuggestionIdx(-1);
        break;
    }
  }, [showSuggestions, suggestions, selectedSuggestionIdx, handleSuggestionSelect]);

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <div className={`${styles.container} ${isFocused ? styles.focused : ''}`}>
        <SearchIcon />
        <div className={styles.inputWrapper}>
          {tags.map(tag => (
            <span
              key={tag.id}
              className={styles.tag}
              onClick={() => onTagRemove?.(tag.id)}
            >
              {tag.label}
              <span className={styles.tagClose}>✕</span>
            </span>
          ))}
          <input
            type="text"
            className={styles.input}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 150)}
            onKeyDown={handleKeyDown}
            placeholder={tags.length > 0 ? '' : placeholder}
          />
        </div>
        {showClear && (
          <button
            type="button"
            className={styles.clear}
            onClick={handleClear}
            onMouseDown={(e) => e.preventDefault()}
          >
            ✕
          </button>
        )}
      </div>

      {/* Word suggestions (autocomplete из словаря) */}
      {showSuggestions && (
        <div className={styles.dropdown}>
          {suggestions.map((word, i) => {
            // Получаем последнее слово из ввода для подсветки
            const inputWords = value.split(/\s+/);
            const lastWord = inputWords[inputWords.length - 1].toLowerCase();
            const matchIdx = word.toLowerCase().indexOf(lastWord);

            return (
              <button
                key={word}
                className={`${styles.dropdownItem} ${i === selectedSuggestionIdx ? styles.selected : ''}`}
                onClick={() => handleSuggestionSelect(word)}
                onMouseDown={(e) => e.preventDefault()}
              >
                <SearchIcon />
                <span className={styles.dropdownText}>
                  {matchIdx >= 0 ? (
                    <>
                      {word.slice(0, matchIdx)}
                      <strong>{word.slice(matchIdx, matchIdx + lastWord.length)}</strong>
                      {word.slice(matchIdx + lastWord.length)}
                    </>
                  ) : (
                    word
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Автодополнение для от:/из: */}
      {showAutocomplete && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>
            <span className={styles.dropdownTitle}>
              {autocompleteMode === 'from' ? 'От кого' : 'Из канала'}
            </span>
          </div>
          {autocompleteOptions.map(item => (
            <button
              key={item}
              className={styles.dropdownItem}
              onClick={() => handleAutocompleteSelect(item)}
              onMouseDown={(e) => e.preventDefault()}
            >
              {autocompleteMode === 'from' ? <PersonIcon /> : <ChatIcon />}
              <span className={styles.dropdownText}>{item}</span>
            </button>
          ))}
        </div>
      )}

      {/* История поиска */}
      {showHistory && !showAutocomplete && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>
            <span className={styles.dropdownTitle}>Недавние</span>
            {onHistoryClear && (
              <button
                className={styles.dropdownClear}
                onClick={onHistoryClear}
                onMouseDown={(e) => e.preventDefault()}
              >
                Очистить
              </button>
            )}
          </div>
          {history.map(query => (
            <button
              key={query}
              className={styles.dropdownItem}
              onClick={() => handleHistorySelect(query)}
              onMouseDown={(e) => e.preventDefault()}
            >
              <HistoryIcon />
              <span className={styles.dropdownText}>{query}</span>
              {onHistoryRemove && (
                <span
                  className={styles.dropdownRemove}
                  onClick={(e) => handleHistoryRemove(e, query)}
                >
                  ✕
                </span>
              )}
            </button>
          ))}
        </div>
      )}

    </div>
  );
}
