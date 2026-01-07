import { useCallback } from 'react';
import { FileRecord } from '../../api/client';
import { MediaTypeIcons } from '../../shared/icons';
import { formatFileSize, formatDuration, formatDate, getMediaTypeLabel, highlightMatch } from '../../shared/formatters';
import { getEffectiveMediaType } from '../../shared/mediaType';
import styles from './FileViewer.module.css';

interface FileViewerProps {
  file: FileRecord;
  onClose: () => void;
  onSend: (file: FileRecord) => void;
  isOnCooldown?: boolean;
  isSending?: boolean;
  searchQuery?: string;
}

export function FileViewer({ file, onClose, onSend, isOnCooldown, isSending, searchQuery }: FileViewerProps) {
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
              {MediaTypeIcons[getEffectiveMediaType(file.mediaType, file.mimeType)]}
            </span>
            <span>{getMediaTypeLabel(getEffectiveMediaType(file.mediaType, file.mimeType))}</span>
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
          {/* Caption с подсветкой совпадений */}
          {file.caption && (
            <div
              className={styles.caption}
              dangerouslySetInnerHTML={{
                __html: highlightMatch(
                  file.caption.replace(/\n/g, '<br/>'),
                  searchQuery
                )
              }}
            />
          )}

          {/* Meta info */}
          <div className={styles.meta}>
            {file.fileName && (
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Название:</span>
                <span
                  dangerouslySetInnerHTML={{
                    __html: highlightMatch(file.fileName, searchQuery)
                  }}
                />
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
                <span
                  dangerouslySetInnerHTML={{
                    __html: highlightMatch(
                      file.forwardFromName || file.forwardFromChatTitle || '',
                      searchQuery
                    )
                  }}
                />
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
