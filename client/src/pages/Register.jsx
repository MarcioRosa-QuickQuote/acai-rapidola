import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useGoogleLogin } from '@react-oauth/google';

export default function Register() {
  const { register, loginWithToken, apiFetch, logout } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const inviteToken = searchParams.get('token');
  const roleParam = searchParams.get('role');

  // Campos base
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const normalizedRole = roleParam === 'entregador' ? 'motoboy' : roleParam;
  const [role, setRole] = useState(['customer','store','motoboy'].includes(normalizedRole) ? normalizedRole : 'customer');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Wizard entregador
  const [wizardStep, setWizardStep] = useState(null); // null | 1 | 2 | 3 | 4
  const [cpf, setCpf] = useState('');
  const [vehicleType, setVehicleType] = useState('moto');
  const [plate, setPlate] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [selfieDataUrl, setSelfieDataUrl] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraStream, setCameraStream] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [cnhDataUrl, setCnhDataUrl] = useState(null);
  const [cnhCameraActive, setCnhCameraActive] = useState(false);
  const [cnhCameraError, setCnhCameraError] = useState('');
  const [cnhCameraStream, setCnhCameraStream] = useState(null);
  const cnhVideoRef = useRef(null);
  const cnhCanvasRef = useRef(null);

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setGoogleLoading(true);
      try {
        const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
        });
        const info = await infoRes.json();
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userInfo: info, role })
        });
        const data = await res.json();
        if (data.token) loginWithToken(data.token, data.user);
        else setError(data.error || 'Erro ao entrar com Google');
      } catch { setError('Erro ao conectar com Google'); }
      setGoogleLoading(false);
    },
    onError: () => setError('Cadastro com Google cancelado')
  });

  useEffect(() => {
    if (inviteToken) {
      logout();
      setRole('motoboy');
      fetch(`/api/auth/register/check-invite?token=${inviteToken}`)
        .then(r => r.json())
        .then(d => {
          if (d.valid) {
            setPhone(d.phone);
            setWizardStep(1);
          } else {
            setError('Convite inválido ou já utilizado.');
          }
        });
    }
  }, [inviteToken]);


  // Limpa câmera ao desmontar
  useEffect(() => {
    return () => { cameraStream?.getTracks().forEach(t => t.stop()); };
  }, [cameraStream]);

  useEffect(() => {
    return () => { cnhCameraStream?.getTracks().forEach(t => t.stop()); };
  }, [cnhCameraStream]);

  // ── Helper de upload ──────────────────────────────────────────────────────

  async function uploadDoc(dataUrl, prefix) {
    const fetchRes = await fetch(dataUrl);
    const blob = await fetchRes.blob();
    const form = new FormData();
    form.append('file', blob, `${prefix}-${Date.now()}.jpg`);
    const r = await fetch('/api/auth/upload-doc', { method: 'POST', body: form });
    const d = await r.json();
    return d.url || null;
  }

  // ── Câmera ────────────────────────────────────────────────────────────────

  async function startCamera() {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      setCameraStream(stream);
      setCameraActive(true);
      // Aguarda o ref estar disponível
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 50);
    } catch {
      setCameraError('Câmera não disponível. Você pode pular esta etapa.');
    }
  }

  function stopCamera() {
    cameraStream?.getTracks().forEach(t => t.stop());
    setCameraStream(null);
    setCameraActive(false);
  }

  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const maxW = 640;
    const scale = Math.min(1, maxW / (video.videoWidth || maxW));
    canvas.width = (video.videoWidth || maxW) * scale;
    canvas.height = (video.videoHeight || 480) * scale;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    setSelfieDataUrl(canvas.toDataURL('image/jpeg', 0.75));
    stopCamera();
  }

  // ── Câmera CNH (traseira) ─────────────────────────────────────────────────

  async function startCnhCamera() {
    setCnhCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      setCnhCameraStream(stream);
      setCnhCameraActive(true);
      setTimeout(() => {
        if (cnhVideoRef.current) cnhVideoRef.current.srcObject = stream;
      }, 50);
    } catch {
      setCnhCameraError('Câmera não disponível. Use a opção de galeria ou pule esta etapa.');
    }
  }

  function stopCnhCamera() {
    cnhCameraStream?.getTracks().forEach(t => t.stop());
    setCnhCameraStream(null);
    setCnhCameraActive(false);
  }

  function captureCnhPhoto() {
    const video = cnhVideoRef.current;
    const canvas = cnhCanvasRef.current;
    if (!video || !canvas) return;
    const maxW = 1280;
    const scale = Math.min(1, maxW / (video.videoWidth || maxW));
    canvas.width = (video.videoWidth || maxW) * scale;
    canvas.height = (video.videoHeight || 720) * scale;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    setCnhDataUrl(canvas.toDataURL('image/jpeg', 0.85));
    stopCnhCamera();
  }

  // ── Wizard handlers ───────────────────────────────────────────────────────

  function handleSelectEntregador() {
    setRole('motoboy');
    setWizardStep(1);
    setError('');
  }

  function handleWizardStep1() {
    if (!name.trim() || name.trim().split(' ').length < 2) return setError('Informe nome e sobrenome');
    if (!cpf.replace(/\D/g, '') || cpf.replace(/\D/g, '').length < 11) return setError('Informe seu CPF completo');
    if (!phone.trim()) return setError('Informe seu celular');
    if (!email.trim() || !email.includes('@')) return setError('Informe um e-mail válido');
    if (password.length < 4) return setError('Senha deve ter no mínimo 4 caracteres');
    setError('');
    setWizardStep(2);
    startCamera();
  }

  async function goToStep3() {
    stopCamera();
    if (selfieDataUrl?.startsWith('data:')) {
      setLoading(true);
      try { const url = await uploadDoc(selfieDataUrl, 'selfie'); if (url) setSelfieDataUrl(url); } catch {}
      setLoading(false);
    }
    setWizardStep(3);
    startCnhCamera();
  }

  async function goToStep4() {
    stopCnhCamera();
    if (cnhDataUrl?.startsWith('data:')) {
      setLoading(true);
      try { const url = await uploadDoc(cnhDataUrl, 'cnh'); if (url) setCnhDataUrl(url); } catch {}
      setLoading(false);
    }
    setWizardStep(4);
  }

  async function handleWizardSubmit() {
    setLoading(true);
    setError('');
    try {
      await register(name, phone, password, 'motoboy', inviteToken, {
        email,
        cpf: cpf.replace(/\D/g, ''),
        vehicle_type: vehicleType,
        plate: plate.toUpperCase(),
        pix_key: pixKey,
        selfie_url: selfieDataUrl || '',
        document_url: cnhDataUrl || ''
      });
      // O AuthContext já faz login e o App redireciona para /motoboy/*
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Submit cliente/loja ───────────────────────────────────────────────────

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(name, phone, password, role, inviteToken, { email });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderProgress() {
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: i <= wizardStep ? '#9C27B0' : '#E8E0F0',
              transition: 'background 0.3s'
            }} />
          ))}
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#9C27B0', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Passo {wizardStep} de 4
        </div>
      </div>
    );
  }

  function renderStep1() {
    return (
      <>
        {renderProgress()}
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 16 }}>Dados pessoais</div>
        {error && <div style={errorStyle}>{error}</div>}

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Nome completo</label>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="Seu nome e sobrenome" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>CPF</label>
          <input value={cpf} onChange={e => {
            const d = e.target.value.replace(/\D/g, '').slice(0, 11);
            const fmt = d.length <= 3 ? d
              : d.length <= 6 ? `${d.slice(0,3)}.${d.slice(3)}`
              : d.length <= 9 ? `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`
              : `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
            setCpf(fmt);
          }} placeholder="000.000.000-00" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Celular</label>
          <input value={phone} onChange={e => setPhone(e.target.value)}
            placeholder="(11) 99999-9999"
            readOnly={!!(inviteToken && phone)}
            style={{ ...inputStyle, ...(inviteToken && phone ? { background: '#F5F0FA', color: '#6A1B9A', fontWeight: 600 } : {}) }}
            onFocus={onFocus} onBlur={onBlur} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>E-mail</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="seu@email.com" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Senha</label>
          <div style={{ position: 'relative' }}>
            <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 4 caracteres" style={{ ...inputStyle, paddingRight: 44 }} onFocus={onFocus} onBlur={onBlur} />
            <button type="button" tabIndex={-1} onClick={() => setShowPw(v => !v)}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#aaa', lineHeight: 0 }}>
              {showPw
                ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              }
            </button>
          </div>
        </div>

        <button type="button" onClick={handleWizardStep1} style={btnPrimary}>Continuar →</button>
        <button type="button" onClick={() => { setWizardStep(null); setRole('customer'); setError(''); }} style={btnSecondary}>
          Voltar
        </button>
      </>
    );
  }

  function renderStep2() {
    return (
      <>
        {renderProgress()}
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Sua selfie</div>
        <div style={{ fontSize: 14, color: '#888', marginBottom: 16 }}>
          Foto para verificação de identidade pela equipe
        </div>

        {!selfieDataUrl ? (
          <>
            <div style={{
              position: 'relative', borderRadius: 12, overflow: 'hidden',
              background: '#111', marginBottom: 12,
              aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <video ref={videoRef} autoPlay playsInline muted
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: cameraActive ? 'block' : 'none' }} />
              {!cameraActive && !cameraError && (
                <div style={{ textAlign: 'center', color: '#666' }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="#555" style={{ marginBottom: 8 }}>
                    <path d="M12 15.2A3.2 3.2 0 0 1 8.8 12 3.2 3.2 0 0 1 12 8.8 3.2 3.2 0 0 1 15.2 12 3.2 3.2 0 0 1 12 15.2M12 7a5 5 0 0 0-5 5 5 5 0 0 0 5 5 5 5 0 0 0 5-5 5 5 0 0 0-5-5m0-7.5L8 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-4l-4-4.5z"/>
                  </svg>
                  <div style={{ fontSize: 14 }}>Câmera desligada</div>
                </div>
              )}
              {cameraError && (
                <div style={{ padding: 16, textAlign: 'center', color: '#999', fontSize: 13 }}>{cameraError}</div>
              )}
            </div>
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {!cameraError && (
              <button type="button" onClick={cameraActive ? capturePhoto : startCamera} style={btnPrimary}>
                {cameraActive ? '📸 Tirar foto' : '📷 Abrir câmera'}
              </button>
            )}
            <label style={{
              display: 'block', width: '100%', padding: '11px', marginBottom: 8,
              background: 'white', color: '#6A1B9A', border: '2px solid #9C27B0', borderRadius: 10,
              fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'center', boxSizing: 'border-box'
            }}>
              Ou selecionar da galeria
              <input type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files[0];
                  if (!file) return;
                  stopCamera();
                  const reader = new FileReader();
                  reader.onload = ev => setSelfieDataUrl(ev.target.result);
                  reader.readAsDataURL(file);
                }} />
            </label>
          </>
        ) : (
          <>
            <div style={{ borderRadius: 12, overflow: 'hidden', marginBottom: 8 }}>
              <img src={selfieDataUrl} alt="Selfie" style={{ width: '100%', display: 'block' }} />
            </div>
            <div style={{ fontSize: 13, color: '#2E7D32', fontWeight: 600, textAlign: 'center', marginBottom: 14 }}>
              Foto capturada!
            </div>
            <button type="button" onClick={goToStep3} style={btnPrimary}>Usar esta foto →</button>
            <button type="button" onClick={() => { setSelfieDataUrl(null); startCamera(); }} style={btnSecondary}>
              Tirar outra
            </button>
          </>
        )}

        <button type="button" onClick={() => { stopCamera(); setSelfieDataUrl(null); setWizardStep(1); }} style={btnBack}>
          ← Voltar
        </button>
      </>
    );
  }

  function renderStep3() {
    return (
      <>
        {renderProgress()}
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>CNH — Categoria A ou AB</div>
        <div style={{ fontSize: 14, color: '#888', marginBottom: 16 }}>
          Foto legível da frente da CNH (obrigatório para moto)
        </div>

        {!cnhDataUrl ? (
          <>
            <div style={{
              position: 'relative', borderRadius: 12, overflow: 'hidden',
              background: '#111', marginBottom: 12,
              aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <video ref={cnhVideoRef} autoPlay playsInline muted
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: cnhCameraActive ? 'block' : 'none' }} />
              {!cnhCameraActive && !cnhCameraError && (
                <div style={{ textAlign: 'center', color: '#666' }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="#555" style={{ marginBottom: 8 }}>
                    <path d="M12 15.2A3.2 3.2 0 0 1 8.8 12 3.2 3.2 0 0 1 12 8.8 3.2 3.2 0 0 1 15.2 12 3.2 3.2 0 0 1 12 15.2M12 7a5 5 0 0 0-5 5 5 5 0 0 0 5 5 5 5 0 0 0 5-5 5 5 0 0 0-5-5m0-7.5L8 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-4l-4-4.5z"/>
                  </svg>
                  <div style={{ fontSize: 14 }}>Câmera desligada</div>
                </div>
              )}
              {cnhCameraError && (
                <div style={{ padding: 16, textAlign: 'center', color: '#999', fontSize: 13 }}>{cnhCameraError}</div>
              )}
            </div>
            <canvas ref={cnhCanvasRef} style={{ display: 'none' }} />

            {!cnhCameraError && (
              <button type="button" onClick={cnhCameraActive ? captureCnhPhoto : startCnhCamera} style={btnPrimary}>
                {cnhCameraActive ? '📸 Fotografar CNH' : '📷 Abrir câmera'}
              </button>
            )}

            <label style={{
              display: 'block', width: '100%', padding: '11px', marginBottom: 8,
              background: 'white', color: '#6A1B9A', border: '2px solid #9C27B0', borderRadius: 10,
              fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'center', boxSizing: 'border-box'
            }}>
              Ou selecionar da galeria
              <input type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files[0];
                  if (!file) return;
                  stopCnhCamera();
                  const reader = new FileReader();
                  reader.onload = ev => setCnhDataUrl(ev.target.result);
                  reader.readAsDataURL(file);
                }} />
            </label>

          </>
        ) : (
          <>
            <div style={{ borderRadius: 12, overflow: 'hidden', marginBottom: 8 }}>
              <img src={cnhDataUrl} alt="CNH" style={{ width: '100%', display: 'block' }} />
            </div>
            <div style={{ fontSize: 13, color: '#2E7D32', fontWeight: 600, textAlign: 'center', marginBottom: 14 }}>
              Foto capturada!
            </div>
            <button type="button" onClick={goToStep4} style={btnPrimary}>Usar esta foto →</button>
            <button type="button" onClick={() => { setCnhDataUrl(null); startCnhCamera(); }} style={btnSecondary}>
              Tirar outra
            </button>
          </>
        )}

        <button type="button" onClick={() => { stopCnhCamera(); setCnhDataUrl(null); setWizardStep(2); }} style={btnBack}>
          ← Voltar
        </button>
      </>
    );
  }

  function renderStep4() {
    const hasPlate = vehicleType === 'moto' || vehicleType === 'car';
    return (
      <>
        {renderProgress()}
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 16 }}>Dados do veículo</div>
        {error && <div style={errorStyle}>{error}</div>}

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Tipo de veículo</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { value: 'moto', label: '🛵 Moto' },
              { value: 'bicycle', label: '🚲 Bicicleta' },
              { value: 'car', label: '🚗 Carro' },
            ].map(({ value, label }) => (
              <button key={value} type="button" onClick={() => setVehicleType(value)} style={{
                flex: 1, minWidth: 70, padding: '10px 4px', borderRadius: 10, textAlign: 'center',
                border: `2px solid ${vehicleType === value ? '#9C27B0' : '#E8E0F0'}`,
                background: vehicleType === value ? '#F3E5F5' : 'white',
                color: vehicleType === value ? '#6A1B9A' : '#555',
                fontWeight: vehicleType === value ? 700 : 400, fontSize: 13, cursor: 'pointer'
              }}>{label}</button>
            ))}
          </div>
        </div>

        {hasPlate && (
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Placa do veículo</label>
            <input value={plate}
              onChange={e => setPlate(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8))}
              placeholder="ABC-1234 ou ABC1D23"
              style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Chave Pix para pagamentos</label>
          <input value={pixKey} onChange={e => setPixKey(e.target.value)}
            placeholder="CPF, e-mail, celular ou chave aleatória"
            style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
        </div>

        <p style={{ fontSize: 12, color: '#BBB', marginBottom: 14, lineHeight: 1.6, textAlign: 'center' }}>
          Ao se cadastrar você concorda com nossa{' '}
          <Link to="/privacidade" style={{ color: '#9C27B0', textDecoration: 'underline' }}>Política de Privacidade</Link>
          {' '}e os{' '}
          <Link to="/termos" style={{ color: '#9C27B0', textDecoration: 'underline' }}>Termos de Uso</Link>
        </p>

        <button type="button" onClick={handleWizardSubmit} disabled={loading}
          style={{ ...btnPrimary, opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Enviando...' : 'Enviar cadastro'}
        </button>
        <button type="button" onClick={() => setWizardStep(3)} style={btnBack}>
          ← Voltar
        </button>
      </>
    );
  }

  // ── Render principal ──────────────────────────────────────────────────────

  return (
    <div className="login-container" style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh', background: 'transparent',
      padding: '100px 20px 20px', position: 'relative', overflow: 'visible'
    }}>

      {/* Logo — z-index abaixo do card para a estaca ficar "fincada" no modal */}
      <div className="login-logo" style={{ textAlign: 'center', marginBottom: -52, marginTop: -80, zIndex: 0, position: 'relative' }}>
        <img src="/vem_acai_transp.png" alt="Vem Açaí" style={{
          width: 180, height: 180, objectFit: 'contain', display: 'block', margin: '0 auto'
        }} />
        {wizardStep && (
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 400 }}>
            Cadastro de Entregador
          </p>
        )}
        {inviteToken && !wizardStep && (
          <div style={{
            background: 'rgba(255,255,255,0.15)', padding: '6px 14px',
            borderRadius: 20, marginTop: 8, fontSize: 13, color: 'white', display: 'inline-block'
          }}>
            Convite de loja parceira — vinculação automática
          </div>
        )}
      </div>

      {/* Card */}
      <div className="login-card" style={{
        width: '100%', maxWidth: 560,
        background: 'rgba(255,255,255,0.97)',
        borderRadius: 24,
        boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
        position: 'relative', zIndex: 2,
        transition: 'transform 0.5s ease-out'
      }}>
        <div style={{ padding: '24px 30px 20px' }}>
          {/* ── Wizard entregador ── */}
          {wizardStep === 1 && renderStep1()}
          {wizardStep === 2 && renderStep2()}
          {wizardStep === 3 && renderStep3()}
          {wizardStep === 4 && renderStep4()}

          {/* ── Formulário cliente/loja ── */}
          {!wizardStep && (
            <form onSubmit={handleSubmit}>
              {error && <div style={errorStyle}>{error}</div>}

              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Nome completo</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Seu nome" required style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
              </div>

              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>E-mail</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="seu@email.com" required style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Celular</label>
                  <input type="text" value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="(11) 99999-9999" required
                    style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Senha</label>
                <div style={{ position: 'relative' }}>
                  <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres" required minLength={6}
                    style={{ ...inputStyle, paddingRight: 44 }} onFocus={onFocus} onBlur={onBlur} />
                  <button type="button" tabIndex={-1} onClick={() => setShowPw(v => !v)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#aaa', lineHeight: 0 }}>
                    {showPw
                      ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Tipo de conta</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { value: 'customer', label: 'Cliente', desc: 'Fazer pedidos' },
                    { value: 'store', label: 'Loja', desc: 'Vender açaí' },
                  ].map(({ value, label, desc }) => (
                    <div key={value} onClick={() => setRole(value)} style={{
                      flex: 1, padding: '10px 6px', borderRadius: 10, textAlign: 'center',
                      border: `2px solid ${role === value ? '#9C27B0' : '#E8E0F0'}`,
                      background: role === value ? '#F3E5F5' : 'white',
                      transition: 'all 0.2s', cursor: 'pointer'
                    }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: role === value ? '#6A1B9A' : '#444' }}>{label}</div>
                      <div style={{ fontSize: 11, color: '#999' }}>{desc}</div>
                    </div>
                  ))}
                  {/* Entregador abre o wizard */}
                  <div onClick={handleSelectEntregador} style={{
                    flex: 1, padding: '10px 6px', borderRadius: 10, textAlign: 'center',
                    border: '2px solid #E8E0F0',
                    background: 'white',
                    transition: 'all 0.2s', cursor: 'pointer'
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#444' }}>Entregador</div>
                    <div style={{ fontSize: 11, color: '#999' }}>Entregar</div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                {!inviteToken && (
                  <button type="button" onClick={() => googleLogin()} disabled={googleLoading} style={{
                    flex: 1, padding: '13px 8px',
                    background: 'white', color: '#333', border: '2px solid #E8E0F0', borderRadius: 10,
                    fontSize: 14, fontWeight: 400, cursor: googleLoading ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    opacity: googleLoading ? 0.7 : 1, boxSizing: 'border-box'
                  }}>
                    {googleLoading ? 'Aguarde...' : 'Cadastrar com'}
                    {!googleLoading && (
                      <svg width="18" height="18" viewBox="0 0 48 48">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                        <path fill="none" d="M0 0h48v48H0z"/>
                      </svg>
                    )}
                  </button>
                )}

                <button type="submit" disabled={loading} style={{
                  flex: inviteToken ? '1' : '1', padding: '13px',
                  background: 'linear-gradient(135deg, #6A1B9A, #9C27B0)',
                  color: 'white', border: 'none', borderRadius: 10,
                  fontSize: 16, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  boxShadow: '0 4px 14px rgba(106,27,154,0.4)'
                }}>
                  {loading ? 'Criando conta...' : 'Cadastrar'}
                </button>
              </div>

              <p style={{ textAlign: 'center', marginTop: 14, fontSize: 14, color: '#888' }}>
                Já tem conta?{' '}
                <Link to="/login" style={{ color: '#6A1B9A', fontWeight: 700, textDecoration: 'none' }}>Entrar</Link>
              </p>
              <p style={{ textAlign: 'center', marginTop: 8, fontSize: 12, color: '#555', lineHeight: 1.6 }}>
                Ao se cadastrar você concorda com nossa{' '}
                <Link to="/privacidade" style={{ color: '#9C27B0', textDecoration: 'underline' }}>Política de Privacidade</Link>
                {' '}e os{' '}
                <Link to="/termos" style={{ color: '#9C27B0', textDecoration: 'underline' }}>Termos de Uso</Link>
              </p>
            </form>
          )}
        </div>
      </div>

      <p style={{ marginTop: 16, fontSize: 12, color: '#fff', zIndex: 1, textAlign: 'center', textShadow: '0 1px 3px rgba(0,0,0,0.6), 0 0 6px rgba(0,0,0,0.4)' }}>
        Vem Açaí © 2026 —{' '}
        <Link to="/privacidade" style={{ color: '#fff', textDecoration: 'underline' }}>Privacidade</Link>
        {' · '}
        <Link to="/termos" style={{ color: '#fff', textDecoration: 'underline' }}>Termos</Link>
      </p>
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '12px 14px', fontSize: 15,
  border: '2px solid #E8E0F0', borderRadius: 10, outline: 'none',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  boxSizing: 'border-box'
};
const labelStyle = { fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 4, display: 'block' };
const errorStyle = {
  background: '#FFF0F0', color: '#C62828', padding: '10px 14px',
  borderRadius: 10, marginBottom: 14, fontSize: 13,
  border: '1px solid #FFCDD2', display: 'flex', alignItems: 'center', gap: 6
};
const btnPrimary = {
  width: '100%', padding: '13px', marginBottom: 8,
  background: 'linear-gradient(135deg, #6A1B9A, #9C27B0)',
  color: 'white', border: 'none', borderRadius: 10,
  fontSize: 16, fontWeight: 700, cursor: 'pointer',
  boxShadow: '0 4px 14px rgba(106,27,154,0.4)'
};
const btnSecondary = {
  width: '100%', padding: '11px', marginBottom: 8,
  background: 'white', color: '#888', border: '2px solid #E8E0F0', borderRadius: 10,
  fontSize: 14, fontWeight: 600, cursor: 'pointer'
};
const btnBack = {
  width: '100%', padding: '9px', marginTop: 4,
  background: 'none', color: '#BBB', border: 'none',
  fontSize: 13, cursor: 'pointer'
};

function onFocus(e) {
  e.target.style.borderColor = '#9C27B0';
  e.target.style.boxShadow = '0 0 0 3px rgba(156,39,176,0.1)';
}
function onBlur(e) {
  e.target.style.borderColor = '#E8E0F0';
  e.target.style.boxShadow = 'none';
}
