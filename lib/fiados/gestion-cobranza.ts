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

export { TRAMOS, tramoDe, etiquetaTramo, TIPOS_GESTION, etiquetaGestion, avanceDeMeta };
export type { TramoId, TipoGestion, AvanceMeta };

const DIA = 86_400_000;

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
 */
export function promesasVigentes(gestiones: readonly Gestion[], ahora: number = Date.now()): Map<string, PromesaVigente> {
  const hoy = new Date(ahora);
  hoy.setHours(0, 0, 0, 0);

  const ultimaPorCliente = new Map<string, Gestion>();
  for (const g of gestiones) {
    if (g.tipo !== "PROMESA" || !g.fechaPrometida) continue;
    const previa = ultimaPorCliente.get(g.customerId);
    if (!previa || g.fecha > previa.fecha) ultimaPorCliente.set(g.customerId, g);
  }

  const out = new Map<string, PromesaVigente>();
  for (const [id, g] of ultimaPorCliente) {
    const dia = new Date(g.fechaPrometida!);
    dia.setHours(0, 0, 0, 0);
    const faltan = Math.round((dia.getTime() - hoy.getTime()) / DIA);
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

/**
 * Lo cobrado dentro del mes en curso, mirando las cuotas una por una.
 *
 * Fiados es soles-only (sin `moneda` en el schema) — a diferencia de
 * Adelantos no hace falta partir por moneda; devuelve un número directo.
 */
export function recuperadoDelMes(
  fiados: readonly { cuotas: readonly { pagadoEn?: string | null; monto: number }[] }[],
  ahora: number = Date.now(),
): number {
  const hoy = new Date(ahora);
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).getTime();
  let total = 0;
  for (const f of fiados) {
    for (const c of f.cuotas) {
      if (!c.pagadoEn) continue;
      const t = new Date(c.pagadoEn).getTime();
      if (t >= desde && t <= ahora) total += c.monto;
    }
  }
  return Math.round(total * 100) / 100;
}
