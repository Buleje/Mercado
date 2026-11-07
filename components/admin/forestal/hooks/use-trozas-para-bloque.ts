"use client";

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { BloqueDistribuido } from "@/lib/forestal/cubicacion-reparto";
import type { SeleccionDeTrozas } from "@/lib/forestal/trozas-para-bloque";

/**
 * use-trozas-para-bloque — pide al servidor qué trozas del grupo ampara de
 * verdad un bloque (ADR-519, fase 1). Sólo lectura: guardar lo elegido es
 * cosa del bloque (`trozasElegidas`), no de este hook.
 *
 * El servidor relee las trozas (llegada, mes cerrado, otro lote, especie) y
 * corre la MISMA función pura que se podría correr acá; se le pregunta a él
 * porque la pantalla no sabe qué trozas siguen libres en el patio.
 */

const URL = "/api/admin/forestal/distribuciones/trozas-para-bloque";
const MAX_MEDIDAS = 2000;

export interface TrozaLeida {
  id: string;
  codigo: string | null;
  volumenM3: number;
  llegaISO: string | null;
  porRecepcionar: boolean;
  motivo: string | null;
}

export interface PropuestaDeTrozas {
  seleccion: SeleccionDeTrozas;
  trozas: TrozaLeida[];
  noEncontradas: string[];
  /** Consumidas por los días que el bloque ya escribió: cuentan como elegidas y no se sueltan. */
  yaEnElLibro: string[];
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Lo que el endpoint necesita del bloque, armado desde lo que ya se ve. Los
 * días ya escritos en el Libro no se piden (sus trozas vuelven por
 * `corridaIds`), y el m³ de cada día es el de SUS grupos, igual que en el plan
 * del Libro: así la propuesta reparte lo mismo que se va a registrar.
 */
export function pedidoDeTrozas(bd: BloqueDistribuido, distribucionId: string | null) {
  const b = bd.bloque;
  const escritos = new Set((b.jornadasLibro ?? []).map((j) => j.dia));
  const porDia = bd.porDia
    .filter((d) => !escritos.has(d.dia))
    .map((d) => ({ dia: d.dia, m3: d.piezas > 0 && d.grupos.length > 0 ? r4(d.grupos.reduce((a, g) => a + g.m3, 0)) : 0 }));
  return {
    bloqueId: b.id,
    distribucionId,
    especie: b.especie ?? "",
    permiso: b.permiso ?? null,
    trozaIds: b.trozaIds ?? [],
    usadoM3: r4(porDia.reduce((a, d) => a + d.m3, 0)),
    aprovechablePct: bd.aprovechablePct,
    porDia,
    corridaIds: [...new Set((b.jornadasLibro ?? []).map((j) => j.corridaId).filter(Boolean))].slice(0, 366),
    /* El endpoint sólo acepta AAAA-MM-DD: una fecha a medio escribir no tumba el pedido. */
    fecha: b.fecha && /^\d{4}-\d{2}-\d{2}$/.test(b.fecha) ? b.fecha : null,
    loteId: b.loteId ?? null,
    ignorarMedidas: b.ignorarMedidas ?? null,
    medidas: bd.asignado
      .flatMap((g) => g.medidas)
      .slice(0, MAX_MEDIDAS)
      .map((m) => ({
        medida: m.medida,
        espesor: m.espesor,
        ancho: m.ancho,
        largo: m.largo,
        uEspesor: m.uEspesor,
        uAncho: m.uAncho,
        uLargo: m.uLargo,
        piezas: m.piezas,
      })),
  };
}

async function pedir(body: unknown, signal: AbortSignal): Promise<PropuestaDeTrozas> {
  const r = await fetch(URL, {
    method: "POST",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify(body),
    signal,
  });
  const json = (await r.json().catch(() => null)) as (Partial<PropuestaDeTrozas> & { message?: string; error?: string }) | null;
  if (!r.ok || !json?.seleccion) {
    throw new Error(json?.message ?? (json?.error ? `El servidor respondió: ${json.error}` : `El servidor respondió ${r.status}`));
  }
  return {
    seleccion: json.seleccion,
    trozas: json.trozas ?? [],
    noEncontradas: json.noEncontradas ?? [],
    yaEnElLibro: json.yaEnElLibro ?? [],
  };
}

/**
 * `activo` = el panel está abierto: no se pide nada por cada bloque al montar
 * la tabla (una distribución trae decenas).
 */
export function useTrozasParaBloque(bd: BloqueDistribuido, distribucionId: string | null, activo: boolean) {
  const [datos, setDatos] = useState<PropuestaDeTrozas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  /* La firma del pedido: si no cambió lo que se manda, no se vuelve a pedir. */
  const body = activo && (bd.bloque.trozaIds ?? []).length > 0 ? pedidoDeTrozas(bd, distribucionId) : null;
  const firma = body ? JSON.stringify(body) : "";

  useEffect(() => {
    if (!firma) return;
    const actual: unknown = JSON.parse(firma);
    const ctrl = new AbortController();
    setCargando(true);
    setError(null);
    pedir(actual, ctrl.signal)
      .then(setDatos)
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setCargando(false);
      });
    return () => ctrl.abort();
  }, [firma, vuelta]);

  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  return { datos, error, cargando, recargar };
}
