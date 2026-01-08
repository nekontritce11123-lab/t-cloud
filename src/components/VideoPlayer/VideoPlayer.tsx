import { useRef, useState, useEffect, useCallback } from 'react';
import { FileRecord, apiClient } from '../../api/client';
import styles from './VideoPlayer.module.css';

interface VideoPlayerProps {
  file: FileRecord;
  thumbnailUrl?: string | null;
}

type LoadingState = 'idle' | 'loading' | 'ready' | 'error';

export function VideoPlayer({ file, thumbnailUrl }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load video URL on mount
  useEffect(() => {
    let cancelled = false;
    setLoadingState('loading');
    setErrorMessage(null);

    apiClient.getVideoUrl(file.id)
      .then(({ videoUrl: url }) => {
        if (!cancelled) {
          setVideoUrl(url);
          setLoadingState('ready');
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('[VideoPlayer] Failed to load video:', error);
          setLoadingState('error');
          if (error.message === 'VIDEO_UNAVAILABLE') {
            setErrorMessage('Видео недоступно');
          } else {
            setErrorMessage('Ошибка загрузки');
          }
        }
      });

    return () => {
      cancelled = true;
    };
  }, [file.id]);

  // Toggle mute on click
  const handleVideoClick = useCallback(() => {
    if (videoRef.current) {
      const newMuted = !isMuted;
      videoRef.current.muted = newMuted;
      setIsMuted(newMuted);
    }
  }, [isMuted]);

  // Prevent propagation to avoid closing FileViewer
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div className={styles.container} onClick={handleContainerClick}>
      {/* Thumbnail preview while loading */}
      {thumbnailUrl && loadingState !== 'ready' && (
        <img src={thumbnailUrl} alt="" className={styles.preview} />
      )}

      {/* Loading spinner overlay */}
      {loadingState === 'loading' && (
        <div className={styles.loadingOverlay}>
          <div className={styles.spinner} />
        </div>
      )}

      {/* Video element */}
      {loadingState === 'ready' && videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          autoPlay
          loop
          muted={isMuted}
          playsInline
          onClick={handleVideoClick}
          className={styles.video}
        />
      )}

      {/* Sound toggle button */}
      {loadingState === 'ready' && (
        <button
          className={styles.soundToggle}
          onClick={handleVideoClick}
          aria-label={isMuted ? 'Включить звук' : 'Выключить звук'}
        >
          {isMuted ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          )}
        </button>
      )}

      {/* Error overlay */}
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
    </div>
  );
}
