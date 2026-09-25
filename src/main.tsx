import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { preloadAllEnginesToIDB } from './utils/engineIndexedDBCache';

// Eagerly pre-cache WebAssembly media converter and archive engines into IndexedDB on first website load
if (typeof window !== 'undefined') {
  preloadAllEnginesToIDB().catch((err) => {
    console.warn('[Engine Init] Background preload notice:', err);
  });

  registerSW({
    immediate: true,
    onNeedRefresh() {
      console.log('New PWA service worker content available, updating...');
    },
    onOfflineReady() {
      console.log('MKV to MP4 Converter is ready to work completely offline.');
    },
  });

  // Deregister any legacy coi-serviceworker instances that conflict with PWA caching
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) {
        if (reg.active?.scriptURL?.includes('coi-serviceworker')) {
          reg.unregister();
        }
      }
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

