// サイト全体（マイアプリ）の Service Worker。
// 電波があるときは何もせず、いつもどおりネットから最新を読み込む（更新はすぐ反映される）。
// 電波がなくて画面を開けないときだけ、オフラインの案内（offline.html）を出す。
// offline.html を変えたら、CACHE の番号を上げる（古い保存分は activate で消える）
const CACHE = 'mywebapp-offline-v1';
const OFFLINE_URL = 'offline.html';
const PRECACHE = [OFFLINE_URL];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(caches.keys()
        .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
        .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    // 画面の読み込み（ページを開く・移動する）以外は、触らずにネットへ任せる
    if (request.mode !== 'navigate') return;
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
});
