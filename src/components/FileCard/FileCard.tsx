import { ReactNode } from 'react';
import { FileRecord } from '../../api/client';
import { MediaTypeIcons, ForwardIcon, FolderIcon } from '../../shared/icons';
import { formatFileSize, formatDuration } from '../../shared/formatters';
import { getEffectiveMediaType } from '../../shared/mediaType';
import { useLongPress } from '../../hooks/useLongPress';
import cardStyles from '../../styles/Card.module.css';

interface FileCardProps {
  file: FileRecord;
  onFileClick: (file: FileRecord) => void;
  onFileLongPress?: (file: FileRecord) => void;
  isSelected?: boolean;
  isSelectionMode?: boolean;
  isOnCooldown?: boolean;
  /** Custom badge (cooldown checkmark or days remaining) */
  badge?: ReactNode;
  /** Disable scale on active (for trash cards) */
  disableActiveScale?: boolean;
  /** Include data-file-id attribute (for drag selection) */
  includeDataFileId?: boolean;
}

export function FileCard({
  file,
  onFileClick,
  onFileLongPress,
  isSelected,
  isSelectionMode,
  isOnCooldown,
  badge,
  disableActiveScale,
  includeDataFileId,
}: FileCardProps) {
  const longPress = useLongPress(file, onFileLongPress, onFileClick);

  const cardClassName = [
    cardStyles.card,
    isSelected ? cardStyles.selected : '',
    isOnCooldown ? cardStyles.cooldown : '',
    disableActiveScale ? cardStyles.noActiveScale : '',
  ].filter(Boolean).join(' ');

  return (
    <button
      className={cardClassName}
      data-file-id={includeDataFileId ? file.id : undefined}
      onClick={longPress.onClick}
      onTouchStart={longPress.onTouchStart}
      onTouchEnd={longPress.onTouchEnd}
      onTouchCancel={longPress.onTouchCancel}
      onMouseDown={longPress.onMouseDown}
      onMouseUp={longPress.onMouseUp}
      onMouseLeave={longPress.onMouseLeave}
    >
      {/* Custom badge (cooldown or days remaining) */}
      {badge}

      {/* Cooldown badge (when isOnCooldown is true and no custom badge) */}
      {isOnCooldown && !badge && (
        <div className={cardStyles.cooldownBadge}>✓</div>
      )}

      {/* Selection checkbox */}
      {isSelectionMode && !isOnCooldown && (
        <div className={cardStyles.checkbox}>
          {isSelected ? '✓' : ''}
        </div>
      )}

      {file.thumbnailUrl ? (
        /* === КАРТОЧКА С ПРЕВЬЮ === */
        <>
          <div className={cardStyles.preview}>
            <img
              src={file.thumbnailUrl}
              alt=""
              className={cardStyles.thumbnail}
              loading="lazy"
            />
            {file.duration && (
              <span className={cardStyles.duration}>
                {formatDuration(file.duration)}
              </span>
            )}
          </div>

          {/* File info - адаптивная панель */}
          {(file.caption || file.fileName) ? (
            <div className={cardStyles.info}>
              {file.caption ? (
                <>
                  <span className={cardStyles.caption}>{file.caption}</span>
                  {file.fileName && (
                    <span className={cardStyles.fileName}>{file.fileName}</span>
                  )}
                </>
              ) : (
                <>
                  {file.fileName && (
                    <span className={cardStyles.name}>{file.fileName}</span>
                  )}
                </>
              )}
              {file.fileSize && (
                <span className={cardStyles.size}>{formatFileSize(file.fileSize)}</span>
              )}
            </div>
          ) : (
            /* Компактный бейдж для фото/видео без текста */
            <div className={cardStyles.miniBadge}>
              <span className={cardStyles.miniBadgeIcon}>
                {MediaTypeIcons[getEffectiveMediaType(file.mediaType, file.mimeType)]}
              </span>
              {file.fileSize && <span>{formatFileSize(file.fileSize)}</span>}
            </div>
          )}
        </>
      ) : (
        /* === КАРТОЧКА БЕЗ ПРЕВЬЮ (документы) === */
        <div className={cardStyles.noThumbContent}>
          <span className={cardStyles.iconLarge}>
            {MediaTypeIcons[getEffectiveMediaType(file.mediaType, file.mimeType)] || FolderIcon}
          </span>
          {file.fileName && (
            <span className={cardStyles.fileNameCenter}>{file.fileName}</span>
          )}
          {file.fileSize && (
            <span className={cardStyles.fileSizeCenter}>{formatFileSize(file.fileSize)}</span>
          )}
        </div>
      )}

      {(file.forwardFromName || file.forwardFromChatTitle) && (
        <div className={cardStyles.forward}>
          <ForwardIcon className={cardStyles.forwardIcon} />
          <span className={cardStyles.forwardName}>
            {file.forwardFromName || file.forwardFromChatTitle}
          </span>
        </div>
      )}
    </button>
  );
}
