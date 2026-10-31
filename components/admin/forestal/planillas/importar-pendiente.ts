/**
 * «Importar foto llenada» desde una tarjeta de Planillas de campo (17-10).
 *
 * La tarjeta no abre el importador: lo abre la pantalla dueña de esas filas
 * (el cubicador, Producción del libro CTP, el censo del LO-TH), que es la que
 * sabe a qué lote o a qué plan van. Para eso la tarjeta deja un pedido de una
 * sola vez en `sessionStorage` y navega; el destino lo toma al montar, abre su
 * importador con la planilla ya elegida y lo borra.
 *
 * Mismo patrón que `TOOL_ONCE_KEY` de Herramientas, con dos cuidados:
 *   · se toma en un EFECTO, nunca en el initializer de un `useState` (en dev
 *     React lo corre dos veces y el salto se perdía, bug del 2026-09-08);
 *   · vence a los 2 minutos: si el destino no llegó a montarse (sin plan de
 *     manejo, sin permiso) el pedido no aparece horas después por sorpresa.
 */
import { useEffect, useRef } from "react";
import type { FormulaTrozas } from "@/lib/forestal/cubicacion-trozas-formula";
import type { DestinoPlanilla, PlanillaId } from "@/lib/forestal/planillas/tipos";

const CLAVE = "forestal:planilla-a-importar";
const VIGENCIA_MS = 2 * 60_000;

export function pedirImportarFoto(id: PlanillaId): void {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify({ id, en: Date.now() }));
  } catch {
    /* sin sessionStorage el destino abre igual; sólo no llega la planilla elegida */
  }
}

/** Devuelve (y borra) el pedido si es para alguna de `ids`. */
export function tomarImportarFoto(ids: readonly string[]): PlanillaId | null {
  try {
    const raw = sessionStorage.getItem(CLAVE);
    if (!raw) return null;
    const p = JSON.parse(raw) as { id?: unknown; en?: unknown };
    if (typeof p.en !== "number" || Date.now() - p.en > VIGENCIA_MS) {
      sessionStorage.removeItem(CLAVE);
      return null;
    }
    if (typeof p.id !== "string" || !ids.includes(p.id)) return null;
    sessionStorage.removeItem(CLAVE);
    return p.id as PlanillaId;
  } catch {
    return null;
  }
}

/**
 * El destino escucha su pedido. `listo` deja esperar a que la pantalla tenga
 * dónde abrir el importador (el censo necesita su plan cargado).
 */
export function useImportarFotoPendiente(
  ids: readonly PlanillaId[],
  onPedido: (id: PlanillaId) => void,
  listo = true,
): void {
  const cb = useRef(onPedido);
  useEffect(() => {
    cb.current = onPedido;
  });
  const clave = ids.join(",");
  useEffect(() => {
    if (!listo) return;
    const id = tomarImportarFoto(clave.split(","));
    if (id) cb.current(id);
  }, [clave, listo]);
}

/** A dónde lleva «Importar foto llenada», por destino. */
export type IrAlImportador =
  | { tipo: "vista"; vista: "cubicador" | "trozas" }
  | { tipo: "enlace"; href: string; permiso: string; donde: string }
  | { tipo: "sin-importador"; href: string; donde: string };

export const IR_AL_IMPORTADOR: Record<DestinoPlanilla, IrAlImportador> = {
  "cubicador-madera": { tipo: "vista", vista: "cubicador" },
  "cubicador-trozas": { tipo: "vista", vista: "trozas" },
  "partes-produccion": {
    tipo: "enlace",
    href: "/admin?tab=ctp-libro-operaciones&vista=produccion",
    permiso: "ctp-libro-operaciones",
    donde: "Libro CTP › Producción › Cargar el parte de turno",
  },
  "censo-loth": {
    tipo: "enlace",
    href: "/admin?tab=loth-libro-operaciones&vista=plan",
    permiso: "loth-libro-operaciones",
    donde: "Libro TH › Plan de manejo › Censo › Importar censo",
  },
  /* El conteo de patio se hace con el celular (etiquetas y acta): no tiene
     importador de filas. La hoja impresa es el respaldo en papel. */
  "conteo-patio": { tipo: "sin-importador", href: "/admin/patio?contar=1", donde: "el modo patio del celular" },
};

/** La fórmula del lote de trozas que pide cada planilla de rolliza (otra fórmula = otro lote). */
export const FORMULA_DE_PLANILLA: Partial<Record<PlanillaId, FormulaTrozas>> = {
  "rolliza-smalian": "smalian",
  "rolliza-oxapampa": "oxapampina",
};
