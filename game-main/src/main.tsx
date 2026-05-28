import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        initDataUnsafe?: {
          user?: { id: number; first_name?: string; username?: string };
          start_param?: string;
        };
        themeParams?: Record<string, string>;
        colorScheme?: 'light' | 'dark';
        MainButton?: { setText: (t: string) => void; show: () => void; hide: () => void };
      };
    };
  }
}

const tg = window.Telegram?.WebApp;
if (tg) {
  try {
    tg.ready();
    tg.expand();
    // start_param (from /start room_xxx or WebApp launch) → URL ?room=
    const startParam = tg.initDataUnsafe?.start_param;
    if (startParam && !new URLSearchParams(window.location.search).get('room')) {
      const url = new URL(window.location.href);
      url.searchParams.set('room', startParam);
      window.history.replaceState({}, '', url.toString());
    }
  } catch (e) {
    console.warn('Telegram WebApp init failed', e);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
