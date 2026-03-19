const CACHE_NAME = "bsm-v6";
const CATALOG_CACHE = "bsm-catalog-v1";
const STATIC_URLS = [
  "/",
  "/tienda",
  "/tienda/categoria/frutas-verduras",
  "/tienda/categoria/abarrotes",
  "/tienda/categoria/carnes",
  "/tienda/categoria/lacteos",
  "/tienda/categoria/bebidas",
  "/tienda/categoria/limpieza",
  "/manifest.webmanifest",
  "/offline.html",
];
const API_CACHE = "bsm-api-v3";
const IMG_CACHE = "bsm-img-v3";
const ASSET_CACHE = "bsm-assets-v1";

// Max cached items per cache to prevent unbounded growth
const IMG_CACHE_LIMIT = 200;
const ASSET_CACHE_LIMIT = 100;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => 
      cache.addAll(STATIC_URLS).catch((err) => {
        console.log("[SW] Failed to cache some static URLs:", err);
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const keep = new Set([CACHE_NAME, API_CACHE, IMG_CACHE, CATALOG_CACHE, ASSET_CACHE]);
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
          if (response.ok) {
            cache.put(event.request, response.clone());
            trimCache(IMG_CACHE, IMG_CACHE_LIMIT);
          }
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

  // Skip other API, admin and Next.js data routes
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/admin")
  )
    return;

  // /_next/static/* assets: cache-first (immutable, hash in filename)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const response = await fetch(event.request);
          if (response.ok) {
            cache.put(event.request, response.clone());
            trimCache(ASSET_CACHE, ASSET_CACHE_LIMIT);
          }
          return response;
        } catch {
          return new Response("", { status: 408 });
        }
      })
    );
    return;
  }

  // Google Fonts & other font assets: cache-first
  if (
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com" ||
    url.pathname.startsWith("/fonts/")
  ) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
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

  // Skip other /_next/ routes (data, image optimization, etc.)
  if (url.pathname.startsWith("/_next/"))
    return;

  // Category pages: network-first with dedicated catalog cache for offline browsing
  if (url.pathname.startsWith("/tienda/categoria/")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const cloned = response.clone();
            caches.open(CATALOG_CACHE).then((cache) => cache.put(event.request, cloned));
          }
          return response;
        })
        .catch(() =>
          caches.open(CATALOG_CACHE).then((cache) =>
            cache.match(event.request).then((cached) => {
              if (cached) return cached;
              return caches.match("/offline.html");
            })
          )
        )
    );
    return;
  }

  // Pages: network first, cache fallback, offline.html as last resort
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
      .catch(() => 
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // If HTML request and no cache, return offline page
          if (
            event.request.destination === "document" ||
            event.request.headers.get("accept")?.includes("text/html")
          ) {
            return caches.match("/offline.html");
          }
          return new Response("Offline", { status: 503 });
        })
      )
  );
});

// ── Cache Maintenance ─────────────────────────────────────────────
function trimCache(cacheName, maxItems) {
  caches.open(cacheName).then((cache) => {
    cache.keys().then((keys) => {
      if (keys.length > maxItems) {
        // Delete oldest entries (FIFO)
        const toDelete = keys.slice(0, keys.length - maxItems);
        toDelete.forEach((key) => cache.delete(key));
      }
    });
  });
}

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

// ── Background Sync – Offline POS Sales ──────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-pos-sales") {
    event.waitUntil(syncPendingSales());
  }
});

async function syncPendingSales() {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction("pendingSales", "readonly");
    const sales = await getAllFromStore(tx.objectStore("pendingSales"));
    for (const sale of sales) {
      try {
        const res = await fetch("/api/sales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sale),
        });
        if (res.ok) {
          const delTx = db.transaction("pendingSales", "readwrite");
          delTx.objectStore("pendingSales").delete(sale.localId);
        }
      } catch { /* retry on next sync */ }
    }
  } catch { /* IndexedDB unavailable */ }
}

function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("bsm-offline", 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("pendingSales")) {
        db.createObjectStore("pendingSales", { keyPath: "localId" });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

function getAllFromStore(store) {
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}
