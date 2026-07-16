const CACHE_NAME = "gamevault-shell-v41";
const IMAGE_CACHE = "gamevault-images-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./icon.png",
  "./manifest.webmanifest"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME && key !== IMAGE_CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const cacheableImage = req.destination === "image" &&
    (url.hostname === "image.tmdb.org" || url.hostname.endsWith("rawg.io"));
  if (cacheableImage) {
    const networkImage = fetch(req).then(res => {
      if (res.ok || res.type === "opaque") {
        const copy = res.clone();
        return caches.open(IMAGE_CACHE).then(async cache => {
          await cache.put(req, copy);
          const keys = await cache.keys();
          await Promise.all(keys.slice(0, Math.max(0, keys.length - 220)).map(key => cache.delete(key)));
          return res;
        });
      }
      return res;
    });
    event.respondWith(caches.match(req).then(cached => cached || networkImage));
    event.waitUntil(networkImage.catch(() => undefined));
    return;
  }
  if (url.origin === location.origin) {
    if (req.mode === "navigate") {
      event.respondWith(
        fetch(req).then(res => {
          if (!res.ok) return res;
          const copy = res.clone();
          return caches.open(CACHE_NAME).then(cache => cache.put("./index.html", copy)).then(() => res);
        }).catch(() => caches.match("./index.html"))
      );
      return;
    }
    const cachedPromise = caches.match(req);
    const networkPromise = fetch(req).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
      }
      return res;
    });
    event.respondWith(cachedPromise.then(cached => {
      if (cached) return cached;
      return networkPromise.catch(() => req.mode === "navigate" ? caches.match("./index.html") : Response.error());
    }));
    event.waitUntil(networkPromise.catch(() => undefined));
  }
});
