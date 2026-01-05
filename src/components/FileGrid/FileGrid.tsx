import { useRef, useCallback } from 'react';
import { FileRecord, MediaType } from '../../api/client';
import styles from './FileGrid.module.css';

interface FileGridProps {
  files: FileRecord[];
  onFileClick: (file: FileRecord) => void;
  onFileLongPress?: (file: FileRecord) => void;
  selectedFiles?: Set<number>;
  isSelectionMode?: boolean;
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

      {/* File info */}
      <div className={styles.info}>
        <span className={styles.name}>
          {file.fileName || file.caption || `${TYPE_EMOJI[file.mediaType]} ${file.mediaType}`}
        </span>
        {file.fileSize && (
          <span className={styles.size}>{formatFileSize(file.fileSize)}</span>
        )}
      </div>

      {/* Forward info badge */}
      {(file.forwardFromName || file.forwardFromChatTitle) && (
        <div className={styles.forward}>
          <span className={styles.forwardIcon}>↩️</span>
          <span className={styles.forwardName}>
            {file.forwardFromName || file.forwardFromChatTitle}
          </span>
        </div>
      )}
    </button>
  );
}

export function FileGrid({ files, onFileClick, onFileLongPress, selectedFiles, isSelectionMode }: FileGridProps) {
  if (files.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>📭</span>
        <p>Файлы не найдены</p>
        <p className={styles.emptyHint}>Пересылайте файлы боту, чтобы они появились здесь</p>
      </div>
    );
  }

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
