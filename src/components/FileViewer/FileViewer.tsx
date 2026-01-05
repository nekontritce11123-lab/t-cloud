import { useCallback } from 'react';
import { FileRecord, MediaType } from '../../api/client';
import styles from './FileViewer.module.css';

interface FileViewerProps {
  file: FileRecord;
  onClose: () => void;
  onSend: (file: FileRecord) => void;
  isOnCooldown?: boolean;
  isSending?: boolean;
}

// SF Symbols style SVG icons
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

function formatDate(dateStr: string): string {
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

export function FileViewer({ file, onClose, onSend, isOnCooldown, isSending }: FileViewerProps) {
  const handleSend = useCallback(() => {
    if (!isOnCooldown && !isSending) {
      onSend(file);
    }
  }, [file, onSend, isOnCooldown, isSending]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={handleBackdropClick}>
      <div className={styles.viewer}>
        {/* Header */}
        <div className={styles.header}>
          <button className={styles.backButton} onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span>Назад</span>
          </button>

          <div className={styles.headerTitle}>
            <span className={styles.mediaTypeIcon}>
              {MediaTypeIcons[file.mediaType]}
            </span>
            <span>{getMediaTypeLabel(file.mediaType)}</span>
          </div>

          <button
            className={`${styles.headerSendButton} ${isOnCooldown ? styles.disabled : ''}`}
            onClick={handleSend}
            disabled={isOnCooldown || isSending}
          >
            {isSending ? (
              <span className={styles.smallSpinner} />
            ) : isOnCooldown ? (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span>Отправлено</span>
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2 11 13" />
                  <path d="M22 2 15 22 11 13 2 9 22 2z" />
                </svg>
                <span>Отправить</span>
              </>
            )}
          </button>
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
          {/* Caption or filename - сохраняем переносы строк */}
          {file.caption && (
            <div className={styles.caption}>{file.caption.split('\n').map((line, i) => (
              <span key={i}>
                {line}
                {i < file.caption!.split('\n').length - 1 && <br />}
              </span>
            ))}</div>
          )}

          {file.fileName && (
            <div className={styles.fileName}>{file.fileName}</div>
          )}

          {/* Meta info */}
          <div className={styles.meta}>
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

            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Добавлено:</span>
              <span>{formatDate(file.createdAt)}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
