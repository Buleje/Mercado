"use client";

/**
 * use-filas-oficiales-del-reparto — el m³ oficial de cada fila especie × tipo
 * del lote cuando hay bloques de rolliza: el MISMO reparto que la Distribución
 * (vista «Por tipo», la de por defecto), donde cada permiso redondea sus filas
 * como su guía y la falta aparte. Las tablas de Resúmenes lo usan para decir lo
 * mismo que la Distribución (Brandon 2026-10-03: «Tablas 13,191, Distribución
 * 13,188; el real es el de la guía»). Sin bloques, `null`: las tablas redondean
 * el lote entero, que es lo mismo porque no hay permisos que separar.
 */
import { useMemo } from "react";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { distribuirPorCapacidad } from "@/lib/forestal/cubicacion-reparto";
import { repartoOficial } from "@/lib/forestal/reparto-oficial";
import { agruparPiezasIguales } from "@/lib/forestal/variado-desglose";
import type { VariadoDelLote } from "./use-config-variado";

export function useFilasOficialesDelReparto(
  rows: PiezaCubicada[],
  variado: Pick<VariadoDelLote, "bloques" | "des">,
  precioDe: Parameters<typeof distribuirPorCapacidad>[3],
): ReadonlyMap<string, number> | null {
  const { bloques, des } = variado;
  return useMemo(() => {
    if (bloques.length === 0) return null;
    /* Las mismas piezas que reparte la Distribución: el Variado abierto y las iguales juntas. */
    const piezas = des ? agruparPiezasIguales(des.piezas) : rows;
    return repartoOficial(distribuirPorCapacidad(bloques, piezas, "tipo", precioDe)).porFila;
  }, [bloques, des, rows, precioDe]);
}
