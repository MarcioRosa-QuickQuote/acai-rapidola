import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { App as CapApp } from '@capacitor/app';
import UpdateBanner from './components/UpdateBanner';
import Login from './pages/Login';
import Register from './pages/Register';
import Legal from './pages/Legal';
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

function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading"><img className="spin" src="/saco_acai.png" /></div>;
  if (!user) return <Navigate to="/login" />;
  if (role && user.role !== role) return <Navigate to={`/${user.role}`} />;
  return children;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
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
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading"><img className="spin" src="/saco_acai.png" /></div>;
  }

  return (
    <>
      <ScrollToTop />
      <BackButtonHandler />
      <UpdateBanner />
      <Routes>
      <Route path="/login" element={user ? <Navigate to={`/${user.role === 'customer' ? 'customer' : user.role}`} /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to={`/${user.role === 'customer' ? 'customer' : user.role}`} /> : <Register />} />
      <Route path="/privacidade" element={<Legal />} />
      <Route path="/termos" element={<Legal />} />

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
