/* Service worker SOLO de avisos de cámaras al celular (2026-10-10).
 *
 * Por qué uno aparte y no `/sw.js`:
 *  · `/sw.js` se autodesregistra en localhost (kill-switch de cachés) y
 *    `ServiceWorkerRegistrar` desregistra todo en desarrollo: el panel corre en
 *    desarrollo en la PC de Brandon, y una suscripción de push muere con su
 *    service worker.
 *  · Éste no intercepta `fetch` ni guarda nada: sólo muestra el aviso y abre el
 *    panel al tocarlo. Vive en su propio alcance (`/sw-avisos/`), así que no
 *    controla ninguna página ni choca con el de la tienda.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = { title: "Cámaras", body: "El video en vivo vio a alguien.", url: "/admin?tab=camaras&vista=personas", tag: "camaras" };
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      /* carga que no es JSON: se muestra el aviso genérico */
    }
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      tag: data.tag,
      renotify: true,
      data: { url: data.url },
      vibrate: [200, 100, 200, 100, 200],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  /* Sólo se abre el propio panel: una URL de otro origen en la carga (revisión
     de seguridad 10-10) cae en la pestaña de Cámaras. */
  let destino = new URL("/admin?tab=camaras", self.location.origin).href;
  try {
    const pedida = new URL(event.notification.data?.url || "/admin?tab=camaras", self.location.origin);
    if (pedida.origin === self.location.origin) destino = pedida.href;
  } catch {
    /* URL rota: queda la pestaña de Cámaras */
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      /* Este service worker no controla páginas (su alcance es /sw-avisos/):
         no puede navegar una pestaña abierta, sólo enfocarla si ya está ahí. */
      const misma = ventanas.find((v) => v.url === destino);
      if (misma && "focus" in misma) return misma.focus();
      return self.clients.openWindow ? self.clients.openWindow(destino) : undefined;
    }),
  );
});
