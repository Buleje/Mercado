"use client";

/**
 * Junta de dónde salen las medidas de las trozas —el patio y los lotes del
 * Libro (ya cargados por `useLotesAserrio`) y el cubicador de trozas del
 * navegador— y corre `cuadrarMedidasDelReparto` sobre la distribución.
 */

import { useEffect, useMemo, useState } from "react";
import { esAserradaDirecta, MAX_TROZAS_POR_BLOQUE, type BloqueRolliza, type Distribucion } from "@/lib/forestal/cubicacion-reparto";
import { cuadrarMedidasDelReparto, trozasDeLasFuentes, type FuentesDeTrozas, type TrozaConOrigen } from "@/lib/forestal/cuadre-medidas-rolliza";
import { medidaDeTroza, type TrozaMedida } from "@/lib/forestal/medida-cabe-en-troza";
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

/**
 * ADR-505: una hoja de antes del 20-10 no guardó las medidas de sus trozas.
 * Se completan UNA vez, desde las mismas fuentes que mira el cuadre; desde ahí
 * viajan con el bloque. `null` = no hay nada que completar.
 *
 * Una hoja que ya escribió jornadas en el Libro (`jornadasLibro`/`corridaIds`
 * en algún bloque) NO cambia sola al abrirla: lo completado entra con
 * «sin respetar medidas» y el reparto queda idéntico al registrado. El
 * operario lo prende desde «Ver antes/después», viendo qué se movería.
 */
export function completarMedidas(bloques: readonly BloqueRolliza[], f: FuentesDeTrozas): BloqueRolliza[] | null {
  const yaRegistrada = bloques.some((b) => (b.jornadasLibro?.length ?? 0) > 0 || (b.corridaIds?.length ?? 0) > 0);
  let cambio = false;
  const next = bloques.map((b) => {
    if (esAserradaDirecta(b) || (b.trozasMedidas?.length ?? 0) > 0) return b;
    const copia = trozasDeLasFuentes(b, f).trozas.flatMap((t) => {
      const m = medidaDeTroza(t);
      return m ? [m] : [];
    });
    if (copia.length === 0 || copia.length > MAX_TROZAS_POR_BLOQUE) return b;
    cambio = true;
    return { ...b, trozasMedidas: copia as TrozaMedida[], ...(yaRegistrada ? { ignorarMedidas: true } : {}) };
  });
  return cambio ? next : null;
}

export function useCuadreMedidas(
  dist: Distribucion,
  estado: Pick<EstadoLotesAserrio, "lotes" | "trozas" | "cargando">,
  completar?: { bloques: BloqueRolliza[]; guardar: (next: BloqueRolliza[]) => void },
) {
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

  /* Con el Libro todavía cargando, las fuentes están a medias: se espera. */
  const bloquesACompletar = completar?.bloques;
  const guardarCompletos = completar?.guardar;
  useEffect(() => {
    if (estado.cargando || !bloquesACompletar || !guardarCompletos) return;
    const next = completarMedidas(bloquesACompletar, fuentes);
    if (next) guardarCompletos(next);
  }, [estado.cargando, bloquesACompletar, guardarCompletos, fuentes]);

  const cuadre = useMemo(() => cuadrarMedidasDelReparto(dist, fuentes), [dist, fuentes]);
  return { cuadre, cargando: estado.cargando, fuentes };
}

export type CuadreMedidasEstado = ReturnType<typeof useCuadreMedidas>;
