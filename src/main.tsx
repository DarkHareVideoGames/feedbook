import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AdminHistoryPage from './AdminHistoryPage';
import SetPasswordModal from './SetPasswordModal';
import { I18nProvider } from './i18n';
import './index.css';

const path = window.location.pathname;

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
