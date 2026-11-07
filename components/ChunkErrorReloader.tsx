"use client";

/**
 * ChunkErrorReloader — auto-recuperación de ChunkLoadError (Brandon 2026-06-07).
 *
 * Problema: cuando se hace un deploy nuevo, los chunks de JS/CSS cambian de
 * hash. Un usuario con una pestaña abierta del bundle VIEJO que dispara un
 * `next/dynamic` (modal, drawer, widget lazy) pide un chunk que ya no existe
 * → `ChunkLoadError: Failed to load chunk ...`. La feature lazy queda rota
 * hasta que el usuario recarga a mano. También lo dispara una caché de disco
 * corrupta del navegador (`ERR_CACHE_READ_FAILURE`).
 *
 * Fix: escuchamos a nivel window los fallos de carga de chunks y recargamos
 * UNA vez (guard anti-loop por sessionStorage). Tras recargar, el HTML trae
 * los hashes nuevos y el chunk carga bien. Si tras recargar SIGUE fallando
 * (chunk genuinamente ausente, no solo stale), el guard evita el loop y deja
 * que el ErrorBoundary muestre su UI.
 *
 * Cubre 2 caminos:
 *   1. Fallo de recurso `<script>`/`<link>` (evento 'error' en fase de captura
 *      — los errores de recurso NO burbujean, por eso `true`).
 *   2. Promise rejection del import() dinámico que no fue atrapada.
 */

import { useEffect } from "react";

const RELOAD_GUARD = "__bsm_chunk_reload_at";
const LOOP_WINDOW_MS = 12_000;

const CHUNK_RE =
  /ChunkLoadError|Loading (?:CSS )?chunk \S+ failed|Failed to load chunk|error loading dynamically imported module|importing a module script failed/i;

function isChunkMessage(s: unknown): boolean {
  return typeof s === "string" && CHUNK_RE.test(s);
}

function isChunkUrl(url: string | null | undefined): boolean {
  return !!url && /\/_next\/static\/(chunks|css)\//.test(url);
}

/* En desarrollo (07-10): `npm run dev` trae solo los cambios de GitHub
   (`scripts/dev-helpers/traer-cambios.mjs`) y Turbopack recompila módulos
   grandes —el Libro TH— en 20-60 s. Durante ese rato el chunk nuevo todavía
   no existe: un solo reintento a los 0 s volvía a fallar y el guard de 12 s
   dejaba la pantalla de error. En dev se espera y se reintenta varias veces;
   en producción sigue siendo UNA recarga. */
const DEV = process.env.NODE_ENV === "development";
const DEV_INTENTOS_KEY = "__bsm_chunk_reload_dev";
const DEV_MAX_INTENTOS = 8;
const DEV_ESPERA_MS = 6_000;
const DEV_VENTANA_MS = 3 * 60_000;

let recargaPendiente = false;

function reloadOnceDev(): void {
  if (recargaPendiente) return;
  let intento = 1;
  try {
    const prev = JSON.parse(sessionStorage.getItem(DEV_INTENTOS_KEY) || "null") as { n: number; desde: number } | null;
    const vigente = prev && Date.now() - prev.desde < DEV_VENTANA_MS;
    intento = vigente ? prev.n + 1 : 1;
    if (intento > DEV_MAX_INTENTOS) return; // 3 min sin chunk: que el ErrorBoundary lo muestre
    sessionStorage.setItem(DEV_INTENTOS_KEY, JSON.stringify({ n: intento, desde: vigente ? prev.desde : Date.now() }));
  } catch {
    /* sin sessionStorage: un intento y listo */
  }
  recargaPendiente = true;
  console.info(`[ChunkErrorReloader] el servidor está compilando cambios nuevos: recargo en ${DEV_ESPERA_MS / 1000} s (intento ${intento}/${DEV_MAX_INTENTOS})`);
  window.setTimeout(() => window.location.reload(), intento === 1 ? 1_500 : DEV_ESPERA_MS);
}

function reloadOnce(): void {
  if (DEV) return reloadOnceDev();
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD) || "0");
    // Anti-loop: si ya recargamos hace <12s, no insistas (el chunk falta de
    // verdad → que el ErrorBoundary muestre su UI en vez de recargar infinito).
    if (Date.now() - last < LOOP_WINDOW_MS) return;
    sessionStorage.setItem(RELOAD_GUARD, String(Date.now()));
  } catch {
    /* sessionStorage bloqueado (modo privado estricto) → recarga igual */
  }
  window.location.reload();
}

export default function ChunkErrorReloader() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      // (1) Fallo de carga de recurso: e.target es el <script>/<link>.
      const target = e.target as (HTMLScriptElement & HTMLLinkElement) | null;
      if (target && (target.tagName === "SCRIPT" || target.tagName === "LINK")) {
        if (isChunkUrl(target.src || target.href)) {
          reloadOnce();
          return;
        }
      }
      // (2) Error JS con mensaje de chunk.
      if (isChunkMessage(e?.message) || isChunkMessage(e?.error?.name) || isChunkMessage(e?.error?.message)) {
        reloadOnce();
      }
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e?.reason;
      if (isChunkMessage(r?.name) || isChunkMessage(r?.message) || isChunkMessage(String(r))) {
        reloadOnce();
      }
    };

    // `true` = fase de captura: los errores de carga de recurso (script/link)
    // no burbujean, así que un listener en bubbling no los vería.
    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection);
    // Dev: si la página aguantó 20 s sin otro fallo de chunk, la compilación
    // terminó; la próxima tanda de cambios arranca a contar de cero.
    const limpiar = DEV
      ? window.setTimeout(() => {
          try { sessionStorage.removeItem(DEV_INTENTOS_KEY); } catch { /* sin sessionStorage: nada que limpiar */ }
        }, 20_000)
      : undefined;
    return () => {
      if (limpiar) window.clearTimeout(limpiar);
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
