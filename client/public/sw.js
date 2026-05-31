// ─── Pé de Açaí · Service Worker ───────────────────────────────────────────
// Estratégia: cache-first para assets estáticos, stale-while-revalidate para
// shell + imagens, network-only para API / socket / Supabase.
// Vite coloca hash no nome dos assets → pode cachear para sempre.

const STATIC_V  = 'rapidola-static-v9';
const IMAGE_V   = 'rapidola-images-v1';
const MAX_IMGS  = 120; // máx de imagens em cache

// Arquivos precacheados no install (críticos para abrir o app)
// Evitar arquivos grandes (>300KB) aqui — eles causam lentidão no install
// logo_placa.png (1.3MB) fica de fora: será cacheado na primeira exibição
const PRECACHE = [
  '/',
  '/manifest.json',
  '/saco_acai.png',   // spinner de loading (68KB)
  '/fundo.jpg',       // bg da loja (173KB)
  '/bandeira.png',    // ícone BR (37KB)
];

// Padrões que NUNCA devem ser interceptados pelo SW
const BYPASS = [
  /\/api\//,
  /\/socket\.io\//,
  /supabase\.co/,
  /router\.project-osrm\.org/,
  /nominatim\.openstreetmap\.org/,
  /maps\.googleapis\.com/,
  /maps\.gstatic\.com/,
  /tile\.openstreetmap\.org/,
  /basemaps\.cartocdn\.com/,   // MapLibre GL style.json + vector tiles
];

// ── Install: precacheia shell ────────────────────────────────────────────────
// NÃO chamamos skipWaiting() aqui — o novo SW fica em "waiting"
// e só ativa quando o usuário confirmar o update via banner.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC_V).then(c => c.addAll(PRECACHE))
  );
});

// ── Mensagens vindas da página ───────────────────────────────────────────────
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') {
    self.skipWaiting(); // usuário confirmou → ativa o novo SW
  }
});

// ── Activate: remove caches antigos ─────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_V && k !== IMAGE_V)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function bypass(url) {
  return BYPASS.some(p => p.test(url.href));
}

function isViteAsset(url) {
  // /assets/index-XXXX.js, /assets/index-XXXX.css, etc.
  return url.pathname.startsWith('/assets/');
}

function isImage(url) {
  return (
    /\.(png|jpe?g|webp|svg|gif|ico)(\?.*)?$/i.test(url.pathname) ||
    url.href.includes('/storage/v1/object/') // Supabase Storage
  );
}

function isFont(url) {
  return (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  );
}

async function limitCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys  = await cache.keys();
  if (keys.length > maxEntries) {
    // Remove os mais antigos (primeiros da lista)
    await Promise.all(keys.slice(0, keys.length - maxEntries).map(k => cache.delete(k)));
  }
}

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Ignora non-GET e chamadas de API/infra
  if (e.request.method !== 'GET' || bypass(url)) return;

  // 1. Assets Vite com hash → CACHE-FIRST, para sempre (nunca expiram)
  if (isViteAsset(url)) {
    e.respondWith(
      caches.open(STATIC_V).then(cache =>
        cache.match(e.request).then(hit => {
          if (hit) return hit;
          return fetch(e.request).then(resp => {
            if (resp.ok) cache.put(e.request, resp.clone());
            return resp;
          });
        })
      )
    );
    return;
  }

  // 2. Imagens → STALE-WHILE-REVALIDATE (serve do cache, atualiza em bg)
  if (isImage(url)) {
    e.respondWith(
      caches.open(IMAGE_V).then(cache =>
        cache.match(e.request).then(cached => {
          // Sempre busca na rede em background para manter fresco
          const netFetch = fetch(e.request)
            .then(resp => {
              if (resp.ok && resp.type !== 'opaque') {
                cache.put(e.request, resp.clone());
                limitCache(IMAGE_V, MAX_IMGS); // limpa se exceder
              }
              return resp;
            })
            .catch(() => cached);

          // Serve do cache imediatamente se disponível
          return cached || netFetch;
        })
      )
    );
    return;
  }

  // 3. Fontes Google → CACHE-FIRST
  if (isFont(url)) {
    e.respondWith(
      caches.open(STATIC_V).then(cache =>
        cache.match(e.request).then(hit => {
          if (hit) return hit;
          return fetch(e.request).then(resp => {
            if (resp.ok) cache.put(e.request, resp.clone());
            return resp;
          });
        })
      )
    );
    return;
  }

  // 4. App shell (navegação SPA) → STALE-WHILE-REVALIDATE
  //    Serve do cache para abrir na hora; rede atualiza em background
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.open(STATIC_V).then(cache =>
        cache.match('/').then(cached => {
          const netFetch = fetch(e.request)
            .then(resp => {
              if (resp.ok) cache.put('/', resp.clone());
              return resp;
            })
            .catch(() => cached);

          return cached || netFetch;
        })
      )
    );
    return;
  }

  // 5. Demais recursos estáticos (sons, pdfs, etc.) → network com fallback
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
