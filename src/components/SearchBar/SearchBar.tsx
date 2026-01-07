import { useState, useCallback, useRef, useEffect } from 'react';
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
}: SearchBarProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Показываем историю когда фокус + пустое поле + есть история
  useEffect(() => {
    setShowHistory(isFocused && !value && history.length > 0);
  }, [isFocused, value, history.length]);

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

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <div className={`${styles.container} ${isFocused ? styles.focused : ''}`}>
        <SearchIcon />
        <input
          type="text"
          className={styles.input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 150)}
          placeholder={placeholder}
        />
        {value && (
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

      {/* История поиска */}
      {showHistory && (
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

      {hint && value && (
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
