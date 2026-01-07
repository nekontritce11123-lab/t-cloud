import { useState, useEffect, useCallback } from 'react';
import { FileRecord, ShareResponse, apiClient } from '../../api/client';
import { CopyIcon, CheckIcon } from '../../shared/icons';
import styles from './ShareModal.module.css';

interface ShareModalProps {
  file: FileRecord;
  onClose: () => void;
}

type RecipientLimit = 1 | 5 | 10 | null;
type ExpiresIn = 24 | 168 | 720 | null; // hours: 1 day, 7 days, 30 days, never

const RECIPIENT_OPTIONS: { value: RecipientLimit; label: string }[] = [
  { value: 1, label: '1' },
  { value: 5, label: '5' },
  { value: 10, label: '10' },
  { value: null, label: '\u221E' }, // infinity symbol
];

const EXPIRES_OPTIONS: { value: ExpiresIn; label: string }[] = [
  { value: 24, label: '1 день' },
  { value: 168, label: '7 дней' },
  { value: 720, label: '30 дней' },
  { value: null, label: '\u221E' }, // infinity symbol
];

export function ShareModal({ file, onClose }: ShareModalProps) {
  const [loading, setLoading] = useState(true);
  const [shareData, setShareData] = useState<ShareResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Settings for new share
  const [maxRecipients, setMaxRecipients] = useState<RecipientLimit>(null);
  const [expiresIn, setExpiresIn] = useState<ExpiresIn>(null);

  // Load existing share info
  useEffect(() => {
    const loadShareInfo = async () => {
      setLoading(true);
      try {
        const data = await apiClient.getShareInfo(file.id);
        setShareData(data);
      } catch (error) {
        console.error('Failed to load share info:', error);
      } finally {
        setLoading(false);
      }
    };

    loadShareInfo();
  }, [file.id]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const handleCopy = useCallback(async () => {
    if (!shareData?.shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareData.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, [shareData?.shareUrl]);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      const options: { maxRecipients?: number; expiresIn?: number } = {};
      if (maxRecipients !== null) {
        options.maxRecipients = maxRecipients;
      }
      if (expiresIn !== null) {
        options.expiresIn = expiresIn;
      }

      const data = await apiClient.createShareLink(file.id, options);
      setShareData(data);
    } catch (error) {
      console.error('Failed to create share link:', error);
    } finally {
      setCreating(false);
    }
  }, [file.id, maxRecipients, expiresIn]);

  const handleDelete = useCallback(async () => {
    if (!shareData?.share.token) return;

    setDeleting(true);
    try {
      await apiClient.deleteShareLink(shareData.share.token);
      setShareData(null);
    } catch (error) {
      console.error('Failed to delete share link:', error);
    } finally {
      setDeleting(false);
    }
  }, [shareData?.share.token]);

  const formatExpiresAt = (expiresAt: string | null): string => {
    if (!expiresAt) return 'Бессрочно';
    const date = new Date(expiresAt);
    const now = new Date();
    const diff = date.getTime() - now.getTime();

    if (diff < 0) return 'Истекла';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) {
      return `${days} дн. ${hours} ч.`;
    }
    return `${hours} ч.`;
  };

  return (
    <div className={styles.overlay} onClick={handleBackdropClick}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>Поделиться</h2>
          <button className={styles.closeButton} onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner} />
          </div>
        ) : shareData ? (
          <>
            {/* Link Section */}
            <div className={styles.linkSection}>
              <div className={styles.linkContainer}>
                <input
                  type="text"
                  className={styles.linkInput}
                  value={shareData.shareUrl}
                  readOnly
                />
                <button
                  className={`${styles.copyButton} ${copied ? styles.copied : ''}`}
                  onClick={handleCopy}
                >
                  {copied ? CheckIcon : CopyIcon}
                </button>
              </div>
            </div>

            {/* Stats Section */}
            <div className={styles.statsSection}>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Скачали:</span>
                <span className={styles.statValue}>
                  {shareData.share.useCount}
                  {shareData.share.maxRecipients && ` / ${shareData.share.maxRecipients}`}
                </span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Срок действия:</span>
                <span className={styles.statValue}>
                  {formatExpiresAt(shareData.share.expiresAt)}
                </span>
              </div>
            </div>

            {/* Delete Action */}
            <div className={styles.actions}>
              <button
                className={styles.deleteButton}
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Отключение...' : 'Отключить ссылку'}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Settings for new share */}
            <div className={styles.settingsSection}>
              <div className={styles.settingLabel}>Лимит получателей</div>
              <div className={styles.chips}>
                {RECIPIENT_OPTIONS.map((option) => (
                  <button
                    key={String(option.value)}
                    className={`${styles.chip} ${maxRecipients === option.value ? styles.active : ''}`}
                    onClick={() => setMaxRecipients(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.settingsSection}>
              <div className={styles.settingLabel}>Срок действия</div>
              <div className={styles.chips}>
                {EXPIRES_OPTIONS.map((option) => (
                  <button
                    key={String(option.value)}
                    className={`${styles.chip} ${expiresIn === option.value ? styles.active : ''}`}
                    onClick={() => setExpiresIn(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Create Action */}
            <div className={styles.actions}>
              <button
                className={styles.createButton}
                onClick={handleCreate}
                disabled={creating}
              >
                {creating ? 'Создание...' : 'Создать ссылку'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
