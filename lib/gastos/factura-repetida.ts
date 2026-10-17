/**
 * lib/gastos/factura-repetida.ts — ¿este comprobante ya se anotó como gasto?
 *
 * El mismo papel cargado dos veces (por dos personas, o una vez a mano y otra
 * desde la foto) duplica el gasto en Mi Plata y el crédito de IGV para el
 * contador. Al registrar, el servidor busca un gasto del mismo negocio con el
 * mismo RUC y la misma serie-número y, si lo hay, pregunta antes de guardar
 * (no bloquea: puede ser otro papel con el número mal escrito en el primero).
 *
 * Puro: lo usan la clase DB, la ruta y su test.
 */

import { formatCurrency } from "@/lib/format";
import { diaConNombre, diaDelGasto } from "@/lib/gastos/lista-gastos";

/**
 * La serie-número comparable: «f001 - 00000123», «F001-123» y «F001 123» son el
 * mismo papel (SUNAT numera el correlativo sin ceros a la izquierda). `null` si
 * no hay número.
 */
export function claveDeComprobante(numero: string | null | undefined): string | null {
  const limpio = String(numero ?? "").toUpperCase().replace(/\s*-\s*/g, "-").trim();
  if (!limpio) return null;
  const partes = limpio.split(/[-\s]+/).filter(Boolean);
  const correlativo = partes.pop() ?? "";
  const sinCeros = /^\d+$/.test(correlativo) ? String(Number(correlativo)) : correlativo;
  return [...partes, sinCeros].join("-");
}

/** El gasto que ya tiene ese comprobante, como lo devuelve el 409. */
export interface GastoConMismoComprobante {
  id: string;
  /** «YYYY-MM-DD» del día del gasto (el que la persona anotó). */
  dia: string;
  monto: number;
  descripcion: string;
  tipo: string | null;
}

const NOMBRE_DEL_PAPEL: Record<string, string> = { factura: "esta factura", boleta: "esta boleta", recibo: "este recibo", ticket: "este ticket" };

/** «Ya anotaste esta factura el jueves 03/10 por S/ 120.00 — ¿es otra?» */
export function avisoDeComprobanteRepetido(g: Pick<GastoConMismoComprobante, "dia" | "monto" | "tipo">): string {
  const papel = (g.tipo && NOMBRE_DEL_PAPEL[g.tipo]) || "este comprobante";
  return `Ya anotaste ${papel} el ${diaConNombre(g.dia)} por ${formatCurrency(g.monto)} — ¿es otra?`;
}

/** Fila de la base → lo que viaja en el 409. */
export function gastoConMismoComprobante(fila: {
  id: string;
  date: Date | string;
  amount: unknown;
  description: string | null;
  documentType: string | null;
}): GastoConMismoComprobante {
  return {
    id: fila.id,
    dia: diaDelGasto(fila.date),
    monto: Number(fila.amount) || 0,
    descripcion: fila.description ?? "",
    tipo: fila.documentType,
  };
}
