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

/* Sólo rutas propias de la foto de un movimiento (el vigía, 23-10): nunca otra dirección de la carga. */
const RUTA_FOTO = "/api/admin/camaras/movimientos/foto";
const FOTO_MAX_BYTES = 2 * 1024 * 1024;

function rutaDeFoto(foto) {
  if (typeof foto !== "string" || !foto) return null;
  try {
    const u = new URL(foto, self.location.origin);
    return u.origin === self.location.origin && u.pathname === RUTA_FOTO ? u.href : null;
  } catch {
    return null;
  }
}

/* La foto del movimiento: la baja ESTE celular con su sesión del panel (el push
   no la lleva), y sólo si su dueño aceptó verla con el celular bloqueado
   (`fotoEnAviso`, Ley 29733). Sin sesión, vencida o lenta: el aviso sale igual, sin foto. */
async function fotoComoDataUrl(href) {
  try {
    const r = await fetch(href, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok || !(r.headers.get("content-type") || "").startsWith("image/jpeg")) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.length === 0 || bytes.length > FOTO_MAX_BYTES) return null;
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return `data:image/jpeg;base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

async function mostrarAviso(data) {
  const foto = rutaDeFoto(data.foto);
  const imagen = foto && data.fotoEnAviso === true ? await fotoComoDataUrl(foto) : null;
  const opciones = {
    body: data.body,
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    tag: data.tag,
    renotify: true,
    data: { url: data.url },
    vibrate: [200, 100, 200, 100, 200],
  };
  if (imagen) opciones.image = imagen;
  if (foto) opciones.actions = [{ action: "foto", title: "Ver foto" }];
  return self.registration.showNotification(data.title, opciones);
}

self.addEventListener("push", (event) => {
  let data = { title: "Cámaras", body: "El video en vivo vio a alguien.", url: "/admin?tab=camaras&vista=personas", tag: "camaras", foto: null, fotoEnAviso: false };
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      /* carga que no es JSON: se muestra el aviso genérico */
    }
  }
  event.waitUntil(mostrarAviso(data));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  /* Sólo se abre el propio panel: una URL de otro origen en la carga (revisión
     de seguridad 10-10) cae en la pestaña de Cámaras. */
  /* «Ver foto» y tocar el aviso abren lo mismo: el panel con ESE movimiento
     (`?movimiento=`), que muestra la foto con la sesión — nunca la imagen suelta. */
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
