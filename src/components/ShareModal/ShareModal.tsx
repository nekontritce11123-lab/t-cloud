import { useState, useEffect, useCallback, useRef } from 'react';
import { FileRecord, ShareResponse, apiClient } from '../../api/client';
import styles from './ShareModal.module.css';

interface ShareModalProps {
  file: FileRecord;
  onClose: () => void;
  onCreated?: (data: ShareResponse) => void;
}

// Preset options
const RECIPIENT_PRESETS = [1, 5, 10] as const;
const EXPIRES_PRESETS = [
  { value: 24, label: '1 день' },
  { value: 168, label: '7 дней' },
  { value: 720, label: '30 дней' },
] as const;

export function ShareModal({ file, onClose, onCreated }: ShareModalProps) {
  const [creating, setCreating] = useState(false);

  // Settings for new share - null means unlimited
  const [maxRecipients, setMaxRecipients] = useState<number | null>(null);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);

  // Custom input mode
  const [isCustomRecipients, setIsCustomRecipients] = useState(false);
  const [isCustomExpires, setIsCustomExpires] = useState(false);
  const [customRecipientsValue, setCustomRecipientsValue] = useState('');
  const [customExpiresValue, setCustomExpiresValue] = useState('');
  const [expiresUnit, setExpiresUnit] = useState<'hours' | 'days'>('days');

  // Refs for auto-focus
  const recipientsInputRef = useRef<HTMLInputElement>(null);
  const expiresInputRef = useRef<HTMLInputElement>(null);

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

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

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

      // Notify parent component
      if (onCreated) {
        onCreated(data);
      } else {
        onClose();
      }
    } catch (error) {
      console.error('Failed to create share link:', error);
    } finally {
      setCreating(false);
    }
  }, [file.id, maxRecipients, expiresIn, onCreated, onClose]);

  return (
    <div className={styles.overlay} onClick={handleBackdropClick}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>Создать ссылку</h2>
          <button className={styles.closeButton} onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Settings Block - compact layout */}
        <div className={styles.settingsBlock}>
          {/* Recipients Row */}
          <div className={styles.settingRow}>
            <div className={styles.settingLabel}>Получатели</div>
            <div className={styles.chips}>
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
            </div>
          </div>

          <div className={styles.divider} />

          {/* Expires Row */}
          <div className={styles.settingRow}>
            <div className={styles.settingLabel}>Срок</div>
            <div className={styles.chips}>
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
            </div>
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
      </div>
    </div>
  );
}
