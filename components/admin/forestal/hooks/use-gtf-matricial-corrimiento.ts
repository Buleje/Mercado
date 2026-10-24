"use client";

/**
 * El corrimiento de toda la hoja (X/Y que la matricial corre junto): una sola
 * lógica para el panel de la impresora y la ventana «Posición de cada campo».
 * Oficina = el X/Y guardado con el talonario (`offsetXMm/offsetYMm` de la
 * hoja, entra en deshacer); otra impresora = su propio corrimiento.
 */

import { PERFIL_OFICINA_ID } from "@/lib/forestal/gtf-salida-tipos";
import type { EstadoGtfMatricial } from "./use-gtf-matricial";
import type { EstadoPerfilesTalonario } from "./use-gtf-matricial-perfiles";

/** El corrimiento corrige el papel, no lo reubica: más de 5 cm es un tipeo (lo exige el schema). */
export const CORRIMIENTO_MIN_MM = -50;
export const CORRIMIENTO_MAX_MM = 50;

export interface CorrimientoTalonario {
  /** Oficina corre con el X/Y de la hoja; las demás, con el suyo. */
  oficina: boolean;
  impresora: string;
  x: number;
  y: number;
  fijarX: (v: number) => void;
  fijarY: (v: number) => void;
}

export function useCorrimientoTalonario(t: EstadoGtfMatricial, imp: EstadoPerfilesTalonario): CorrimientoTalonario {
  const p = imp.elegido;
  const hoja = t.hoja;
  if (!p || p.id === PERFIL_OFICINA_ID) {
    return {
      oficina: true,
      impresora: p?.nombre ?? "Oficina",
      x: hoja?.offsetXMm ?? 0,
      y: hoja?.offsetYMm ?? 0,
      fijarX: (v) => t.cambiarHoja({ offsetXMm: v }),
      fijarY: (v) => t.cambiarHoja({ offsetYMm: v }),
    };
  }
  return {
    oficina: false,
    impresora: p.nombre,
    x: p.corrimientoXmm,
    y: p.corrimientoYmm,
    fijarX: (v) => imp.calibrar(p.id, { corrimientoXmm: v }),
    fijarY: (v) => imp.calibrar(p.id, { corrimientoYmm: v }),
  };
}
