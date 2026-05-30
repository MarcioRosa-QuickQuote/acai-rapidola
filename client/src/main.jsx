import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import './index.css';

// Registra Service Worker e detecta updates disponíveis
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {

      // Verifica update a cada vez que o app volta ao foco
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update();
      });

      function notifyUpdate(worker) {
        worker.addEventListener('statechange', () => {
          // 'installed' + controller existente = novo SW esperando para ativar
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent('swUpdateReady', { detail: reg }));
          }
        });
      }

      // SW novo já estava esperando quando a página abriu
      if (reg.waiting) {
        window.dispatchEvent(new CustomEvent('swUpdateReady', { detail: reg }));
      }
      // SW novo começa a instalar após a página abrir
      reg.addEventListener('updatefound', () => notifyUpdate(reg.installing));

      // Quando o SW ativa (skipWaiting foi chamado) → recarrega a página
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });

    }).catch(() => {});
  });
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

ReactDOM.createRoot(document.getElementById('root')).render(
  <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <App />
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  </GoogleOAuthProvider>
);
