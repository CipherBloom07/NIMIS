import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './design-tokens.css';
import './styles.css';
import './requirements-theme.css';
import './reference-fidelity.css';

if ('storage' in navigator && navigator.storage?.persist) {
  navigator.storage.persist().catch(() => false);
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);

if ('serviceWorker' in navigator) {
  if (import.meta.env.DEV) {
    // A prior production/PWA service worker cached JavaScript/CSS before network.
    // Remove only this app's registration in development so Vite can serve fresh files.
    navigator.serviceWorker.getRegistrations()
      .then(registrations => Promise.all(registrations
        .filter(registration => {
          const expected = new URL(import.meta.env.BASE_URL, window.location.origin).href;
          return registration.scope === expected;
        })
        .map(registration => registration.unregister())))
      .catch(error => console.warn('NIMIS dev cache-worker cleanup failed:', error));
    // Never clear localStorage, IndexedDB or survey drafts during this operation.
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
        .catch(error => console.warn('NIMIS offline shell registration failed:', error));
    });
  }
}
