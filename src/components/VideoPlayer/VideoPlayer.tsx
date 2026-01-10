import { useRef, useState, useEffect, useCallback } from 'react';
import { FileRecord, apiClient } from '../../api/client';
import { useTelegram } from '../../hooks/useTelegram';
import styles from './VideoPlayer.module.css';

interface VideoPlayerProps {
  file: FileRecord;
  thumbnailUrl?: string | null;
  onFullscreenChange?: (isFullscreen: boolean) => void;
  // Called when user clicks fullscreen - passes video data to parent for FloatingVideoPlayer
  onEnterFullscreen?: (videoUrl: string, currentTime: number, isMuted: boolean) => void;
}

type LoadingState = 'idle' | 'loading' | 'ready' | 'error';

// Format seconds to mm:ss
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function VideoPlayer({ file, thumbnailUrl, onFullscreenChange, onEnterFullscreen }: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Telegram API
  const { fullscreen: tgFullscreen, safeAreaInset } = useTelegram();

  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(file.duration || 0);

  // UI state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

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

  // Exit fullscreen helper (for close button and escape key)
  const exitFullscreen = useCallback(() => {
    console.log('[VideoPlayer] Exit fullscreen requested');
    setIsFullscreen(false);
    onFullscreenChange?.(false);

    if (tgFullscreen.isSupported) {
      tgFullscreen.exit();
    }
  }, [tgFullscreen, onFullscreenChange]);

  // Subscribe to Telegram fullscreen events
  useEffect(() => {
    if (!tgFullscreen.isSupported) return;

    // Listen for fullscreen state changes from Telegram
    const unsubChanged = tgFullscreen.onChanged((isFs) => {
      console.log('[VideoPlayer] Telegram fullscreen changed:', isFs);
      setIsFullscreen(isFs);
      onFullscreenChange?.(isFs);
    });

    // Listen for fullscreen errors
    const unsubFailed = tgFullscreen.onFailed((error) => {
      console.error('[VideoPlayer] Telegram fullscreen failed:', error);
      // Fallback to CSS fullscreen on error
      if (error === 'UNSUPPORTED') {
        setIsFullscreen(true);
        onFullscreenChange?.(true);
      }
    });

    return () => {
      unsubChanged();
      unsubFailed();
    };
  }, [tgFullscreen, onFullscreenChange]);

  // Escape key handler for fullscreen exit (CSS fallback)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        exitFullscreen();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, exitFullscreen]);

  // Auto-hide controls logic
  const showControls = useCallback(() => {
    setControlsVisible(true);

    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }

    // Auto-hide after 3 sec if playing (always, not just in fullscreen)
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 3000);
    }
  }, [isPlaying]);

  // Show controls on any interaction
  useEffect(() => {
    if (!isPlaying) {
      setControlsVisible(true);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    } else {
      showControls();
    }
  }, [isPlaying, showControls]);

  // Video event handlers
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  }, []);

  // Control handlers
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;

    if (videoRef.current.paused) {
      videoRef.current.play().catch(console.error);
    } else {
      videoRef.current.pause();
    }
    showControls();
  }, [showControls]);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    const newMuted = !isMuted;
    videoRef.current.muted = newMuted;
    setIsMuted(newMuted);
    showControls();
  }, [isMuted, showControls]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !progressRef.current) return;

    const rect = progressRef.current.getBoundingClientRect();
    const clickPosition = (e.clientX - rect.left) / rect.width;
    const newTime = clickPosition * duration;

    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    showControls();
  }, [duration, showControls]);

  // Fullscreen handler
  const toggleFullscreen = useCallback(() => {
    // If onEnterFullscreen is provided, use FloatingVideoPlayer instead of CSS fullscreen
    if (onEnterFullscreen && videoUrl) {
      console.log('[VideoPlayer] Opening FloatingVideoPlayer');
      onEnterFullscreen(videoUrl, currentTime, isMuted);
      return;
    }

    // Fallback: CSS Fullscreen + Telegram API
    if (!isFullscreen) {
      console.log('[VideoPlayer] Entering CSS fullscreen');
      setIsFullscreen(true);
      onFullscreenChange?.(true);

      if (tgFullscreen.isSupported) {
        console.log('[VideoPlayer] Also requesting Telegram fullscreen');
        tgFullscreen.request();
      }
    } else {
      console.log('[VideoPlayer] Exiting fullscreen');
      setIsFullscreen(false);
      onFullscreenChange?.(false);

      if (tgFullscreen.isSupported) {
        tgFullscreen.exit();
      }
    }

    showControls();
  }, [isFullscreen, showControls, onFullscreenChange, tgFullscreen, onEnterFullscreen, videoUrl, currentTime, isMuted]);

  // Prevent propagation to avoid closing FileViewer
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // Handle tap on video area to show/hide controls
  const handleVideoAreaClick = useCallback(() => {
    if (controlsVisible) {
      togglePlay();
    } else {
      showControls();
    }
  }, [controlsVisible, togglePlay, showControls]);

  // Mouse move shows controls
  const handleMouseMove = useCallback(() => {
    showControls();
  }, [showControls]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Safe area padding for notched devices in fullscreen
  const fullscreenStyle = isFullscreen && safeAreaInset ? {
    paddingTop: safeAreaInset.top,
    paddingBottom: safeAreaInset.bottom,
    paddingLeft: safeAreaInset.left,
    paddingRight: safeAreaInset.right,
  } : undefined;

  return (
    <div
      ref={containerRef}
      className={`${styles.container} ${isFullscreen ? styles.fullscreen : ''} ${!controlsVisible ? styles.hideControls : ''}`}
      style={fullscreenStyle}
      onClick={handleContainerClick}
      onMouseMove={handleMouseMove}
    >
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
        <>
          <video
            ref={videoRef}
            src={videoUrl}
            autoPlay
            loop
            muted={isMuted}
            playsInline
            className={styles.video}
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onPlay={handlePlay}
            onPause={handlePause}
            onEnded={handleEnded}
            onClick={handleVideoAreaClick}
          />

          {/* Controls overlay */}
          <div className={`${styles.controls} ${controlsVisible ? '' : styles.hidden}`}>
            {/* Progress bar */}
            <div
              ref={progressRef}
              className={styles.progressBar}
              onClick={handleSeek}
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

            {/* Bottom controls */}
            <div className={styles.bottomControls}>
              <span className={styles.time}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>

              <div className={styles.rightControls}>
                {/* Play/Pause */}
                <button
                  className={styles.controlButton}
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

                {/* Sound toggle */}
                <button
                  className={styles.controlButton}
                  onClick={toggleMute}
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

                {/* Fullscreen */}
                <button
                  className={styles.controlButton}
                  onClick={toggleFullscreen}
                  aria-label={isFullscreen ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим'}
                >
                  {isFullscreen ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                      <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Big play button in center when paused */}
          {!isPlaying && controlsVisible && (
            <button
              className={styles.bigPlayButton}
              onClick={togglePlay}
              aria-label="Воспроизвести"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            </button>
          )}

          {/* Close button in fullscreen mode */}
          {isFullscreen && controlsVisible && (
            <button
              className={styles.closeFullscreenButton}
              onClick={exitFullscreen}
              aria-label="Выйти из полноэкранного режима"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </>
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
