import { useMemo } from 'react';
import { FileRecord } from '../../api/client';
import { MediaTypeIcons, ForwardIcon, FolderIcon } from '../../shared/icons';
import { formatFileSize, formatDuration } from '../../shared/formatters';
import { getEffectiveMediaType } from '../../shared/mediaType';
import { useLongPress } from '../../hooks/useLongPress';
import cardStyles from '../../styles/Card.module.css';
import layoutStyles from './Timeline.module.css';

// Объединяем стили: cardStyles для карточек, layoutStyles для layout
const styles = { ...cardStyles, ...layoutStyles };

interface TimelineProps {
  files: FileRecord[];
  onFileClick: (file: FileRecord) => void;
  onFileLongPress?: (file: FileRecord) => void;
  selectedFiles?: Set<number>;
  isSelectionMode?: boolean;
  isOnCooldown?: (fileId: number) => boolean;
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
        /* === КАРТОЧКА С ПРЕВЬЮ === */
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

          {/* File info - адаптивная панель */}
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
            /* Компактный бейдж для фото/видео без текста */
            <div className={styles.miniBadge}>
              <span className={styles.miniBadgeIcon}>
                {MediaTypeIcons[getEffectiveMediaType(file.mediaType, file.mimeType)]}
              </span>
              {file.fileSize && <span>{formatFileSize(file.fileSize)}</span>}
            </div>
          )}
        </>
      ) : (
        /* === КАРТОЧКА БЕЗ ПРЕВЬЮ (документы) === */
        <div className={styles.noThumbContent}>
          <span className={styles.iconLarge}>
            {MediaTypeIcons[getEffectiveMediaType(file.mediaType, file.mimeType)] || FolderIcon}
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
