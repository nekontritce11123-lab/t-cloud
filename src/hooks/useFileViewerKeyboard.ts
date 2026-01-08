import { useEffect, useCallback } from 'react';

interface KeyboardNavConfig {
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onSend?: () => void;
  isActive: boolean;
}

/**
 * Hook for keyboard navigation in FileViewer
 * Handles arrow keys, WASD, Escape, and Enter
 * Ignores keypresses when focus is on INPUT or TEXTAREA
 */
export function useFileViewerKeyboard(config: KeyboardNavConfig): void {
  const { onPrev, onNext, onClose, onSend, isActive } = config;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't intercept when typing in inputs
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }

    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        e.preventDefault();
        onPrev();
        break;

      case 'ArrowRight':
      case 'd':
      case 'D':
        e.preventDefault();
        onNext();
        break;

      case 'Escape':
        e.preventDefault();
        onClose();
        break;

      case 'Enter':
        if (onSend) {
          e.preventDefault();
          onSend();
        }
        break;
    }
  }, [onPrev, onNext, onClose, onSend]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActive, handleKeyDown]);
}
