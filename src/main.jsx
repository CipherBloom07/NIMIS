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
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(error => console.warn('NIMIS offline shell registration failed:', error));
  });
}
