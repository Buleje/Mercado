/**
 * Tipos de «Recibir la orden» (`OCRecepcionModal`) y de sus tres pasos.
 * Salieron del modal el 17-10 para dejarlo bajo las 300 líneas; sin cambios de lógica.
 */
import { pideLote } from "@/lib/compras/lotes-recepcion";
import type { ConformidadServicio } from "@/lib/compras/conformidad-recepcion";

export type OCItem = {
  productId: number;
  name: string;
  quantity: number;
  unitCost: number;
  unit: string;
};

/** Los mismos estados que acepta el endpoint y que ya usa Recepción. */
export type CondicionItem = "ok" | "dañado" | "vencido" | "faltante";

export const CONDICIONES: Array<{ v: CondicionItem; l: string }> = [
  { v: "ok", l: "Bien" },
  { v: "dañado", l: "Dañado" },
  { v: "vencido", l: "Vencido" },
];

export type ReceivedItem = {
  productId: number;
  name: string;
  /** Lo que se espera en ESTE viaje: lo pedido menos lo que ya llegó o no llegará. */
  orderedQty: number;
  /** Lo que llegó en recepciones anteriores y lo pedido en la orden (para «ya llegó X de Y»). */
  yaLlego: number;
  pedidoTotal: number;
  receivedQty: number;
  unitPrice: number;
  originalPrice: number;
  unit: string;
  noLlego: boolean;
  /** Cómo llegó la mercadería. Lo dañado y lo vencido no entra a stock vendible. */
  condition: CondicionItem;
  /** «Vence» (YYYY-MM-DD): con fecha, lo que entra a stock nace como lote. */
  expiryDate?: string;
  lote?: string;
  /** C20 · De lo que llegó bien: apartado para revisar y rechazado (no entran a stock vendible). */
  enRevision?: number;
  rechazado?: number;
  motivoRevision?: string;
} & ConformidadServicio;

/** La fecha y el lote viajan solo si la línea entra a stock: la merma no vence. */
export function conVence(i: ReceivedItem): boolean {
  return !i.noLlego && pideLote(i);
}
