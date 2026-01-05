import { useState, useCallback } from 'react';
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

interface SearchHint {
  field: string;
  snippet: string;
}

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  hint?: SearchHint | null;
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

export function SearchBar({ value, onChange, onClear, placeholder = 'Поиск...', hint }: SearchBarProps) {
  const [isFocused, setIsFocused] = useState(false);

  const handleClear = useCallback(() => {
    if (onClear) {
      onClear();
    } else {
      onChange('');
    }
  }, [onChange, onClear]);

  return (
    <div className={styles.wrapper}>
      <div className={`${styles.container} ${isFocused ? styles.focused : ''}`}>
        <SearchIcon />
        <input
          type="text"
          className={styles.input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
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
