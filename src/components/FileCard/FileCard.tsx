import { ReactNode } from 'react';
import { FileRecord } from '../../api/client';
import { MediaTypeIcons, ForwardIcon, FolderIcon } from '../../shared/icons';
import { formatDuration, formatFileSize } from '../../shared/formatters';
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
  // When includeDataFileId is true, Timeline manages long press for drag selection
  // FileCard's useLongPress only handles click vs long-press distinction (to prevent onClick after long press)
  const effectiveLongPress = includeDataFileId ? undefined : onFileLongPress;
  const longPress = useLongPress(file, effectiveLongPress, onFileClick);

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

      {/* Cooldown badge (when isOnCooldown is true and no custom badge, hide in selection mode) */}
      {isOnCooldown && !badge && !isSelectionMode && (
        <div className={cardStyles.cooldownBadge}>✓</div>
      )}

      {/* Selection checkbox - shows for ALL files including cooldown */}
      {isSelectionMode && (
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
            </div>
          ) : file.mediaType !== 'photo' ? (
            /* Компактный бейдж для видео/документов без текста (не для фото) */
            <div className={cardStyles.miniBadge}>
              <span className={cardStyles.miniBadgeIcon}>
                {MediaTypeIcons[getEffectiveMediaType(file.mediaType, file.mimeType)]}
              </span>
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
          {file.fileSize && (
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
