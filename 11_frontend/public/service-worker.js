/**
 * Service Worker（アプリシェルキャッシュ）
 *
 * 対応設計書: 01_docs/02_sd/04_共通設計/非機能設計.md §3
 *
 * Phase1 では静的アセット（アプリシェル）のみをキャッシュし、オフライン時も
 * 起動画面までは表示できるようにする。**問題データそのもののオフライン
 * キャッシュは Phase2 で本格対応**するため、APIレスポンスはキャッシュしない。
 */
const CACHE_NAME = 'oracle-master-app-shell-v1';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // GET以外と、APIへのリクエストはキャッシュ対象外。
  // 認証付きの動的データを保存しないための措置（Phase2でオフライン対応を検討）
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // 画面遷移はネットワーク優先、失敗時にアプリシェルへフォールバック
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }

  // 静的アセットはキャッシュ優先
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
