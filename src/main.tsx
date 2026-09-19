import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Register PWA service worker immediately for offline capability
if (typeof window !== 'undefined') {
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

