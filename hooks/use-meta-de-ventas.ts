"use client";

/**
 * La meta de ventas del mes, la misma que se administra en «Metas» (ADR-415,
 * `/api/goals`, tabla `AdminGoal`).
 *
 * El gráfico de Ingresos del Resumen dibujaba una «Meta: S/15,000» fija en el
 * código: la misma para una bodega que vende S/ 200 al mes y para un
 * aserradero. Ahora se dibuja la meta que el negocio puso (categoría «ventas»,
 * período «mensual»); si no hay, no se inventa — la pantalla ofrece ponerla.
 */

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { MetaDTO } from "@/lib/admin/metas-tareas";

/** La meta mensual de ventas vigente: la última creada con esa categoría y período. */
export function metaMensualDeVentas(metas: ReadonlyArray<MetaDTO>): MetaDTO | null {
  const candidatas = metas.filter((m) => m.category === "ventas" && m.period === "mensual" && m.target > 0);
  return candidatas.length ? candidatas[candidatas.length - 1] : null;
}

export interface UsoMetaDeVentas {
  meta: MetaDTO | null;
  cargando: boolean;
  /** No se pudo leer: la pantalla no ofrece «ponla» (no sabe si ya hay una). */
  error: boolean;
  guardando: boolean;
  /** `true` si se guardó. */
  guardar: (target: number) => Promise<boolean>;
}

export function useMetaDeVentas(): UsoMetaDeVentas {
  const [meta, setMeta] = useState<MetaDTO | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch("/api/goals", { credentials: "include", cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as unknown;
      })
      .then((d) => { if (vivo) setMeta(metaMensualDeVentas(Array.isArray(d) ? (d as MetaDTO[]) : [])); })
      .catch(() => { if (vivo) setError(true); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, []);

  const guardar = useCallback(async (target: number) => {
    if (!Number.isFinite(target) || target <= 0) return false;
    setGuardando(true);
    try {
      const r = await fetch("/api/goals", {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ name: "Ventas del mes", category: "ventas", period: "mensual", target, unit: "S/" }),
      });
      if (!r.ok) return false;
      setMeta((await r.json()) as MetaDTO);
      return true;
    } catch {
      return false;
    } finally {
      setGuardando(false);
    }
  }, []);

  return { meta, cargando, error, guardando, guardar };
}
