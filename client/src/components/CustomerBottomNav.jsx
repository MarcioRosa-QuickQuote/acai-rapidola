import { useNavigate, useLocation } from 'react-router-dom';

const TABS = [
  { label: 'Início', path: '/customer', exact: true },
  { label: 'Busca', path: '/customer/busca' },
  { label: 'Pedidos', path: '/customer/pedidos' },
  { label: 'Favoritos', path: '/customer/favoritos' },
  { label: 'Perfil', path: '/customer/conta' },
];

function TabIcon({ label, active }) {
  const c = active ? 'var(--primary)' : '#999';
  switch (label) {
    case 'Início': return <svg width="22" height="22" viewBox="0 0 24 24" fill={c}><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>;
    case 'Busca': return <svg width="22" height="22" viewBox="0 0 24 24" fill={c}><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>;
    case 'Pedidos': return <svg width="22" height="22" viewBox="0 0 24 24" fill={c}><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"/></svg>;
    case 'Favoritos': return <svg width="22" height="22" viewBox="0 0 24 24" fill={c}><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>;
    case 'Perfil': return <svg width="22" height="22" viewBox="0 0 24 24" fill={c}><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>;
    default: return null;
  }
}

export default function CustomerBottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  function isActive(tab) {
    if (tab.exact) return pathname === tab.path;
    return pathname === tab.path || pathname.startsWith(tab.path + '/');
  }

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
      background: 'white', borderTop: '1px solid var(--border)',
      display: 'flex', height: 64,
      boxShadow: '0 -2px 12px rgba(0,0,0,0.08)'
    }}>
      {TABS.map(tab => {
        const active = isActive(tab);
        return (
          <button key={tab.label} onClick={() => navigate(tab.path)}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, border: 'none', background: 'none', cursor: 'pointer', padding: '6px 0' }}>
            <TabIcon label={tab.label} active={active} />
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? 'var(--primary)' : '#999' }}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
