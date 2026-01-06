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
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>📭</span>
        <p>{searchQuery ? 'Ничего не найдено' : 'Файлы не найдены'}</p>
        <p className={styles.emptyHint}>
          {searchQuery
            ? `По запросу "${searchQuery}" ничего не найдено`
            : 'Пересылайте файлы боту, чтобы они появились здесь'
          }
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
          />
        ))}
      </div>
    </div>
  );
}
