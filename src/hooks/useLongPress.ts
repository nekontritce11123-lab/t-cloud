import { useRef, useCallback } from 'react';
import { LONG_PRESS_MS } from '../constants/config';

/**
 * Hook for handling long press interactions
 * Cancels long press if finger moves (user is scrolling)
 * Returns handlers for touch/mouse events
 */
export function useLongPress<T>(
  item: T,
  onLongPress?: (item: T) => void,
  onClick?: (item: T) => void,
  timeout = LONG_PRESS_MS
) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);

  const handleTouchStart = useCallback(() => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      onLongPress?.(item);
    }, timeout);
  }, [item, onLongPress, timeout]);

  // Cancel long press if user moves finger (scrolling)
  const handleTouchMove = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      // Timer не сработал (был отменён) - сбрасываем для следующего взаимодействия
      isLongPress.current = false;
    }
    // Если timer уже сработал (isLongPress = true), НЕ сбрасываем здесь
    // handleClick проверит флаг и сбросит его после
  }, []);

  const handleClick = useCallback(() => {
    if (!isLongPress.current) {
      onClick?.(item);
    }
    isLongPress.current = false;
  }, [item, onClick]);

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleClick,
    // Aliases for event handlers
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchEnd,
    onMouseDown: handleTouchStart,
    onMouseUp: handleTouchEnd,
    onMouseLeave: handleTouchEnd,
    onClick: handleClick,
  };
}
