import { useRef, useCallback, useEffect, RefObject } from 'react';

interface UseAutoScrollOptions {
  edgeZone?: number;   // Размер зоны активации (px от края)
  minSpeed?: number;   // Минимальная скорость скролла
  maxSpeed?: number;   // Максимальная скорость скролла
}

/**
 * Hook для автоматического скролла при drag selection
 * Когда палец/курсор приближается к краю контейнера - начинается скролл
 */
export function useAutoScroll(
  isActive: boolean,
  containerRef: RefObject<HTMLElement | null>,
  options: UseAutoScrollOptions = {}
) {
  const { edgeZone = 100, minSpeed = 3, maxSpeed = 15 } = options;

  const touchY = useRef(0);
  const rafId = useRef<number | null>(null);

  const scrollLoop = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      rafId.current = requestAnimationFrame(scrollLoop);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const containerHeight = containerRect.height;

    // Позиция курсора ОТНОСИТЕЛЬНО контейнера
    const posInContainer = touchY.current - containerRect.top;

    let speed = 0;

    // Верхняя зона - скролл вверх
    if (posInContainer < edgeZone && posInContainer > 0) {
      const ratio = 1 - (posInContainer / edgeZone);
      speed = -(minSpeed + ratio * (maxSpeed - minSpeed));
    }
    // Нижняя зона - скролл вниз
    else if (posInContainer > containerHeight - edgeZone) {
      const distanceFromBottom = containerHeight - posInContainer;
      if (distanceFromBottom > 0) {
        const ratio = 1 - (distanceFromBottom / edgeZone);
        speed = minSpeed + ratio * (maxSpeed - minSpeed);
      }
    }

    if (speed !== 0) {
      container.scrollTop += speed;
    }

    rafId.current = requestAnimationFrame(scrollLoop);
  }, [containerRef, edgeZone, minSpeed, maxSpeed]);

  const updatePosition = useCallback((clientY: number) => {
    touchY.current = clientY;
  }, []);

  const start = useCallback(() => {
    if (!rafId.current) {
      rafId.current = requestAnimationFrame(scrollLoop);
    }
  }, [scrollLoop]);

  const stop = useCallback(() => {
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
  }, []);

  // Автоматически запускаем/останавливаем при изменении isActive
  useEffect(() => {
    if (isActive) {
      start();
    } else {
      stop();
    }
    return stop;
  }, [isActive, start, stop]);

  return { updatePosition, start, stop };
}
