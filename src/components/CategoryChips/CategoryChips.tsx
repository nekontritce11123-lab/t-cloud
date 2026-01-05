import { MediaType, CategoryStats } from '../../api/client';
import styles from './CategoryChips.module.css';

interface CategoryChipsProps {
  stats: CategoryStats[];
  selectedType: MediaType | null;
  onSelect: (type: MediaType | null) => void;
}

interface Category {
  type: MediaType | null;
  label: string;
  emoji: string;
  color: string;
}

const CATEGORIES: Category[] = [
  { type: null, label: 'Все', emoji: '📁', color: 'var(--app-button-color)' },
  { type: 'photo', label: 'Фото', emoji: '🖼', color: 'var(--color-photo)' },
  { type: 'video', label: 'Видео', emoji: '🎬', color: 'var(--color-video)' },
  { type: 'document', label: 'Доки', emoji: '📄', color: 'var(--color-document)' },
  { type: 'link', label: 'Ссылки', emoji: '🔗', color: 'var(--color-link)' },
  { type: 'audio', label: 'Аудио', emoji: '🎵', color: 'var(--color-audio)' },
  { type: 'voice', label: 'Голос', emoji: '🎤', color: 'var(--color-voice)' },
  { type: 'animation', label: 'GIF', emoji: '🎞', color: 'var(--color-animation)' },
  { type: 'sticker', label: 'Стикеры', emoji: '🎨', color: 'var(--color-sticker)' },
];

export function CategoryChips({ stats, selectedType, onSelect }: CategoryChipsProps) {
  const getCount = (type: MediaType | null): number => {
    if (type === null) {
      return stats.reduce((sum, s) => sum + s.count, 0);
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
              onClick={() => onSelect(category.type)}
            >
              <span className={styles.emoji}>{category.emoji}</span>
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
