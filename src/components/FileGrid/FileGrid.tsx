import { FileRecord } from '../../api/client';
import { MediaTypeIcons, ForwardIcon, FolderIcon } from '../../shared/icons';
import { formatFileSize, formatDuration } from '../../shared/formatters';
import { useLongPress } from '../../hooks/useLongPress';
import cardStyles from '../../styles/Card.module.css';
import gridStyles from './FileGrid.module.css';

// Объединяем стили: cardStyles для карточек, gridStyles для сетки и поиска
const styles = { ...cardStyles, ...gridStyles };

interface FileGridProps {
  files: FileRecord[];
  onFileClick: (file: FileRecord) => void;
  onFileLongPress?: (file: FileRecord) => void;
  selectedFiles?: Set<number>;
  isSelectionMode?: boolean;
  searchQuery?: string;
  isOnCooldown?: (fileId: number) => boolean;
}

interface FileCardProps {
  file: FileRecord;
  onFileClick: (file: FileRecord) => void;
  onFileLongPress?: (file: FileRecord) => void;
  isSelected?: boolean;
  isSelectionMode?: boolean;
  isOnCooldown?: boolean;
}

function FileCard({ file, onFileClick, onFileLongPress, isSelected, isSelectionMode, isOnCooldown }: FileCardProps) {
  const longPress = useLongPress(file, onFileLongPress, onFileClick);

  return (
    <button
      className={`${styles.card} ${isSelected ? styles.selected : ''} ${isOnCooldown ? styles.cooldown : ''}`}
      onClick={longPress.onClick}
      onTouchStart={longPress.onTouchStart}
      onTouchEnd={longPress.onTouchEnd}
      onTouchCancel={longPress.onTouchCancel}
      onMouseDown={longPress.onMouseDown}
      onMouseUp={longPress.onMouseUp}
      onMouseLeave={longPress.onMouseLeave}
    >
      {isOnCooldown && (
        <div className={styles.cooldownBadge}>✓</div>
      )}
      {isSelectionMode && !isOnCooldown && (
        <div className={styles.checkbox}>
          {isSelected ? '✓' : ''}
        </div>
      )}

      {file.thumbnailUrl ? (
        <>
          <div className={styles.preview}>
            <img
              src={file.thumbnailUrl}
              alt=""
              className={styles.thumbnail}
              loading="lazy"
            />
            {file.duration && (
              <span className={styles.duration}>
                {formatDuration(file.duration)}
              </span>
            )}
          </div>

          {(file.caption || file.fileName) ? (
            <div className={styles.info}>
              {file.caption ? (
                <>
                  <span className={styles.caption}>{file.caption}</span>
                  {file.fileName && (
                    <span className={styles.fileName}>{file.fileName}</span>
                  )}
                </>
              ) : (
                <>
                  {file.fileName && (
                    <span className={styles.name}>{file.fileName}</span>
                  )}
                </>
              )}
              {file.fileSize && (
                <span className={styles.size}>{formatFileSize(file.fileSize)}</span>
              )}
            </div>
          ) : (
            <div className={styles.miniBadge}>
              <span className={styles.miniBadgeIcon}>
                {MediaTypeIcons[file.mediaType]}
              </span>
              {file.fileSize && <span>{formatFileSize(file.fileSize)}</span>}
            </div>
          )}
        </>
      ) : (
        <div className={styles.noThumbContent}>
          <span className={styles.iconLarge}>
            {MediaTypeIcons[file.mediaType] || FolderIcon}
          </span>
          {file.fileName && (
            <span className={styles.fileNameCenter}>{file.fileName}</span>
          )}
          {file.fileSize && (
            <span className={styles.fileSizeCenter}>{formatFileSize(file.fileSize)}</span>
          )}
        </div>
      )}

      {(file.forwardFromName || file.forwardFromChatTitle) && (
        <div className={styles.forward}>
          <ForwardIcon className={styles.forwardIcon} />
          <span className={styles.forwardName}>
            {file.forwardFromName || file.forwardFromChatTitle}
          </span>
        </div>
      )}
    </button>
  );
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
