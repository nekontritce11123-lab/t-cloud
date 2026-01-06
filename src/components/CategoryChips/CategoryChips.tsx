import { MediaType, CategoryStats } from '../../api/client';
import styles from './CategoryChips.module.css';

// Extended type to include 'trash' as a special category
export type CategoryType = MediaType | 'trash' | null;

interface CategoryChipsProps {
  stats: CategoryStats[];
  selectedType: CategoryType;
  onSelect: (type: CategoryType) => void;
  trashCount?: number;
}

// SF Symbols style icons (inline SVG)
const Icons = {
  all: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  photo: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  ),
  video: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m10 9 5 3-5 3V9Z" fill="currentColor" stroke="none" />
    </svg>
  ),
  document: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  ),
  link: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  audio: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  ),
  voice: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  ),
  animation: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="2.18" />
      <line x1="7" x2="7" y1="2" y2="22" />
      <line x1="17" x2="17" y1="2" y2="22" />
      <line x1="2" x2="22" y1="12" y2="12" />
      <line x1="2" x2="7" y1="7" y2="7" />
      <line x1="2" x2="7" y1="17" y2="17" />
      <line x1="17" x2="22" y1="17" y2="17" />
      <line x1="17" x2="22" y1="7" y2="7" />
    </svg>
  ),
  sticker: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" x2="9.01" y1="9" y2="9" strokeWidth="2" />
      <line x1="15" x2="15.01" y1="9" y2="9" strokeWidth="2" />
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  ),
};

interface Category {
  type: CategoryType;
  label: string;
  icon: keyof typeof Icons;
  color: string;
}

const CATEGORIES: Category[] = [
  { type: null, label: 'Все', icon: 'all', color: 'var(--app-button-color)' },
  { type: 'photo', label: 'Фото', icon: 'photo', color: 'var(--color-photo)' },
  { type: 'video', label: 'Видео', icon: 'video', color: 'var(--color-video)' },
  { type: 'document', label: 'Доки', icon: 'document', color: 'var(--color-document)' },
  { type: 'link', label: 'Ссылки', icon: 'link', color: 'var(--color-link)' },
  { type: 'audio', label: 'Аудио', icon: 'audio', color: 'var(--color-audio)' },
  { type: 'voice', label: 'Голос', icon: 'voice', color: 'var(--color-voice)' },
  { type: 'animation', label: 'GIF', icon: 'animation', color: 'var(--color-animation)' },
  { type: 'sticker', label: 'Стикеры', icon: 'sticker', color: 'var(--color-sticker)' },
  { type: 'trash', label: 'Корзина', icon: 'trash', color: 'var(--app-destructive-text-color, #ff3b30)' },
];

export function CategoryChips({ stats, selectedType, onSelect, trashCount = 0 }: CategoryChipsProps) {
  const getCount = (type: CategoryType): number => {
    if (type === null) {
      return stats.reduce((sum, s) => sum + s.count, 0);
    }
    if (type === 'trash') {
      return trashCount;
    }
    return stats.find(s => s.mediaType === type)?.count || 0;
  };

  return (
    <div className={styles.container}>
      <div className={styles.scroll}>
        {CATEGORIES.map(category => {
          const count = getCount(category.type);
          const isSelected = selectedType === category.type;

          return (
            <button
              key={category.type || 'all'}
              className={`${styles.chip} ${isSelected ? styles.selected : ''}`}
              style={{
                '--chip-color': category.color,
              } as React.CSSProperties}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(category.type);
              }}
            >
              <span className={styles.icon}>{Icons[category.icon]}</span>
              <span className={styles.label}>{category.label}</span>
              {count > 0 && (
                <span className={styles.count}>{count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
