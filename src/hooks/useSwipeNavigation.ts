import { useRef, useCallback } from 'react';

/**
 * Swipe navigation constants
 * TODO: Move to config.ts later
 */
const SWIPE_HORIZONTAL_THRESHOLD = 50;
const SWIPE_VERTICAL_THRESHOLD = 150;
const SWIPE_VELOCITY_THRESHOLD = 500;
const NAVIGATION_COOLDOWN_MS = 300;

/**
 * Minimum movement to determine dominant axis (pixels)
 */
const AXIS_LOCK_THRESHOLD = 20;

/**
 * Dominance ratio required to lock to an axis (0.6 = 60%)
 */
const AXIS_DOMINANCE_RATIO = 0.6;

type SwipeAxis = 'horizontal' | 'vertical' | null;

interface TouchState {
  startX: number;
  startY: number;
  startTime: number;
  lockedAxis: SwipeAxis;
  isInScrollableArea: boolean; // Touch started in scrollable area
}

/**
 * Find the nearest scrollable parent element
 * Returns element if it has overflow-y: auto/scroll AND content exceeds height
 */
function findScrollableParent(element: HTMLElement | null): HTMLElement | null {
  while (element) {
    const style = window.getComputedStyle(element);
    const overflowY = style.overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') &&
        element.scrollHeight > element.clientHeight) {
      return element;
    }
    element = element.parentElement;
  }
  return null;
}

interface SwipeHandlers {
  onSwipeLeft?: () => void;   // Next file
  onSwipeRight?: () => void;  // Prev file
  onSwipeDown?: () => void;   // Close viewer
}

/**
 * Hook for handling swipe navigation gestures
 *
 * Features:
 * - Axis locking after initial movement
 * - Velocity-based swipe detection
 * - Cooldown protection against rapid swipes
 * - Diagonal swipe handling
 *
 * @param handlers - Callbacks for swipe directions
 * @returns Touch event handlers to spread on element
 */
export function useSwipeNavigation(handlers: SwipeHandlers) {
  const touchState = useRef<TouchState | null>(null);
  const lastSwipeTime = useRef<number>(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Ignore multi-touch
    if (e.touches.length !== 1) {
      touchState.current = null;
      return;
    }

    const touch = e.touches[0];

    // Check if touch started in a scrollable area
    const target = e.target as HTMLElement;
    const scrollableParent = findScrollableParent(target);
    const isInScrollableArea = scrollableParent !== null;

    touchState.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
      lockedAxis: null,
      isInScrollableArea,
    };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchState.current || e.touches.length !== 1) {
      return;
    }

    const touch = e.touches[0];
    const state = touchState.current;

    // Already locked to an axis - nothing more to determine
    if (state.lockedAxis !== null) {
      return;
    }

    const deltaX = Math.abs(touch.clientX - state.startX);
    const deltaY = Math.abs(touch.clientY - state.startY);
    const totalMovement = deltaX + deltaY;

    // Not enough movement to determine axis yet
    if (totalMovement < AXIS_LOCK_THRESHOLD) {
      return;
    }

    // Determine dominant axis based on dominance ratio
    const horizontalRatio = deltaX / totalMovement;
    const verticalRatio = deltaY / totalMovement;

    if (horizontalRatio >= AXIS_DOMINANCE_RATIO) {
      state.lockedAxis = 'horizontal';
    } else if (verticalRatio >= AXIS_DOMINANCE_RATIO) {
      state.lockedAxis = 'vertical';
    }
    // If neither axis is dominant (diagonal), lockedAxis stays null
    // and the swipe will be ignored on touchEnd
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchState.current) {
      return;
    }

    const state = touchState.current;
    touchState.current = null;

    // Check cooldown
    const now = Date.now();
    if (now - lastSwipeTime.current < NAVIGATION_COOLDOWN_MS) {
      return;
    }

    // No axis locked = ambiguous gesture, ignore
    if (state.lockedAxis === null) {
      return;
    }

    // Get final touch position from changedTouches
    const touch = e.changedTouches[0];
    if (!touch) {
      return;
    }

    const deltaX = touch.clientX - state.startX;
    const deltaY = touch.clientY - state.startY;
    const deltaTime = now - state.startTime;

    // Calculate velocities (pixels per second)
    const velocityX = deltaTime > 0 ? Math.abs(deltaX) / deltaTime * 1000 : 0;
    const velocityY = deltaTime > 0 ? Math.abs(deltaY) / deltaTime * 1000 : 0;

    // Handle horizontal swipes
    if (state.lockedAxis === 'horizontal') {
      const thresholdMet = Math.abs(deltaX) >= SWIPE_HORIZONTAL_THRESHOLD;
      const velocityMet = velocityX >= SWIPE_VELOCITY_THRESHOLD;

      if (thresholdMet || velocityMet) {
        lastSwipeTime.current = now;

        if (deltaX < 0) {
          // Swipe left -> next file
          handlers.onSwipeLeft?.();
        } else {
          // Swipe right -> prev file
          handlers.onSwipeRight?.();
        }
      }
    }

    // Handle vertical swipes - ONLY if NOT in scrollable area
    // This prevents swipe-down-to-close from conflicting with scrolling
    if (state.lockedAxis === 'vertical' && !state.isInScrollableArea) {
      const thresholdMet = Math.abs(deltaY) >= SWIPE_VERTICAL_THRESHOLD;
      const velocityMet = velocityY >= SWIPE_VELOCITY_THRESHOLD;

      if ((thresholdMet || velocityMet) && deltaY > 0) {
        // Swipe down -> close viewer (only down direction)
        lastSwipeTime.current = now;
        handlers.onSwipeDown?.();
      }
      // Swipe up is ignored (no handler for it)
    }
  }, [handlers]);

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };
}
