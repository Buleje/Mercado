/**
 * Cómo se gestiona un fiado: en qué tramo cae y qué se hizo con él.
 *
 * Mismo concepto que la cobranza de Adelantos (tramos de atraso 30/60/90,
 * tipos de gestión) — se REUSAN esas constantes desde `lib/adelantos/
 * gestion-cobranza.ts` en vez de duplicarlas, para que un ajuste a los
 * cortes no pueda quedar aplicado en un módulo y olvidado en el otro. Lo
 * que sí es propio de Fiados es la CLAVE: acá se agrupa por `customerId`
 * (el cliente), no por `beneficiarioId`.
 */

import {
  TRAMOS,
  tramoDe,
  etiquetaTramo,
  TIPOS_GESTION,
  etiquetaGestion,
  avanceDeMeta,
  type TramoId,
  type TipoGestion,
  type AvanceMeta,
} from "@/lib/adelantos/gestion-cobranza";
import { limaDateKey } from "@/lib/utils";

export { TRAMOS, tramoDe, etiquetaTramo, TIPOS_GESTION, etiquetaGestion, avanceDeMeta };
export type { TramoId, TipoGestion, AvanceMeta };

const DIA = 86_400_000;

/**
 * `YYYY-MM-DD` del día de Lima, o «» si la fecha no sirve. Una fecha elegida en
 * un calendario (vencimiento, promesa) puede llegar como medianoche UTC: ésa se
 * lee tal cual, porque pasada a Lima caería el día anterior. Un momento (un
 * cobro, una promesa anotada a mediodía) se pasa a Lima.
 */
export function diaDe(fecha: string | null | undefined): string {
  if (!fecha) return "";
  if (/T00:00:00(\.000)?Z$/.test(fecha) || /^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha.slice(0, 10);
  return limaDateKey(fecha);
}

/** Días entre dos claves `YYYY-MM-DD` (positivo = `b` es después de `a`). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DIA);
}

export type Gestion = {
  id: string;
  customerId: string;
  fecha: string;
  tipo: string;
  nota?: string | null;
  fechaPrometida?: string | null;
  montoPrometido?: number | null;
  usuario?: string | null;
};

/** La última gestión de cada cliente, indexada para pintar la fila. */
export function ultimaGestionPorCliente(gestiones: readonly Gestion[]): Map<string, Gestion> {
  const out = new Map<string, Gestion>();
  for (const g of gestiones) {
    const previa = out.get(g.customerId);
    if (!previa || g.fecha > previa.fecha) out.set(g.customerId, g);
  }
  return out;
}

export type EstadoPromesa = "sin-promesa" | "prometio" | "vence-hoy" | "incumplio";

export type PromesaVigente = {
  gestion: Gestion;
  estado: Exclude<EstadoPromesa, "sin-promesa">;
  /** Días hasta la fecha prometida. Negativo = ya pasó. */
  faltan: number;
};

/**
 * La promesa que todavía cuenta, por cliente — sólo la MÁS RECIENTE (ver
 * misma regla en el original de Adelantos).
 *
 * «Hoy» y el día prometido son días de Lima (10-10): con la hora del navegador
 * una promesa guardada a medianoche UTC caía el día anterior y la de hoy salía
 * «no cumplió», mientras «Por vencer» la ponía en «Hoy».
 */
export function promesasVigentes(gestiones: readonly Gestion[], ahora: number = Date.now()): Map<string, PromesaVigente> {
  const hoy = limaDateKey(ahora);

  const ultimaPorCliente = new Map<string, Gestion>();
  for (const g of gestiones) {
    if (g.tipo !== "PROMESA" || !diaDe(g.fechaPrometida)) continue;
    const previa = ultimaPorCliente.get(g.customerId);
    if (!previa || g.fecha > previa.fecha) ultimaPorCliente.set(g.customerId, g);
  }

  const out = new Map<string, PromesaVigente>();
  for (const [id, g] of ultimaPorCliente) {
    const faltan = diasEntre(hoy, diaDe(g.fechaPrometida));
    out.set(id, {
      gestion: g,
      faltan,
      estado: faltan > 0 ? "prometio" : faltan === 0 ? "vence-hoy" : "incumplio",
    });
  }
  return out;
}

/** Cuánto hace que no se toca a alguien. `null` = nunca se lo gestionó. */
export function diasSinGestion(ultima: Gestion | undefined, ahora: number = Date.now()): number | null {
  if (!ultima) return null;
  return Math.floor((ahora - new Date(ultima.fecha).getTime()) / DIA);
}
