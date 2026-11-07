"use client";

/**
 * usePlantaDatos — los datos de la vista Planta (ADR-142 + croquis ADR-465):
 * zonas, lo ubicable, dónde está cada cosa, el croquis del negocio y los
 * saldos del Libro para los indicadores.
 *
 * Toda escritura de ubicaciones va en UN solo PUT `{ asignaciones }`. Antes
 * «ubicar todas las trozas» mandaba N PUT en paralelo y cada uno reescribía la
 * lista entera del KV: ganaba el último y se perdían las demás.
 */

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import { aplicarAsignaciones } from "@/lib/forestal/planta-croquis";
import type { AsignacionPlanta, Item, PlanoPlanta, PlantaCroquis, PlantaZona, UbicacionPlanta } from "@/lib/forestal/planta-zona-types";

export interface PlantaSaldos {
  materiaPrima: { ingresoM3: number; consumidoM3: number; saldoM3: number };
  productoStock: number;
  despachado: number;
}

const URL_PLANTA = "/api/admin/forestal/ctp/planta";

async function mensajeDe(r: Response): Promise<string> {
  const j = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
  return j.message ?? (r.status === 403 ? "No tienes permiso para guardar esto." : `HTTP ${r.status}`);
}

/** Lo guardado: el formato nuevo (`ubicaciones`) o el viejo (`asignaciones` id → zona). */
function leerUbicaciones(pz: { ubicaciones?: unknown; asignaciones?: unknown }): Record<string, UbicacionPlanta> {
  const out: Record<string, UbicacionPlanta> = {};
  const raw = (pz.ubicaciones ?? pz.asignaciones ?? {}) as Record<string, unknown>;
  for (const [clave, v] of Object.entries(raw)) {
    if (typeof v === "string" && v) { out[clave] = { zonaId: v }; continue; }
    const u = v as { zonaId?: unknown; lat?: unknown; lng?: unknown } | null;
    if (!u || typeof u.zonaId !== "string" || !u.zonaId) continue;
    out[clave] = typeof u.lat === "number" && typeof u.lng === "number" ? { zonaId: u.zonaId, lat: u.lat, lng: u.lng } : { zonaId: u.zonaId };
  }
  return out;
}

export function usePlantaDatos(period: CtpPeriod, plano: PlanoPlanta) {
  const [zonas, setZonas] = useState<PlantaZona[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [ubicaciones, setUbicaciones] = useState<Record<string, UbicacionPlanta>>({});
  const [croquis, setCroquis] = useState<PlantaCroquis | null>(null);
  /** Ya se preguntó al servidor si el negocio tiene croquis (decide el plano por defecto). */
  const [croquisSabido, setCroquisSabido] = useState(false);
  const [saldos, setSaldos] = useState<PlantaSaldos | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const sp = applyCtpPeriodParams(new URLSearchParams({ saldos: "1" }), period);
      const [rz, rs] = await Promise.all([
        fetch(`${URL_PLANTA}?plano=${plano}`, { credentials: "include" }),
        fetch(`/api/admin/forestal/ctp?${sp}`, { credentials: "include" }),
      ]);
      if (!rz.ok) throw new Error(await mensajeDe(rz));
      const pz = await rz.json();
      setZonas(pz.zonas ?? []);
      setItems(pz.items ?? []);
      setUbicaciones(leerUbicaciones(pz));
      // El croquis viaja con `?plano=croquis`; si la respuesta no lo trae, se
      // conserva el que ya había (cambiar a satélite no lo borra).
      if ("croquis" in pz) { setCroquis(pz.croquis ?? null); setCroquisSabido(true); }
      if (rs.ok) {
        const s = (await rs.json()).saldos;
        const mp = s?.materiaPrima ?? { ingresoM3: 0, consumidoM3: 0, saldoM3: 0 };
        const productos = (s?.productos ?? []) as { producido: number; despachado: number; stock: number }[];
        setSaldos({
          materiaPrima: { ingresoM3: Number(mp.ingresoM3 ?? 0), consumidoM3: Number(mp.consumidoM3 ?? 0), saldoM3: Number(mp.saldoM3 ?? 0) },
          productoStock: productos.reduce((a, p) => a + Number(p.stock ?? 0), 0),
          despachado: productos.reduce((a, p) => a + Number(p.despachado ?? 0), 0),
        });
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [period, plano]);
  useEffect(() => { void load(); }, [load]);

  /** Ubicar, mover o quitar (`zonaId: null`) varias cosas: optimista y en UNA escritura. */
  const asignar = useCallback(async (asigs: AsignacionPlanta[], marca = asigs[0]?.clave ?? null) => {
    if (asigs.length === 0) return;
    setOcupado(marca);
    setUbicaciones((prev) => aplicarAsignaciones(prev, asigs));
    try {
      const r = await fetch(URL_PLANTA, {
        method: "PUT", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({ asignaciones: asigs }),
      });
      if (!r.ok) throw new Error(await mensajeDe(r));
    } catch (e) { setError(`No se pudo guardar la ubicación: ${e instanceof Error ? e.message : String(e)}`); void load(); }
    finally { setOcupado(null); }
  }, [load]);

  /**
   * Guardar el croquis (máquinas, medidas). Solo dueño o administrador. La
   * imagen viaja aparte como `imagenRef` (lo que devolvió el POST de la
   * imagen; `null` = sacarla; ausente = no tocarla).
   */
  const guardarCroquis = useCallback(async (c: PlantaCroquis, imagen?: { imagenRef: string | null }): Promise<boolean> => {
    const previo = croquis;
    setCroquis(c);
    try {
      const r = await fetch(`${URL_PLANTA}/croquis`, {
        method: "PUT", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({ version: c.version, anchoM: c.anchoM, altoM: c.altoM, maquinas: c.maquinas, ...(imagen ?? {}) }),
      });
      if (!r.ok) throw new Error(await mensajeDe(r));
      const j = (await r.json().catch(() => ({}))) as { croquis?: PlantaCroquis };
      if (j.croquis) setCroquis(j.croquis);
      return true;
    } catch (e) {
      setCroquis(previo);
      setError(`No se pudo guardar el croquis: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }, [croquis]);

  return { zonas, items, ubicaciones, croquis, croquisSabido, saldos, loading, error, setError, ocupado, load, asignar, guardarCroquis };
}
