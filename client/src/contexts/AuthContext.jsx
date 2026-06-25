import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);
const API = '/api';

function readUserCache() {
  try { return JSON.parse(localStorage.getItem('_usr') || 'null'); } catch { return null; }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readUserCache);
  const [store, setStore] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  // Só mostra spinner se não houver usuário em cache (primeira abertura ou após logout)
  const [loading, setLoading] = useState(!readUserCache() && !!localStorage.getItem('token'));
  const [networkError, setNetworkError] = useState(false);

  // Render free tier demora 30-60s no cold start e retorna 502 enquanto acorda.
  // Retentatvas automáticas evitam mostrar erro ao usuário nesse caso.
  const checkAuth = useCallback((tok, attempt = 0) => {
    if (!tok) { setLoading(false); return; }
    // Só exibe spinner se não há usuário em cache (evita logo ao retomar app)
    if (attempt === 0 && !readUserCache()) setLoading(true);
    if (attempt === 0) setNetworkError(false);

    fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${tok}` } })
      .then(r => {
        if (r.status === 401 || r.status === 403 || r.status === 404) { logout(); setLoading(false); return; }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json().then(data => {
          if (data) {
            setUser(data.user);
            setStore(data.store);
            if (data.user) localStorage.setItem('_usr', JSON.stringify(data.user));
          }
          setLoading(false);
        });
      })
      .catch(() => {
        // delays: 8s → 15s → 20s antes de mostrar o erro
        const delays = [8000, 15000, 20000];
        if (attempt < delays.length) {
          setTimeout(() => checkAuth(tok, attempt + 1), delays[attempt]);
          // loading permanece true — usuário vê spinner enquanto servidor acorda
        } else {
          setNetworkError(true);
          setLoading(false);
        }
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    checkAuth(token);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function retryAuth() {
    checkAuth(localStorage.getItem('token'));
  }

  function login(phone, password) {
    return fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password })
    })
      .then(r => r.json().then(d => ({ ok: r.ok, ...d })))
      .then(data => {
        if (!data.ok) throw new Error(data.error || 'Login falhou');
        localStorage.setItem('token', data.token);
        localStorage.setItem('_usr', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
        setStore(data.store);
        setNetworkError(false);
        return data;
      });
  }

  function register(name, phone, password, role, inviteToken, extra) {
    return fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, password, role, inviteToken, extra })
    })
      .then(r => r.json().then(d => ({ ok: r.ok, ...d })))
      .then(data => {
        if (!data.ok) throw new Error(data.error || 'Cadastro falhou');
        localStorage.setItem('token', data.token);
        localStorage.setItem('_usr', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
        setNetworkError(false);
        return data;
      });
  }

  function loginWithToken(newToken, userData) {
    localStorage.setItem('token', newToken);
    localStorage.setItem('_usr', JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
    setNetworkError(false);
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('_usr');
    setToken(null);
    setUser(null);
    setStore(null);
    setNetworkError(false);
  }

  function apiFetch(path, options = {}) {
    return fetch(`${API}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
        Authorization: `Bearer ${token}`
      }
    }).then(r => r.json().then(d =>
      Array.isArray(d) ? { ok: r.ok, data: d } : { ok: r.ok, ...d }
    )).catch(err => {
      console.error('apiFetch error:', err);
      return { ok: false, error: 'Erro de conexão', data: [] };
    });
  }

  return (
    <AuthContext.Provider value={{ user, store, token, loading, networkError, retryAuth, login, loginWithToken, register, logout, apiFetch, setStore }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
