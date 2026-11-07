/**
 * Vistas de «Mis clientes» (M07, 17-10): la búsqueda, los filtros de arriba
 * de la tabla y el orden de las columnas con un nombre. Primera pantalla
 * fuera de Pedidos con el menú genérico (`useVistasGuardadas`).
 */

import type { Rango } from "@/lib/admin/filtros-columna";
import type { VistaDelSistema } from "@/lib/admin/vistas-guardadas";
import type { Frecuencia, Segment } from "./crm-compartido";

export interface EstadoCrm {
  busqueda: string;
  frecuencia: Frecuencia[];
  credito: Rango<number>;
  segmentos: Segment[];
  etiquetas: string[];
  /** El orden de las columnas si lo cambiaste; `null` = el de fábrica. */
  columnas: string[] | null;
}

export const ESTADO_ESTANDAR_CRM: EstadoCrm = {
  busqueda: "",
  frecuencia: [],
  credito: { min: null, max: null },
  segmentos: [],
  etiquetas: [],
  columnas: null,
};

export const VISTAS_DEL_SISTEMA_CRM: readonly VistaDelSistema<EstadoCrm>[] = [
  { id: "estandar", nombre: "Estándar", ayuda: "Todos tus clientes, el que más gastó arriba", estado: ESTADO_ESTANDAR_CRM },
  /* «Con deuda» escribe { min: 0,01 }, igual que el filtro de la tabla. */
  { id: "con-deuda", nombre: "Con deuda", ayuda: "Los que te deben algo", estado: { ...ESTADO_ESTANDAR_CRM, credito: { min: 0.01, max: null } } },
  { id: "frecuentes", nombre: "Frecuentes", ayuda: "Los que compran 5 veces o más", estado: { ...ESTADO_ESTANDAR_CRM, segmentos: ["frecuente"] } },
  { id: "perdidos", nombre: "Para recuperar", ayuda: "Más de 90 días sin comprar: a quién escribirle", estado: { ...ESTADO_ESTANDAR_CRM, segmentos: ["perdido"] } },
];

const esListaDeTexto = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const esCifra = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v));

export function esEstadoCrm(e: unknown): e is EstadoCrm {
  if (typeof e !== "object" || e === null) return false;
  const c = e as Record<string, unknown>;
  const credito = c.credito as Record<string, unknown> | null;
  return (
    typeof c.busqueda === "string" &&
    esListaDeTexto(c.frecuencia) &&
    typeof credito === "object" && credito !== null && esCifra(credito.min) && esCifra(credito.max) &&
    esListaDeTexto(c.segmentos) &&
    esListaDeTexto(c.etiquetas) &&
    (c.columnas === null || esListaDeTexto(c.columnas))
  );
}

/** Dos estados son la misma vista aunque los filtros se hayan marcado en otro orden. */
export function firmaCrm(e: EstadoCrm): string {
  const orden = (l: readonly string[]) => [...l].sort().join(",");
  return [
    e.busqueda.trim().toLowerCase(),
    orden(e.frecuencia),
    `${e.credito.min ?? ""}~${e.credito.max ?? ""}`,
    orden(e.segmentos),
    orden(e.etiquetas),
    e.columnas?.join(",") ?? "",
  ].join("|");
}
