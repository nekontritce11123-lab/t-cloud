import { useCallback, useState, useEffect, useRef } from 'react';
import { FileRecord, ShareResponse, apiClient } from '../../api/client';
import { MediaTypeIcons, ShareIcon } from '../../shared/icons';
import { formatFileSize, formatDuration, formatDate, getMediaTypeLabel, highlightMatch } from '../../shared/formatters';
import { getEffectiveMediaType } from '../../shared/mediaType';
import { ShareSection } from '../ShareSection';
import { VideoPlayer } from '../VideoPlayer';
import { AudioPlayer } from '../AudioPlayer';
import { useSwipeNavigation } from '../../hooks/useSwipeNavigation';
import { useFileViewerKeyboard } from '../../hooks/useFileViewerKeyboard';
import styles from './FileViewer.module.css';

// Helper to check if file is a video
function isVideoFile(mediaType: string): boolean {
  return mediaType === 'video' || mediaType === 'video_note';
}

// Helper to check if file is audio
function isAudioFile(mediaType: string): boolean {
  return mediaType === 'audio' || mediaType === 'voice';
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
  // Navigation props - соседние файлы для carousel-анимации
  prevFile?: FileRecord;
  nextFile?: FileRecord;
  hasPrev?: boolean;
  hasNext?: boolean;
  positionLabel?: string;  // "3 из 47"
  onNavigate?: (direction: 'prev' | 'next') => void;
  // Existing props
  onClose: () => void;
  onSend: (file: FileRecord) => void;
  onCaptionUpdate?: (fileId: number, newCaption: string | null) => void;
  isOnCooldown?: boolean;
  isSending?: boolean;
  searchQuery?: string;
}

type ShareMode = 'idle' | 'creating';

export function FileViewer({
  file,
  prevFile,
  nextFile,
  hasPrev,
  hasNext,
  positionLabel,
  onNavigate,
  onClose,
  onSend,
  onCaptionUpdate,
  isOnCooldown,
  isSending,
  searchQuery
}: FileViewerProps) {
  const [isClosing, setIsClosing] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'next' | 'prev' | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);  // Блокировка rapid swipes
  // Инициализация shareLoading зависит от файла - если нет share, сразу false
  const [shareLoading, setShareLoading] = useState(() => file.hasShare);
  const [shareData, setShareData] = useState<ShareResponse | null>(null);
  const [disablingShare, setDisablingShare] = useState(false);

  // Caption editing state
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState('');
  const [isSavingCaption, setIsSavingCaption] = useState(false);
  const captionTextareaRef = useRef<HTMLTextAreaElement>(null);

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
    // Сразу установить правильное значение при смене файла
    // Это предотвращает мелькание spinner для файлов без share
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

  // Auto-focus caption textarea when editing
  useEffect(() => {
    if (isEditingCaption && captionTextareaRef.current) {
      captionTextareaRef.current.focus();
      // Move cursor to end
      const len = captionTextareaRef.current.value.length;
      captionTextareaRef.current.setSelectionRange(len, len);
    }
  }, [isEditingCaption]);

  // Reset caption edit when file changes
  useEffect(() => {
    setIsEditingCaption(false);
    setCaptionDraft('');
  }, [file.id]);

  // Caption editing handlers
  const startCaptionEdit = useCallback(() => {
    setCaptionDraft(file.caption || '');
    setIsEditingCaption(true);
  }, [file.caption]);

  const cancelCaptionEdit = useCallback(() => {
    setIsEditingCaption(false);
    setCaptionDraft('');
  }, []);

  const saveCaptionEdit = useCallback(async () => {
    if (!onCaptionUpdate) return;

    const newCaption = captionDraft.trim() || null;
    // Skip if no change
    if (newCaption === (file.caption || null)) {
      setIsEditingCaption(false);
      return;
    }

    setIsSavingCaption(true);
    try {
      await onCaptionUpdate(file.id, newCaption);
      setIsEditingCaption(false);
    } catch (error) {
      console.error('Failed to save caption:', error);
    } finally {
      setIsSavingCaption(false);
    }
  }, [file.id, file.caption, captionDraft, onCaptionUpdate]);

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

  const handleAnimatedClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  }, [onClose]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleAnimatedClose();
    }
  }, [handleAnimatedClose]);

  // Navigation handlers - вызываем onNavigate ПОСЛЕ анимации
  const handlePrev = useCallback(() => {
    if (isAnimating || !hasPrev || !onNavigate || !prevFile) return;

    setIsAnimating(true);
    setSlideDirection('prev');

    // Ждём окончания анимации, потом меняем файл
    setTimeout(() => {
      onNavigate('prev');
      setSlideDirection(null);
      setIsAnimating(false);
    }, 320);
  }, [isAnimating, hasPrev, onNavigate, prevFile]);

  const handleNext = useCallback(() => {
    if (isAnimating || !hasNext || !onNavigate || !nextFile) return;

    setIsAnimating(true);
    setSlideDirection('next');

    // Ждём окончания анимации, потом меняем файл
    setTimeout(() => {
      onNavigate('next');
      setSlideDirection(null);
      setIsAnimating(false);
    }, 320);
  }, [isAnimating, hasNext, onNavigate, nextFile]);

  // Swipe navigation (swipe left = next, swipe right = prev, swipe down = close)
  const swipeHandlers = useSwipeNavigation({
    onSwipeLeft: handleNext,
    onSwipeRight: handlePrev,
    onSwipeDown: handleAnimatedClose,
  });

  // Keyboard navigation (arrows, escape, enter)
  useFileViewerKeyboard({
    onPrev: handlePrev,
    onNext: handleNext,
    onClose: handleAnimatedClose,
    onSend: handleSend,
    isActive: true,
  });

  // Helper: рендер превью для файла
  const renderPreview = (f: FileRecord | undefined) => {
    if (!f) return null;
    if (isVideoFile(f.mediaType)) {
      return <VideoPlayer file={f} thumbnailUrl={f.thumbnailUrl} />;
    }
    if (isAudioFile(f.mediaType)) {
      return <AudioPlayer file={f} />;
    }
    if (f.thumbnailUrl) {
      // Вычислить aspect-ratio из размеров файла для резервирования места
      // Это предотвращает layout shift при загрузке высоких фото
      const aspectRatio = f.width && f.height ? f.width / f.height : undefined;
      return (
        <img
          src={f.thumbnailUrl}
          alt=""
          className={styles.preview}
          style={aspectRatio ? { aspectRatio: String(aspectRatio) } : undefined}
        />
      );
    }
    return (
      <div className={styles.iconPreview}>
        {MediaTypeIcons[f.mediaType]}
      </div>
    );
  };

  // Helper: рендер info секции для файла (caption + meta, без share)
  const renderInfo = (f: FileRecord | undefined, isCurrentFile = false) => {
    if (!f) return null;

    // Caption section - editable only for current file
    const renderCaption = () => {
      // For non-current files (incoming during animation), show static content
      if (!isCurrentFile) {
        if (f.caption) {
          return (
            <div
              className={`${styles.caption} ${styles.captionEditable}`}
              dangerouslySetInnerHTML={{
                __html: highlightMatch(f.caption.replace(/\n/g, '<br/>'), searchQuery)
              }}
            />
          );
        }
        // Показываем placeholder для резервирования места (без onClick)
        return (
          <div className={styles.captionPlaceholder}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
            Добавить описание
          </div>
        );
      }

      // Current file - show editable caption
      if (isEditingCaption) {
        return (
          <div className={styles.captionEdit}>
            <textarea
              ref={captionTextareaRef}
              className={styles.captionTextarea}
              value={captionDraft}
              onChange={(e) => setCaptionDraft(e.target.value)}
              placeholder="Введите описание..."
              rows={3}
              maxLength={4096}
            />
            <div className={styles.captionEditFooter}>
              <span className={styles.captionCharCount}>
                {captionDraft.length} / 4096
              </span>
              <div className={styles.captionEditButtons}>
                <button
                  className={styles.captionCancelBtn}
                  onClick={cancelCaptionEdit}
                  disabled={isSavingCaption}
                >
                  Отмена
                </button>
                <button
                  className={styles.captionSaveBtn}
                  onClick={saveCaptionEdit}
                  disabled={isSavingCaption}
                >
                  {isSavingCaption ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </div>
          </div>
        );
      }

      // Not editing - show caption or placeholder (clickable if onCaptionUpdate provided)
      if (f.caption) {
        return (
          <div
            className={`${styles.caption} ${onCaptionUpdate ? styles.captionEditable : ''}`}
            onClick={onCaptionUpdate ? startCaptionEdit : undefined}
            dangerouslySetInnerHTML={{
              __html: highlightMatch(f.caption.replace(/\n/g, '<br/>'), searchQuery)
            }}
          />
        );
      }

      // No caption - show placeholder if editable
      if (onCaptionUpdate) {
        return (
          <button className={styles.captionPlaceholder} onClick={startCaptionEdit}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
            Добавить описание
          </button>
        );
      }

      return null;
    };

    return (
      <>
        {/* Caption */}
        {renderCaption()}

        {/* Meta info */}
        <div className={styles.meta}>
          {f.fileName && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Название:</span>
              <span dangerouslySetInnerHTML={{ __html: highlightMatch(f.fileName, searchQuery) }} />
            </div>
          )}
          {f.mimeType && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Тип:</span>
              <span>{f.mimeType}</span>
            </div>
          )}
          {f.fileSize && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Размер:</span>
              <span>{formatFileSize(f.fileSize)}</span>
            </div>
          )}
          {f.duration && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Длительность:</span>
              <span>{formatDuration(f.duration)}</span>
            </div>
          )}
          {(f.width && f.height) && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Разрешение:</span>
              <span>{f.width} × {f.height}</span>
            </div>
          )}
          {(f.forwardFromName || f.forwardFromChatTitle) && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>От:</span>
              <span dangerouslySetInnerHTML={{
                __html: highlightMatch(f.forwardFromName || f.forwardFromChatTitle || '', searchQuery)
              }} />
            </div>
          )}
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Добавлено:</span>
            <span>{formatDate(f.createdAt)}</span>
          </div>
        </div>
      </>
    );
  };

  // Определяем входящий файл для анимации
  const incomingFile = slideDirection === 'next' ? nextFile : slideDirection === 'prev' ? prevFile : undefined;

  return (
    <div className={`${styles.overlay} ${isClosing ? styles.closing : ''}`} onClick={handleBackdropClick}>
      <div className={`${styles.viewer} ${isClosing ? styles.closing : ''}`} {...swipeHandlers}>
        {/* Header */}
        <div className={styles.header}>
          <button className={styles.backButton} onClick={handleAnimatedClose}>
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

        {/* Carousel Container - двухслойная анимация */}
        <div className={styles.carouselContainer}>
          {/* Слой 1: Текущий файл (может уезжать) */}
          <div className={`${styles.slideLayer} ${styles.current} ${
            slideDirection === 'next' ? styles.exitLeft :
            slideDirection === 'prev' ? styles.exitRight : ''
          }`}>
            <div className={styles.previewWrapper}>
              <div className={styles.previewContainer}>
                {renderPreview(file)}
              </div>
            </div>
            <div className={styles.info}>
              {renderInfo(file, true)}
              {/* Share Section - только для текущего файла */}
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

          {/* Слой 2: Входящий файл (только во время анимации) */}
          {/* Структура ИДЕНТИЧНА current layer для консистентного layout */}
          {slideDirection && incomingFile && (
            <div className={`${styles.slideLayer} ${styles.incoming} ${
              slideDirection === 'next' ? styles.enterFromRight : styles.enterFromLeft
            }`}>
              <div className={styles.previewWrapper}>
                <div className={styles.previewContainer}>
                  {renderPreview(incomingFile)}
                </div>
              </div>
              {/* Info СНАРУЖИ previewWrapper - как у current layer */}
              <div className={styles.info}>
                {renderInfo(incomingFile, false)}
                <div className={styles.sharePlaceholder}>
                  <span className={styles.shareIcon}>{ShareIcon}</span>
                  Поделиться
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation buttons (desktop only) - position: fixed */}
        {onNavigate && (
          <>
            <button
              className={`${styles.navButton} ${styles.navButtonLeft}`}
              onClick={handlePrev}
              disabled={!hasPrev || isAnimating}
              aria-label="Previous"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <button
              className={`${styles.navButton} ${styles.navButtonRight}`}
              onClick={handleNext}
              disabled={!hasNext || isAnimating}
              aria-label="Next"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
