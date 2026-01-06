import { useMemo, useState, useRef, useCallback } from 'react';
import { FileRecord } from '../../api/client';
import { FileCard } from '../FileCard';
import { DayCheckbox } from '../DayCheckbox';
import gridStyles from '../../styles/Grid.module.css';
import dateHeaderStyles from '../../styles/DateHeader.module.css';
import layoutStyles from './Timeline.module.css';

// Объединяем стили
const styles = { ...gridStyles, ...dateHeaderStyles, ...layoutStyles };

interface TimelineProps {
  files: FileRecord[];
  onFileClick: (file: FileRecord) => void;
  onFileLongPress?: (file: FileRecord) => void;
  selectedFiles?: Set<number>;
  isSelectionMode?: boolean;
  isOnCooldown?: (fileId: number) => boolean;
  onSelectDay?: (files: FileRecord[], action: 'add' | 'remove') => void;
  onToggleFile?: (file: FileRecord) => void;
  hapticFeedback?: { light: () => void };
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

export function Timeline({
  files,
  onFileClick,
  onFileLongPress,
  selectedFiles,
  isSelectionMode,
  isOnCooldown,
  onSelectDay,
  onToggleFile,
  hapticFeedback
}: TimelineProps) {
  const groupedFiles = useMemo(() => groupFilesByDate(files), [files]);

  // Drag selection state
  const [isDragging, setIsDragging] = useState(false);
  const draggedFileIds = useRef<Set<number>>(new Set());
  const lastTouchY = useRef<number>(0);

  // Создаём Map для быстрого поиска файла по id
  const filesById = useMemo(() => {
    const map = new Map<number, FileRecord>();
    for (const file of files) {
      map.set(file.id, file);
    }
    return map;
  }, [files]);

  // Drag selection handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isSelectionMode) return;

    const touch = e.touches[0];
    lastTouchY.current = touch.clientY;

    // Проверяем, начинается ли касание на карточке
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    const cardElement = element?.closest('[data-file-id]');
    if (cardElement) {
      setIsDragging(true);
      draggedFileIds.current = new Set();
    }
  }, [isSelectionMode]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging || !isSelectionMode || !onToggleFile) return;

    const touch = e.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    const cardElement = element?.closest('[data-file-id]');

    if (cardElement) {
      const fileIdStr = cardElement.getAttribute('data-file-id');
      if (fileIdStr) {
        const fileId = Number(fileIdStr);
        // Проверяем что это новый файл и не на cooldown
        if (!draggedFileIds.current.has(fileId) && !isOnCooldown?.(fileId)) {
          draggedFileIds.current.add(fileId);
          const file = filesById.get(fileId);
          if (file) {
            onToggleFile(file);
            hapticFeedback?.light();
          }
        }
      }
    }

    lastTouchY.current = touch.clientY;
  }, [isDragging, isSelectionMode, onToggleFile, isOnCooldown, filesById, hapticFeedback]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    draggedFileIds.current = new Set();
  }, []);

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
    <div
      className={styles.timeline}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {sortedGroups.map(([dateKey, dateFiles]) => (
        <div key={dateKey} className={styles.group}>
          <div className={styles.dateHeader}>
            <span className={styles.dateText}>{formatDateHeader(dateKey)}</span>
            <div className={styles.dateActions}>
              {!isSelectionMode && (
                <span className={styles.dateCount}>{dateFiles.length}</span>
              )}
              <DayCheckbox
                dateFiles={dateFiles}
                selectedFiles={selectedFiles}
                isSelectionMode={isSelectionMode}
                isOnCooldown={isOnCooldown}
                onSelectDay={onSelectDay}
              />
            </div>
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
                includeDataFileId
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
