const CACHE_NAME = "english-review-checkin-v9";
const APP_SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "src/main.js?v=20260617-fixed-nav",
  "src/storage.js",
  "src/styles.css?v=20260617-fixed-nav",
  "assets/nami-avatar.jpg",
  "assets/icon-180.png?v=20260615-pwa-icon",
  "assets/icon-192.png?v=20260615-pwa-icon",
  "assets/icon-512.png?v=20260615-pwa-icon"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put("./", responseClone);
          });
          return response;
        })
        .catch(() => caches.match("./").then((cached) => cached || caches.match("index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => caches.match("index.html"));
    })
  );
});
