const CACHE_NAME = "myhomeapp-v4";
const APP_ROOT = self.registration.scope;
const APP_ROOT_URL = new URL(APP_ROOT);
const APP_INDEX = new URL("index.html", APP_ROOT).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const response = await fetch(APP_ROOT);
      if (!response.ok) throw new Error("Unable to cache the app shell.");
      await cache.put(APP_ROOT, response.clone());
      await cache.put(APP_INDEX, response.clone());
      await cache.addAll([
        new URL("manifest.webmanifest", APP_ROOT).href,
        new URL("pwa-icon.svg", APP_ROOT).href,
      ]);
      const html = await response.text();
      const assets = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))["']/g)].map(
        (match) => match[1]
      );
      await cache.addAll(assets);
    })()
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("myhomeapp-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== APP_ROOT_URL.origin ||
    !url.pathname.startsWith(APP_ROOT_URL.pathname)
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(APP_INDEX, copy));
          return response;
        })
        .catch(() => caches.match(APP_INDEX))
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreVary: true }).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
    )
  );
});
