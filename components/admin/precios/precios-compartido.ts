import { formatDateTime } from "@/lib/format";

export type PriceRecord = {
  id: string;
  productId: number;
  oldPrice: number;
  newPrice: number;
  changedAt: string;
  changedBy?: string;
};

export type Sentido = "" | "subio" | "bajo";

export interface FiltrosPrecios {
  search: string;
  producto: string;
  desde: string;
  hasta: string;
  sentido: Sentido;
}

export const FILTROS_VACIOS: FiltrosPrecios = { search: "", producto: "", desde: "", hasta: "", sentido: "" };

/** Cuántas filas se ven de entrada; «Ver todos» muestra el resto. */
export const FILAS_VISIBLES = 15;

export function fmtFecha(iso: string): string {
  try {
    return formatDateTime(iso);
  } catch {
    return iso;
  }
}

/** Variación porcentual del cambio (null si el precio anterior era 0). */
export function variacionPct(h: PriceRecord): number | null {
  return h.oldPrice > 0 ? ((h.newPrice - h.oldPrice) / h.oldPrice) * 100 : null;
}
