import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AdminHistoryPage from './AdminHistoryPage';
import SetPasswordModal from './SetPasswordModal';
import NotFoundPage from './NotFoundPage';
import { I18nProvider } from './i18n';
import './index.css';
import './brand-overrides.css';

// Captura precoce do hash de erro do Supabase (token expirado), antes de o
// cliente Supabase o processar/limpar da URL.
if (window.location.hash && /otp_expired|access_denied/.test(window.location.hash)) {
  try { sessionStorage.setItem('feedbook:authError', window.location.hash); } catch { /* ignore */ }
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

const path = window.location.pathname;

// Em desenvolvimento, limpar caches administrativos antigos. O Service Worker
// continua ativo para permitir testar Web Push, mas não interceta pedidos fetch.
if (path.startsWith('/admin') && import.meta.env.DEV) {
  if ('caches' in window) {
    void caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith('fb-admin-')).map((key) => caches.delete(key))),
    );
  }
}

// Registo do Service Worker apenas na área administrativa.
// Não controla rotas públicas.
if (path.startsWith('/admin') && 'serviceWorker' in navigator) {
  const registerSw = () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/admin' })
      .then((registration) => {
        const configureWorker = (worker: ServiceWorker | null) => {
          if (import.meta.env.DEV && worker) worker.postMessage({ type: 'DEV_MODE' });
        };
        configureWorker(registration.installing);
        configureWorker(registration.waiting);
        configureWorker(registration.active);
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            configureWorker(newWorker);
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch(() => {
        // Silencioso: PWA é progressiva; falha não bloqueia a app.
      });
  };
  if (document.readyState === 'complete') {
    registerSw();
  } else {
    window.addEventListener('load', registerSw, { once: true });
  }
}

function Root() {
  return (
    <>
      {/* Modal de convite "define a tua password" — ativo em todas as páginas. */}
      <SetPasswordModal />
      {path.startsWith('/admin') ? (
        <AdminHistoryPage />
      ) : path === '/' ? (
        <App />
      ) : (
        <NotFoundPage />
      )}
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