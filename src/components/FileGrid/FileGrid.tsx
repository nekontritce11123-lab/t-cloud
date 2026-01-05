import { useRef, useCallback } from 'react';
import { FileRecord, MediaType } from '../../api/client';
import styles from './FileGrid.module.css';

interface FileGridProps {
  files: FileRecord[];
  onFileClick: (file: FileRecord) => void;
  onFileLongPress?: (file: FileRecord) => void;
  selectedFiles?: Set<number>;
  isSelectionMode?: boolean;
  searchQuery?: string; // Если передан - показываем результаты поиска
}

const TYPE_EMOJI: Record<MediaType, string> = {
  photo: '🖼',
  video: '🎬',
  document: '📄',
  audio: '🎵',
  voice: '🎤',
  video_note: '⭕',
  animation: '🎞',
  sticker: '🎨',
  link: '🔗',
};

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface FileCardProps {
  file: FileRecord;
  onFileClick: (file: FileRecord) => void;
  onFileLongPress?: (file: FileRecord) => void;
  isSelected?: boolean;
  isSelectionMode?: boolean;
}

function FileCard({ file, onFileClick, onFileLongPress, isSelected, isSelectionMode }: FileCardProps) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);

  const handleTouchStart = useCallback(() => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      onFileLongPress?.(file);
    }, 500); // 500ms для long press
  }, [file, onFileLongPress]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleClick = useCallback(() => {
    if (!isLongPress.current) {
      onFileClick(file);
    }
    isLongPress.current = false;
  }, [file, onFileClick]);

  return (
    <button
      className={`${styles.card} ${isSelected ? styles.selected : ''}`}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onMouseDown={handleTouchStart}
      onMouseUp={handleTouchEnd}
      onMouseLeave={handleTouchEnd}
    >
      {/* Selection checkbox */}
      {isSelectionMode && (
        <div className={styles.checkbox}>
          {isSelected ? '✓' : ''}
        </div>
      )}

      {/* Thumbnail or icon */}
      <div className={styles.preview}>
        {file.thumbnailUrl ? (
          <img
            src={file.thumbnailUrl}
            alt=""
            className={styles.thumbnail}
            loading="lazy"
          />
        ) : (
          <span className={styles.icon}>
            {TYPE_EMOJI[file.mediaType] || '📁'}
          </span>
        )}

        {/* Duration badge for video/audio */}
        {file.duration && (
          <span className={styles.duration}>
            {formatDuration(file.duration)}
          </span>
        )}
      </div>

      {/* File info - Smart Card: caption > fileName */}
      <div className={styles.info}>
        {file.caption ? (
          <>
            {/* Caption как основной текст */}
            <span className={styles.caption}>{file.caption}</span>
            {/* Filename мелко снизу */}
            {file.fileName && (
              <span className={styles.fileName}>{file.fileName}</span>
            )}
          </>
        ) : (
          <>
            {/* Если нет caption - показываем filename как раньше */}
            <span className={styles.name}>
              {file.fileName || `${TYPE_EMOJI[file.mediaType]} ${file.mediaType}`}
            </span>
          </>
        )}
        {file.fileSize && (
          <span className={styles.size}>{formatFileSize(file.fileSize)}</span>
        )}
      </div>

      {/* Forward info badge - от кого переслано */}
      {(file.forwardFromName || file.forwardFromChatTitle) && (
        <div className={styles.forward}>
          <span className={styles.forwardIcon}>↩️</span>
          <span className={styles.forwardName}>
            от {file.forwardFromName || file.forwardFromChatTitle}
          </span>
        </div>
      )}

    </button>
  );
}

export function FileGrid({ files, onFileClick, onFileLongPress, selectedFiles, isSelectionMode, searchQuery }: FileGridProps) {
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

  // Проверяем есть ли это результаты поиска
  const isSearchResult = searchQuery && files.some(f => f.matchedField);

  // Обычный режим без поиска - просто сетка
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
          />
        ))}
      </div>
    );
  }

  // Режим поиска с результатами
  return (
    <div className={styles.searchResults}>
      {/* Заголовок результатов поиска */}
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
          />
        ))}
      </div>
    </div>
  );
}
