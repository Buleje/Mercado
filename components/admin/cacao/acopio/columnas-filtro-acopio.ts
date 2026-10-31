import { formatDate } from "@/lib/format";

export interface Lote {
  id: string;
  loteCode: string;
  fecha: string;
  productorId: string | null;
  productorNombre: string | null;
  parcelaCodigo: string | null;
  variedad: string | null;
  tipoGrano: string;
  pesoKg: string;
  humedadPct: string | null;
  precioPorKg: string | null;
  totalPagado: string | null;
  montoPagado: string | null;
  estadoPago: string;
  indiceFermentacion: string | null;
  grado: string | null;
  status: string;
  annulledReason: string | null;
}

/** Saldo que aún se le debe al productor por un lote (liquidación − abonado). */
export const saldoDe = (l: Lote) => Math.max(0, Number(l.totalPagado ?? 0) - Number(l.montoPagado ?? 0));
export const tienePendiente = (l: Lote) => l.estadoPago !== "pagado" && saldoDe(l) > 0;

/** Filtros rápidos client-side sobre los lotes ya cargados. «Grado I» y
 *  «Variedad» vivían acá Y en el panel «Filtros» de abajo (dos controles para
 *  el mismo dato) — ahora es sólo el autofiltro de su propia columna. */
export type Quick = "todos" | "saldo" | "sin_vincular" | "humedo";
export type SortKey = "fecha" | "pesoKg" | "totalPagado";
export const QUICK_CHIPS: { key: Quick; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "saldo", label: "Con saldo" },
  { key: "sin_vincular", label: "Sin vincular" },
  { key: "humedo", label: "Húmedo" },
];
/** Bucket para lotes sin grado evaluado — un valor real de columna, no "todos". */
export const SIN_GRADO = "__sin_grado__";

export const fdate = (iso: string) => {
  try {
    return formatDate(iso, { soloFecha: true });
  } catch {
    return iso;
  }
};
export const n2 = (v: string | number | null) => (v == null ? "—" : Number(v).toFixed(2));
