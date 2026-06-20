import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);
const API = '/api';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [store, setStore] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [networkError, setNetworkError] = useState(false);

  const checkAuth = useCallback((tok) => {
    if (!tok) { setLoading(false); return; }
    setLoading(true);
    setNetworkError(false);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${tok}` },
      signal: controller.signal
    })
      .then(r => {
        clearTimeout(timeout);
        // Token inválido/expirado → desloga
        if (r.status === 401 || r.status === 403) { logout(); return null; }
        // Servidor acordando (502/503/504) → tela de reconexão, não desloga
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (data) { setUser(data.user); setStore(data.store); }
      })
      .catch(() => {
        // Cobre: erro de rede, timeout (AbortError) e erros HTTP não-401/403
        setNetworkError(true);
      })
      .finally(() => setLoading(false));
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
        setToken(data.token);
        setUser(data.user);
        setNetworkError(false);
        return data;
      });
  }

  function loginWithToken(newToken, userData) {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(userData);
    setNetworkError(false);
  }

  function logout() {
    localStorage.removeItem('token');
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
