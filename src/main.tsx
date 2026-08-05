import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AdminPage from './AdminPage';
import AdminHistoryPage from './AdminHistoryPage';
import { I18nProvider } from './i18n';
import './index.css';

const path = window.location.pathname;

function Root() {
  if (path === '/admin/history') return <AdminHistoryPage />;
  if (path.startsWith('/admin')) return <AdminPage />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <Root />
    </I18nProvider>
  </React.StrictMode>,
);
