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
  /** Search match info for highlighting */
  searchMatch?: { field: string; snippet: string };
}

// Inline подсветка совпадений в тексте
function highlightText(
  text: string,
  targetField: string | string[],
  searchMatch?: { field: string; snippet: string }
): string {
  if (!searchMatch) return text;

  const fields = Array.isArray(targetField) ? targetField : [targetField];
  if (!fields.includes(searchMatch.field)) return text;

  // Извлекаем слово из snippet (между **)
  const match = searchMatch.snippet.match(/\*\*([^*]+)\*\*/);
  if (!match) return text;

  const word = match[1];
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
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
  searchMatch,
}: FileCardProps) {
  const longPress = useLongPress(file, onFileLongPress, onFileClick);

  const cardClassName = [
    cardStyles.card,
    isSelected ? cardStyles.selected : '',
    isOnCooldown ? cardStyles.cooldown : '',
    disableActiveScale ? cardStyles.noActiveScale : '',
  ].filter(Boolean).join(' ');

  // Не показывать размер файла на миниатюрах изображений (photo, video_note, PNG и др.)
  const isImageType = file.mediaType === 'photo' ||
    file.mediaType === 'video_note' ||
    file.mimeType?.startsWith('image/');
  const showFileSize = !isImageType;

  return (
    <button
      className={cardClassName}
      data-file-id={includeDataFileId ? file.id : undefined}
      onClick={longPress.onClick}
      onContextMenu={(e) => e.preventDefault()}
      onTouchStart={longPress.onTouchStart}
      onTouchMove={longPress.onTouchMove}
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
                  <span
                    className={cardStyles.caption}
                    dangerouslySetInnerHTML={{
                      __html: highlightText(file.caption, 'caption', searchMatch)
                    }}
                  />
                  {file.fileName && (
                    <span className={cardStyles.fileName}>{file.fileName}</span>
                  )}
                </>
              ) : (
                <>
                  {file.fileName && (
                    <span
                      className={cardStyles.name}
                      dangerouslySetInnerHTML={{
                        __html: highlightText(file.fileName, 'file_name', searchMatch)
                      }}
                    />
                  )}
                </>
              )}
              {showFileSize && file.fileSize && (
                <span className={cardStyles.size}>{formatFileSize(file.fileSize)}</span>
              )}
            </div>
          ) : file.mediaType !== 'photo' ? (
            /* Компактный бейдж для видео/документов без текста (не для фото) */
            <div className={cardStyles.miniBadge}>
              <span className={cardStyles.miniBadgeIcon}>
                {MediaTypeIcons[getEffectiveMediaType(file.mediaType, file.mimeType)]}
              </span>
              {showFileSize && file.fileSize && <span>{formatFileSize(file.fileSize)}</span>}
            </div>
          ) : null}
        </>
      ) : (
        /* === КАРТОЧКА БЕЗ ПРЕВЬЮ (документы) === */
        <div className={cardStyles.noThumbContent}>
          <span className={cardStyles.iconLarge}>
            {MediaTypeIcons[getEffectiveMediaType(file.mediaType, file.mimeType)] || FolderIcon}
          </span>
          {file.fileName && (
            <span
              className={cardStyles.fileNameCenter}
              dangerouslySetInnerHTML={{
                __html: highlightText(file.fileName, 'file_name', searchMatch)
              }}
            />
          )}
          {showFileSize && file.fileSize && (
            <span className={cardStyles.fileSizeCenter}>{formatFileSize(file.fileSize)}</span>
          )}
        </div>
      )}

      {/* Forward badge с inline подсветкой */}
      {(file.forwardFromName || file.forwardFromChatTitle) && (
        <div className={cardStyles.forward}>
          <ForwardIcon className={cardStyles.forwardIcon} />
          <span
            className={cardStyles.forwardName}
            dangerouslySetInnerHTML={{
              __html: highlightText(
                file.forwardFromName || file.forwardFromChatTitle || '',
                ['forward_from_name', 'forward_from_chat_title'],
                searchMatch
              )
            }}
          />
        </div>
      )}
    </button>
  );
}
