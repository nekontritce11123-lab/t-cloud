import { useMemo, useState, useRef, useCallback } from 'react';
import { FileRecord } from '../../api/client';
import { FileCard } from '../FileCard';
import { DayCheckbox } from '../DayCheckbox';
import { formatDateHeader } from '../../shared/formatters';
import gridStyles from '../../styles/Grid.module.css';
import dateHeaderStyles from '../../styles/DateHeader.module.css';
import cardStyles from '../../styles/Card.module.css';
import layoutStyles from './TrashTimeline.module.css';

// Объединяем стили
const styles = { ...cardStyles, ...gridStyles, ...dateHeaderStyles, ...layoutStyles };

interface TrashTimelineProps {
  files: FileRecord[];
  onFileClick: (file: FileRecord) => void;
  onFileLongPress: (file: FileRecord) => void;
  selectedFiles: Set<number>;
  isSelectionMode: boolean;
  onSelectDay: (files: FileRecord[], action: 'add' | 'remove') => void;
  onToggleFile: (file: FileRecord) => void;
  hapticFeedback: { light: () => void };
}

// Группировка файлов по дате удаления (в локальной timezone пользователя)
function groupFilesByDeletedDate(files: FileRecord[]): Map<string, FileRecord[]> {
  const groups = new Map<string, FileRecord[]>();

  for (const file of files) {
    if (!file.deletedAt) continue;
    // Parse ISO string and use LOCAL date components for grouping
    // (not UTC date from string split, which causes timezone issues)
    const date = new Date(file.deletedAt);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(file);
  }

  return groups;
}

export function TrashTimeline({
  files,
  onFileClick,
  onFileLongPress,
  selectedFiles,
  isSelectionMode,
  onSelectDay,
  onToggleFile,
  hapticFeedback
}: TrashTimelineProps) {
  const groupedFiles = useMemo(() => groupFilesByDeletedDate(files), [files]);

  // Drag selection state
  const [isDragging, setIsDragging] = useState(false);
  const draggedFileIds = useRef<Set<number>>(new Set());

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
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    const cardElement = element?.closest('[data-file-id]');
    if (cardElement) {
      setIsDragging(true);
      draggedFileIds.current = new Set();
    }
  }, [isSelectionMode]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging || !isSelectionMode) return;

    const touch = e.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    const cardElement = element?.closest('[data-file-id]');

    if (cardElement) {
      const fileIdStr = cardElement.getAttribute('data-file-id');
      if (fileIdStr) {
        const fileId = Number(fileIdStr);
        if (!draggedFileIds.current.has(fileId)) {
          draggedFileIds.current.add(fileId);
          const file = filesById.get(fileId);
          if (file) {
            onToggleFile(file);
            hapticFeedback.light();
          }
        }
      }
    }
  }, [isDragging, isSelectionMode, onToggleFile, filesById, hapticFeedback]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    draggedFileIds.current = new Set();
  }, []);

  if (files.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>🗑️</span>
        <p>Корзина пуста</p>
        <p className={styles.emptyHint}>Удалённые файлы будут храниться здесь 30 дней</p>
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
            <span className={styles.dateText}>{formatDateHeader(dateKey, 'Удалено')}</span>
            <div className={styles.dateActions}>
              {!isSelectionMode && (
                <span className={styles.dateCount}>{dateFiles.length}</span>
              )}
              <DayCheckbox
                dateFiles={dateFiles}
                selectedFiles={selectedFiles}
                isSelectionMode={isSelectionMode}
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
                isSelected={selectedFiles.has(file.id)}
                isSelectionMode={isSelectionMode}
                disableActiveScale
                includeDataFileId
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
