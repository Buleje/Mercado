// ─── Kill-switch en localhost ───────────────────────────────────────────────
// Si el SW arranca en localhost, se autodesregistra y limpia TODAS sus caches
// antes de hacer cualquier otra cosa. Esto evita que una versión vieja del SW
// (que sí interceptaba localhost) deje 404s cacheadas tras un fix de runtime.
//
// Patrón: el guard funciona ya en `fetch`, pero si el `install` o `activate`
// de una versión PREVIA cacheó entries, esas entries sobreviven hasta que
// limpiemos. Acá lo hacemos explícito en cada arranque del worker en local.
if (self.location && self.location.hostname === "localhost") {
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
          await self.registration.unregister();
          const clients = await self.clients.matchAll({ type: "window" });
          for (const client of clients) client.navigate(client.url);
        } catch (err) {
          console.log("[SW] localhost kill-switch failed (non-fatal):", err);
        }
      })(),
    );
  });
  // Pasthrough — no interceptar fetches
  self.addEventListener("fetch", () => {});
} else {

// Brandon 2026-05-20 v7 FIX FOUC:
// Bump CACHE_NAME v14→v15 — el activate hook ahora limpia el cache viejo
// que estaba sirviendo HTML stale con referencias a chunks JS antiguos
// (causaba el "flash de estilos viejos al cargar/regresar" reportado).
const CACHE_NAME = "buleje-v15";
const CATALOG_CACHE = "buleje-catalog-v3";
// FIX 2026-05-06: removidos /offline (no existe — solo /offline.html) y /admin
// (redirige 30x → cache.addAll lo rechaza como "illegal path").
// Brandon 2026-05-20 v7: REMOVIDOS de aquí "/", "/tiendas", "/negocios",
// "/tienda" — eran páginas dinámicas con contenido fresco (counter de
// tiendas, JSON-LD con stores actuales). Cachearlas hacía que el bfcache
// browser sirviera versiones viejas con shape de UI anterior → FOUC.
// Mantenemos solo recursos verdaderamente estáticos: offline page + manifest +
// delivery-app shell (los repartidores SÍ necesitan offline pre-cache).
const STATIC_URLS = [
  "/manifest.webmanifest",
  "/offline.html",
  // Shell de la delivery app — riders con señal inestable conservan el
  // panel offline. Se excluyen rutas de API (/api/delivery/*) porque son
  // dinámicas y no deben servirse desde cache en modo offline.
  "/delivery-app",
  "/delivery-app/login",
  "/delivery-manifest.json",
];
const API_CACHE = "buleje-api-v4";
const IMG_CACHE = "buleje-img-v4";
const ASSET_CACHE = "buleje-assets-v3";

// Max cached items per cache to prevent unbounded growth
const IMG_CACHE_LIMIT = 200;
const ASSET_CACHE_LIMIT = 100;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Promise.allSettled + cache.add por URL: tolera fallos individuales
      // (404, redirect, network) sin reventar la instalación del SW.
      Promise.allSettled(
        STATIC_URLS.map((u) =>
          cache.add(u).catch((err) => {
            console.log("[SW] skip " + u + ":", err && err.message ? err.message : err);
          }),
        ),
      ),
    ),
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

  // En localhost (desarrollo) NO interceptar nada para evitar módulos HMR cacheados
  if (url.hostname === "localhost") return;

  // Ignorar extensiones del navegador
  if (
    url.protocol === "chrome-extension:" ||
    url.protocol === "moz-extension:" ||
    url.protocol === "extension:"
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
        // Audit 2026-05-17 07-P1-5: antes devolvíamos Response("[]") con 200
        // cuando fetch fallaba sin cache previa — el cliente recibía lista
        // vacía y creía "no hay productos" en vez de "estoy offline". Ahora
        // devolvemos 503 con header x-offline=1 para que el UI muestre
        // empty-state correcto (mensaje "sin conexión, intenta luego").
        .catch(() => caches.match(event.request).then(r => r || new Response(
          JSON.stringify({ error: "offline", message: "Sin conexión" }),
          {
            status: 503,
            headers: { "Content-Type": "application/json", "x-offline": "1" },
          }
        )))
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

  // Pages dinámicas (/, /tiendas, /negocios, /marketplace/[slug], etc):
  // Brandon 2026-05-20 v7 — antes cacheabamos el HTML completo en CACHE_NAME
  // y devolvíamos esa version stale al regresar (flash de estilos viejos +
  // re-paint cuando llegaba la version fresca). Ahora: network-only para
  // HTML dinámico, sin cache intermedio. offline.html se sirve solo cuando
  // hay error de network (sin caché previa, no hay nada que servir stale).
  event.respondWith(
    fetch(event.request)
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
  let data = { title: "Buleje", body: "Tienes una nueva notificación", url: "/", icon: "/icons/icon-192x192.png" };
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
    const req = indexedDB.open("buleje-offline", 1);
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

} // ─── end localhost-kill-switch else branch ─────────────────────────────────
