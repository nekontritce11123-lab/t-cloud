import { useMemo, useState, useRef, useCallback, RefObject } from 'react';
import { FileRecord } from '../../api/client';
import { FileCard } from '../FileCard';
import { DayCheckbox } from '../DayCheckbox';
import { formatDateHeader } from '../../shared/formatters';
import { groupByDateField } from '../../shared/utils';
import { useAutoScroll } from '../../hooks/useAutoScroll';
import { LONG_PRESS_MS } from '../../constants/config';
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
  onSelectRange?: (fileIds: number[]) => void;
  hapticFeedback?: { light: () => void };
  scrollContainerRef?: RefObject<HTMLElement | null>;
}

export function Timeline({
  files,
  onFileClick,
  onFileLongPress,
  selectedFiles,
  isSelectionMode,
  isOnCooldown,
  onSelectDay,
  onSelectRange,
  hapticFeedback,
  scrollContainerRef
}: TimelineProps) {
  const groupedFiles = useMemo(() => groupByDateField(files, 'createdAt'), [files]);

  // Drag selection state
  const [isDragging, setIsDragging] = useState(false);
  const dragAnchorId = useRef<number | null>(null);
  const lastSelectedRange = useRef<Set<number>>(new Set());
  const lastTouchMoveTime = useRef<number>(0);
  const dragStartCoordinate = useRef<{ x: number; y: number } | null>(null);
  const dragThresholdMet = useRef(false);

  // Long press timer for entering selection mode
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capturedPointerId = useRef<number | null>(null);

  // Block click events after drag to prevent anchor toggle
  const blockClickUntil = useRef<number>(0);

  // Fallback ref если scrollContainerRef не передан
  const fallbackRef = useRef<HTMLElement>(null);

  // Auto-scroll при drag
  const { updatePosition: updateAutoScrollPosition } = useAutoScroll(
    isDragging,
    scrollContainerRef ?? fallbackRef
  );

  // Создаём список файлов в ВИЗУАЛЬНОМ порядке (как они отображаются на экране)
  // Важно: sortedGroups сортирует даты по убыванию (новые сверху)
  const visualFileOrder = useMemo(() => {
    const sortedGroups = Array.from(groupedFiles.entries()).sort(
      (a, b) => b[0].localeCompare(a[0])
    );
    const flatList: FileRecord[] = [];
    for (const [, dateFiles] of sortedGroups) {
      flatList.push(...dateFiles);
    }
    return flatList;
  }, [groupedFiles]);

  // Map для быстрого поиска ВИЗУАЛЬНОГО индекса файла
  const visualIndexById = useMemo(() => {
    const map = new Map<number, number>();
    visualFileOrder.forEach((file, index) => {
      map.set(file.id, index);
    });
    return map;
  }, [visualFileOrder]);

  // Функция для выделения range от anchor до current (использует ВИЗУАЛЬНЫЙ порядок)
  const selectRange = useCallback((anchorId: number, currentId: number) => {
    const anchorIndex = visualIndexById.get(anchorId);
    const currentIndex = visualIndexById.get(currentId);

    if (anchorIndex === undefined || currentIndex === undefined) return;

    const start = Math.min(anchorIndex, currentIndex);
    const end = Math.max(anchorIndex, currentIndex);

    // Получаем все id файлов в range (из визуального порядка!)
    const rangeIds = visualFileOrder.slice(start, end + 1).map(f => f.id);
    const newRange = new Set(rangeIds);

    // Проверяем изменился ли range
    if (newRange.size !== lastSelectedRange.current.size ||
        ![...newRange].every(id => lastSelectedRange.current.has(id))) {
      lastSelectedRange.current = newRange;
      onSelectRange?.(rangeIds);
      hapticFeedback?.light();
    }
  }, [visualFileOrder, visualIndexById, onSelectRange, hapticFeedback]);

  // Получить file id из элемента под координатами
  const getFileIdAtPoint = useCallback((clientX: number, clientY: number): number | null => {
    const element = document.elementFromPoint(clientX, clientY);
    const cardElement = element?.closest('[data-file-id]');
    if (cardElement) {
      const fileIdStr = cardElement.getAttribute('data-file-id');
      if (fileIdStr) {
        return Number(fileIdStr);
      }
    }
    return null;
  }, []);

  // === POINTER EVENTS (работают для touch и mouse) ===

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const fileId = getFileIdAtPoint(e.clientX, e.clientY);
    if (fileId === null) return;

    // Сохраняем координаты для threshold проверки
    dragStartCoordinate.current = { x: e.clientX, y: e.clientY };

    // Захватываем pointer СРАЗУ (для drag за пределами элемента)
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      capturedPointerId.current = e.pointerId;
    } catch {
      // Игнорируем если capture не поддерживается
    }

    if (isSelectionMode) {
      // Уже в selection mode → сразу начинаем drag
      setIsDragging(true);
      dragAnchorId.current = fileId;
      dragThresholdMet.current = false;
      // Сохраняем текущее выделение чтобы новый drag добавлял к нему
      lastSelectedRange.current = new Set(selectedFiles || []);
      lastSelectedRange.current.add(fileId);
      // НЕ выделяем anchor сразу - пусть click handler в FileCard занимается toggle
    } else {
      // НЕ в selection mode → запускаем long press timer
      // Очищаем предыдущий timer если был
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }

      const anchorFileId = fileId;
      longPressTimer.current = setTimeout(() => {
        longPressTimer.current = null;

        // Находим файл по ID для callback
        const file = files.find(f => f.id === anchorFileId);
        if (file) {
          // Входим в selection mode через callback
          onFileLongPress?.(file);

          // СРАЗУ устанавливаем drag state чтобы можно было тянуть
          setIsDragging(true);
          dragAnchorId.current = anchorFileId;
          dragThresholdMet.current = true; // Сразу готов к drag (threshold не нужен после long press)
          lastSelectedRange.current = new Set([anchorFileId]);
        }
      }, LONG_PRESS_MS);
    }
  }, [isSelectionMode, getFileIdAtPoint, files, onFileLongPress]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const start = dragStartCoordinate.current;

    // Если есть pending long press timer → проверяем не скроллит ли пользователь
    if (longPressTimer.current && start) {
      const distance = Math.sqrt(
        Math.pow(e.clientX - start.x, 2) + Math.pow(e.clientY - start.y, 2)
      );
      if (distance > 10) {
        // Пользователь скроллит → отменяем long press
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
        // Освобождаем pointer capture (разрешаем нативный скролл)
        if (capturedPointerId.current !== null) {
          try {
            (e.target as HTMLElement).releasePointerCapture(capturedPointerId.current);
          } catch {
            // Игнорируем ошибку
          }
          capturedPointerId.current = null;
        }
        return;
      }
    }

    // Drag selection logic
    if (!isDragging || !isSelectionMode || dragAnchorId.current === null) return;

    // Проверяем threshold 10px перед началом drag selection (для selection mode, не для long press)
    if (start && !dragThresholdMet.current) {
      const distance = Math.sqrt(
        Math.pow(e.clientX - start.x, 2) + Math.pow(e.clientY - start.y, 2)
      );
      if (distance < 10) return; // Игнорируем micro movements
      dragThresholdMet.current = true;
      // При первом превышении threshold - выделяем anchor файл
      onSelectRange?.([dragAnchorId.current]);
    }

    // Обновляем позицию для auto-scroll (без throttle - нужна плавность)
    updateAutoScrollPosition(e.clientY);

    // Throttle для selection logic (50ms)
    const now = Date.now();
    if (now - lastTouchMoveTime.current < 50) return;
    lastTouchMoveTime.current = now;

    const currentFileId = getFileIdAtPoint(e.clientX, e.clientY);
    if (currentFileId !== null) {
      selectRange(dragAnchorId.current, currentFileId);
    }
  }, [isDragging, isSelectionMode, getFileIdAtPoint, selectRange, updateAutoScrollPosition, onSelectRange]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    // Очищаем long press timer если не сработал
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    // Блокируем click events после drag чтобы предотвратить toggle anchor файла
    if (isDragging) {
      blockClickUntil.current = Date.now() + 100;
    }

    // Сбрасываем drag state
    if (isDragging) {
      setIsDragging(false);
      dragAnchorId.current = null;
      dragStartCoordinate.current = null;
      dragThresholdMet.current = false;
      lastSelectedRange.current = new Set();
    }

    // Освобождаем pointer capture
    if (capturedPointerId.current !== null) {
      try {
        (e.target as HTMLElement).releasePointerCapture(capturedPointerId.current);
      } catch {
        // Игнорируем ошибку если capture уже освобождён
      }
      capturedPointerId.current = null;
    }
  }, [isDragging]);

  // Capture handler для блокировки click после drag
  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (Date.now() < blockClickUntil.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, []);


  if (files.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIconWrapper}>
          <svg className={styles.emptyFolderIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <h3 className={styles.emptyTitle}>Хранилище пусто</h3>
        <p className={styles.emptyHint}>Пересылайте файлы боту,<br />чтобы они появились здесь</p>
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
      style={isDragging ? { touchAction: 'none' } : undefined}
      onClickCapture={handleClickCapture}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
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
                isFavorite={file.isFavorite}
                includeDataFileId
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
