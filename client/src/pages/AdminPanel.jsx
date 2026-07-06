import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

/* ── helpers ─────────────────────────────────────────────────── */
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtMoney(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtDays(n) {
  if (n === null || n === undefined) return 'Sem expiração';
  if (n === 0) return 'Expira hoje';
  return `${n} dia${n !== 1 ? 's' : ''} restante${n !== 1 ? 's' : ''}`;
}
function actionLabel(a) {
  const map = {
    grant_premium: '✅ Assinante ativado',
    revoke_premium: '🔴 Acesso suspenso',
    set_permanent_premium: '♾️ Assinante permanente',
    activate: '✅ Ativado',
    deactivate: '⛔ Desativado',
  };
  return map[a] || a;
}

/* ── API helper ──────────────────────────────────────────────── */
function useAdminApi(token) {
  const call = useCallback(async (path, opts = {}) => {
    const r = await fetch(`/api/admin${path}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    return r.json();
  }, [token]);
  return call;
}

/* ── Stat Card ───────────────────────────────────────────────── */
function StatCard({ icon, label, value, sub, color = '#6A1B9A', onClick }) {
  return (
    <div onClick={onClick} style={{
      background: 'white', borderRadius: 14, padding: '18px 20px',
      boxShadow: '0 1px 4px rgba(0,0,0,.08)', display: 'flex', gap: 14, alignItems: 'center',
      cursor: onClick ? 'pointer' : 'default'
    }}>
      <div style={{
        width: 46, height: 46, borderRadius: 12, background: color + '18',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a1a', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: color, marginTop: 1, fontWeight: 600 }}>{sub}</div>}
      </div>
    </div>
  );
}

/* ── Badge ───────────────────────────────────────────────────── */
function Badge({ children, color = '#6A1B9A', bg }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 99,
      background: bg || color + '18', color, fontSize: 11, fontWeight: 700
    }}>{children}</span>
  );
}

/* ── Plan Badge ──────────────────────────────────────────────── */
function PlanBadge({ store }) {
  const now = new Date();
  if (store.subscription_active === 0) return <Badge color="#e53935" bg="#ffeaea">Inativo</Badge>;
  const expired = store.premium_until && new Date(store.premium_until) <= now;
  if (expired) return <Badge color="#e53935" bg="#ffeaea">Inativo</Badge>;
  if (store.plan === 'trial') return <Badge color="#1565C0" bg="#E3F2FD">Grátis 🎁</Badge>;
  if (store.plan === 'premium') {
    if (!store.premium_until) return <Badge color="#2E7D32" bg="#e8f5e9">Ativo ♾️</Badge>;
    return <Badge color="#2E7D32" bg="#e8f5e9">Ativo ✅</Badge>;
  }
  return <Badge color="#e53935" bg="#ffeaea">Inativo</Badge>;
}

/* ── Grant Modal ─────────────────────────────────────────────── */
function GrantModal({ store, onClose, onDone, api }) {
  const [action, setAction] = useState('grant_premium');
  const [days, setDays] = useState('30');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    setLoading(true); setErr('');
    try {
      const body = { action, note };
      if (action === 'grant_premium') body.days = parseInt(days) || 30;
      const r = await api(`/stores/${store.id}/plan`, { method: 'PATCH', body });
      if (r.ok) { onDone(); onClose(); }
      else setErr(r.error || 'Erro');
    } finally { setLoading(false); }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
    }} onClick={onClose}>
      <div style={{
        background: 'white', borderRadius: 18, padding: 28, width: '100%', maxWidth: 440,
        boxShadow: '0 8px 40px rgba(0,0,0,.18)'
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>Gerenciar Assinatura</div>
        <div style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>{store.name}</div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>Ação</div>
          {[
            ['grant_premium', '✅ Ativar como assinante por X dias'],
            ['set_permanent_premium', '♾️ Ativar como assinante permanente'],
            ['revoke_premium', '🔴 Desativar (suspender acesso)'],
          ].map(([val, lbl]) => (
            <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer' }}>
              <input type="radio" value={val} checked={action === val} onChange={() => setAction(val)} />
              <span style={{ fontSize: 14 }}>{lbl}</span>
            </label>
          ))}
        </div>

        {action === 'grant_premium' && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>Dias de acesso</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {['7','14','30','60','90','365'].map(d => (
                <button key={d} onClick={() => setDays(d)} style={{
                  padding: '4px 12px', borderRadius: 8, border: '1.5px solid',
                  borderColor: days === d ? '#6A1B9A' : '#ddd',
                  background: days === d ? '#F3E5F5' : 'white',
                  color: days === d ? '#6A1B9A' : '#555',
                  fontWeight: days === d ? 700 : 400, cursor: 'pointer', fontSize: 13
                }}>{d}d</button>
              ))}
            </div>
            <input
              type="number" min="1" value={days} onChange={e => setDays(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14 }}
              placeholder="Ou digitar número de dias"
            />
            {store.premium_until && new Date(store.premium_until) > new Date() && (
              <div style={{ fontSize: 11, color: '#6A1B9A', marginTop: 4 }}>
                ℹ️ Já tem premium até {fmtDate(store.premium_until)} — os dias serão somados
              </div>
            )}
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>Observação (opcional)</div>
          <input
            type="text" value={note} onChange={e => setNote(e.target.value)}
            placeholder="Ex: Cortesia mês inaugural"
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14 }}
          />
        </div>

        {err && <div style={{ color: '#e53935', fontSize: 13, marginBottom: 12 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '10px', borderRadius: 10, border: '1.5px solid #ddd',
            background: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 14
          }}>Cancelar</button>
          <button onClick={submit} disabled={loading} style={{
            flex: 2, padding: '10px', borderRadius: 10, border: 'none',
            background: action === 'revoke_premium' ? '#e53935' : '#6A1B9A',
            color: 'white', cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 700, fontSize: 14, opacity: loading ? .7 : 1
          }}>{loading ? 'Salvando…' : 'Confirmar'}</button>
        </div>
      </div>
    </div>
  );
}

/* ── Store Detail Drawer ─────────────────────────────────────── */
function StoreDrawer({ storeId, api, onClose, onRefresh }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showGrant, setShowGrant] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const d = await api(`/stores/${storeId}`);
    setData(d); setLoading(false);
  }, [storeId, api]);

  useEffect(() => { load(); }, [load]);

  async function toggleActive() {
    if (!data) return;
    setTogglingActive(true);
    await api(`/stores/${storeId}/active`, {
      method: 'PATCH',
      body: { active: data.subscription_active === 0 ? 1 : 0 }
    });
    await load();
    onRefresh();
    setTogglingActive(false);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 900,
      display: 'flex', justifyContent: 'flex-end'
    }} onClick={onClose}>
      <div style={{
        width: '100%', maxWidth: 480, background: 'white', height: '100%',
        overflowY: 'auto', boxShadow: '-4px 0 30px rgba(0,0,0,.12)'
      }} onClick={e => e.stopPropagation()}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#888' }}>
            Carregando…
          </div>
        ) : !data ? (
          <div style={{ padding: 24, color: '#e53935' }}>Erro ao carregar</div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {data.logo
                ? <img src={data.logo} style={{ width: 52, height: 52, borderRadius: 12, objectFit: 'cover' }} />
                : <div style={{ width: 52, height: 52, borderRadius: 12, background: '#F3E5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🏪</div>
              }
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 17 }}>{data.name}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{data.address}</div>
                <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <PlanBadge store={data} />
                  {data.daysLeft !== null && data.plan === 'premium' && (
                    <Badge color="#1565C0" bg="#E3F2FD">{fmtDays(data.daysLeft)}</Badge>
                  )}
                </div>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888', padding: 4 }}>✕</button>
            </div>

            {/* Actions */}
            <div style={{ padding: '14px 20px', display: 'flex', gap: 8, borderBottom: '1px solid #f0f0f0' }}>
              <button onClick={() => setShowGrant(true)} style={{
                flex: 1, padding: '9px 0', borderRadius: 10, border: 'none',
                background: '#6A1B9A', color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer'
              }}>⭐ Gerenciar Plano</button>
              <button onClick={toggleActive} disabled={togglingActive} style={{
                padding: '9px 14px', borderRadius: 10, border: '1.5px solid',
                borderColor: data.subscription_active === 1 ? '#e53935' : '#2E7D32',
                background: 'white',
                color: data.subscription_active === 1 ? '#e53935' : '#2E7D32',
                fontWeight: 700, fontSize: 13, cursor: 'pointer'
              }}>
                {data.subscription_active === 1 ? '⛔ Desativar' : '✅ Ativar'}
              </button>
            </div>

            {/* Owner */}
            {data.owner && (
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0f0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Dono</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{data.owner.name}</div>
                <div style={{ fontSize: 12, color: '#888' }}>📱 {data.owner.phone}</div>
                {data.owner.email && <div style={{ fontSize: 12, color: '#888' }}>✉️ {data.owner.email}</div>}
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>Cadastrado em {fmtDate(data.owner.created_at)}</div>
              </div>
            )}

            {/* Subscription info */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Assinatura</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  ['Plano', data.plan === 'premium' ? 'R$129/mês' : 'Sem plano'],
                  ['Status', data.subscription_active === 1 ? 'Ativa' : 'Inativa'],
                  ['Ativo até', data.premium_until ? fmtDate(data.premium_until) : (data.plan === 'premium' ? 'Permanente' : '—')],
                  ['Loja criada em', fmtDate(data.created_at)],
                ].map(([k, v]) => (
                  <div key={k} style={{ background: '#fafafa', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, color: '#aaa', fontWeight: 600 }}>{k}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 1 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent orders */}
            {data.recentOrders?.length > 0 && (
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0f0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Pedidos Recentes</div>
                {data.recentOrders.slice(0, 5).map(o => (
                  <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f9f9f9' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{fmtMoney(o.total)}</div>
                      <div style={{ fontSize: 11, color: '#aaa' }}>{fmtDate(o.created_at)}</div>
                    </div>
                    <Badge color={o.status === 'delivered' ? '#2E7D32' : o.status === 'cancelled' ? '#e53935' : '#FF6D00'}>
                      {o.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {/* Logs */}
            <div style={{ padding: '14px 20px 28px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Histórico de Assinatura</div>
              {!data.logs?.length ? (
                <div style={{ fontSize: 13, color: '#aaa' }}>Nenhuma alteração registrada ainda.</div>
              ) : data.logs.map(l => (
                <div key={l.id} style={{ padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{actionLabel(l.action)} {l.days ? `(${l.days} dias)` : ''}</div>
                  {l.note && <div style={{ fontSize: 12, color: '#888' }}>"{l.note}"</div>}
                  <div style={{ fontSize: 11, color: '#aaa' }}>{fmtDate(l.created_at)} · {l.admin_name || 'admin'}</div>
                </div>
              ))}
            </div>

            {showGrant && (
              <GrantModal
                store={data}
                api={api}
                onClose={() => setShowGrant(false)}
                onDone={() => { load(); onRefresh(); }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── RejectModal ─────────────────────────────────────────────── */
function RejectModal({ entregador, onClose, onDone, api }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    await api(`/entregadores/${entregador.id}/reject`, { method: 'PATCH', body: { reason } });
    onDone(); onClose();
    setLoading(false);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
    }} onClick={onClose}>
      <div style={{
        background: 'white', borderRadius: 18, padding: 28, width: '100%', maxWidth: 400,
        boxShadow: '0 8px 40px rgba(0,0,0,.18)'
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>Recusar cadastro</div>
        <div style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>{entregador.name}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>Motivo (opcional)</div>
        <input value={reason} onChange={e => setReason(e.target.value)}
          placeholder="Ex: Documento ilegível, selfie inválida..."
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box', marginBottom: 16 }} />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 10, borderRadius: 10, border: '1.5px solid #ddd', background: 'white', cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
          <button onClick={submit} disabled={loading} style={{ flex: 2, padding: 10, borderRadius: 10, border: 'none', background: '#e53935', color: 'white', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: loading ? .7 : 1 }}>
            {loading ? 'Recusando…' : 'Recusar cadastro'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main AdminPanel ─────────────────────────────────────────── */
export default function AdminPanel() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const api = useAdminApi(token);

  const [view, setView] = useState('stores'); // 'stores' | 'entregadores' | 'logs'
  const [stats, setStats] = useState(null);
  const [stores, setStores] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPlan, setFilterPlan] = useState('all');
  const [selectedStoreId, setSelectedStoreId] = useState(null);
  const [showGrant, setShowGrant] = useState(null);

  // Entregadores
  const [entregadores, setEntregadores] = useState([]);
  const [entregadoresLoading, setEntregadoresLoading] = useState(false);
  const [filterApproval, setFilterApproval] = useState('pending'); // 'all'|'pending'|'approved'|'rejected'
  const [autoApprove, setAutoApprove] = useState(false);
  const [autoApproveLoading, setAutoApproveLoading] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [deleteHoverId, setDeleteHoverId] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [s, st] = await Promise.all([api('/stats'), api('/stores')]);
    setStats(s); setStores(Array.isArray(st) ? st : []);
    setLoading(false);
  }, [api]);

  const loadLogs = useCallback(async () => {
    const l = await api('/logs');
    setLogs(Array.isArray(l) ? l : []);
  }, [api]);

  const loadEntregadores = useCallback(async () => {
    setEntregadoresLoading(true);
    const [list, settings] = await Promise.all([api('/entregadores'), api('/settings')]);
    setEntregadores(Array.isArray(list) ? list : []);
    setAutoApprove(settings?.auto_approve_motoboy === 'true');
    setEntregadoresLoading(false);
  }, [api]);

  async function toggleAutoApprove() {
    setAutoApproveLoading(true);
    const newVal = !autoApprove;
    await api('/settings', { method: 'PATCH', body: { key: 'auto_approve_motoboy', value: String(newVal) } });
    setAutoApprove(newVal);
    setAutoApproveLoading(false);
  }

  async function approveEntregador(id) {
    await api(`/entregadores/${id}/approve`, { method: 'PATCH', body: {} });
    loadEntregadores();
  }

  async function deleteEntregador(id, name) {
    if (!window.confirm(`Excluir o cadastro de "${name}"? Esta ação não pode ser desfeita.`)) return;
    await api(`/entregadores/${id}`, { method: 'DELETE' });
    loadEntregadores();
  }

  async function suspendEntregador(id, reason) {
    await api(`/entregadores/${id}/suspend`, { method: 'PATCH', body: { reason } });
    loadEntregadores();
  }

  useEffect(() => {
    if (user?.role !== 'admin') { navigate('/login'); return; }
    loadAll();
  }, []);

  useEffect(() => {
    if (view === 'logs') loadLogs();
    if (view === 'entregadores') loadEntregadores();
  }, [view]);

  const filtered = stores.filter(s => {
    const q = search.toLowerCase();
    const matchQ = !q || s.name?.toLowerCase().includes(q) || s.address?.toLowerCase().includes(q) ||
      s.owner?.name?.toLowerCase().includes(q) || s.owner?.phone?.includes(q);
    const now = new Date();
    const isPremium = s.plan === 'premium' && s.subscription_active === 1 &&
      (!s.premium_until || new Date(s.premium_until) > now);
    const isInactive = s.subscription_active === 0;
    if (filterPlan === 'premium' && !isPremium) return false;
    if (filterPlan === 'basico' && (isPremium || isInactive)) return false;
    if (filterPlan === 'inactive' && !isInactive) return false;
    return matchQ;
  });

  return (
    <div style={{ minHeight: '100vh', background: '#F5F0FA', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{
        background: '#4A148C', color: 'white', padding: '0 20px',
        display: 'flex', alignItems: 'center', gap: 12, height: 56, flexShrink: 0
      }}>
        <img src="/vem_acai_transp.png" style={{ width: 32, height: 32, objectFit: 'contain' }} alt="" />
        <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: -0.3 }}>Vem, Açaí! · Admin</div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 13, opacity: 0.8 }}>Olá, {user?.name}</div>
        <button onClick={logout} style={{
          background: 'rgba(255,255,255,.15)', border: 'none', color: 'white',
          padding: '5px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600
        }}>Sair</button>
      </div>

      {/* Nav tabs */}
      <div style={{
        background: 'white', borderBottom: '1px solid #ede7f6',
        display: 'flex', padding: '0 20px', gap: 0
      }}>
        {[
          ['stores', '🏪', 'Lojas'],
          ['entregadores', '🛵', stats?.pendingMotoboys > 0 ? `Entregadores (${stats.pendingMotoboys})` : 'Entregadores'],
          ['logs', '📋', 'Histórico'],
        ].map(([k, icon, lbl]) => (
          <button key={k} onClick={() => setView(k)} style={{
            padding: '12px 18px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: view === k ? 700 : 500, fontSize: 14,
            color: view === k ? '#6A1B9A' : '#888',
            borderBottom: view === k ? '2.5px solid #6A1B9A' : '2.5px solid transparent'
          }}>{icon} {lbl}</button>
        ))}
      </div>

      <div style={{ flex: 1, padding: '20px 16px', maxWidth: 960, margin: '0 auto', width: '100%' }}>

        {/* ── Stats cards ── */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
            <StatCard icon="🏪" label="Total de Lojas" value={stats.totalStores} color="#6A1B9A" />
            <StatCard icon="⭐" label="Plano Ativo" value={stats.premiumActive} sub={`${stats.basico} sem plano`} color="#FF6D00" />
            <StatCard icon="📦" label="Pedidos hoje" value={stats.ordersToday} sub={`${stats.totalOrders30d} em 30 dias`} color="#1565C0" />
            <StatCard icon="💰" label="Receita hoje" value={fmtMoney(stats.revenueToday)} color="#2E7D32" />
            <StatCard icon="👥" label="Clientes" value={stats.totalCustomers} color="#0097A7" />
            <StatCard icon="🛵" label="Entregadores" value={stats.totalMotoboys} sub={stats.pendingMotoboys > 0 ? `${stats.pendingMotoboys} aguardando` : undefined} color="#795548" onClick={() => setView('entregadores')} />
          </div>
        )}

        {/* ── STORES VIEW ── */}
        {view === 'stores' && (
          <>
            {/* Search + Filter */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nome, endereço ou dono…"
                style={{ flex: 1, minWidth: 200, padding: '9px 14px', borderRadius: 10, border: '1.5px solid #ddd', fontSize: 14 }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                {[['all','Todas'],['premium','Ativo'],['basico','Grátis'],['inactive','Inativo']].map(([v,l]) => (
                  <button key={v} onClick={() => setFilterPlan(v)} style={{
                    padding: '8px 14px', borderRadius: 10, border: '1.5px solid',
                    borderColor: filterPlan === v ? '#6A1B9A' : '#ddd',
                    background: filterPlan === v ? '#F3E5F5' : 'white',
                    color: filterPlan === v ? '#6A1B9A' : '#555',
                    fontWeight: filterPlan === v ? 700 : 400, cursor: 'pointer', fontSize: 13
                  }}>{l}</button>
                ))}
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>Carregando…</div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>Nenhuma loja encontrada</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filtered.map(s => (
                  <div key={s.id} style={{
                    background: 'white', borderRadius: 14, padding: '14px 16px',
                    boxShadow: '0 1px 4px rgba(0,0,0,.07)',
                    display: 'flex', gap: 12, alignItems: 'center',
                    cursor: 'pointer', transition: 'box-shadow .15s'
                  }}
                    onClick={() => setSelectedStoreId(s.id)}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 3px 12px rgba(106,27,154,.13)'}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,.07)'}
                  >
                    {s.logo
                      ? <img src={s.logo} style={{ width: 42, height: 42, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                      : <div style={{ width: 42, height: 42, borderRadius: 10, background: '#F3E5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🏪</div>
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</div>
                        <PlanBadge store={s} />
                        {s.daysLeft !== null && s.plan === 'premium' && s.subscription_active === 1 && (
                          <span style={{ fontSize: 11, color: '#888' }}>{fmtDays(s.daysLeft)}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.owner?.name || '—'} · {s.owner?.phone || '—'}
                      </div>
                    </div>
                    {/* Stats */}
                    <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{s.orders30d}</div>
                        <div style={{ fontSize: 10, color: '#aaa' }}>pedidos/30d</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#2E7D32' }}>{fmtMoney(s.revenue30d)}</div>
                        <div style={{ fontSize: 10, color: '#aaa' }}>receita/30d</div>
                      </div>
                    </div>
                    {/* Quick grant button */}
                    <button
                      onClick={e => { e.stopPropagation(); setShowGrant(s); }}
                      style={{
                        padding: '6px 12px', borderRadius: 8, border: 'none',
                        background: '#F3E5F5', color: '#6A1B9A',
                        fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0
                      }}
                    >⭐ Plano</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── ENTREGADORES VIEW ── */}
        {view === 'entregadores' && (
          <>
            {/* Auto-approval toggle */}
            <div style={{ background: 'white', borderRadius: 14, padding: '14px 18px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,.07)', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Aprovação automática</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  {autoApprove ? 'Entregadores são aprovados imediatamente ao se cadastrar' : 'Novos entregadores aguardam revisão manual antes de usar o app'}
                </div>
              </div>
              <button onClick={toggleAutoApprove} disabled={autoApproveLoading} style={{
                width: 52, height: 28, borderRadius: 14, border: 'none', cursor: autoApproveLoading ? 'not-allowed' : 'pointer',
                background: autoApprove ? '#4CAF50' : '#ddd',
                transition: 'background 0.2s', position: 'relative', flexShrink: 0
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', background: 'white',
                  position: 'absolute', top: 3, transition: 'left 0.2s',
                  left: autoApprove ? 27 : 3,
                  boxShadow: '0 1px 4px rgba(0,0,0,.2)'
                }} />
              </button>
            </div>

            {/* Filtros */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {[['pending','Pendentes'],['approved','Aprovados'],['suspended','Suspensos'],['rejected','Recusados'],['all','Todos']].map(([v,l]) => (
                <button key={v} onClick={() => setFilterApproval(v)} style={{
                  padding: '7px 14px', borderRadius: 10, border: '1.5px solid',
                  borderColor: filterApproval === v ? '#6A1B9A' : '#ddd',
                  background: filterApproval === v ? '#F3E5F5' : 'white',
                  color: filterApproval === v ? '#6A1B9A' : '#555',
                  fontWeight: filterApproval === v ? 700 : 400, cursor: 'pointer', fontSize: 13
                }}>{l}</button>
              ))}
            </div>

            {entregadoresLoading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#888' }}>Carregando…</div>
            ) : (() => {
              const filtered = entregadores.filter(e =>
                filterApproval === 'all' || e.approval_status === filterApproval
              );
              return filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>Nenhum entregador encontrado</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {filtered.map(e => (
                    <div key={e.id} style={{ background: 'white', borderRadius: 14, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.07)', position: 'relative' }}>
                      <button
                        onClick={() => deleteEntregador(e.id, e.name)}
                        onMouseEnter={() => setDeleteHoverId(e.id)}
                        onMouseLeave={() => setDeleteHoverId(null)}
                        title="Excluir cadastro"
                        style={{
                          position: 'absolute', top: 10, right: 10,
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 16, padding: 4, lineHeight: 1,
                          color: deleteHoverId === e.id ? '#e53935' : '#bbb',
                          transition: 'color 0.15s'
                        }}
                      >🗑</button>
                      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                        {/* Selfie */}
                        <div style={{ flexShrink: 0 }}>
                          {e.selfie_url ? (
                            <a href={e.selfie_url} target="_blank" rel="noreferrer">
                              <img src={e.selfie_url} alt="selfie" style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover', display: 'block', cursor: 'zoom-in' }} />
                            </a>
                          ) : (
                            <div style={{ width: 72, height: 72, borderRadius: 12, background: '#F3E5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🧑</div>
                          )}
                        </div>

                        {/* CNH */}
                        {e.document_url && (
                          <div style={{ flexShrink: 0 }}>
                            <div style={{ fontSize: 10, color: '#888', marginBottom: 2, textAlign: 'center' }}>CNH</div>
                            <a href={e.document_url} target="_blank" rel="noreferrer">
                              <img src={e.document_url} alt="CNH" style={{
                                width: 90, height: 60, borderRadius: 8, objectFit: 'cover',
                                border: '1px solid #ddd', display: 'block'
                              }} />
                            </a>
                          </div>
                        )}

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                            <div style={{ fontWeight: 700, fontSize: 15 }}>{e.name}</div>
                            <Badge
                              color={e.approval_status === 'approved' ? '#2E7D32' : e.approval_status === 'rejected' ? '#e53935' : e.approval_status === 'suspended' ? '#6A1B9A' : '#FF6D00'}
                              bg={e.approval_status === 'approved' ? '#e8f5e9' : e.approval_status === 'rejected' ? '#ffeaea' : e.approval_status === 'suspended' ? '#F3E5F5' : '#fff3e0'}
                            >
                              {e.approval_status === 'approved' ? 'Aprovado' : e.approval_status === 'rejected' ? 'Recusado' : e.approval_status === 'suspended' ? 'Suspenso' : 'Pendente'}
                            </Badge>
                          </div>
                          <div style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>📱 {e.phone} {e.email && `· ✉️ ${e.email}`}</div>
                          {e.cpf && <div style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>CPF: {e.cpf}</div>}
                          <div style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>
                            {e.vehicle_type && `${e.vehicle_type === 'moto' ? '🛵 Moto' : e.vehicle_type === 'bicycle' ? '🚲 Bicicleta' : e.vehicle_type === 'car' ? '🚗 Carro' : '🚶 A pé'}`}
                            {e.plate && ` · Placa: ${e.plate}`}
                          </div>
                          {e.pix_key && <div style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>Pix: {e.pix_key}</div>}
                          {e.rejection_reason && <div style={{ fontSize: 12, color: e.approval_status === 'suspended' ? '#6A1B9A' : '#e53935', marginTop: 4 }}>Motivo: {e.rejection_reason}</div>}
                          {e.approval_status === 'suspended' && e.suspended_until && (() => {
                            const until = new Date(e.suspended_until);
                            const days = Math.max(0, Math.ceil((until - new Date()) / 86400000));
                            return (
                              <div style={{ fontSize: 11, color: '#6A1B9A', fontWeight: 600, marginTop: 2 }}>
                                ⏱ {days === 0 ? 'Expira hoje' : `Expira em ${days} dia${days !== 1 ? 's' : ''}`} · {until.toLocaleDateString('pt-BR')}
                              </div>
                            );
                          })()}
                          <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>Cadastro em {fmtDate(e.created_at)}</div>

                          {/* Stats de pedidos + métricas */}
                          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                            {e.stats && e.stats.total > 0 && (<>
                              <span style={{ fontSize: 11, background: '#e8f5e9', color: '#2E7D32', padding: '2px 8px', borderRadius: 8, fontWeight: 600 }}>
                                ✅ {e.stats.delivered} entregas
                              </span>
                              {e.stats.cancelled > 0 && (
                                <span style={{ fontSize: 11, background: '#ffeaea', color: '#e53935', padding: '2px 8px', borderRadius: 8, fontWeight: 600 }}>
                                  ✕ {Math.round(e.stats.cancelled / e.stats.total * 100)}% cancel.
                                </span>
                              )}
                            </>)}
                            {e.acceptance_rate !== null && e.acceptance_rate !== undefined && (
                              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, fontWeight: 600,
                                background: e.acceptance_rate >= 70 ? '#e8f5e9' : e.acceptance_rate >= 50 ? '#fff3e0' : '#ffeaea',
                                color: e.acceptance_rate >= 70 ? '#2E7D32' : e.acceptance_rate >= 50 ? '#E65100' : '#e53935' }}>
                                👍 {e.acceptance_rate}% aceitação
                              </span>
                            )}
                            {e.avg_rating !== null && e.avg_rating !== undefined && (
                              <span style={{ fontSize: 11, background: '#FFF8E1', color: '#F57F17', padding: '2px 8px', borderRadius: 8, fontWeight: 600 }}>
                                ⭐ {e.avg_rating} ({e.rating_count})
                              </span>
                            )}
                          </div>

                        </div>
                      </div>

                      {/* Botões de ação */}
                      {e.approval_status === 'pending' && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                          <button onClick={() => approveEntregador(e.id)} style={{
                            padding: '8px 20px', borderRadius: 10, border: 'none',
                            background: '#4CAF50', color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer'
                          }}>✅ Aprovar</button>
                          <button onClick={() => setRejectTarget(e)} style={{
                            padding: '8px 20px', borderRadius: 10, border: 'none',
                            background: '#e53935', color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer'
                          }}>✕ Recusar</button>
                        </div>
                      )}
                      {e.approval_status !== 'pending' && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                          {(e.approval_status === 'rejected' || e.approval_status === 'suspended') && (
                            <button onClick={() => approveEntregador(e.id)} style={{
                              padding: '7px 16px', borderRadius: 10, border: 'none',
                              background: '#4CAF50', color: 'white', fontWeight: 700, fontSize: 12, cursor: 'pointer'
                            }}>✅ Reativar</button>
                          )}
                          {e.approval_status === 'approved' && (
                            <button onClick={() => suspendEntregador(e.id, 'Suspenso pelo administrador')} style={{
                              padding: '7px 16px', borderRadius: 10, border: 'none',
                              background: '#6A1B9A', color: 'white', fontWeight: 700, fontSize: 12, cursor: 'pointer'
                            }}>⏸ Suspender</button>
                          )}
                          {(e.approval_status === 'approved' || e.approval_status === 'suspended') && (
                            <button onClick={() => setRejectTarget(e)} style={{
                              padding: '7px 16px', borderRadius: 10, border: 'none',
                              background: '#e53935', color: 'white', fontWeight: 700, fontSize: 12, cursor: 'pointer'
                            }}>✕ Recusar</button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}

            {rejectTarget && (
              <RejectModal
                entregador={rejectTarget}
                api={api}
                onClose={() => setRejectTarget(null)}
                onDone={loadEntregadores}
              />
            )}
          </>
        )}

        {/* ── LOGS VIEW ── */}
        {view === 'logs' && (
          <div style={{ background: 'white', borderRadius: 14, padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Histórico de Alterações</div>
            {logs.length === 0 ? (
              <div style={{ color: '#aaa', fontSize: 14 }}>Nenhum log ainda.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {logs.map((l, i) => (
                  <div key={l.id} style={{
                    display: 'flex', gap: 12, padding: '10px 0',
                    borderBottom: i < logs.length - 1 ? '1px solid #f5f5f5' : 'none'
                  }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: '#F3E5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                      {l.action === 'grant_premium' || l.action === 'set_permanent_premium' ? '⭐' :
                        l.action === 'revoke_premium' ? '🔴' :
                          l.action === 'activate' ? '✅' : '⛔'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>
                        {l.store_name} <span style={{ color: '#888', fontWeight: 400 }}>—</span> {actionLabel(l.action)}
                        {l.days ? <span style={{ color: '#6A1B9A', fontWeight: 700 }}> ({l.days} dias)</span> : ''}
                      </div>
                      {l.note && <div style={{ fontSize: 12, color: '#888' }}>"{l.note}"</div>}
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 1 }}>
                        {fmtDate(l.created_at)} · por {l.admin_name || 'admin'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Drawers & Modals */}
      {selectedStoreId && (
        <StoreDrawer
          storeId={selectedStoreId}
          api={api}
          onClose={() => setSelectedStoreId(null)}
          onRefresh={loadAll}
        />
      )}
      {showGrant && (
        <GrantModal
          store={showGrant}
          api={api}
          onClose={() => setShowGrant(null)}
          onDone={loadAll}
        />
      )}
    </div>
  );
}
