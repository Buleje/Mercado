"use client";

/**
 * Los dos avisos de una guía que el servidor mide (`/api/admin/forestal/loth/guia-permiso`):
 *
 *  - `useSaldoDelPermiso`: al elegir un permiso en «Asignar permiso», lo que trae
 *    la guía por especie contra lo autorizado (T7 + T6). La ventana sólo lo
 *    muestra: el POST vuelve a medir dentro de la transacción.
 *  - `useTrozasAManoQueAnula`: las trozas anotadas a mano que anular la guía
 *    anula con ella (la misma regla del anular del servidor).
 */

import { useEffect, useState } from "react";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";
import type { SaldoDelPermisoParaLaGuia, TrozasAManoDeLaGuia } from "@/lib/forestal/loth-guia-permiso-saldo";

const RUTA = "/api/admin/forestal/loth/guia-permiso";

export interface SaldoDelPermisoEstado {
  saldo: SaldoDelPermisoParaLaGuia | null;
  cargando: boolean;
  error: string | null;
}

export function useSaldoDelPermiso(gtfId: string, planId: string): SaldoDelPermisoEstado {
  const [estado, setEstado] = useState<{ clave: string; saldo: SaldoDelPermisoParaLaGuia | null; error: string | null } | null>(null);
  const clave = planId ? `${gtfId}:${planId}` : "";
  useEffect(() => {
    if (!clave) return;
    const ctrl = new AbortController();
    const q = new URLSearchParams({ gtfId, planId });
    fetch(`${RUTA}?${q}`, { credentials: "include", cache: "no-store", signal: ctrl.signal })
      .then(async (r) => {
        const j = await leerJson<SaldoDelPermisoParaLaGuia & { message?: string; error?: string }>(r);
        if (ctrl.signal.aborted) return;
        if (!r.ok || !j) setEstado({ clave, saldo: null, error: j?.message ?? j?.error ?? `No se pudo medir lo autorizado (${r.status})` });
        else setEstado({ clave, saldo: j, error: null });
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        logger.warn("[loth-gtf] no se pudo medir lo autorizado del permiso", { error: String(err) });
        setEstado({ clave, saldo: null, error: "No se pudo medir lo autorizado. Cierra y vuelve a intentar." });
      });
    return () => ctrl.abort();
  }, [clave, gtfId, planId]);
  const vigente = estado && estado.clave === clave ? estado : null;
  return { saldo: vigente?.saldo ?? null, cargando: !!clave && !vigente, error: vigente?.error ?? null };
}

/** `null` mientras llega o si falla: el modal no dice nada que no sepa. */
export function useTrozasAManoQueAnula(gtfId: string | null | undefined): TrozasAManoDeLaGuia | null {
  const [r, setR] = useState<{ id: string; v: TrozasAManoDeLaGuia } | null>(null);
  useEffect(() => {
    if (!gtfId) return;
    const ctrl = new AbortController();
    fetch(`${RUTA}?trozasAManoDe=${encodeURIComponent(gtfId)}`, { credentials: "include", cache: "no-store", signal: ctrl.signal })
      .then(async (res) => {
        const j = await leerJson<TrozasAManoDeLaGuia>(res);
        if (!ctrl.signal.aborted && res.ok && j && typeof j.trozas === "number") setR({ id: gtfId, v: j });
      })
      .catch((err) => {
        if (!ctrl.signal.aborted) logger.warn("[loth-gtf] no se pudo contar las trozas a mano de la guía", { error: String(err) });
      });
    return () => ctrl.abort();
  }, [gtfId]);
  return r && r.id === gtfId ? r.v : null;
}
