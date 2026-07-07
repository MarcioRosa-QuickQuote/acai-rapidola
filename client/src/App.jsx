import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { App as CapApp } from '@capacitor/app';
import UpdateBanner from './components/UpdateBanner';
import Login from './pages/Login';
import Register from './pages/Register';
import Legal from './pages/Legal';
import DeleteAccount from './pages/DeleteAccount';
import CustomerStoreList from './pages/CustomerStoreList';
import CustomerHome from './pages/CustomerHome';
import CustomerOrder from './pages/CustomerOrder';
import CustomerPayment from './pages/CustomerPayment';
import CustomerTracking from './pages/CustomerTracking';
import CustomerBusca from './pages/CustomerBusca';
import CustomerPedidos from './pages/CustomerPedidos';
import CustomerFavoritos from './pages/CustomerFavoritos';
import CustomerPagamentos from './pages/CustomerPagamentos';
import CustomerNotificacoes from './pages/CustomerNotificacoes';
import StoreDashboard from './pages/StoreDashboard';
import MotoboyDashboard from './pages/MotoboyDashboard';
import AdminPanel from './pages/AdminPanel';

function AuthLayout() {
  const videoRef = useRef(null);
  const location = useLocation();

  useEffect(() => { videoRef.current?.play().catch(() => {}); }, [location.pathname]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const resume = () => v.play().catch(() => {});
    document.addEventListener('visibilitychange', resume);
    v.addEventListener('pause', resume);
    // autoplay pode ser bloqueado sem gesto do usuário no carregamento inicial;
    // qualquer primeiro toque/clique na tela tenta de novo
    document.addEventListener('touchstart', resume, { once: true });
    document.addEventListener('click', resume, { once: true });
    return () => {
      document.removeEventListener('visibilitychange', resume);
      v.removeEventListener('pause', resume);
      document.removeEventListener('touchstart', resume);
      document.removeEventListener('click', resume);
    };
  }, []);

  return (
    <div style={{ height: '100%', position: 'relative' }}>
      {createPortal(
        <>
          <div style={{
            position: 'fixed', inset: 0,
            background: 'linear-gradient(160deg, #6A1B9A 0%, #9C27B0 45%, #CE93D8 100%)'
          }} />
          <video ref={videoRef} autoPlay loop muted playsInline preload="auto" className="login-video">
            <source src="/video4.mp4" type="video/mp4" />
          </video>
          <div className="login-video-overlay" />
        </>,
        document.body
      )}
      <Outlet />
    </div>
  );
}

function ReconnectScreen({ onRetry }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 16, padding: 24, background: '#F3E5F5' }}>
      <div style={{ fontSize: 52 }}>📡</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: '#1a1a1a' }}>Sem conexão com o servidor</div>
      <div style={{ fontSize: 13, color: '#888', textAlign: 'center', maxWidth: 280 }}>
        O servidor pode estar acordando (isso leva ~30s). Verifique sua internet e tente novamente.
      </div>
      <button onClick={onRetry} style={{
        background: 'linear-gradient(135deg, #6A1B9A, #9C27B0)', color: 'white',
        border: 'none', borderRadius: 14, padding: '14px 32px',
        fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 8
      }}>
        Tentar Novamente
      </button>
    </div>
  );
}

function ProtectedRoute({ role, children }) {
  const { user, loading, networkError, retryAuth } = useAuth();
  if (loading) return <div className="loading" style={{ flexDirection: 'column' }}><img className="spin" src="/saco_acai.png" /></div>;
  if (networkError) return <ReconnectScreen onRetry={retryAuth} />;
  if (!user) return <Navigate to="/login" />;
  if (role && user.role !== role) return <Navigate to={`/${user.role}`} />;
  return children;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { document.getElementById('root')?.scrollTo(0, 0); }, [pathname]);
  return null;
}

function BackButtonHandler() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    let handler;
    CapApp.addListener('backButton', () => {
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        CapApp.exitApp();
      }
    }).then(h => { handler = h; });
    return () => { handler?.remove(); };
  }, [navigate, location]);
  return null;
}

export default function App() {
  const { user, loading, networkError, retryAuth } = useAuth();
  const [slowHint, setSlowHint] = useState(false);

  useEffect(() => {
    if (!loading) { setSlowHint(false); return; }
    const t = setTimeout(() => setSlowHint(true), 5000);
    return () => clearTimeout(t);
  }, [loading]);

  if (loading) {
    return (
      <div className="loading">
        <img className="spin" src="/saco_acai.png" />
        <span style={{ position: 'absolute', top: 'calc(50% + 44px)', fontSize: 13, color: '#9C27B0', fontWeight: 600, opacity: slowHint ? 0.8 : 0, transition: 'opacity 0.4s' }}>
          Aguardando servidor...
        </span>
      </div>
    );
  }

  if (networkError) {
    return <ReconnectScreen onRetry={retryAuth} />;
  }

  return (
    <>
      <ScrollToTop />
      <BackButtonHandler />
      <UpdateBanner />
      <Routes>
      <Route element={user ? <Navigate to={`/${user.role === 'customer' ? 'customer' : user.role}`} /> : <AuthLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>
      <Route path="/privacidade" element={<Legal />} />
      <Route path="/termos" element={<Legal />} />
      <Route path="/deletar-conta" element={<DeleteAccount />} />

      <Route path="/customer" element={
        <ProtectedRoute role="customer"><CustomerStoreList /></ProtectedRoute>
      } />
      <Route path="/customer/conta" element={
        <ProtectedRoute role="customer"><CustomerHome /></ProtectedRoute>
      } />
      <Route path="/customer/menu/:storeId" element={
        <ProtectedRoute role="customer"><CustomerHome /></ProtectedRoute>
      } />
      <Route path="/customer/order" element={
        <ProtectedRoute role="customer"><CustomerOrder /></ProtectedRoute>
      } />
      <Route path="/customer/payment/:id" element={
        <ProtectedRoute role="customer"><CustomerPayment /></ProtectedRoute>
      } />
      <Route path="/customer/tracking/:id" element={
        <ProtectedRoute role="customer"><CustomerTracking /></ProtectedRoute>
      } />
      <Route path="/customer/busca" element={
        <ProtectedRoute role="customer"><CustomerBusca /></ProtectedRoute>
      } />
      <Route path="/customer/pedidos" element={
        <ProtectedRoute role="customer"><CustomerPedidos /></ProtectedRoute>
      } />
      <Route path="/customer/favoritos" element={
        <ProtectedRoute role="customer"><CustomerFavoritos /></ProtectedRoute>
      } />
      <Route path="/customer/pagamentos" element={
        <ProtectedRoute role="customer"><CustomerPagamentos /></ProtectedRoute>
      } />
      <Route path="/customer/notificacoes" element={
        <ProtectedRoute role="customer"><CustomerNotificacoes /></ProtectedRoute>
      } />

      <Route path="/store/*" element={
        <ProtectedRoute role="store"><StoreDashboard /></ProtectedRoute>
      } />

      <Route path="/motoboy/*" element={
        <ProtectedRoute role="motoboy"><MotoboyDashboard /></ProtectedRoute>
      } />

      <Route path="/admin/*" element={
        <ProtectedRoute role="admin"><AdminPanel /></ProtectedRoute>
      } />

      <Route path="*" element={
        user ? <Navigate to={`/${user.role === 'customer' ? 'customer' : user.role === 'admin' ? 'admin' : user.role}`} /> : <Navigate to="/login" />
      } />
    </Routes>
    </>
  );
}
