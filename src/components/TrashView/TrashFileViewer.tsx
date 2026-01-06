import { useCallback } from 'react';
import { FileRecord, MediaType } from '../../api/client';
import { MediaTypeIcons } from '../../shared/icons';
import { formatFileSize, formatDuration } from '../../shared/formatters';
import { getEffectiveMediaType } from '../../shared/mediaType';
import styles from './TrashFileViewer.module.css';

interface TrashFileViewerProps {
  file: FileRecord;
  onClose: () => void;
  onRestore: (file: FileRecord) => void;
  onDelete: (file: FileRecord) => void;
  isRestoring?: boolean;
  isDeleting?: boolean;
}

// Вычисляет дни до автоудаления
function getDaysRemaining(deletedAt: string): number {
  const deleted = new Date(deletedAt);
  const now = new Date();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  const deleteDate = new Date(deleted.getTime() + thirtyDays);
  const remaining = Math.ceil((deleteDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, remaining);
}

function formatDeletedDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const fileDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  if (fileDate.getTime() === today.getTime()) {
    return `Сегодня, ${time}`;
  }
  if (fileDate.getTime() === yesterday.getTime()) {
    return `Вчера, ${time}`;
  }

  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getMediaTypeLabel(type: MediaType): string {
  const labels: Record<MediaType, string> = {
    photo: 'Фото',
    video: 'Видео',
    document: 'Документ',
    audio: 'Аудио',
    voice: 'Голосовое',
    video_note: 'Видеосообщение',
    animation: 'GIF',
    sticker: 'Стикер',
    link: 'Ссылка',
  };
  return labels[type] || type;
}

export function TrashFileViewer({
  file,
  onClose,
  onRestore,
  onDelete,
  isRestoring,
  isDeleting
}: TrashFileViewerProps) {
  const daysRemaining = getDaysRemaining(file.deletedAt!);
  const isProcessing = isRestoring || isDeleting;

  const handleRestore = useCallback(() => {
    if (!isProcessing) {
      onRestore(file);
    }
  }, [file, onRestore, isProcessing]);

  const handleDelete = useCallback(() => {
    if (!isProcessing) {
      onDelete(file);
    }
  }, [file, onDelete, isProcessing]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isProcessing) {
      onClose();
    }
  }, [onClose, isProcessing]);

  return (
    <div className={styles.overlay} onClick={handleBackdropClick}>
      <div className={styles.viewer}>
        {/* Header */}
        <div className={styles.header}>
          <button className={styles.backButton} onClick={onClose} disabled={isProcessing}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span>Назад</span>
          </button>

          <div className={styles.headerTitle}>
            <span className={styles.mediaTypeIcon}>
              {MediaTypeIcons[getEffectiveMediaType(file.mediaType, file.mimeType)]}
            </span>
            <span>{getMediaTypeLabel(getEffectiveMediaType(file.mediaType, file.mimeType))}</span>
          </div>

          {/* Empty spacer for flex balance */}
          <div className={styles.headerSpacer} />
        </div>

        {/* Preview */}
        <div className={styles.previewContainer}>
          {file.thumbnailUrl ? (
            <img
              src={file.thumbnailUrl}
              alt=""
              className={styles.preview}
            />
          ) : (
            <div className={styles.iconPreview}>
              {MediaTypeIcons[file.mediaType]}
            </div>
          )}
        </div>

        {/* Info */}
        <div className={styles.info}>
          {/* Days remaining warning */}
          <div className={styles.deleteWarning}>
            {daysRemaining === 0
              ? 'Будет удалён сегодня автоматически'
              : `Удалится автоматически через ${daysRemaining} дн.`
            }
          </div>

          {/* Caption */}
          {file.caption && (
            <div className={styles.caption}>{file.caption.split('\n').map((line, i) => (
              <span key={i}>
                {line}
                {i < file.caption!.split('\n').length - 1 && <br />}
              </span>
            ))}</div>
          )}

          {/* Meta info */}
          <div className={styles.meta}>
            {file.fileName && (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Название:</span>
                <span>{file.fileName}</span>
              </div>
            )}

            {file.mimeType && (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Тип:</span>
                <span>{file.mimeType}</span>
              </div>
            )}

            {file.fileSize && (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Размер:</span>
                <span>{formatFileSize(file.fileSize)}</span>
              </div>
            )}

            {file.duration && (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Длительность:</span>
                <span>{formatDuration(file.duration)}</span>
              </div>
            )}

            {(file.width && file.height) && (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Разрешение:</span>
                <span>{file.width} × {file.height}</span>
              </div>
            )}

            {(file.forwardFromName || file.forwardFromChatTitle) && (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>От:</span>
                <span>{file.forwardFromName || file.forwardFromChatTitle}</span>
              </div>
            )}

            {file.deletedAt && (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Удалено:</span>
                <span>{formatDeletedDate(file.deletedAt)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          <button
            className={styles.restoreBtn}
            onClick={handleRestore}
            disabled={isProcessing}
          >
            {isRestoring ? (
              <span className={styles.spinner} />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            )}
            <span>Восстановить</span>
          </button>
          <button
            className={styles.deleteBtn}
            onClick={handleDelete}
            disabled={isProcessing}
          >
            {isDeleting ? (
              <span className={styles.spinner} />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            )}
            <span>Удалить навсегда</span>
          </button>
        </div>
      </div>
    </div>
  );
}
