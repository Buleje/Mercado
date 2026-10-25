import type { HoyToca } from "@/lib/db/adelantos-hoy-toca.db";

/** Lo que devuelve `/api/adelantos/resumen` (lo lee el módulo y lo dibuja el Resumen). */
export type Resumen = {
  totalAdelantado: number;
  totalLiquidado: number;
  saldoPendiente: number;
  excedente: number;
  adelantosAbiertos: number;
  adelantosLiquidados: number;
  beneficiarios: number;
  /**
   * La plata RECIBIDA (ADR-448): los campos de arriba siguen contando sólo lo
   * que diste. Ausente = el servidor todavía no sabe de direcciones.
   */
  recibido?: { abiertos: number; porMoneda: { moneda: string; total: number; porDevolver: number; excedente: number; abiertos: number }[] };
  /** Las cuatro cifras y las tareas de hoy (25-10). `null` = el servidor no pudo contarlo. */
  hoyToca?: HoyToca | null;
};

/** Plata por moneda (ADR-118): `{ PEN: 120, USD: 40 }`. */
export type PorMoneda = Record<string, number>;
