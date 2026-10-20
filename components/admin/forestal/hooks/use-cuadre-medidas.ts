"use client";

/**
 * Junta de dónde salen las medidas de las trozas —el patio y los lotes del
 * Libro (ya cargados por `useLotesAserrio`) y el cubicador de trozas del
 * navegador— y corre `cuadrarMedidasDelReparto` sobre la distribución.
 */

import { useEffect, useMemo, useState } from "react";
import type { Distribucion } from "@/lib/forestal/cubicacion-reparto";
import { cuadrarMedidasDelReparto, type FuentesDeTrozas, type TrozaConOrigen } from "@/lib/forestal/cuadre-medidas-rolliza";
import { claveLoteTrozas } from "@/lib/forestal/cubicacion-trozas-formula";
import type { EstadoLotesAserrio } from "./use-lotes-aserrio";

type Cubicador = FuentesDeTrozas["cubicador"];

/** El lote Smalian del cubicador de trozas (Ø en cm, largo en m): el mismo que lee «Traer del cubicador de trozas». */
function leerCubicador(): Cubicador {
  try {
    const slug = localStorage.getItem("active-tenant-slug") ?? "main";
    const v: unknown = JSON.parse(localStorage.getItem(claveLoteTrozas(slug, "smalian")) ?? "[]");
    if (!Array.isArray(v)) return [];
    return v
      .map((r) => r as { especie?: unknown; d1?: unknown; d2?: unknown; largo?: unknown })
      .map((r) => ({ especie: typeof r.especie === "string" ? r.especie : undefined, d1: Number(r.d1), d2: Number(r.d2), largo: Number(r.largo) }))
      .filter((r) => r.d1 > 0 || r.largo > 0);
  } catch {
    return [];
  }
}

export function useCuadreMedidas(dist: Distribucion, estado: Pick<EstadoLotesAserrio, "lotes" | "trozas" | "cargando">) {
  const [cubicador, setCubicador] = useState<Cubicador>([]);
  useEffect(() => {
    const releer = () => setCubicador(leerCubicador());
    releer();
    window.addEventListener("storage", releer);
    return () => window.removeEventListener("storage", releer);
  }, []);

  const fuentes = useMemo<FuentesDeTrozas>(() => {
    const deLotes: TrozaConOrigen[] = estado.lotes.flatMap((l) => l.trozas.map((t) => ({ ...t, permiso: t.permiso ?? l.permiso ?? null })));
    return {
      libro: [...estado.trozas, ...deLotes],
      lotes: new Map(estado.lotes.map((l) => [l.id, { code: l.code, trozas: l.trozas }])),
      cubicador,
    };
  }, [estado.lotes, estado.trozas, cubicador]);

  const cuadre = useMemo(() => cuadrarMedidasDelReparto(dist, fuentes), [dist, fuentes]);
  return { cuadre, cargando: estado.cargando };
}

export type CuadreMedidasEstado = ReturnType<typeof useCuadreMedidas>;
