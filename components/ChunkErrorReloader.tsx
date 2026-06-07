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

function reloadOnce(): void {
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
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
