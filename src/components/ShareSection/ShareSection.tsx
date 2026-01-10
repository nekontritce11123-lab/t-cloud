import { useState, useCallback } from 'react';
import { ShareResponse } from '../../api/client';
import { CopyIcon, CheckIcon } from '../../shared/icons';
import styles from './ShareSection.module.css';

interface ShareSectionProps {
  shareData: ShareResponse;
  onDisable: () => void;
  isDisabling: boolean;
}

type CopiedType = 'telegram' | 'web' | null;

export function ShareSection({ shareData, onDisable, isDisabling }: ShareSectionProps) {
  const [copied, setCopied] = useState<CopiedType>(null);

  const handleCopy = useCallback(async (type: 'telegram' | 'web') => {
    const url = type === 'telegram' ? shareData.shareUrl : shareData.webUrl;
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, [shareData.shareUrl, shareData.webUrl]);

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
    <div className={styles.section}>
      {/* Telegram URL */}
      <div className={styles.urlBlock}>
        <div className={styles.urlLabel}>Telegram:</div>
        <div className={styles.urlRow}>
          <span className={styles.url}>{shareData.shareUrl}</span>
          <button
            className={`${styles.copyBtn} ${copied === 'telegram' ? styles.copied : ''}`}
            onClick={() => handleCopy('telegram')}
          >
            {copied === 'telegram' ? CheckIcon : CopyIcon}
          </button>
        </div>
      </div>

      {/* Web URL */}
      {shareData.webUrl && (
        <div className={styles.urlBlock}>
          <div className={styles.urlLabel}>Веб-ссылка:</div>
          <div className={styles.urlRow}>
            <span className={styles.url}>{shareData.webUrl}</span>
            <button
              className={`${styles.copyBtn} ${copied === 'web' ? styles.copied : ''}`}
              onClick={() => handleCopy('web')}
            >
              {copied === 'web' ? CheckIcon : CopyIcon}
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className={styles.stats}>
        <span>
          Скачали: {shareData.share.useCount}
          {shareData.share.maxRecipients && ` / ${shareData.share.maxRecipients}`}
        </span>
        <span className={styles.separator}>•</span>
        <span>Срок: {formatExpiresAt(shareData.share.expiresAt)}</span>
      </div>

      {/* Disable button */}
      <button
        className={styles.disableBtn}
        onClick={onDisable}
        disabled={isDisabling}
      >
        {isDisabling ? 'Отключение...' : 'Отключить ссылку'}
      </button>
    </div>
  );
}
