const MERCADO_PAGO_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN;

function detectPixKeyType(key) {
  const digits = key.replace(/\D/g, '');
  if (/^\d{11}$/.test(digits)) return 'CPF';
  if (/^\d{14}$/.test(digits)) return 'CNPJ';
  if (/^\d{10,11}$/.test(digits)) return 'phone';
  if (key.includes('@')) return 'email';
  return 'evp'; // chave aleatória
}

async function sendPixTransfer(amount, pixKey, description) {
  if (!MERCADO_PAGO_TOKEN) {
    console.log(`[Pix] Sem token MP — transferência manual necessária: R$ ${amount} → ${pixKey}`);
    return false;
  }
  if (!pixKey || amount <= 0) return false;

  const keyType = detectPixKeyType(pixKey);
  const cleanKey = keyType === 'CPF' || keyType === 'CNPJ'
    ? pixKey.replace(/\D/g, '')
    : pixKey.replace(/\s/g, '');

  try {
    const body = {
      amount: parseFloat(amount.toFixed(2)),
      currency_id: 'BRL',
      payment_method_id: 'pix',
      receiver: {
        pix_identification: { type: keyType.toUpperCase(), number: cleanKey }
      },
      description
    };

    const res = await fetch('https://api.mercadopago.com/v1/account/bank_transfers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MERCADO_PAGO_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `${description}-${Date.now()}`
      },
      body: JSON.stringify(body)
    });

    const data = await res.json();

    if (res.ok && (data.status === 'approved' || data.status === 'pending')) {
      console.log(`[Pix] Transferência OK: R$ ${amount} → ${pixKey} (status: ${data.status})`);
      return true;
    }

    console.error('[Pix] Transferência falhou:', data?.message || data?.error || JSON.stringify(data));
    return false;
  } catch (err) {
    console.error('[Pix] Erro na transferência:', err.message);
    return false;
  }
}

module.exports = { sendPixTransfer };
