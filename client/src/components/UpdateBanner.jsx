import { useState, useEffect } from 'react';

/**
 * Aparece quando o Service Worker detecta uma nova versão disponível.
 * O usuário toca "Atualizar" → SW ativa → página recarrega automaticamente.
 */
export default function UpdateBanner() {
  const [registration, setRegistration] = useState(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    function onUpdate(e) {
      setRegistration(e.detail);
    }
    window.addEventListener('swUpdateReady', onUpdate);
    return () => window.removeEventListener('swUpdateReady', onUpdate);
  }, []);

  if (!registration) return null;

  function doUpdate() {
    if (updating) return;
    setUpdating(true);
    // Manda o SW pular a fila e ativar
    const sw = registration.waiting;
    if (sw) sw.postMessage({ type: 'SKIP_WAITING' });
    // O controllerchange em main.jsx vai recarregar a página automaticamente
    // Timeout de segurança caso o reload não venha
    setTimeout(() => window.location.reload(), 3000);
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)', // acima da bottom nav
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      background: '#1A1A2E',
      color: 'white',
      borderRadius: 14,
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
      maxWidth: 'calc(100vw - 32px)',
      width: 360,
      animation: 'slideUp 0.3s ease',
    }}>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      {/* Ícone */}
      <div style={{ fontSize: 22, flexShrink: 0 }}>🆕</div>

      {/* Texto */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>Nova versão disponível</div>
        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 1 }}>Toque para atualizar o app</div>
      </div>

      {/* Botão */}
      <button
        onClick={doUpdate}
        disabled={updating}
        style={{
          background: '#6A1B9A',
          color: 'white',
          border: 'none',
          borderRadius: 20,
          padding: '7px 16px',
          fontSize: 13,
          fontWeight: 700,
          cursor: updating ? 'default' : 'pointer',
          opacity: updating ? 0.7 : 1,
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        {updating ? 'Atualizando…' : 'Atualizar'}
      </button>
    </div>
  );
}
