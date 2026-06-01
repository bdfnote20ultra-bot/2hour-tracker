import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

// Remove the old offline service worker so fresh Vercel deploys appear right away.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations()
      .then(registrations => registrations.forEach(registration => registration.unregister()))
      .catch(() => {});
  });
}

function clearBrowserCaches() {
  if ('caches' in window) {
    caches.keys()
      .then(keys => Promise.all(keys.map(key => caches.delete(key))))
      .catch(() => {});
  }
}

window.addEventListener('pagehide', clearBrowserCaches);
window.addEventListener('beforeunload', clearBrowserCaches);
