import { useCallback, useState, useEffect, useRef } from 'react';
import { FileRecord, ShareResponse, apiClient } from '../../api/client';
import { MediaTypeIcons, ShareIcon } from '../../shared/icons';
import { formatFileSize, formatDuration, formatDate, getMediaTypeLabel, highlightMatch } from '../../shared/formatters';
import { getEffectiveMediaType } from '../../shared/mediaType';
import { ShareSection } from '../ShareSection';
import { VideoPlayer } from '../VideoPlayer';
import { useSwipeNavigation } from '../../hooks/useSwipeNavigation';
import { useFileViewerKeyboard } from '../../hooks/useFileViewerKeyboard';
import styles from './FileViewer.module.css';

// Helper to check if file is a video
function isVideoFile(mediaType: string): boolean {
  return mediaType === 'video' || mediaType === 'video_note';
}

// Preset options for share creation
const RECIPIENT_PRESETS = [1, 5, 10] as const;
const EXPIRES_PRESETS = [
  { value: 24, label: '1 день' },
  { value: 168, label: '7 дней' },
  { value: 720, label: '30 дней' },
] as const;

interface FileViewerProps {
  file: FileRecord;
  // Navigation props
  hasPrev?: boolean;
  hasNext?: boolean;
  positionLabel?: string;  // "3 из 47"
  onNavigate?: (direction: 'prev' | 'next') => void;
  // Existing props
  onClose: () => void;
  onSend: (file: FileRecord) => void;
  isOnCooldown?: boolean;
  isSending?: boolean;
  searchQuery?: string;
}

type ShareMode = 'idle' | 'creating';

export function FileViewer({
  file,
  hasPrev,
  hasNext,
  positionLabel,
  onNavigate,
  onClose,
  onSend,
  isOnCooldown,
  isSending,
  searchQuery
}: FileViewerProps) {
  const [shareLoading, setShareLoading] = useState(true);
  const [shareData, setShareData] = useState<ShareResponse | null>(null);
  const [disablingShare, setDisablingShare] = useState(false);

  // Share creation state
  const [shareMode, setShareMode] = useState<ShareMode>('idle');
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [maxRecipients, setMaxRecipients] = useState<number | null>(null);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);

  // Custom input state
  const [isCustomRecipients, setIsCustomRecipients] = useState(false);
  const [isCustomExpires, setIsCustomExpires] = useState(false);
  const [customRecipientsValue, setCustomRecipientsValue] = useState('');
  const [customExpiresValue, setCustomExpiresValue] = useState('');
  const [expiresUnit, setExpiresUnit] = useState<'hours' | 'days'>('days');

  // Refs for auto-focus
  const recipientsInputRef = useRef<HTMLInputElement>(null);
  const expiresInputRef = useRef<HTMLInputElement>(null);

  // Load share info on mount (optimized: skip if no share exists)
  useEffect(() => {
    // If file has no share, show button immediately
    if (!file.hasShare) {
      setShareLoading(false);
      setShareData(null);
      return;
    }

    // File has share, load details
    setShareLoading(true);
    apiClient.getShareInfo(file.id)
      .then(setShareData)
      .catch(() => setShareData(null))
      .finally(() => setShareLoading(false));
  }, [file.id, file.hasShare]);

  // Auto-focus when switching to custom mode
  useEffect(() => {
    if (isCustomRecipients && recipientsInputRef.current) {
      recipientsInputRef.current.focus();
    }
  }, [isCustomRecipients]);

  useEffect(() => {
    if (isCustomExpires && expiresInputRef.current) {
      expiresInputRef.current.focus();
    }
  }, [isCustomExpires]);

  // Reset share creation state
  const resetShareCreation = useCallback(() => {
    setShareMode('idle');
    setMaxRecipients(null);
    setExpiresIn(null);
    setIsCustomRecipients(false);
    setIsCustomExpires(false);
    setCustomRecipientsValue('');
    setCustomExpiresValue('');
    setExpiresUnit('days');
  }, []);

  // Handle create share
  const handleCreateShare = useCallback(async () => {
    setIsCreatingShare(true);
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
      resetShareCreation();
    } catch (error) {
      console.error('Failed to create share link:', error);
    } finally {
      setIsCreatingShare(false);
    }
  }, [file.id, maxRecipients, expiresIn, resetShareCreation]);

  // Handle disable share
  const handleDisableShare = useCallback(async () => {
    if (!shareData?.share.token) return;
    setDisablingShare(true);
    try {
      await apiClient.deleteShareLink(shareData.share.token);
      setShareData(null);
    } catch (error) {
      console.error('Failed to disable share:', error);
    } finally {
      setDisablingShare(false);
    }
  }, [shareData?.share.token]);

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

  // Navigation handlers
  const handlePrev = useCallback(() => {
    if (hasPrev && onNavigate) {
      onNavigate('prev');
    }
  }, [hasPrev, onNavigate]);

  const handleNext = useCallback(() => {
    if (hasNext && onNavigate) {
      onNavigate('next');
    }
  }, [hasNext, onNavigate]);

  // Swipe navigation (swipe left = next, swipe right = prev, swipe down = close)
  const swipeHandlers = useSwipeNavigation({
    onSwipeLeft: handleNext,
    onSwipeRight: handlePrev,
    onSwipeDown: onClose,
  });

  // Keyboard navigation (arrows, escape, enter)
  useFileViewerKeyboard({
    onPrev: handlePrev,
    onNext: handleNext,
    onClose,
    onSend: handleSend,
    isActive: true,
  });

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
            {positionLabel && (
              <span className={styles.positionLabel}>{positionLabel}</span>
            )}
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
        <div className={styles.previewContainer} {...swipeHandlers}>
          {isVideoFile(file.mediaType) ? (
            <VideoPlayer file={file} thumbnailUrl={file.thumbnailUrl} />
          ) : file.thumbnailUrl ? (
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

          {/* Navigation buttons (desktop only) */}
          {onNavigate && (
            <>
              <button
                className={`${styles.navButton} ${styles.navButtonLeft}`}
                onClick={handlePrev}
                disabled={!hasPrev}
                aria-label="Previous"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <button
                className={`${styles.navButton} ${styles.navButtonRight}`}
                onClick={handleNext}
                disabled={!hasNext}
                aria-label="Next"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </>
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

          {/* Share Section */}
          {shareLoading ? (
            <div className={styles.shareLoading}>
              <div className={styles.miniSpinner} />
            </div>
          ) : shareData ? (
            <ShareSection
              shareData={shareData}
              onDisable={handleDisableShare}
              isDisabling={disablingShare}
            />
          ) : shareMode === 'creating' ? (
            <div className={styles.shareCreateArea}>
              <div className={styles.settingsBlock}>
                {/* Expires Row - first */}
                <div className={styles.settingRow}>
                  <div className={styles.settingLabel}>Срок</div>
                  <div className={styles.chips}>
                    {isCustomExpires ? (
                      <div className={styles.inlineInputWithToggle}>
                        <input
                          ref={expiresInputRef}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={customExpiresValue}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            if (val === '' || (parseInt(val) > 0 && parseInt(val) <= 365)) {
                              setCustomExpiresValue(val);
                              if (val) {
                                const hours = expiresUnit === 'days' ? parseInt(val) * 24 : parseInt(val);
                                setExpiresIn(hours);
                              } else {
                                setExpiresIn(null);
                              }
                            }
                          }}
                          placeholder="..."
                          className={styles.inlineInputField}
                        />
                        <div className={styles.unitToggle}>
                          <button
                            className={`${styles.unitBtn} ${expiresUnit === 'hours' ? styles.active : ''}`}
                            onClick={() => {
                              setExpiresUnit('hours');
                              if (customExpiresValue) {
                                setExpiresIn(parseInt(customExpiresValue));
                              }
                            }}
                          >
                            ч
                          </button>
                          <button
                            className={`${styles.unitBtn} ${expiresUnit === 'days' ? styles.active : ''}`}
                            onClick={() => {
                              setExpiresUnit('days');
                              if (customExpiresValue) {
                                setExpiresIn(parseInt(customExpiresValue) * 24);
                              }
                            }}
                          >
                            дн
                          </button>
                        </div>
                        <button
                          className={styles.inlineCancel}
                          onClick={() => {
                            setIsCustomExpires(false);
                            setCustomExpiresValue('');
                            setExpiresIn(null);
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <button
                        className={styles.chip}
                        onClick={() => setIsCustomExpires(true)}
                      >
                        <svg className={styles.chipIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        </svg>
                      </button>
                    )}
                    {EXPIRES_PRESETS.map((option) => (
                      <button
                        key={option.value}
                        className={`${styles.chip} ${expiresIn === option.value && !isCustomExpires ? styles.active : ''}`}
                        onClick={() => {
                          setExpiresIn(option.value);
                          setCustomExpiresValue('');
                          setIsCustomExpires(false);
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                    <button
                      className={`${styles.chip} ${expiresIn === null && !isCustomExpires ? styles.active : ''}`}
                      onClick={() => {
                        setExpiresIn(null);
                        setCustomExpiresValue('');
                        setIsCustomExpires(false);
                      }}
                    >
                      ∞
                    </button>
                  </div>
                </div>

                <div className={styles.divider} />

                {/* Recipients Row - second */}
                <div className={styles.settingRow}>
                  <div className={styles.settingLabel}>Лимит</div>
                  <div className={styles.chips}>
                    {isCustomRecipients ? (
                      <div className={styles.inlineInput}>
                        <input
                          ref={recipientsInputRef}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={customRecipientsValue}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            if (val === '' || (parseInt(val) > 0 && parseInt(val) <= 10000)) {
                              setCustomRecipientsValue(val);
                              setMaxRecipients(val ? parseInt(val) : null);
                            }
                          }}
                          placeholder="..."
                          className={styles.inlineInputField}
                        />
                        <button
                          className={styles.inlineCancel}
                          onClick={() => {
                            setIsCustomRecipients(false);
                            setCustomRecipientsValue('');
                            setMaxRecipients(null);
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <button
                        className={styles.chip}
                        onClick={() => setIsCustomRecipients(true)}
                      >
                        <svg className={styles.chipIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        </svg>
                      </button>
                    )}
                    {RECIPIENT_PRESETS.map((value) => (
                      <button
                        key={value}
                        className={`${styles.chip} ${maxRecipients === value && !isCustomRecipients ? styles.active : ''}`}
                        onClick={() => {
                          setMaxRecipients(value);
                          setCustomRecipientsValue('');
                          setIsCustomRecipients(false);
                        }}
                      >
                        {value}
                      </button>
                    ))}
                    <button
                      className={`${styles.chip} ${maxRecipients === null && !isCustomRecipients ? styles.active : ''}`}
                      onClick={() => {
                        setMaxRecipients(null);
                        setCustomRecipientsValue('');
                        setIsCustomRecipients(false);
                      }}
                    >
                      ∞
                    </button>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className={styles.shareActions}>
                <button
                  className={styles.cancelBtn}
                  onClick={resetShareCreation}
                >
                  Отмена
                </button>
                <button
                  className={styles.createBtn}
                  onClick={handleCreateShare}
                  disabled={isCreatingShare}
                >
                  {isCreatingShare ? 'Создание...' : 'Создать ссылку'}
                </button>
              </div>
            </div>
          ) : (
            <button
              className={styles.shareButton}
              onClick={() => setShareMode('creating')}
            >
              <span className={styles.shareIcon}>{ShareIcon}</span>
              Поделиться
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
