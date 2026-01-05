import { useState, useCallback } from 'react';
import styles from './SearchBar.module.css';

interface SearchHint {
  field: string;
  snippet: string;
}

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: SearchHint | null; // Подсказка где найдено
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
    default: return '';
  }
}

export function SearchBar({ value, onChange, placeholder = 'Поиск...', hint }: SearchBarProps) {
  const [isFocused, setIsFocused] = useState(false);

  const handleClear = useCallback(() => {
    onChange('');
  }, [onChange]);

  return (
    <div className={styles.wrapper}>
      <div className={`${styles.container} ${isFocused ? styles.focused : ''}`}>
        <span className={styles.icon}>🔍</span>
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
          <button className={styles.clear} onClick={handleClear}>
            ✕
          </button>
        )}
      </div>
      {/* Подсказка под поиском */}
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
