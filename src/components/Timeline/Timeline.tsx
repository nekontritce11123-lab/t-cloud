import { useMemo, useRef, useCallback } from 'react';
import { FileRecord, MediaType } from '../../api/client';
import styles from './Timeline.module.css';

interface TimelineProps {
  files: FileRecord[];
  onFileClick: (file: FileRecord) => void;
  onFileLongPress?: (file: FileRecord) => void;
  selectedFiles?: Set<number>;
  isSelectionMode?: boolean;
  isOnCooldown?: (fileId: number) => boolean;
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

// Форматирование даты для заголовка группы
function formatDateHeader(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const fileDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (fileDate.getTime() === today.getTime()) {
    return 'Сегодня';
  }
  if (fileDate.getTime() === yesterday.getTime()) {
    return 'Вчера';
  }

  // Проверяем, текущий ли это год
  const isCurrentYear = date.getFullYear() === now.getFullYear();

  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];

  if (isCurrentYear) {
    return `${date.getDate()} ${months[date.getMonth()]}`;
  }
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

// Группировка файлов по датам
function groupFilesByDate(files: FileRecord[]): Map<string, FileRecord[]> {
  const groups = new Map<string, FileRecord[]>();

  for (const file of files) {
    const dateKey = file.createdAt.split('T')[0]; // "2025-01-05"
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(file);
  }

  return groups;
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
    }, 500);
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
      {isOnCooldown && (
        <div className={styles.cooldownBadge}>✓</div>
      )}
      {isSelectionMode && !isOnCooldown && (
        <div className={styles.checkbox}>
          {isSelected ? '✓' : ''}
        </div>
      )}

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

        {file.duration && (
          <span className={styles.duration}>
            {formatDuration(file.duration)}
          </span>
        )}
      </div>

      <div className={styles.info}>
        {file.caption ? (
          <>
            <span className={styles.caption}>{file.caption}</span>
            {file.fileName && (
              <span className={styles.fileName}>{file.fileName}</span>
            )}
          </>
        ) : (
          <span className={styles.name}>
            {file.fileName || `${TYPE_EMOJI[file.mediaType]} ${file.mediaType}`}
          </span>
        )}
        {file.fileSize && (
          <span className={styles.size}>{formatFileSize(file.fileSize)}</span>
        )}
      </div>

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

export function Timeline({ files, onFileClick, onFileLongPress, selectedFiles, isSelectionMode, isOnCooldown }: TimelineProps) {
  const groupedFiles = useMemo(() => groupFilesByDate(files), [files]);

  if (files.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>📭</span>
        <p>Файлы не найдены</p>
        <p className={styles.emptyHint}>Пересылайте файлы боту, чтобы они появились здесь</p>
      </div>
    );
  }

  // Сортируем группы по дате (новые сверху)
  const sortedGroups = Array.from(groupedFiles.entries()).sort(
    (a, b) => b[0].localeCompare(a[0])
  );

  return (
    <div className={styles.timeline}>
      {sortedGroups.map(([dateKey, dateFiles]) => (
        <div key={dateKey} className={styles.group}>
          <div className={styles.dateHeader}>
            <span className={styles.dateText}>{formatDateHeader(dateKey)}</span>
            <span className={styles.dateCount}>{dateFiles.length}</span>
          </div>
          <div className={styles.grid}>
            {dateFiles.map(file => (
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
      ))}
    </div>
  );
}
