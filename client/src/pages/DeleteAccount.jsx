import { useNavigate } from 'react-router-dom';

export default function DeleteAccount() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: '#F8F4FF' }}>
      <div style={{
        background: 'white', borderBottom: '1px solid #EEE',
        padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12,
        position: 'sticky', top: 0, zIndex: 10
      }}>
        <button onClick={() => navigate(-1)}
          style={{ background: '#EEE', border: 'none', color: '#333', fontSize: 22, width: 36, height: 36, borderRadius: '50%', padding: 0, fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="#333">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
        </button>
        <img src="/vem_acai_transp.png" style={{ width: 40, height: 40, objectFit: 'contain' }} />
        <span style={{ fontWeight: 800, fontSize: 16, color: '#4A148C' }}>Vem Açaí</span>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 20px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#4A148C', marginBottom: 8 }}>
          Exclusão de Conta
        </h1>
        <p style={{ fontSize: 15, color: '#555', marginBottom: 32, lineHeight: 1.6 }}>
          Você pode solicitar a exclusão da sua conta e de todos os dados associados a qualquer momento.
        </p>

        <div style={{ background: 'white', borderRadius: 16, padding: 24, marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#333', marginBottom: 12 }}>
            Como solicitar a exclusão
          </h2>
          <ol style={{ paddingLeft: 20, color: '#555', fontSize: 15, lineHeight: 2 }}>
            <li>Acesse o aplicativo <strong>Vem Açaí</strong></li>
            <li>Vá em <strong>Perfil → Configurações</strong></li>
            <li>Toque em <strong>"Excluir minha conta"</strong></li>
          </ol>
          <p style={{ fontSize: 14, color: '#888', marginTop: 12 }}>
            Ou envie um e-mail para{' '}
            <a href="mailto:dream2applabs@gmail.com?subject=Solicitação de exclusão de conta - Vem Açaí"
              style={{ color: '#6A1B9A', fontWeight: 600 }}>
              dream2applabs@gmail.com
            </a>
            {' '}com o assunto <strong>"Solicitação de exclusão de conta"</strong> e o e-mail cadastrado na conta.
          </p>
        </div>

        <div style={{ background: 'white', borderRadius: 16, padding: 24, marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#333', marginBottom: 12 }}>
            O que é excluído
          </h2>
          <ul style={{ paddingLeft: 20, color: '#555', fontSize: 15, lineHeight: 2 }}>
            <li>Nome, e-mail e telefone</li>
            <li>Endereços cadastrados</li>
            <li>Histórico de pedidos</li>
            <li>Fotos e documentos enviados (entregadores)</li>
            <li>Dados de acesso e autenticação</li>
          </ul>
        </div>

        <div style={{ background: 'white', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#333', marginBottom: 8 }}>
            Prazo de exclusão
          </h2>
          <p style={{ fontSize: 15, color: '#555', lineHeight: 1.6 }}>
            A exclusão é processada em até <strong>30 dias</strong> após a solicitação.
            Alguns dados financeiros podem ser retidos por até 5 anos conforme exigência legal.
          </p>
        </div>
      </div>
    </div>
  );
}
