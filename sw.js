const CACHE_NAME = 'jp-stock-screener-v1';
const URLS_TO_CACHE = [
  '/jp-stock-screener/',
  '/jp-stock-screener/index.html',
  '/jp-stock-screener/style.css',
  '/jp-stock-screener/app.js',
  '/jp-stock-screener/data/fundamentals.json',
  '/jp-stock-screener/data/prices.json',
];

// インストール時にキャッシュ
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(URLS_TO_CACHE);
    })
  );
});

// フェッチ時にキャッシュ優先
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});

// 古いキャッシュを削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      );
    })
  );
});