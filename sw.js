// ============================================================
// SERVICE WORKER — محطة الدهار الجديدة
// ============================================================
const CACHE_NAME = 'dahar-v1';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 أيام

// الملفات اللي هتتحفظ أوف لاين
const STATIC_ASSETS = [
  './',
  './operating.html',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;900&family=Rajdhani:wght@500;600;700&display=swap'
];

// ── INSTALL: كاش كل الملفات الأساسية ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(e => console.warn('Cache miss:', url)))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: امسح الكاش القديم ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: استراتيجية Cache First للملفات الثابتة، Network First للـ API ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // طلبات الـ Google Apps Script — مش بنكاشها
  if (url.hostname.includes('script.google.com')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ status: 'offline', message: 'لا يوجد إنترنت' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // طلبات الـ Google Fonts — Network First مع Cache Fallback
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // باقي الطلبات — Cache First
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return res;
      }).catch(() => {
        // لو كل حاجة فشلت — رد بصفحة أوف لاين
        if (event.request.destination === 'document') {
          return caches.match('./operating.html');
        }
      });
    })
  );
});

// ── BACKGROUND SYNC: مزامنة السجلات المعلقة لما النت يرجع ──
self.addEventListener('sync', event => {
  if (event.tag === 'sync-pending-records') {
    event.waitUntil(syncPendingRecords());
  }
});

async function syncPendingRecords() {
  // البيانات موجودة في localStorage — الـ SW مش بيوصلها مباشرة
  // الـ sync بيتم من الصفحة نفسها عن طريق autoSyncPending()
  const clients = await self.clients.matchAll();
  clients.forEach(client => client.postMessage({ type: 'SYNC_NOW' }));
}

// ── MESSAGE: تواصل مع الصفحة ──
self.addEventListener('message', event => {
  if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data.type === 'CACHE_URLS') {
    caches.open(CACHE_NAME).then(cache => cache.addAll(event.data.urls));
  }
});
