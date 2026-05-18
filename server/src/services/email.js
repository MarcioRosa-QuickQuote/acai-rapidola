const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'Acai Rapidola <noreply@acair.rapidola.com.br>';

function hasEmailProvider() {
  return !!RESEND_API_KEY;
}

async function sendEmail(to, subject, html) {
  if (!hasEmailProvider()) {
    console.log(`[EMAIL] Simulado para ${to}: ${subject}`);
    return true;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html })
    });
    const data = await res.json();
    console.log('[EMAIL] Enviado para', to, ':', data.id || data);
    return !!data.id;
  } catch (err) {
    console.error('[EMAIL] Erro:', err?.message);
    return false;
  }
}

async function sendResetCode(email, code) {
  return sendEmail(
    email,
    'Recuperação de Senha - Açaí Rapidola',
    `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#6A1B9A">Recuperação de Senha</h2>
      <p>Seu código de recuperação é:</p>
      <div style="font-size:32px;font-weight:800;letter-spacing:8px;text-align:center;padding:16px;background:#F3E5F5;border-radius:12px;color:#6A1B9A;margin:16px 0">${code}</div>
      <p style="color:#888;font-size:13px">Válido por 10 minutos. Se não solicitou, ignore este email.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
      <p style="color:#bbb;font-size:11px">Açaí Rapidola</p>
    </div>`
  );
}

module.exports = { sendEmail, sendResetCode, hasEmailProvider };
