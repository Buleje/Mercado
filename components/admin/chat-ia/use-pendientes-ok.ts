"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Cuenta de pendientes de la respuesta de `/api/ai-assistant/approvals`; null si no la trae. */
function contar(d: unknown): number | null {
  if (!d || typeof d !== "object") return null;
  const r = d as { count?: unknown; pending?: unknown };
  if (typeof r.count === "number") return r.count;
  return Array.isArray(r.pending) ? r.pending.length : null;
}

/**
 * Cuántas acciones de la IA esperan tu OK, de TODOS los canales (este chat,
 * WhatsApp, Telegram): el servidor las guarda por tenant.
 *
 * Misma regla que «Lo que hizo la IA»: si una lectura falla (429, red caída) se
 * CONSERVA el último valor —leerlo como 0 escondía aprobaciones vivas—; 401/403
 * es «sin permiso» → 0. Con la pestaña del navegador oculta no se sondea.
 */
export function usePendientesOK(intervaloMs = 30_000): {
  pendientes: number;
  recargar: () => void;
} {
  const [pendientes, setPendientes] = useState(0);
  const vivo = useRef(true);

  const recargar = useCallback(() => {
    fetch("/api/ai-assistant/approvals", { credentials: "include", cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) return 0;
        if (!r.ok) return null;
        return contar(await r.json().catch(() => null));
      })
      .then((n) => {
        if (vivo.current && n !== null) setPendientes(n);
      })
      .catch(() => {
        /* Sin red: se queda con lo último que se supo. */
      });
  }, []);

  useEffect(() => {
    vivo.current = true;
    recargar();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") recargar();
    }, intervaloMs);
    return () => {
      vivo.current = false;
      clearInterval(t);
    };
  }, [recargar, intervaloMs]);

  return { pendientes, recargar };
}
