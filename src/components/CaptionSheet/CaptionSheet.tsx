import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { FileRecord } from '../../api/client';
import styles from './CaptionSheet.module.css';

interface CaptionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  selectedFiles: Set<number>;
  files: FileRecord[];
  onSave: (caption: string | null) => Promise<void>;
}

export function CaptionSheet({
  isOpen,
  onClose,
  selectedFiles,
  files,
  onSave,
}: CaptionSheetProps) {
  const [isClosing, setIsClosing] = useState(false);
  const [caption, setCaption] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Get selected files data
  const selectedFilesData = useMemo(() => {
    return files.filter(f => selectedFiles.has(f.id));
  }, [files, selectedFiles]);

  // Count files with existing captions
  const filesWithCaption = useMemo(() => {
    return selectedFilesData.filter(f => f.caption && f.caption.trim()).length;
  }, [selectedFilesData]);

  const fileCount = selectedFiles.size;

  // Auto-focus textarea when opened
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 300);
    }
  }, [isOpen]);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setCaption('');
      setIsSaving(false);
    }
  }, [isOpen]);

  // Animated close handler
  const handleAnimatedClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  }, [onClose]);

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        handleAnimatedClose();
      }
    },
    [handleAnimatedClose]
  );

  // Handle save
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const newCaption = caption.trim() || null;
      await onSave(newCaption);
      handleAnimatedClose();
    } catch (error) {
      console.error('Failed to save caption:', error);
    } finally {
      setIsSaving(false);
    }
  }, [caption, onSave, handleAnimatedClose]);

  // Character count
  const charCount = caption.length;
  const maxChars = 4096;
  const isWarning = charCount > 3500;
  const isError = charCount > 4000;

  if (!isOpen) return null;

  return (
    <div
      className={`${styles.overlay} ${isClosing ? styles.closing : ''}`}
      onClick={handleBackdropClick}
    >
      <div className={`${styles.sheet} ${isClosing ? styles.closing : ''}`}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.handle} />
          <div className={styles.titleBlock}>
            <h2 className={styles.title}>Изменить описание</h2>
            <span className={styles.subtitle}>{fileCount} файлов</span>
          </div>
          <button className={styles.closeButton} onClick={handleAnimatedClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {/* Info about existing captions */}
          {filesWithCaption > 0 && (
            <div className={styles.warningBlock}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
              <span>
                {filesWithCaption === fileCount
                  ? 'Все файлы уже имеют описание'
                  : `${filesWithCaption} из ${fileCount} уже имеют описание`
                }
              </span>
            </div>
          )}

          {/* Textarea */}
          <div className={styles.textareaWrapper}>
            <textarea
              ref={textareaRef}
              className={styles.textarea}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Введите новое описание..."
              rows={4}
              maxLength={maxChars}
            />
            <span
              className={`${styles.charCounter} ${isWarning ? styles.warning : ''} ${isError ? styles.error : ''}`}
            >
              {charCount} / {maxChars}
            </span>
          </div>

          {/* Hint */}
          <p className={styles.hint}>
            Описание будет применено ко всем выбранным файлам. Существующие описания будут заменены.
          </p>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button
            className={styles.cancelButton}
            onClick={handleAnimatedClose}
            disabled={isSaving}
          >
            Отмена
          </button>
          <button
            className={styles.saveButton}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Сохранение...' : `Сохранить (${fileCount})`}
          </button>
        </div>
      </div>
    </div>
  );
}
