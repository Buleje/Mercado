"use client";

/**
 * session-refresh — única puerta de entrada a POST /api/auth/refresh.
 *
 * POR QUÉ EXISTE (Brandon 2026-07-22, reporte de HTTP 429 "Has excedido el
 * límite de solicitudes"): el endpoint admite 20 req / 5 min y le pegaban TRES
 * emisores distintos, cada uno con su propio contador y sin saber del otro:
 *
 *   · useTokenRefresh    → al montar + cada 12 min + al volver a la pestaña
 *   · useSessionKeepAlive→ al montar + cada 4 min + al volver a la pestaña
 *                          + ante actividad del usuario (pointerdown/keydown)
 *   · SessionExpiryGuard → al extender la sesión desde el aviso
 *
 * Sumados —y multiplicados por cada pestaña del panel abierta— alcanzaba con
 * alternar entre el panel y WhatsApp un rato para quedarse sin sesión. Medido
 * antes del fix: 25 idas y vueltas a la pestaña = 25 requests.
 *
 * Acá el throttle es del ENDPOINT, no de cada hook: todos comparten el mismo
 * piso de tiempo (vía localStorage, así también cuenta entre pestañas), la
 * misma deduplicación de request en vuelo y el mismo backoff cuando el
 * servidor responde 429.
 */

/**
 * Piso entre refreshes reales. Por debajo del ciclo de 4 min del keepalive
 * —para no cambiarle el propósito— y muy holgado frente al access token de
 * 15 min: en el peor caso son ~1,7 requests cada 5 minutos contra un límite
 * de 20.
 */
const MIN_INTERVAL_MS = 3 * 60 * 1000;

/** Compartido entre pestañas del mismo origen. */
const LAST_KEY = "buleje-last-token-refresh";
/** Hasta cuándo NO volver a pedir, tras un 429. */
const BLOCK_KEY = "buleje-refresh-blocked-until";

/** Una sola request en vuelo por pestaña, aunque la pidan tres hooks a la vez. */
let enVuelo: Promise<boolean> | null = null;

function leerNum(clave: string): number {
  try {
    const v = Number(localStorage.getItem(clave));
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

function guardarNum(clave: string, v: number): void {
  try { localStorage.setItem(clave, String(v)); } catch { /* modo privado: se pierde el throttle entre pestañas, no rompe */ }
}

export interface RefrescarOpts {
  /**
   * Saltea el piso de tiempo. Sólo para cuando el token YA venció (401
   * interceptado o el usuario pulsando "seguir conectado"): ahí esperar deja
   * la sesión rota. El backoff de 429 se respeta igual.
   */
  forzar?: boolean;
  /** Qué disparó el intento — sólo para diagnosticar. */
  motivo?: string;
}

/**
 * Renueva la sesión respetando el presupuesto de requests.
 *
 * @returns `true` si la sesión sigue viva (renovada o aún vigente por
 *   throttle), `false` si el refresh falló de verdad.
 */
export async function refrescarSesion(opts: RefrescarOpts = {}): Promise<boolean> {
  if (typeof window === "undefined") return true;
  if (enVuelo) return enVuelo;

  const ahora = Date.now();
  // El backoff manda incluso sobre `forzar`: insistir mientras el servidor
  // dice "esperá" sólo alarga el castigo.
  if (ahora < leerNum(BLOCK_KEY)) return true;
  if (!opts.forzar && ahora - leerNum(LAST_KEY) < MIN_INTERVAL_MS) return true;

  // Se marca ANTES del fetch: si se marcara al recibir la respuesta, las
  // llamadas casi simultáneas (varias pestañas, o el efecto doble de React en
  // dev) leerían todas el valor viejo y saldrían juntas.
  guardarNum(LAST_KEY, ahora);

  enVuelo = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });

      if (res.ok) return true;

      if (res.status === 401) {
        const ruta = window.location.pathname;
        if (ruta.startsWith("/admin") || ruta.startsWith("/t/")) {
          window.location.href = "/admin/login";
        }
        return false;
      }

      if (res.status === 429) {
        const espera = Number(res.headers.get("retry-after")) || 120;
        guardarNum(BLOCK_KEY, Date.now() + espera * 1000);
        return false;
      }

      return false;
    } catch {
      // Error de red: no se redirige, puede ser momentáneo.
      return false;
    } finally {
      enVuelo = null;
    }
  })();

  return enVuelo;
}
