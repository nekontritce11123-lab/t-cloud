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

interface SearchHint {
  field: string;
  snippet: string;
}

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  onSearch?: (query: string) => void;
  placeholder?: string;
  hint?: SearchHint | null;
  history?: string[];
  onHistorySelect?: (query: string) => void;
  onHistoryRemove?: (query: string) => void;
  onHistoryClear?: () => void;
  /** Smart tags extracted from search input */
  tags?: SearchTag[];
  onTagRemove?: (tagId: string) => void;
  /** Available senders for autocomplete */
  senders?: { names: string[]; chats: string[] };
}

// Форматирование snippet
function formatSnippet(snippet: string): string {
  return snippet.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}

// Описание поля
function getFieldLabel(field: string): string {
  switch (field) {
    case 'caption': return 'в подписи';
    case 'file_name': return 'в имени';
    case 'forward_from_name': return 'от';
    case 'forward_from_chat_title': return 'из чата';
    case 'url': return 'в URL';
    case 'title': return 'в заголовке';
    case 'description': return 'в описании';
    case 'site_name': return 'на сайте';
    default: return '';
  }
}

export function SearchBar({
  value,
  onChange,
  onClear,
  onSearch,
  placeholder = 'Поиск...',
  hint,
  history = [],
  onHistorySelect,
  onHistoryRemove,
  onHistoryClear,
  tags = [],
  onTagRemove,
  senders = { names: [], chats: [] },
}: SearchBarProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Определяем режим автодополнения: 'from' | 'chat' | null
  const autocompleteMode = useMemo(() => {
    const trimmed = value.trim().toLowerCase();
    // Проверяем последнее слово
    const words = value.split(/\s+/);
    const lastWord = words[words.length - 1]?.toLowerCase() || '';

    if (lastWord.startsWith('от:') || lastWord.startsWith('from:')) {
      return 'from';
    }
    if (lastWord.startsWith('из:') || lastWord.startsWith('chat:')) {
      return 'chat';
    }
    // Также показываем если просто ввели "от:" или "из:"
    if (trimmed === 'от:' || trimmed === 'from:') return 'from';
    if (trimmed === 'из:' || trimmed === 'chat:') return 'chat';
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

  // Показываем dropdown автодополнения
  const showAutocomplete = isFocused && autocompleteMode && autocompleteOptions.length > 0;

  // Показываем историю когда фокус + пустое поле + нет тегов + есть история + нет автодополнения
  useEffect(() => {
    setShowHistory(isFocused && !value && tags.length === 0 && history.length > 0 && !autocompleteMode);
  }, [isFocused, value, tags.length, history.length, autocompleteMode]);

  // Показываем крестик очистки если есть текст или теги
  const showClear = value || tags.length > 0;

  // Закрываем при клике вне
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
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

  // Выбор из автодополнения
  const handleAutocompleteSelect = useCallback((item: string) => {
    // Заменяем последнее слово на полный тег с пробелом в конце
    const words = value.split(/\s+/);
    words.pop(); // Убираем неполное слово
    const prefix = autocompleteMode === 'from' ? 'от:' : 'из:';
    const newValue = [...words, `${prefix}${item} `].join(' ').replace(/^\s+/, '');
    onChange(newValue);
  }, [value, autocompleteMode, onChange]);

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

      {hint && value && !showAutocomplete && (
        <div className={styles.hint}>
          <span className={styles.hintLabel}>{getFieldLabel(hint.field)}:</span>
          <span
            className={styles.hintText}
            dangerouslySetInnerHTML={{ __html: formatSnippet(hint.snippet) }}
          />
        </div>
      )}
    </div>
  );
}
