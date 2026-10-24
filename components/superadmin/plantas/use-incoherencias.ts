"use client";

import { useCallback, useMemo, useState } from "react";
import type {
  GravedadIncoherencia,
  IncoherenciaPlanta,
  IncoherenciasResponse,
  OrigenIncoherencia,
  PlantasListaResponse,
} from "@/lib/superadmin/plantas-forestales/tipos";
import { useCargaSuperadmin } from "./use-carga";

export interface FiltrosIncoherencias {
  gravedad: GravedadIncoherencia | "";
  origen: OrigenIncoherencia | "";
  tenantId: string;
  incluirPrueba: boolean;
}

const INICIAL: FiltrosIncoherencias = { gravedad: "", origen: "", tenantId: "", incluirPrueba: false };

/** Mayor m³ en juego primero; las que no se miden en m³ (null) al final, por gravedad. */
const PESO: Record<GravedadIncoherencia, number> = { error: 0, warning: 1, info: 2 };
export function ordenarPorM3(items: IncoherenciaPlanta[]): IncoherenciaPlanta[] {
  return [...items].sort((a, b) => {
    if (a.m3EnJuego == null && b.m3EnJuego == null) return PESO[a.gravedad] - PESO[b.gravedad];
    if (a.m3EnJuego == null) return 1;
    if (b.m3EnJuego == null) return -1;
    return b.m3EnJuego - a.m3EnJuego || PESO[a.gravedad] - PESO[b.gravedad];
  });
}

/** Incoherencias de todas las plantas con filtros (los aplica el servidor). */
export function useIncoherencias() {
  const [filtros, setFiltros] = useState<FiltrosIncoherencias>(INICIAL);
  const q = new URLSearchParams({ incluirPrueba: filtros.incluirPrueba ? "1" : "0" });
  if (filtros.gravedad) q.set("gravedad", filtros.gravedad);
  if (filtros.origen) q.set("origen", filtros.origen);
  if (filtros.tenantId) q.set("tenantId", filtros.tenantId);
  const carga = useCargaSuperadmin<IncoherenciasResponse>(`/api/superadmin/plantas/incoherencias?${q.toString()}`);

  // Nombre y slug de cada planta (para el filtro y para entrar a su libro): de
  // la lista, pedida DESPUÉS de las incoherencias para no calcular las dos a la
  // vez (la segunda sale de la memoria de 5 minutos del servidor).
  const lista = useCargaSuperadmin<PlantasListaResponse>(carga.data ? "/api/superadmin/plantas?incluirPrueba=1" : null);
  const plantas = useMemo(() => {
    const porId = new Map<string, { id: string; nombre: string; slug: string | null }>();
    for (const p of lista.data?.plantas ?? []) porId.set(p.identidad.tenantId, { id: p.identidad.tenantId, nombre: p.identidad.nombre, slug: p.identidad.slug });
    for (const it of carga.data?.items ?? []) if (!porId.has(it.tenantId)) porId.set(it.tenantId, { id: it.tenantId, nombre: it.plantaNombre, slug: null });
    return [...porId.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [lista.data, carga.data]);
  const slugDe = useCallback((tenantId: string) => plantas.find((p) => p.id === tenantId)?.slug ?? null, [plantas]);

  const items = useMemo(() => ordenarPorM3(carga.data?.items ?? []), [carga.data]);

  const cambiar = (parcial: Partial<FiltrosIncoherencias>) => setFiltros((f) => ({ ...f, ...parcial }));
  const limpiar = () => setFiltros(INICIAL);
  const hayFiltros = Boolean(filtros.gravedad || filtros.origen || filtros.tenantId);

  return { ...carga, items, plantas, slugDe, filtros, cambiar, limpiar, hayFiltros };
}
