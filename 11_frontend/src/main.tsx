import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ExamProvider } from './exam/ExamContext';
import { AppRoutes } from './routes/AppRoutes';
import './styles/global.css';

// PWA: アプリシェルのキャッシュ（非機能設計 §3）。開発時は登録しない
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/service-worker.js');
  });
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('#root が見つかりません');
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ExamProvider>
          <AppRoutes />
        </ExamProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
