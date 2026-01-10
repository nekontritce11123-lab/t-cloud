import { useRef, useState, useEffect, useCallback } from 'react';
import { FileRecord, apiClient } from '../../api/client';
import styles from './AudioPlayer.module.css';

interface AudioPlayerProps {
  file: FileRecord;
}

type LoadingState = 'idle' | 'loading' | 'ready' | 'error';

// Format seconds to mm:ss
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function AudioPlayer({ file }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(file.duration || 0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load audio URL on mount
  useEffect(() => {
    let cancelled = false;
    setLoadingState('loading');
    setErrorMessage(null);

    apiClient.getAudioUrl(file.id)
      .then(({ audioUrl: url, duration: serverDuration }) => {
        if (!cancelled) {
          setAudioUrl(url);
          setLoadingState('ready');
          if (serverDuration) {
            setDuration(serverDuration);
          }
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('[AudioPlayer] Failed to load audio:', error);
          setLoadingState('error');
          if (error.message === 'AUDIO_UNAVAILABLE') {
            setErrorMessage('Аудио недоступно');
          } else {
            setErrorMessage('Ошибка загрузки');
          }
        }
      });

    return () => {
      cancelled = true;
    };
  }, [file.id]);

  // Update duration when audio metadata loads
  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  }, []);

  // Update current time during playback
  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }, []);

  // Handle audio end
  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  }, []);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch((error) => {
        console.error('[AudioPlayer] Play failed:', error);
      });
      setIsPlaying(true);
    }
  }, [isPlaying]);

  // Seek on progress bar click
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !progressRef.current) return;

    const rect = progressRef.current.getBoundingClientRect();
    const clickPosition = (e.clientX - rect.left) / rect.width;
    const newTime = clickPosition * duration;

    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration]);

  // Prevent propagation to avoid closing FileViewer
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const isVoice = file.mediaType === 'voice';
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={styles.container} onClick={handleContainerClick}>
      {/* Cover image or icon */}
      <div className={styles.coverWrapper}>
        {file.thumbnailUrl && !isVoice ? (
          <img src={file.thumbnailUrl} alt="" className={styles.cover} />
        ) : (
          <div className={styles.iconPlaceholder}>
            {isVoice ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="4" />
                <path d="M12 8v0" />
              </svg>
            )}
          </div>
        )}
      </div>

      {/* Title */}
      {file.fileName && (
        <div className={styles.title}>{file.fileName}</div>
      )}

      {/* Loading state */}
      {loadingState === 'loading' && (
        <div className={styles.loadingOverlay}>
          <div className={styles.spinner} />
        </div>
      )}

      {/* Error state */}
      {loadingState === 'error' && (
        <div className={styles.errorOverlay}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{errorMessage || 'Ошибка'}</span>
        </div>
      )}

      {/* Player controls - show when ready */}
      {loadingState === 'ready' && audioUrl && (
        <div className={styles.controls}>
          {/* Hidden audio element */}
          <audio
            ref={audioRef}
            src={audioUrl}
            preload="metadata"
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
          />

          {/* Progress bar */}
          <div
            ref={progressRef}
            className={styles.progressBar}
            onClick={handleProgressClick}
          >
            <div
              className={styles.progressFill}
              style={{ width: `${progress}%` }}
            />
            <div
              className={styles.progressThumb}
              style={{ left: `${progress}%` }}
            />
          </div>

          {/* Time display */}
          <div className={styles.timeDisplay}>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          {/* Play/Pause button */}
          <button
            className={styles.playButton}
            onClick={togglePlay}
            aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
