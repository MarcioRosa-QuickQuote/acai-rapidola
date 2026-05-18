const cepCache = new Map();

function sanitize(str, maxLen = 500) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim().slice(0, maxLen);
}

function sanitizeNum(val) {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : Math.max(0, n);
}

async function lookupCep(cep) {
  const clean = cep.replace(/\D/g, '').slice(0, 8);
  if (clean.length !== 8) return null;

  const cached = cepCache.get(clean);
  if (cached && Date.now() - cached.ts < 86400000) return cached.data;

  for (const api of [
    `https://brasilapi.com.br/api/cep/v2/${clean}`,
    `https://viacep.com.br/ws/${clean}/json/`
  ]) {
    try {
      const resp = await fetch(api);
      if (!resp.ok) continue;
      const data = await resp.json();
      if (data.erro) continue;

      const result = {
        cep: data.cep || clean,
        street: data.street || data.logradouro || '',
        neighborhood: data.bairro || '',
        city: data.cidade || data.localidade || '',
        state: data.uf || '',
        display_name: `${data.street || data.logradouro || ''}, ${data.bairro || ''} - ${data.cidade || data.localidade || ''}/${data.uf || ''}`
      };
      cepCache.set(clean, { data: result, ts: Date.now() });
      return result;
    } catch {}
  }
  return null;
}

module.exports = { sanitize, sanitizeNum, lookupCep };