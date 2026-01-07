import { FileRecord } from '../../api/client';
import { FileCard } from '../FileCard';
import cardStyles from '../../styles/Card.module.css';
import gridStyles from '../../styles/Grid.module.css';
import localStyles from './FileGrid.module.css';

// Объединяем стили: cardStyles для карточек, gridStyles для сетки, localStyles для поиска
const styles = { ...cardStyles, ...gridStyles, ...localStyles };

interface FileGridProps {
  files: FileRecord[];
  onFileClick: (file: FileRecord) => void;
  onFileLongPress?: (file: FileRecord) => void;
  selectedFiles?: Set<number>;
  isSelectionMode?: boolean;
  searchQuery?: string;
  isOnCooldown?: (fileId: number) => boolean;
}

export function FileGrid({ files, onFileClick, onFileLongPress, selectedFiles, isSelectionMode, searchQuery, isOnCooldown }: FileGridProps) {
  if (files.length === 0) {
    // Search empty state - с подсказками
    if (searchQuery) {
      return (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>🔍</span>
          <h3 className={styles.emptyTitle}>Ничего не найдено</h3>
          <p className={styles.emptyQuery}>«{searchQuery}»</p>

          <div className={styles.emptyTips}>
            <div className={styles.emptyTipsTitle}>Советы</div>
            <ul className={styles.emptyTipsList}>
              <li>Проверьте правописание</li>
              <li>Попробуйте другие слова</li>
              <li>Используйте часть слова</li>
            </ul>
          </div>

          <div className={styles.emptyFields}>
            <span className={styles.emptyFieldChip}>📝 Подписи</span>
            <span className={styles.emptyFieldChip}>📄 Имена</span>
            <span className={styles.emptyFieldChip}>↗️ От кого</span>
          </div>
        </div>
      );
    }

    // Default empty state
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>📭</span>
        <h3 className={styles.emptyTitle}>Файлы не найдены</h3>
        <p className={styles.emptyHint}>
          Пересылайте файлы боту,<br />чтобы они появились здесь
        </p>
      </div>
    );
  }

  const isSearchResult = searchQuery && files.some(f => f.matchedField);

  if (!searchQuery) {
    return (
      <div className={styles.grid}>
        {files.map(file => (
          <FileCard
            key={file.id}
            file={file}
            onFileClick={onFileClick}
            onFileLongPress={onFileLongPress}
            isSelected={selectedFiles?.has(file.id)}
            isSelectionMode={isSelectionMode}
            isOnCooldown={isOnCooldown?.(file.id)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={styles.searchResults}>
      {isSearchResult && (
        <div className={styles.searchHeader}>
          <span className={styles.searchCount}>
            Найдено: {files.length}
          </span>
        </div>
      )}

      <div className={styles.grid}>
        {files.map(file => (
          <FileCard
            key={file.id}
            file={file}
            onFileClick={onFileClick}
            onFileLongPress={onFileLongPress}
            isSelected={selectedFiles?.has(file.id)}
            isSelectionMode={isSelectionMode}
            isOnCooldown={isOnCooldown?.(file.id)}
            searchMatch={file.matchedField && file.matchedSnippet ? {
              field: file.matchedField,
              snippet: file.matchedSnippet,
            } : undefined}
          />
        ))}
      </div>
    </div>
  );
}
