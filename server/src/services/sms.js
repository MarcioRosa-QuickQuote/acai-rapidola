const TOTALVOIP_USER = process.env.TOTALVOIP_USER || '';
const TOTALVOIP_PASS = process.env.TOTALVOIP_PASS || '';
const SMS_SENDER = process.env.SMS_SENDER || 'Acai Rapidola';

let simulatedCode = '';

function hasSMSProvider() {
  return !!(TOTALVOIP_USER && TOTALVOIP_PASS);
}

async function sendSMS(phone, message) {
  if (hasSMSProvider()) {
    try {
      const url = `https://api.totalvoip.com.br/sms/send?user=${TOTALVOIP_USER}&password=${TOTALVOIP_PASS}&number=${phone}&message=${encodeURIComponent(message)}`;
      const res = await fetch(url);
      const text = await res.text();
      console.log('[SMS] Enviado para', phone, ':', text);
      return true;
    } catch (err) {
      console.error('[SMS] Erro ao enviar:', err?.message);
      return false;
    }
  }

  console.log(`[SMS] Simulado para ${phone}: ${message}`);
  return true;
}

async function sendResetCode(phone, code) {
  simulatedCode = code;
  const msg = `${SMS_SENDER}: seu codigo de recuperacao e ${code}. Valido por 10 minutos.`;
  return sendSMS(phone, msg);
}

module.exports = { sendSMS, sendResetCode, hasSMSProvider, getSimulatedCode: () => simulatedCode };
