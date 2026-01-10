import { useEffect, useState, useRef, useCallback, useMemo } from 'react';

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
  close: () => void;
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
    start_param?: string;
    chat_instance?: string;
    chat_type?: string;
  };
  themeParams: {
    bg_color?: string;
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
    secondary_bg_color?: string;
  };
  colorScheme: 'light' | 'dark';
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    isProgressVisible: boolean;
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
    setText: (text: string) => void;
    enable: () => void;
    disable: () => void;
    showProgress: (leaveActive?: boolean) => void;
    hideProgress: () => void;
  };
  BackButton: {
    isVisible: boolean;
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  sendData: (data: string) => void;
  switchInlineQuery: (query: string, chatTypes?: string[]) => void;

  // Fullscreen API (Telegram Mini Apps Bot API 8.0+)
  isFullscreen?: boolean;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  onEvent?: (eventType: string, callback: (params?: unknown) => void) => void;
  offEvent?: (eventType: string, callback: (params?: unknown) => void) => void;

  // Safe area for notched devices (Bot API 8.0+)
  safeAreaInset?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  contentSafeAreaInset?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };

  // Vertical swipes control (Bot API 7.7+)
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;

  // Post events for orientation lock and other features
  postEvent?: (eventType: string, params?: Record<string, unknown>) => void;
}

export function useTelegram() {
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);
  const [isReady, setIsReady] = useState(false);
  const mainButtonCallbackRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();

      // Принудительная установка тёмной темы (независимо от настроек пользователя)
      (tg as unknown as { setHeaderColor?: (c: string) => void }).setHeaderColor?.('#18222d');
      (tg as unknown as { setBackgroundColor?: (c: string) => void }).setBackgroundColor?.('#18222d');

      setWebApp(tg);
      setIsReady(true);
    } else {
      // Development fallback
      setIsReady(true);
    }
  }, []);

  const hapticFeedback = {
    light: () => webApp?.HapticFeedback.impactOccurred('light'),
    medium: () => webApp?.HapticFeedback.impactOccurred('medium'),
    heavy: () => webApp?.HapticFeedback.impactOccurred('heavy'),
    success: () => webApp?.HapticFeedback.notificationOccurred('success'),
    error: () => webApp?.HapticFeedback.notificationOccurred('error'),
    warning: () => webApp?.HapticFeedback.notificationOccurred('warning'),
    selection: () => webApp?.HapticFeedback.selectionChanged(),
  };

  const getInitData = (): string => {
    return window.Telegram?.WebApp?.initData || '';
  };

  // Показать/скрыть главную кнопку (с правильной очисткой старого callback)
  const showMainButton = useCallback((text: string, onClick: () => void) => {
    if (webApp) {
      // Удаляем старый callback если был
      if (mainButtonCallbackRef.current) {
        webApp.MainButton.offClick(mainButtonCallbackRef.current);
      }
      // Сохраняем новый callback
      mainButtonCallbackRef.current = onClick;
      webApp.MainButton.setText(text);
      webApp.MainButton.onClick(onClick);
      webApp.MainButton.show();
    }
  }, [webApp]);

  const hideMainButton = useCallback(() => {
    if (webApp) {
      // Удаляем callback при скрытии
      if (mainButtonCallbackRef.current) {
        webApp.MainButton.offClick(mainButtonCallbackRef.current);
        mainButtonCallbackRef.current = null;
      }
      webApp.MainButton.hide();
    }
  }, [webApp]);

  const mainButton = {
    show: showMainButton,
    hide: hideMainButton,
    setText: (text: string) => webApp?.MainButton.setText(text),
    showProgress: () => webApp?.MainButton.showProgress(true),
    hideProgress: () => webApp?.MainButton.hideProgress(),
  };

  // Fullscreen API (Bot API 8.0+) - memoized to prevent useEffect re-runs
  const fullscreen = useMemo(() => ({
    isSupported: !!webApp?.requestFullscreen,
    isActive: webApp?.isFullscreen || false,

    request: () => {
      if (webApp?.requestFullscreen) {
        // Prevent collapse while watching video
        webApp.disableVerticalSwipes?.();
        webApp.requestFullscreen();
      }
    },

    exit: () => {
      if (webApp?.exitFullscreen) {
        webApp.exitFullscreen();
        webApp.enableVerticalSwipes?.();
      }
    },

    // Subscribe to fullscreen state changes
    onChanged: (callback: (isFullscreen: boolean) => void) => {
      if (webApp?.onEvent) {
        const handler = () => callback(webApp?.isFullscreen || false);
        webApp.onEvent('fullscreenChanged', handler);
        return () => webApp.offEvent?.('fullscreenChanged', handler);
      }
      return () => {};
    },

    // Subscribe to fullscreen errors
    onFailed: (callback: (error: string) => void) => {
      if (webApp?.onEvent) {
        const handler = (params: unknown) => {
          const error = (params as { error?: string })?.error || 'UNKNOWN';
          callback(error);
        };
        webApp.onEvent('fullscreenFailed', handler);
        return () => webApp.offEvent?.('fullscreenFailed', handler);
      }
      return () => {};
    },
  }), [webApp]);

  return {
    webApp,
    isReady,
    user: webApp?.initDataUnsafe.user,
    colorScheme: webApp?.colorScheme || 'dark',
    themeParams: webApp?.themeParams,
    hapticFeedback,
    getInitData,
    mainButton,
    fullscreen,
    safeAreaInset: webApp?.safeAreaInset,
  };
}
