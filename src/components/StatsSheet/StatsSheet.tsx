import { useMemo, useCallback } from 'react';
import { FileRecord, CategoryStats, MediaType } from '../../api/client';
import { formatFileSize, getMediaTypeLabel } from '../../shared/formatters';
import { MediaTypeIcons } from '../../shared/icons';
import styles from './StatsSheet.module.css';

// Categories to display (ordered)
const CATEGORIES: MediaType[] = ['photo', 'video', 'document', 'link', 'audio', 'voice'];

interface StatsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  files: FileRecord[];
  stats: CategoryStats[];
  trashCount: number;
  onCategoryClick: (category: string) => void;
  onSourceClick: (source: string) => void;
}

interface SourceStats {
  name: string;
  count: number;
  size: number;
}

export function StatsSheet({
  isOpen,
  onClose,
  files,
  stats,
  trashCount,
  onCategoryClick,
  onSourceClick,
}: StatsSheetProps) {
  // Compute total files and size
  const totalFiles = useMemo(() => {
    return stats.reduce((sum, s) => sum + s.count, 0);
  }, [stats]);

  const totalSize = useMemo(() => {
    return files.reduce((sum, f) => sum + (f.fileSize || 0), 0);
  }, [files]);

  // Compute size by category from files
  const sizeByCategory = useMemo(() => {
    const sizeMap: Record<MediaType, number> = {
      photo: 0,
      video: 0,
      document: 0,
      audio: 0,
      voice: 0,
      video_note: 0,
      link: 0,
    };

    files.forEach((file) => {
      if (file.mediaType && file.fileSize) {
        sizeMap[file.mediaType] += file.fileSize;
      }
    });

    return sizeMap;
  }, [files]);

  // Compute top sources (forwardFromName or forwardFromChatTitle)
  const topSources = useMemo(() => {
    const sourceMap = new Map<string, { count: number; size: number }>();

    files.forEach((file) => {
      const source = file.forwardFromName || file.forwardFromChatTitle;
      if (source) {
        const existing = sourceMap.get(source) || { count: 0, size: 0 };
        existing.count += 1;
        existing.size += file.fileSize || 0;
        sourceMap.set(source, existing);
      }
    });

    // Convert to array and sort by count descending
    const sources: SourceStats[] = [];
    sourceMap.forEach((value, name) => {
      sources.push({ name, count: value.count, size: value.size });
    });

    return sources
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // Top 5 sources
  }, [files]);

  // Get count for a category from stats
  const getCategoryCount = useCallback(
    (category: MediaType): number => {
      const stat = stats.find((s) => s.mediaType === category);
      return stat?.count || 0;
    },
    [stats]
  );

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // Handle category row click
  const handleCategoryClick = useCallback(
    (category: MediaType) => {
      onCategoryClick(category);
    },
    [onCategoryClick]
  );

  // Handle source row click
  const handleSourceClick = useCallback(
    (source: string) => {
      onSourceClick(source);
    },
    [onSourceClick]
  );

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={handleBackdropClick}>
      <div className={styles.sheet}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.handle} />
          <h2 className={styles.title}>Статистика</h2>
          <button className={styles.closeButton} onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {/* Summary */}
          <div className={styles.summary}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryValue}>{totalFiles}</span>
              <span className={styles.summaryLabel}>Всего файлов</span>
            </div>
            <div className={styles.summaryDivider} />
            <div className={styles.summaryItem}>
              <span className={styles.summaryValue}>{formatFileSize(totalSize) || '0 B'}</span>
              <span className={styles.summaryLabel}>Общий размер</span>
            </div>
            {trashCount > 0 && (
              <>
                <div className={styles.summaryDivider} />
                <div className={styles.summaryItem}>
                  <span className={styles.summaryValue}>{trashCount}</span>
                  <span className={styles.summaryLabel}>В корзине</span>
                </div>
              </>
            )}
          </div>

          {/* Categories */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>По категориям</h3>
            <div className={styles.categoryList}>
              {CATEGORIES.map((category) => {
                const count = getCategoryCount(category);
                const size = sizeByCategory[category];

                return (
                  <button
                    key={category}
                    className={styles.categoryRow}
                    onClick={() => handleCategoryClick(category)}
                  >
                    <span className={styles.categoryIcon} data-category={category}>
                      {MediaTypeIcons[category]}
                    </span>
                    <span className={styles.categoryName}>
                      {getMediaTypeLabel(category)}
                    </span>
                    <span className={styles.categoryStats}>
                      <span className={styles.categoryCount}>{count}</span>
                      {size > 0 && (
                        <span className={styles.categorySize}>{formatFileSize(size)}</span>
                      )}
                    </span>
                    <svg className={styles.chevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Top Sources */}
          {topSources.length > 0 && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Источники</h3>
              <div className={styles.sourceList}>
                {topSources.map((source) => (
                  <button
                    key={source.name}
                    className={styles.sourceRow}
                    onClick={() => handleSourceClick(source.name)}
                  >
                    <span className={styles.sourceIcon}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </span>
                    <span className={styles.sourceName}>{source.name}</span>
                    <span className={styles.sourceStats}>
                      <span className={styles.sourceCount}>{source.count}</span>
                      {source.size > 0 && (
                        <span className={styles.sourceSize}>{formatFileSize(source.size)}</span>
                      )}
                    </span>
                    <svg className={styles.chevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
