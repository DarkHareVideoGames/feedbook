import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AdminHistoryPage from './AdminHistoryPage';
import SetPasswordModal from './SetPasswordModal';
import { I18nProvider } from './i18n';
import './index.css';
import './brand-overrides.css';

const path = window.location.pathname;

// Registo do Service Worker apenas na área administrativa (escopo /admin).
// Não controla rotas públicas.
if (path.startsWith('/admin') && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/admin' })
      .then((registration) => {
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch(() => {
        // Silencioso: PWA é progressiva; falha não bloqueia a app.
      });
  });
}

function Root() {
  return (
    <>
      {/* Modal de convite "define a tua password" — ativo em todas as páginas. */}
      <SetPasswordModal />
      {path.startsWith('/admin') ? <AdminHistoryPage /> : <App />}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <Root />
    </I18nProvider>
  </React.StrictMode>,
);