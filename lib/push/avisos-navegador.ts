/**
 * La suscripción de Web Push del panel en el navegador (cámaras 10-10, agenda 20-10).
 *
 * Un solo service worker de avisos (`/sw-avisos.js`, alcance `/sw-avisos/`) y,
 * por lo tanto, UNA suscripción por navegador que comparten las cámaras y la
 * agenda: cada módulo guarda su copia del endpoint en su propia lista del
 * servidor. Por eso apagar un módulo NO llama `unsubscribe()` (mataría el
 * otro): sólo lo saca de su lista.
 *
 * El service worker de la tienda se desregistra en desarrollo y en localhost
 * (`ServiceWorkerRegistrar`), y la suscripción moriría con él: de ahí el propio.
 *
 * Sólo navegador (lo importan hooks de cliente). Sin "use client": es una
 * librería, no un componente.
 */

export const SW_AVISOS = "/sw-avisos.js";
export const ALCANCE_AVISOS = "/sw-avisos/";

function bytesDeClave(base64url: string): Uint8Array<ArrayBuffer> {
  const relleno = "=".repeat((4 - (base64url.length % 4)) % 4);
  const crudo = atob((base64url + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(crudo.length));
  for (let i = 0; i < crudo.length; i++) out[i] = crudo.charCodeAt(i);
  return out;
}

export function hayPush(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Espera a que el service worker recién registrado quede activo (sin eso `subscribe` falla). */
async function registroActivo(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register(SW_AVISOS, { scope: ALCANCE_AVISOS });
  if (reg.active) return reg;
  const w = reg.installing ?? reg.waiting;
  if (w) {
    await new Promise<void>((ok) => {
      const mirar = () => {
        if (w.state === "activated") ok();
      };
      w.addEventListener("statechange", mirar);
      mirar();
    });
  }
  return reg;
}

/** La suscripción que ya tiene este navegador, o `null`. Nunca pide permiso. */
export async function suscripcionActual(): Promise<PushSubscription | null> {
  if (!hayPush()) return null;
  const reg = await navigator.serviceWorker.getRegistration(ALCANCE_AVISOS);
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/**
 * La suscripción de este navegador con la clave pública del servidor: reusa la
 * que hay o crea una. El permiso de notificaciones lo pide quien llama (cada
 * módulo dice su propio mensaje si lo niegan). Puede tirar.
 */
export async function suscribirEsteNavegador(clavePublica: string): Promise<PushSubscription> {
  const reg = await registroActivo();
  const clave = bytesDeClave(clavePublica);
  const sub = await reg.pushManager.getSubscription();
  if (sub) return sub;
  try {
    return await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave });
  } catch {
    /* Suscripción vieja con otra clave del servidor: se rehace una vez. */
    await (await reg.pushManager.getSubscription())?.unsubscribe();
    return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave });
  }
}
