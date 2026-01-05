import { useState, useEffect, useCallback } from 'react';
import { apiClient, FileRecord, LinkRecord } from '../../api/client';
import styles from './TrashView.module.css';

interface TrashViewProps {
  onRestore: () => void;
  hapticFeedback: {
    light: () => void;
    medium: () => void;
    success: () => void;
    error: () => void;
  };
}

// Calculate days remaining before auto-delete
function getDaysRemaining(deletedAt: string): number {
  const deleted = new Date(deletedAt);
  const now = new Date();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  const deleteDate = new Date(deleted.getTime() + thirtyDays);
  const remaining = Math.ceil((deleteDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, remaining);
}

// Format remaining days text
function formatRemaining(days: number): string {
  if (days === 0) return 'Удалится сегодня';
  if (days === 1) return 'Удалится завтра';
  if (days < 5) return `Удалится через ${days} дня`;
  return `Удалится через ${days} дней`;
}

interface TrashItemProps {
  type: 'file' | 'link';
  id: number;
  title: string;
  subtitle?: string | null;
  emoji: string;
  thumbnailUrl?: string | null;
  deletedAt: string;
  onRestore: (type: 'file' | 'link', id: number) => void;
  onDelete: (type: 'file' | 'link', id: number) => void;
}

function TrashItem({ type, id, title, subtitle, emoji, thumbnailUrl, deletedAt, onRestore, onDelete }: TrashItemProps) {
  const [showActions, setShowActions] = useState(false);
  const daysRemaining = getDaysRemaining(deletedAt);

  return (
    <div className={styles.item}>
      <button className={styles.itemContent} onClick={() => setShowActions(!showActions)}>
        <div className={styles.preview}>
          {thumbnailUrl ? (
            <img src={thumbnailUrl} alt="" className={styles.thumbnail} loading="lazy" />
          ) : (
            <span className={styles.emoji}>{emoji}</span>
          )}
        </div>
        <div className={styles.info}>
          <span className={styles.title}>{title}</span>
          {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
          <span className={styles.remaining}>{formatRemaining(daysRemaining)}</span>
        </div>
      </button>

      {showActions && (
        <div className={styles.actions}>
          <button className={styles.restoreBtn} onClick={() => onRestore(type, id)}>
            Восстановить
          </button>
          <button className={styles.permanentDeleteBtn} onClick={() => onDelete(type, id)}>
            Удалить навсегда
          </button>
        </div>
      )}
    </div>
  );
}

export function TrashView({ onRestore, hapticFeedback }: TrashViewProps) {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [links, setLinks] = useState<LinkRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load trash items
  const loadTrash = useCallback(async () => {
    setIsLoading(true);
    try {
      const [filesResult, linksResult] = await Promise.all([
        apiClient.getTrashFiles(),
        apiClient.getTrashLinks(),
      ]);
      setFiles(filesResult.items);
      setLinks(linksResult.items);
    } catch (error) {
      console.error('Error loading trash:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrash();
  }, [loadTrash]);

  // Restore item
  const handleRestore = useCallback(async (type: 'file' | 'link', id: number) => {
    hapticFeedback.light();
    try {
      if (type === 'file') {
        await apiClient.restoreFile(id);
        setFiles(prev => prev.filter(f => f.id !== id));
      } else {
        await apiClient.restoreLink(id);
        setLinks(prev => prev.filter(l => l.id !== id));
      }
      hapticFeedback.success();
      onRestore();
    } catch (error) {
      console.error('Error restoring:', error);
      hapticFeedback.error();
    }
  }, [hapticFeedback, onRestore]);

  // Permanently delete item
  const handlePermanentDelete = useCallback(async (type: 'file' | 'link', id: number) => {
    hapticFeedback.medium();
    try {
      if (type === 'file') {
        await apiClient.permanentDeleteFile(id);
        setFiles(prev => prev.filter(f => f.id !== id));
      } else {
        await apiClient.permanentDeleteLink(id);
        setLinks(prev => prev.filter(l => l.id !== id));
      }
      hapticFeedback.success();
    } catch (error) {
      console.error('Error deleting:', error);
      hapticFeedback.error();
    }
  }, [hapticFeedback]);

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <div className="spinner" />
      </div>
    );
  }

  const isEmpty = files.length === 0 && links.length === 0;

  if (isEmpty) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>🗑️</span>
        <p>Корзина пуста</p>
        <p className={styles.emptyHint}>Удалённые файлы будут храниться здесь 30 дней</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.headerText}>
          Удалённые элементы автоматически удаляются через 30 дней
        </span>
      </div>

      <div className={styles.list}>
        {/* Files */}
        {files.map(file => (
          <TrashItem
            key={`file-${file.id}`}
            type="file"
            id={file.id}
            title={file.caption || file.fileName || 'Файл'}
            subtitle={file.fileName && file.caption ? file.fileName : undefined}
            emoji={getFileEmoji(file.mediaType)}
            thumbnailUrl={file.thumbnailUrl}
            deletedAt={file.deletedAt!}
            onRestore={handleRestore}
            onDelete={handlePermanentDelete}
          />
        ))}

        {/* Links */}
        {links.map(link => (
          <TrashItem
            key={`link-${link.id}`}
            type="link"
            id={link.id}
            title={link.title || link.url}
            subtitle={link.siteName}
            emoji="🔗"
            thumbnailUrl={link.imageUrl}
            deletedAt={link.deletedAt!}
            onRestore={handleRestore}
            onDelete={handlePermanentDelete}
          />
        ))}
      </div>
    </div>
  );
}

function getFileEmoji(mediaType: string): string {
  const emojis: Record<string, string> = {
    photo: '🖼',
    video: '🎬',
    document: '📄',
    audio: '🎵',
    voice: '🎤',
    video_note: '⭕',
    animation: '🎞',
    sticker: '🎨',
  };
  return emojis[mediaType] || '📁';
}
