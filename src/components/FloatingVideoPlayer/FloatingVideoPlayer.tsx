import { useRef, useState, useEffect, useCallback } from 'react';
import { FileRecord } from '../../api/client';
import { useTelegram } from '../../hooks/useTelegram';
import styles from './FloatingVideoPlayer.module.css';

interface FloatingVideoPlayerProps {
  file: FileRecord;
  videoUrl: string;
  initialTime: number;
  initialMuted: boolean;
  onClose: () => void;
}

// Format seconds to mm:ss
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function FloatingVideoPlayer({
  file,
  videoUrl,
  initialTime,
  initialMuted,
  onClose
}: FloatingVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Telegram API
  const { fullscreen: tgFullscreen } = useTelegram();

  // Playback state
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [currentTime, setCurrentTime] = useState(initialTime);
  const [duration, setDuration] = useState(file.duration || 0);

  // UI state
  const [controlsVisible, setControlsVisible] = useState(true);

  // Request Telegram fullscreen on mount (bonus if supported)
  useEffect(() => {
    if (tgFullscreen.isSupported) {
      console.log('[FloatingVideoPlayer] Requesting Telegram fullscreen');
      tgFullscreen.request();
    }

    return () => {
      if (tgFullscreen.isSupported) {
        console.log('[FloatingVideoPlayer] Exiting Telegram fullscreen');
        tgFullscreen.exit();
      }
    };
  }, [tgFullscreen]);

  // Set initial playback time
  useEffect(() => {
    if (videoRef.current && initialTime > 0) {
      videoRef.current.currentTime = initialTime;
    }
  }, [initialTime]);

  // Auto-hide controls logic
  const showControls = useCallback(() => {
    setControlsVisible(true);

    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }

    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 3000);
    }
  }, [isPlaying]);

  // Show controls when paused
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

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  const handleClose = useCallback(() => {
    console.log('[FloatingVideoPlayer] Closing');
    if (tgFullscreen.isSupported) {
      tgFullscreen.exit();
    }
    onClose();
  }, [tgFullscreen, onClose]);

  // Tap on video to show/hide controls
  const handleVideoClick = useCallback(() => {
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

  return (
    <div
      className={`${styles.container} ${!controlsVisible ? styles.hideControls : ''}`}
      onMouseMove={handleMouseMove}
    >
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
        onClick={handleVideoClick}
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

      {/* Close button - always visible when controls are visible */}
      {controlsVisible && (
        <button
          className={styles.closeButton}
          onClick={handleClose}
          aria-label="Закрыть"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
