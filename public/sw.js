const CACHE_NAME = "bsm-v3";
const STATIC_URLS = ["/", "/manifest.webmanifest"];
const API_CACHE = "bsm-api-v2";
const IMG_CACHE = "bsm-img-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const keep = new Set([CACHE_NAME, API_CACHE, IMG_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  // Ignorar extensiones del navegador
  if (
    url.protocol === "chrome-extension:" ||
    url.protocol === "moz-extension:" ||
    url.protocol === "extension:" ||
    url.hostname === "localhost" && url.port !== "3000"
  ) return;

  // Cache product images (Unsplash, OpenFoodFacts)
  if (url.hostname.includes("unsplash.com") || url.hostname.includes("openfoodfacts.org")) {
    event.respondWith(
      caches.open(IMG_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const response = await fetch(event.request);
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        } catch {
          return new Response("", { status: 408 });
        }
      })
    );
    return;
  }

  // Cache read-only API responses (products, promotions, settings) — network first, cache fallback
  if (url.pathname.startsWith("/api/products") || url.pathname.startsWith("/api/promotions") || url.pathname === "/api/settings") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const cloned = response.clone();
            caches.open(API_CACHE).then((cache) => cache.put(event.request, cloned));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then(r => r || new Response("[]", { headers: { "Content-Type": "application/json" } })))
    );
    return;
  }

  // Skip other API, admin and Next.js internal routes
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/admin") ||
    url.pathname.startsWith("/_next/")
  )
    return;

  // Pages: network first, cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const cloned = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, cloned));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── Web Push ──────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = { title: "Bodega San Martín", body: "Tienes una nueva notificación", url: "/", icon: "/icons/icon-192x192.png" };
  if (event.data) {
    try { data = { ...data, ...JSON.parse(event.data.text()) }; } catch {}
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: "/icons/icon-192x192.png",
      data: { url: data.url },
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
