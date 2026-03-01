// Service Worker - JS 파일 캐시 완전 방지
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(names => Promise.all(names.map(n => caches.delete(n))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);
    // 자체 JS 파일만 대상 (CDN 제외)
    if (url.pathname.endsWith('.js') && url.origin === self.location.origin) {
        // 타임스탬프 쿼리 추가 → Cloudflare CDN 캐시도 우회
        url.searchParams.set('_', Date.now());
        e.respondWith(fetch(url.href, { cache: 'no-store' }));
    }
});
