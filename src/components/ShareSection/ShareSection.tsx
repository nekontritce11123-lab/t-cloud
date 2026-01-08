import { useState, useCallback } from 'react';
import { ShareResponse } from '../../api/client';
import { CopyIcon, CheckIcon } from '../../shared/icons';
import styles from './ShareSection.module.css';

interface ShareSectionProps {
  shareData: ShareResponse;
  onDisable: () => void;
  isDisabling: boolean;
}

export function ShareSection({ shareData, onDisable, isDisabling }: ShareSectionProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!shareData.shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareData.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, [shareData.shareUrl]);

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
      {/* URL + Copy */}
      <div className={styles.urlRow}>
        <span className={styles.url}>{shareData.shareUrl}</span>
        <button
          className={`${styles.copyBtn} ${copied ? styles.copied : ''}`}
          onClick={handleCopy}
        >
          {copied ? CheckIcon : CopyIcon}
        </button>
      </div>

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
