import { useLocation, useNavigate, Link } from 'react-router-dom';

export default function Legal() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isPrivacy = !pathname.includes('termos');

  return (
    <div style={{ minHeight: '100vh', background: '#F8F4FF' }}>
      {/* Header */}
      <div style={{
        background: 'white', borderBottom: '1px solid #EEE',
        padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12,
        position: 'sticky', top: 0, zIndex: 10
      }}>
        <button className="btn btn-sm" onClick={() => navigate(-1)}
          style={{ background: 'var(--border)', color: 'var(--primary-dark)', fontSize: 22, width: 36, height: 36, borderRadius: '50%', padding: 0, fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="#333">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
        </button>
        <img src="/t_vem_acai.png" style={{ width: 40, height: 40, objectFit: 'contain' }} />
        <span style={{ fontWeight: 800, fontSize: 16, color: '#4A148C' }}>Vem, Açaí!</span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: 'white', borderBottom: '2px solid #EEE' }}>
        <Link to="/privacidade" style={{
          flex: 1, padding: '14px 0', textAlign: 'center', textDecoration: 'none',
          fontWeight: 700, fontSize: 14,
          color: isPrivacy ? '#4A148C' : '#999',
          borderBottom: isPrivacy ? '3px solid #4A148C' : '3px solid transparent'
        }}>
          Política de Privacidade
        </Link>
        <Link to="/termos" style={{
          flex: 1, padding: '14px 0', textAlign: 'center', textDecoration: 'none',
          fontWeight: 700, fontSize: 14,
          color: !isPrivacy ? '#4A148C' : '#999',
          borderBottom: !isPrivacy ? '3px solid #4A148C' : '3px solid transparent'
        }}>
          Termos de Uso
        </Link>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px 60px' }}>
        {isPrivacy ? <PrivacyPolicy /> : <TermsOfService />}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 17, fontWeight: 800, color: '#4A148C', marginBottom: 10, marginTop: 0 }}>{title}</h2>
      <div style={{ fontSize: 14, color: '#444', lineHeight: 1.75 }}>{children}</div>
    </div>
  );
}

function PrivacyPolicy() {
  return (
    <>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#1a1a2e', marginBottom: 4 }}>Política de Privacidade</h1>
      <p style={{ fontSize: 12, color: '#999', marginBottom: 28 }}>Última atualização: maio de 2025</p>

      <Section title="1. Quem somos">
        O <strong>Vem, Açaí!</strong> é uma plataforma de delivery que conecta clientes, lojas de açaí e motoboys
        na região de Belém do Pará. Operado por <strong>Açaí Rapidola</strong>.
        Contato: <a href="mailto:contato@vemacai.dream2app.com.br" style={{ color: '#4A148C' }}>contato@vemacai.dream2app.com.br</a>
      </Section>

      <Section title="2. Dados que coletamos">
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li><strong>Cadastro:</strong> nome, telefone, e-mail e senha (criptografada)</li>
          <li><strong>Endereço:</strong> endereço de entrega e coordenadas GPS</li>
          <li><strong>Localização em tempo real:</strong> coletada apenas do motoboy durante entregas ativas, para rastreamento pelo cliente</li>
          <li><strong>Pedidos:</strong> itens, valores, status e histórico de entregas</li>
          <li><strong>Pagamento:</strong> processado pelo Mercado Pago — não armazenamos dados de cartão</li>
        </ul>
      </Section>

      <Section title="3. Como usamos seus dados">
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li>Processar e entregar seus pedidos</li>
          <li>Calcular rotas e taxas de entrega</li>
          <li>Enviar notificações sobre o status do pedido</li>
          <li>Melhorar a experiência do aplicativo</li>
          <li>Cumprir obrigações legais</li>
        </ul>
      </Section>

      <Section title="4. Compartilhamento de dados">
        Seus dados são compartilhados somente quando necessário para o funcionamento do serviço:
        <ul style={{ paddingLeft: 20, margin: '8px 0 0' }}>
          <li><strong>Lojas parceiras:</strong> recebem seu nome, endereço e telefone para preparar e entregar o pedido</li>
          <li><strong>Motoboys:</strong> recebem endereço de entrega e nome do cliente</li>
          <li><strong>Mercado Pago:</strong> processa pagamentos (<a href="https://www.mercadopago.com.br/privacidade" target="_blank" rel="noreferrer" style={{ color: '#4A148C' }}>política de privacidade</a>)</li>
          <li><strong>Google LLC:</strong> usamos Google Places API para busca de endereços (<a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" style={{ color: '#4A148C' }}>política do Google</a>)</li>
          <li><strong>Supabase:</strong> armazenamento seguro de dados (<a href="https://supabase.com/privacy" target="_blank" rel="noreferrer" style={{ color: '#4A148C' }}>política do Supabase</a>)</li>
        </ul>
        Não vendemos seus dados a terceiros.
      </Section>

      <Section title="5. Localização GPS">
        A localização do dispositivo é solicitada para:
        <ul style={{ paddingLeft: 20, margin: '8px 0 0' }}>
          <li>Preencher automaticamente seu endereço de entrega (cliente)</li>
          <li>Rastrear o motoboy durante a entrega (motoboy)</li>
        </ul>
        Você pode recusar a permissão de localização e digitar o endereço manualmente.
        A localização do motoboy é transmitida ao cliente apenas durante entregas ativas.
      </Section>

      <Section title="6. Seus direitos">
        Você pode a qualquer momento:
        <ul style={{ paddingLeft: 20, margin: '8px 0 0' }}>
          <li>Acessar e corrigir seus dados pessoais pelo aplicativo</li>
          <li>Solicitar a exclusão da sua conta e dados enviando e-mail para <a href="mailto:contato@vemacai.dream2app.com.br" style={{ color: '#4A148C' }}>contato@vemacai.dream2app.com.br</a></li>
          <li>Revogar permissões de localização nas configurações do seu dispositivo</li>
        </ul>
      </Section>

      <Section title="7. Segurança">
        Utilizamos criptografia HTTPS em todas as comunicações, senhas armazenadas com hash bcrypt
        e acesso restrito ao banco de dados via Supabase Row Level Security.
      </Section>

      <Section title="8. Retenção de dados">
        Seus dados são mantidos enquanto sua conta estiver ativa. Após exclusão da conta,
        dados são removidos em até 30 dias, exceto registros financeiros que devem ser
        mantidos por obrigação legal (5 anos).
      </Section>

      <Section title="9. Contato">
        Em caso de dúvidas sobre esta política: <a href="mailto:contato@vemacai.dream2app.com.br" style={{ color: '#4A148C' }}>contato@vemacai.dream2app.com.br</a>
      </Section>
    </>
  );
}

function TermsOfService() {
  return (
    <>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: '#1a1a2e', marginBottom: 4 }}>Termos de Uso</h1>
      <p style={{ fontSize: 12, color: '#999', marginBottom: 28 }}>Última atualização: maio de 2025</p>

      <Section title="1. Aceitação dos termos">
        Ao criar uma conta ou usar o aplicativo <strong>Vem, Açaí!</strong>, você concorda com estes Termos de Uso.
        Se não concordar, não utilize o serviço.
      </Section>

      <Section title="2. O serviço">
        O Vem, Açaí! é uma plataforma de intermediação que conecta clientes a lojas de açaí e motoboys independentes
        na região de Belém do Pará. Não somos fabricantes nem distribuidores dos produtos vendidos pelas lojas.
      </Section>

      <Section title="3. Cadastro e conta">
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li>Você deve ter ao menos 18 anos para criar uma conta</li>
          <li>As informações fornecidas no cadastro devem ser verdadeiras</li>
          <li>Você é responsável pela segurança da sua senha</li>
          <li>É proibido criar múltiplas contas ou usar contas de terceiros</li>
        </ul>
      </Section>

      <Section title="4. Pedidos e pagamentos">
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li>Pedidos confirmados e pagos não podem ser cancelados após a loja iniciar o preparo</li>
          <li>O valor da taxa de entrega é calculado pela distância e informado antes da confirmação</li>
          <li>Pagamentos são processados pelo Mercado Pago, sujeito aos termos deles</li>
          <li>Em caso de problema com o pedido, entre em contato com a loja pelo aplicativo</li>
        </ul>
      </Section>

      <Section title="5. Responsabilidades do cliente">
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li>Fornecer endereço de entrega correto e completo</li>
          <li>Estar disponível para receber o pedido no endereço informado</li>
          <li>Não usar o aplicativo para fins ilícitos ou fraudulentos</li>
        </ul>
      </Section>

      <Section title="6. Responsabilidades das lojas">
        As lojas parceiras são responsáveis pela qualidade, higiene e conformidade dos produtos oferecidos,
        pelo tempo de preparo informado e pelo atendimento pós-venda ao cliente.
      </Section>

      <Section title="7. Responsabilidades dos motoboys">
        Os motoboys são profissionais autônomos responsáveis por possuir habilitação e documentação válidos,
        pela integridade dos produtos durante o transporte e pelo cumprimento dos prazos de entrega.
      </Section>

      <Section title="8. Limitação de responsabilidade">
        O Vem, Açaí! não se responsabiliza por atrasos causados por condições de trânsito ou clima,
        qualidade dos produtos preparados pelas lojas, danos causados por informações incorretas fornecidas pelo usuário
        ou indisponibilidade temporária do serviço por manutenção ou falhas técnicas.
      </Section>

      <Section title="9. Propriedade intelectual">
        A marca, logo e conteúdo do Vem, Açaí! são de propriedade da Açaí Rapidola.
        É proibida a reprodução sem autorização prévia.
      </Section>

      <Section title="10. Alterações nos termos">
        Podemos atualizar estes termos a qualquer momento. Usuários serão notificados por e-mail ou pelo aplicativo.
        O uso continuado após as alterações implica aceitação dos novos termos.
      </Section>

      <Section title="11. Foro e lei aplicável">
        Estes termos são regidos pelas leis brasileiras. Fica eleito o foro da Comarca de Belém/PA para
        resolução de eventuais conflitos.
      </Section>

      <Section title="12. Contato">
        <a href="mailto:contato@vemacai.dream2app.com.br" style={{ color: '#4A148C' }}>contato@vemacai.dream2app.com.br</a>
      </Section>
    </>
  );
}
