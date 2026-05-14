import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const statusLabels = {
  pending: 'Aguardando pgto', confirmed: 'Confirmado', preparing: 'Preparando',
  ready: 'Pronto', assigned: 'Motoboy a caminho', picked_up: 'Retirado',
  in_transit: 'Em trânsito', arriving: 'Chegando', delivered: 'Entregue', cancelled: 'Cancelado'
};

const statusColors = {
  pending: 'badge-warning', confirmed: 'badge-primary', preparing: 'badge-info',
  ready: 'badge-success', assigned: 'badge-primary', picked_up: 'badge-primary',
  in_transit: 'badge-info', arriving: 'badge-accent', delivered: 'badge-success', cancelled: 'badge-danger'
};

const actionMap = {
  confirmed: { label: 'Preparar', next: 'preparing' },
  preparing: { label: 'Marcar Pronto', next: 'ready' },
  ready: { label: 'Já está pronto', next: 'ready' }
};

export default function StoreDashboard() {
  const { user, store: storeData, apiFetch, logout, setStore } = useAuth();
  const { socket, joinStore, toast, setToast } = useSocket();
  const [orders, setOrders] = useState([]);
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('orders');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [settings, setSettings] = useState({ name: '', logo: '', address: '', lat: '', lng: '' });
  const [saveMsg, setSaveMsg] = useState('');
  const [mapCenter, setMapCenter] = useState([-23.5505, -46.6333]);
  const [geocoding, setGeocoding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const [logoSaving, setLogoSaving] = useState(false);
  const [settingsTab, setSettingsTab] = useState('produtos');
  const [orderFilter, setOrderFilter] = useState('ativos');
  const [motoboys, setMotoboys] = useState([]);
  const [motoboyPhone, setMotoboyPhone] = useState('');
  const [motoboyMsg, setMotoboyMsg] = useState('');
  const [invites, setInvites] = useState([]);
  const [inviteLink, setInviteLink] = useState('');
  const [products, setProducts] = useState([]);
  const [productForm, setProductForm] = useState(null);
  const [productImg, setProductImg] = useState(null);
  const productImgRef = useRef(null);

  useEffect(() => {
    loadOrders();
    if (storeData) {
      joinStore(storeData.id);
      setOpen(!!storeData.open);
    }
  }, [storeData]);

  useEffect(() => {
    if (storeData) {
      setSettings({
        name: storeData.name || '',
        logo: storeData.logo || '',
        address: storeData.address || '',
        lat: String(storeData.lat),
        lng: String(storeData.lng)
      });
      setMapCenter([storeData.lat, storeData.lng]);
    }
  }, [storeData]);

  useEffect(() => {
    if (!socket) return;
    socket.on('new_order', () => loadOrders());
    socket.on('order_paid', () => { loadOrders(); setToast('Pagamento confirmado! Prepare o açaí!'); });
    socket.on('order_status', () => loadOrders());
    socket.on('notification', (notif) => {
      if (notif.type === 'delivery') setToast(notif.body);
    });
    return () => {
      socket.off('new_order');
      socket.off('order_paid');
      socket.off('order_status');
      socket.off('notification');
    };
  }, [socket]);

  useEffect(() => {
    if (view === 'settings' && settingsTab === 'motoboys') loadMotoboys();
    if (view === 'settings' && settingsTab === 'produtos') loadProducts();
  }, [view, settingsTab, storeData]);

  async function loadOrders() {
    const data = await apiFetch('/orders');
    if (data.data) setOrders(data.data);
    setLoading(false);
  }

  async function updateStatus(orderId, status) {
    await apiFetch(`/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    loadOrders();
  }

  async function toggleOpen() {
    if (!storeData) return;
    const data = await apiFetch(`/stores/${storeData.id}/toggle-open`, { method: 'PATCH' });
    if (data.ok || data.open !== undefined) setOpen(data.open);
  }

  async function uploadLogo() {
    const file = fileRef.current?.files?.[0];
    if (!file || !storeData) return;
    setLogoSaving(true);
    const formData = new FormData();
    formData.append('logo', file);
    try {
      const res = await fetch(`/api/stores/${storeData.id}/logo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData
      });
      const data = await res.json();
      if (data.logo) {
        setSettings(s => ({ ...s, logo: data.logo }));
        setStore(prev => prev ? { ...prev, logo: data.logo } : prev);
        setSaveMsg('Logo atualizado!');
        setTimeout(() => setSaveMsg(''), 2000);
      }
    } catch {
      setSaveMsg('Erro ao enviar logo.');
      setTimeout(() => setSaveMsg(''), 3000);
    } finally {
      setLogoSaving(false);
    }
  }

  async function saveSettings() {
    if (!storeData) return;
    setSaveMsg('');
    setUploading(true);

    const data = await apiFetch(`/stores/${storeData.id}/settings`, {
      method: 'PUT',
      body: JSON.stringify({
        name: settings.name,
        logo: settings.logo,
        address: settings.address,
        lat: parseFloat(settings.lat),
        lng: parseFloat(settings.lng)
      })
    });
    if (data.ok) {
      if (data.name) setStore(data);
      setSaveMsg('Configurações salvas!');
      setTimeout(() => setSaveMsg(''), 3000);
    }
    setUploading(false);
  }

  async function geocodeAddress() {
    if (!settings.address) return;
    setGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(settings.address)}&limit=1&countrycodes=BR`
      );
      const data = await res.json();
      if (data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        setSettings(s => ({ ...s, lat: String(lat), lng: String(lng) }));
        setMapCenter([lat, lng]);
      } else {
        setSaveMsg('Endereço não encontrado. Tente um endereço mais específico.');
        setTimeout(() => setSaveMsg(''), 4000);
      }
    } catch {
        setSaveMsg('Erro ao buscar endereço.');
      setTimeout(() => setSaveMsg(''), 4000);
    } finally {
      setGeocoding(false);
    }
  }

  async function loadMotoboys() {
    if (!storeData) return;
    const [motoboysData, invitesData] = await Promise.all([
      apiFetch(`/stores/${storeData.id}/motoboys`),
      apiFetch(`/stores/${storeData.id}/invites`)
    ]);
    if (motoboysData.data) setMotoboys(motoboysData.data);
    if (invitesData.data) setInvites(invitesData.data);
  }

  async function generateInvite() {
    if (!motoboyPhone.trim() || !storeData) return;
    setMotoboyMsg('');
    setInviteLink('');
    const data = await apiFetch(`/stores/${storeData.id}/invite`, {
      method: 'POST',
      body: JSON.stringify({ phone: motoboyPhone.trim() })
    });
    if (data.error) {
      setMotoboyMsg(data.error);
      setTimeout(() => setMotoboyMsg(''), 4000);
    } else if (data.direct) {
      setMotoboyPhone('');
      setMotoboyMsg(`Motoboy ${data.name} vinculado diretamente como parceiro!`);
      setTimeout(() => setMotoboyMsg(''), 3000);
      loadMotoboys();
    } else if (data.inviteLink) {
      setInviteLink(data.inviteLink);
      setMotoboyMsg('Convite gerado! Compartilhe o link com o motoboy.');
      setTimeout(() => setMotoboyMsg(''), 6000);
      loadMotoboys();
    }
  }

  async function copyInviteLinkToken(token) {
    const link = `${window.location.origin}/register?token=${token}`;
    try {
      await navigator.clipboard.writeText(link);
      setMotoboyMsg('Link copiado!');
      setTimeout(() => setMotoboyMsg(''), 2000);
    } catch {
      setMotoboyMsg('Erro ao copiar.');
      setTimeout(() => setMotoboyMsg(''), 2000);
    }
  }

  async function revokeInvite(inviteId) {
    if (!storeData || !confirm('Cancelar este convite?')) return;
    await apiFetch(`/stores/${storeData.id}/invite/${inviteId}`, { method: 'DELETE' });
    loadMotoboys();
  }

  async function toggleEmployee(motoboyId, current) {
    if (!storeData) return;
    await apiFetch(`/stores/${storeData.id}/motoboy/${motoboyId}`, {
      method: 'PATCH',
      body: JSON.stringify({ employee: current ? 0 : 1 })
    });
    loadMotoboys();
  }

  async function removeMotoboy(motoboyId) {
    if (!storeData || !confirm('Remover este motoboy da loja?')) return;
    await apiFetch(`/stores/${storeData.id}/motoboy/${motoboyId}`, { method: 'DELETE' });
    loadMotoboys();
  }

  async function loadProducts() {
    if (!storeData) return;
    const data = await apiFetch(`/products?store_id=${storeData.id}`);
    if (data.data) setProducts(data.data);
  }

  function openNewProduct() {
    setProductForm({ name: '', description: '', price: '', size_ml: '500' });
    setProductImg(null);
  }

  async function saveProduct() {
    if (!storeData || !productForm) return;
    const { name, description, price, size_ml, id } = productForm;
    if (!name || !price || !size_ml) return;

    let imageUrl = productForm.image || '';
    const file = productImgRef.current?.files?.[0];
    if (file) {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/products/upload-image', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData
      });
      const data = await res.json();
      if (data.url) imageUrl = data.url;
    }

    if (id) {
      await apiFetch(`/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, description, price: parseFloat(price), size_ml: parseInt(size_ml), image: imageUrl })
      });
    } else {
      await apiFetch('/products', {
        method: 'POST',
        body: JSON.stringify({ name, description, price: parseFloat(price), size_ml: parseInt(size_ml), image: imageUrl })
      });
    }
    setProductForm(null);
    setProductImg(null);
    loadProducts();
  }

  async function toggleProduct(id, active) {
    await apiFetch(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ active: active ? 0 : 1 })
    });
    loadProducts();
  }

  async function deleteProduct(id) {
    if (!confirm('Excluir este produto permanentemente?')) return;
    await apiFetch(`/products/${id}`, { method: 'DELETE' });
    loadProducts();
  }

  function editProduct(p) {
    setProductForm({ id: p.id, name: p.name, description: p.description || '', price: String(p.price), size_ml: String(p.size_ml) });
  }

  function MapClickHandler() {
    useMapEvents({
      click(e) {
        const { lat, lng } = e.latlng;
        setSettings(s => ({ ...s, lat: String(lat.toFixed(6)), lng: String(lng.toFixed(6)) }));
      }
    });
    return null;
  }

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  const unpaidOrders = orders.filter(o => o.payment_status !== 'paid');
  const pendingOrders = orders.filter(o => o.payment_status === 'paid' && !['delivered','cancelled'].includes(o.status));
  const paidOrders = orders.filter(o => o.payment_status === 'paid');
  
  const now = Date.now();
  const staleUnpaid = unpaidOrders.filter(o => {
    const created = new Date(o.created_at).getTime();
    return (now - created) > 2 * 60 * 60 * 1000;
  });
  
  const displayOrders = orderFilter === 'ativos' ? pendingOrders : orderFilter === 'pendentes' ? unpaidOrders.filter(o => {
    const created = new Date(o.created_at).getTime();
    return (now - created) <= 2 * 60 * 60 * 1000;
  }) : orders;

  return (
    <div>
      <div className="header">
        <div className="header-left">
          {storeData?.logo && (
            <img src={storeData.logo} alt="Logo" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; }} />
          )}
          <div style={{ minWidth: 0 }}>
            <div className="header-title">{storeData?.name || 'Loja'}</div>
          </div>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <span style={{
            fontSize: 12, fontWeight: 700,
            color: open ? 'var(--success)' : 'var(--danger)',
            background: open ? '#E8F5E9' : '#FFEBEE',
            padding: '4px 14px', borderRadius: 20
          }}>
            {open ? 'ABERTA - Aceitando pedidos' : 'FECHADA'}
          </span>
        </div>
        <div className="header-right">
          <div className="toggle-switch" onClick={toggleOpen} title={open ? 'Fechar loja' : 'Abrir loja'}>
            <input type="checkbox" checked={open} readOnly />
            <span className="toggle-slider" />
          </div>
          <button className="btn btn-sm"
            style={{ background: view !== 'orders' ? 'var(--primary)' : 'var(--border)', color: view !== 'orders' ? 'white' : 'var(--text)', fontSize: 12 }}
            onClick={() => setView(view === 'settings' ? 'orders' : 'settings')}>
            {view === 'orders' ? 'Conta' : 'Pedidos'}
          </button>
          <button className="btn btn-sm"
            style={{ background: 'var(--border)', color: 'var(--text)', fontSize: 12 }}
            onClick={logout}>Sair</button>
        </div>
      </div>

      <div className="container">
        {view === 'settings' ? (
          <>
            <div className="flex-row" style={{ marginBottom: 16 }}>
              <button className={`btn btn-sm ${settingsTab === 'produtos' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setSettingsTab('produtos')}>
                Produtos ({products.length})
              </button>
              <button className={`btn btn-sm ${settingsTab === 'conta' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setSettingsTab('conta')}>Conta</button>
              <button className={`btn btn-sm ${settingsTab === 'motoboys' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setSettingsTab('motoboys')}>
                Motoboys ({motoboys.length})
              </button>
              <button className={`btn btn-sm ${settingsTab === 'financeiro' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setSettingsTab('financeiro')}>
                Financeiro
              </button>
              <button className={`btn btn-sm ${settingsTab === 'assinatura' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setSettingsTab('assinatura')}>
                Assinatura
              </button>
            </div>

            {settingsTab === 'produtos' ? (
            <>
            <div className="page-title">Cardápio</div>

            <div className="card">
              {!productForm ? (
                <button className="btn btn-primary" onClick={openNewProduct} style={{ marginBottom: 16 }}>
                  + Novo Produto
                </button>
              ) : (
                <div style={{ marginBottom: 16, padding: 16, background: '#F3E5F5', borderRadius: 12, border: '1px solid #E1BEE7' }}>
                  <div className="text-sm font-bold mb-3" style={{ color: '#6A1B9A' }}>
                    {productForm.id ? 'Editar Produto' : 'Novo Produto'}
                  </div>
                  <div className="form-group">
                    <label className="label">Nome</label>
                    <input className="input" type="text" value={productForm.name}
                      onChange={e => setProductForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="Ex: Acai 500ml" />
                  </div>
                  <div className="form-group">
                    <label className="label">Descricao</label>
                    <input className="input" type="text" value={productForm.description}
                      onChange={e => setProductForm(p => ({ ...p, description: e.target.value }))}
                      placeholder="Acai puro batido com guarana" />
                  </div>
                  <div className="flex-row" style={{ gap: 8 }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="label">Preco (R$)</label>
                      <input className="input" type="number" step="0.01" value={productForm.price}
                        onChange={e => setProductForm(p => ({ ...p, price: e.target.value }))}
                        placeholder="25.00" />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="label">Tamanho (ml)</label>
                      <select className="input" value={productForm.size_ml}
                        onChange={e => setProductForm(p => ({ ...p, size_ml: e.target.value }))}>
                        <option value="500">500ml (Meio Litro)</option>
                        <option value="1000">1 Litro</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="label">Imagem do Produto</label>
                    <input type="file" accept="image/*" ref={productImgRef}
                      style={{ fontSize: 13 }} />
                  </div>
                  <div className="flex-row" style={{ gap: 8, marginTop: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={saveProduct}>
                      {productForm.id ? 'Salvar' : 'Criar Produto'}
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => setProductForm(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {products.length === 0 ? (
                  <div className="text-center text-muted" style={{ padding: 20 }}>
                    Nenhum produto cadastrado. Clique em "Novo Produto".
                  </div>
                ) : (
                  products.map(p => (
                    <div key={p.id} className="flex-between card" style={{
                      padding: '12px 16px',
                      opacity: p.active ? 1 : 0.5,
                      background: p.active ? 'white' : '#F5F5F5'
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="flex-row" style={{ gap: 8, alignItems: 'center', marginBottom: 2 }}>
                          <span className="font-bold text-sm" style={{
                            textDecoration: p.active ? 'none' : 'line-through'
                          }}>{p.name}</span>
                          <span className="badge" style={{
                            background: '#E8F5E9', color: '#2E7D32', fontSize: 11, whiteSpace: 'nowrap'
                          }}>{p.size_ml}ml</span>
                          {!p.active && (
                            <span className="badge" style={{
                              background: '#FFEBEE', color: '#C62828', fontSize: 10
                            }}>Inativo</span>
                          )}
                        </div>
                        {p.description && (
                          <div className="text-xs text-muted" style={{ marginBottom: 2 }}>{p.description}</div>
                        )}
                        <div className="text-sm font-bold" style={{ color: '#6A1B9A' }}>
                          R$ {p.price.toFixed(2)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                        <button className="btn btn-sm"
                          style={{ fontSize: 11, padding: '4px 10px', background: '#F3E5F5', color: '#6A1B9A', border: 'none' }}
                          onClick={() => editProduct(p)}>
                          Editar
                        </button>
                        <button className="btn btn-sm"
                          style={{ fontSize: 11, padding: '4px 10px', background: p.active ? '#FFF3E0' : '#E8F5E9', color: p.active ? '#E65100' : '#2E7D32', border: 'none' }}
                          onClick={() => toggleProduct(p.id, p.active)}>
                          {p.active ? 'Desativar' : 'Ativar'}
                        </button>
                        <button className="btn btn-sm"
                          style={{ fontSize: 11, padding: '4px 10px', background: '#FFEBEE', color: '#C62828', border: 'none' }}
                          onClick={() => deleteProduct(p.id)}>
                          Excluir
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            </>
            ) : settingsTab === 'conta' ? (
            <>
            <div className="page-title">Conta da Loja</div>

            <div className="card">
              <div className="form-group">
                <label className="label">Logo da Loja</label>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  {(settings.logo || fileRef.current?.files?.[0]) && (
                    <img
                      src={settings.logo || (fileRef.current?.files?.[0] ? URL.createObjectURL(fileRef.current.files[0]) : null)}
                      alt="Logo"
                      style={{ maxWidth: 160, maxHeight: 80, objectFit: 'contain', borderRadius: 8 }}
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                  )}
                  <input type="file" accept="image/*" ref={fileRef}
                    onChange={uploadLogo}
                    style={{ fontSize: 14 }} />
                  {logoSaving && <span className="text-xs text-muted">Enviando logo...</span>}
                  <span className="text-xs text-muted">Formatos aceitos: PNG, JPG, GIF (máx 5MB)</span>
                </div>
              </div>

              <div className="form-group">
                <label className="label">Nome da Loja</label>
                <input className="input" type="text" value={settings.name}
                  onChange={e => setSettings(s => ({ ...s, name: e.target.value }))}
                  placeholder="Nome que aparece no topo do app" />
              </div>

              <div className="form-group">
                <label className="label">Endereço da Loja</label>
                <div className="flex-row" style={{ gap: 8 }}>
                  <input className="input" type="text" value={settings.address}
                    onChange={e => setSettings(s => ({ ...s, address: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); geocodeAddress(); } }}
                    placeholder="Rua, número, bairro - Cidade"
                    style={{ flex: 1 }} />
                  <button className="btn btn-sm btn-secondary"
                    onClick={geocodeAddress} disabled={geocoding}
                    style={{ width: 'auto', whiteSpace: 'nowrap' }}>
                    {geocoding ? '...' : 'Buscar no Mapa'}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="label">Localização no Mapa</label>
                <div className="text-xs text-muted" style={{ marginBottom: 8 }}>
                  Digite o endereço e clique em "Buscar no Mapa", depois arraste o marcador ou clique no mapa para ajustar.
                </div>
                <div style={{ height: 300, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <MapContainer
                    center={mapCenter}
                    zoom={15}
                    style={{ height: '100%', width: '100%' }}
                    key={`${mapCenter[0]}-${mapCenter[1]}`}
                  >
                    <TileLayer
                      attribution='&copy; OpenStreetMap'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <Marker
                      position={[
                        (settings.lat === '' || isNaN(parseFloat(settings.lat))) ? mapCenter[0] : parseFloat(settings.lat),
                        (settings.lng === '' || isNaN(parseFloat(settings.lng))) ? mapCenter[1] : parseFloat(settings.lng)
                      ]}
                      draggable={true}
                      eventHandlers={{
                        dragend(e) {
                          const { lat, lng } = e.target.getLatLng();
                          setSettings(s => ({ ...s, lat: String(lat.toFixed(6)), lng: String(lng.toFixed(6)) }));
                        }
                      }}
                    />
                    <MapClickHandler />
                  </MapContainer>
                </div>
              </div>

              {saveMsg && (
                <div style={{ background: '#E8F5E9', color: '#2E7D32', padding: 10, borderRadius: 8, marginBottom: 12, textAlign: 'center', fontWeight: 600 }}>
                  {saveMsg}
                </div>
              )}

              <button className="btn btn-primary" onClick={saveSettings} disabled={uploading}>
                {uploading ? 'Salvando...' : 'Salvar Configurações'}
              </button>
            </div>

            <div className="card">
              <h3 className="text-sm font-bold text-muted mb-2">Informações da Loja</h3>
              <div className="flex-between text-sm" style={{ marginTop: 4 }}>
                <span>Nome:</span><span className="font-bold">{storeData?.name}</span>
              </div>
              <div className="flex-between text-sm" style={{ marginTop: 4 }}>
                <span>Endereço:</span><span>{settings.address || storeData?.address}</span>
              </div>
              <div className="flex-between text-sm" style={{ marginTop: 4 }}>
                <span>Assinatura:</span>
                <span className="badge badge-success">R$ 89/mês</span>
              </div>
            </div>
            </>
            ) : (
            <>
            <div className="page-title">Motoboys</div>

            <div className="card" style={{ background: '#E3F2FD', border: '1px solid #BBDEFB', marginBottom: 16 }}>
              <p className="text-xs text-muted" style={{ marginBottom: 4, fontWeight: 600 }}>Como funciona:</p>
              <p className="text-xs text-muted" style={{ marginBottom: 4 }}>
                <strong>Parceiro:</strong> voce gera um link de convite, o motoboy se cadastra e recebe pedidos automaticamente (sem aceitar/recusar).
              </p>
              <p className="text-xs text-muted">
                <strong>Independente:</strong> motoboys se cadastram sozinhos e escolhem quais pedidos aceitar (modelo iFood/Uber).
              </p>
            </div>

            <div className="card">
              <div className="form-group">
                <label className="label">Convidar Motoboy Parceiro</label>
                <div className="flex-row" style={{ gap: 8 }}>
                  <input className="input" type="text" value={motoboyPhone}
                    onChange={e => setMotoboyPhone(e.target.value)}
                    placeholder="WhatsApp do motoboy (ex: 11999999999)"
                    style={{ flex: 1 }} />
                  <button className="btn btn-primary btn-sm"
                    onClick={generateInvite}
                    style={{ width: 'auto', whiteSpace: 'nowrap' }}>
                    Gerar Convite
                  </button>
                </div>
                <span className="text-xs text-muted">Se o motoboy ja tiver cadastro, sera vinculado direto. Senao, gere o link.</span>
              </div>

              {inviteLink && (
                <div style={{ background: '#E8F5E9', border: '1px solid #C8E6C9', padding: 12, borderRadius: 8, marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, color: '#2E7D32', marginBottom: 6, fontSize: 13 }}>
                    Link de convite gerado:
                  </div>
                  <div style={{ background: 'white', padding: 8, borderRadius: 4, fontSize: 12, wordBreak: 'break-all', marginBottom: 8, border: '1px solid var(--border)' }}>
                    {inviteLink}
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={copyInviteLink}>
                    Copiar Link
                  </button>
                  <span className="text-xs text-muted" style={{ marginLeft: 8 }}>Envie este link para o motoboy se cadastrar</span>
                </div>
              )}

              {motoboyMsg && (
                <div style={{
                  marginTop: 8, fontSize: 13, fontWeight: 600,
                  color: motoboyMsg.includes('Erro') || motoboyMsg.includes('invalido') ? '#C62828' : '#2E7D32'
                }}>
                  {motoboyMsg}
                </div>
              )}

              <hr style={{ margin: '20px 0', borderTop: '1px solid var(--border)' }} />

              {invites.filter(i => !i.used).length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <label className="label">Convites Pendentes</label>
                  {invites.filter(i => !i.used).map(inv => (
                    <div key={inv.id} style={{ padding: '8px 12px', background: '#FFF8E1', borderRadius: 8, border: '1px solid #FFE082', marginBottom: 6 }}>
                      <div className="flex-between" style={{ marginBottom: 4 }}>
                        <div className="text-sm font-bold">{inv.phone}</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-sm"
                            style={{ fontSize: 11, padding: '4px 10px', background: '#E8F5E9', color: '#2E7D32', border: 'none' }}
                            onClick={() => copyInviteLinkToken(inv.token)}>
                            Copiar Link
                          </button>
                          <button className="btn btn-sm"
                            style={{ color: '#C62828', fontSize: 11, background: 'transparent', border: 'none' }}
                            onClick={() => revokeInvite(inv.id)}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                      <div className="text-xs text-muted" style={{ wordBreak: 'break-all' }}>
                        {window.location.origin}/register?token={inv.token}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <label className="label">Motoboys Vinculados</label>
              {motoboys.length === 0 && invites.filter(i => !i.used).length === 0 ? (
                <div className="text-center text-muted" style={{ padding: 20 }}>
                  Nenhum motoboy vinculado. Convide um motoboy parceiro pelo telefone acima.
                </div>
              ) : motoboys.length === 0 ? (
                <div className="text-center text-muted" style={{ padding: 20 }}>
                  Nenhum motoboy vinculado ainda. Aguardando cadastro dos convidados.
                </div>
              ) : (
                motoboys.map(m => (
                  <div key={m.id} className="flex-between card" style={{
                    padding: '12px 16px',
                    background: m.employee ? '#F3E5F5' : '#FAFAFA',
                    border: m.employee ? '1px solid #E1BEE7' : '1px solid var(--border)'
                  }}>
                    <div>
                      <div className="font-bold text-sm">{m.name}</div>
                      <div className="text-xs text-muted">{m.phone}</div>
                      <div style={{ marginTop: 4 }}>
                        <span className="badge" style={{
                          background: m.employee ? '#E8F5E9' : '#FFF3E0',
                          color: m.employee ? '#2E7D32' : '#E65100',
                          fontSize: 11
                        }}>
                          {m.employee ? 'Parceiro (auto-designado)' : 'Independente (aceita pedidos)'}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                      <div className="toggle-switch" onClick={() => toggleEmployee(m.id, m.employee)}
                        title={m.employee ? 'Tornar independente' : 'Tornar parceiro da loja'}>
                        <input type="checkbox" checked={!!m.employee} readOnly />
                        <span className="toggle-slider" />
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {m.employee ? 'Parceiro' : 'Independente'}
                      </span>
                      <button className="btn btn-sm"
                        style={{ color: '#C62828', fontSize: 12, padding: '2px 8px', background: 'transparent' }}
                        onClick={() => removeMotoboy(m.id)}>
                        Remover
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            </>
            )}

            {settingsTab === 'financeiro' && (
              <div className="card" style={{ textAlign: 'left' }}>
                <div className="page-title" style={{ fontSize: 20 }}>Financeiro</div>
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  <div className="card text-center" style={{ flex: 1, background: 'linear-gradient(135deg, #E8F5E9, #C8E6C9)', padding: 16 }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--secondary)' }}>
                      R$ {paidOrders.reduce((s, o) => s + o.total, 0).toFixed(2)}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#2E7D32' }}>Total vendido (mês)</div>
                  </div>
                  <div className="card text-center" style={{ flex: 1, background: 'linear-gradient(135deg, #F3E5F5, #E1BEE7)', padding: 16 }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--primary)' }}>{paidOrders.length}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#6A1B9A' }}>Pedidos pagos</div>
                  </div>
                </div>
                <div className="card" style={{ background: '#FFF8E1', border: '1px solid #FFE082', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#F57F17', marginBottom: 4 }}>Relatório completo</div>
                  <div style={{ fontSize: 12, color: '#999' }}>Em breve: exportação de relatórios fiscais e extratos</div>
                </div>
              </div>
            )}

            {settingsTab === 'assinatura' && (
              <div className="card" style={{ textAlign: 'left' }}>
                <div className="page-title" style={{ fontSize: 20 }}>Assinatura</div>
                <div style={{
                  background: 'linear-gradient(135deg, #6A1B9A, #4A148C)',
                  borderRadius: 14, padding: 24, color: 'white', textAlign: 'center', marginBottom: 16
                }}>
                  <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 4 }}>Plano Atual</div>
                  <div style={{ fontSize: 36, fontWeight: 800 }}>R$ 89<span style={{ fontSize: 16, fontWeight: 400 }}>/mês</span></div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>Plano Profissional</div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-light)', lineHeight: 1.6 }}>
                  <div style={{ marginBottom: 8 }}>✅ Pedidos ilimitados</div>
                  <div style={{ marginBottom: 8 }}>✅ Até 5 motoboys parceiros</div>
                  <div style={{ marginBottom: 8 }}>✅ Pagamento via Mercado Pago</div>
                  <div style={{ marginBottom: 8 }}>✅ Gestão de cardápio</div>
                  <div style={{ marginBottom: 8 }}>✅ Suporte prioritário</div>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="grid-2 mb-4">
              <div className="card text-center" style={{ background: 'linear-gradient(135deg, #F3E5F5, #E1BEE7)' }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--primary)' }}>{pendingOrders.length}</div>
                <div className="text-sm font-bold">Pedidos ativos</div>
              </div>
              <div className="card text-center" style={{ background: 'linear-gradient(135deg, #E8F5E9, #C8E6C9)' }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--secondary)' }}>
                  R$ {paidOrders.reduce((s, o) => s + o.total, 0).toFixed(0)}
                </div>
                <div className="text-sm font-bold">Total vendido</div>
              </div>
            </div>

            <div className="page-title">Pedidos</div>

            <div className="flex-row" style={{ marginBottom: 14 }}>
              <button className={`btn btn-sm ${orderFilter === 'ativos' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setOrderFilter('ativos')}>
                Ativos ({pendingOrders.length})
              </button>
              <button className={`btn btn-sm ${orderFilter === 'pendentes' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setOrderFilter('pendentes')}>
                Pendentes ({unpaidOrders.filter(o => (now - new Date(o.created_at).getTime()) <= 2*60*60*1000).length})
              </button>
            </div>

            {displayOrders.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                    <rect x="20" y="16" width="24" height="32" rx="3" stroke="var(--border)" strokeWidth="2"/>
                    <path d="M28 28h8M28 34h8" stroke="var(--border)" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <p>Nenhum pedido ainda</p>
              </div>
            ) : (
              displayOrders.map(order => (
                <div key={order.id} className="card">
                  <div className="flex-between" style={{ marginBottom: 6 }}>
                    <div>
                      <span className="font-bold">#{order.id.slice(0, 8)}</span>
                      <span className="text-sm text-muted" style={{ marginLeft: 8 }}>
                        {order.customer_name}
                      </span>
                    </div>
                    <span className={`badge ${order.payment_status === 'paid' ? 'badge-success' : 'badge-warning'}`}>
                      {order.payment_status === 'paid' ? 'Pago' : 'Pendente'}
                    </span>
                  </div>

                  <div className="flex-between text-sm text-muted" style={{ marginBottom: 4 }}>
                    <span>{order.customer_address}</span>
                    <span className="font-bold" style={{ color: 'var(--primary)' }}>
                      R$ {order.total.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex-between" style={{ marginTop: 8 }}>
                    <span className={`badge ${statusColors[order.status] || 'badge-warning'}`}>
                      {statusLabels[order.status]}
                    </span>

                    <div className="flex-row">
                      {order.motoboy_name && (
                        <span className="text-xs text-muted" style={{ background: '#E3F2FD', padding: '2px 8px', borderRadius: 4 }}>
                          {order.motoboy_name}
                        </span>
                      )}

                      {order.payment_status === 'paid' && actionMap[order.status] && (
                        <button className="btn btn-sm btn-primary"
                          onClick={() => updateStatus(order.id, actionMap[order.status].next)}>
                          {actionMap[order.status].label}
                        </button>
                      )}

                      {(order.status === 'arriving' || order.status === 'picked_up') && (
                        <span className="badge" style={{ background: '#FFF3E0', color: '#E65100' }}>
                          ALERTA: Motoboy próximo!
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}

            <button className="btn btn-outline mt-4" onClick={loadOrders}>
              Atualizar Pedidos
            </button>
          </>
        )}
      </div>
    </div>
  );
}
