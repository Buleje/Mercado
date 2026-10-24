import type { ResumenSinControl } from "@/lib/adelantos/sin-control";

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
  /** Lo dado que quedó suelto (quieto, sin fecha o vencido). `null` = el servidor no pudo contarlo. */
  sinControl?: ResumenSinControl | null;
};

/** Plata por moneda (ADR-118): `{ PEN: 120, USD: 40 }`. */
export type PorMoneda = Record<string, number>;
