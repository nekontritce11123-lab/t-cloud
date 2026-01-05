import React, { useRef, useCallback } from 'react';
import { FileRecord, MediaType } from '../../api/client';
import styles from './FileGrid.module.css';

interface FileGridProps {
  files: FileRecord[];
  onFileClick: (file: FileRecord) => void;
  onFileLongPress?: (file: FileRecord) => void;
  selectedFiles?: Set<number>;
  isSelectionMode?: boolean;
  searchQuery?: string; // Если передан - показываем результаты поиска
  isOnCooldown?: (fileId: number) => boolean;
}

// SF Symbols style SVG icons for media types
const MediaTypeIcons: Record<MediaType, React.ReactElement> = {
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
  video_note: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m10 9 5 3-5 3V9Z" fill="currentColor" stroke="none" />
    </svg>
  ),
  animation: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="2.18" />
      <line x1="7" x2="7" y1="2" y2="22" />
      <line x1="17" x2="17" y1="2" y2="22" />
      <line x1="2" x2="22" y1="12" y2="12" />
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
  link: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
};

// Forward icon SVG
function ForwardIcon() {
  return (
    <svg className={styles.forwardIcon} viewBox="0 0 16 16" fill="currentColor">
      <path d="M2.5 8.5a.5.5 0 0 1 0-1h9.793L9.146 4.354a.5.5 0 1 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L12.293 8.5H2.5z" transform="scale(-1,1) translate(-16,0)"/>
    </svg>
  );
}

// Default folder icon
const FolderIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

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
  isOnCooldown?: boolean;
}

function FileCard({ file, onFileClick, onFileLongPress, isSelected, isSelectionMode, isOnCooldown }: FileCardProps) {
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
      className={`${styles.card} ${isSelected ? styles.selected : ''} ${isOnCooldown ? styles.cooldown : ''}`}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onMouseDown={handleTouchStart}
      onMouseUp={handleTouchEnd}
      onMouseLeave={handleTouchEnd}
    >
      {/* Cooldown badge */}
      {isOnCooldown && (
        <div className={styles.cooldownBadge}>✓</div>
      )}
      {/* Selection checkbox */}
      {isSelectionMode && !isOnCooldown && (
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
            {MediaTypeIcons[file.mediaType] || FolderIcon}
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
            {/* Если нет caption - показываем filename (без emoji) */}
            {file.fileName && (
              <span className={styles.name}>{file.fileName}</span>
            )}
          </>
        )}
        {file.fileSize && (
          <span className={styles.size}>{formatFileSize(file.fileSize)}</span>
        )}
      </div>

      {/* Forward info badge - от кого переслано */}
      {(file.forwardFromName || file.forwardFromChatTitle) && (
        <div className={styles.forward}>
          <ForwardIcon />
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
            isOnCooldown={isOnCooldown?.(file.id)}
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
            isOnCooldown={isOnCooldown?.(file.id)}
          />
        ))}
      </div>
    </div>
  );
}
