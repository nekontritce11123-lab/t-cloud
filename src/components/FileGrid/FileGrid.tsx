import { FileRecord, MediaType } from '../../api/client';
import styles from './FileGrid.module.css';

interface FileGridProps {
  files: FileRecord[];
  onFileClick: (file: FileRecord) => void;
}

const TYPE_EMOJI: Record<MediaType, string> = {
  photo: '🖼',
  video: '🎬',
  document: '📄',
  audio: '🎵',
  voice: '🎤',
  video_note: '⭕',
  animation: '🎞',
  sticker: '🎨',
  link: '🔗',
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

export function FileGrid({ files, onFileClick }: FileGridProps) {
  if (files.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>📭</span>
        <p>Файлы не найдены</p>
        <p className={styles.emptyHint}>Пересылайте файлы боту, чтобы они появились здесь</p>
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      {files.map(file => (
        <button
          key={file.id}
          className={styles.card}
          onClick={() => onFileClick(file)}
        >
          {/* Thumbnail or icon */}
          <div className={styles.preview}>
            {file.thumbnailUrl ? (
              <img
                src={file.thumbnailUrl}
                alt=""
                className={styles.thumbnail}
                loading="lazy"
              />
            ) : (
              <span className={styles.icon}>
                {TYPE_EMOJI[file.mediaType] || '📁'}
              </span>
            )}

            {/* Duration badge for video/audio */}
            {file.duration && (
              <span className={styles.duration}>
                {formatDuration(file.duration)}
              </span>
            )}
          </div>

          {/* File info */}
          <div className={styles.info}>
            <span className={styles.name}>
              {file.fileName || file.caption || `${TYPE_EMOJI[file.mediaType]} ${file.mediaType}`}
            </span>
            {file.fileSize && (
              <span className={styles.size}>{formatFileSize(file.fileSize)}</span>
            )}
          </div>

          {/* Forward info badge */}
          {(file.forwardFromName || file.forwardFromChatTitle) && (
            <div className={styles.forward}>
              <span className={styles.forwardIcon}>↩️</span>
              <span className={styles.forwardName}>
                {file.forwardFromName || file.forwardFromChatTitle}
              </span>
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
