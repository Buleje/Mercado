/**
 * Pieza `cierre-para-contador` — de lo que devuelven las rutas a las filas del
 * Excel. Puro (sin red, sin React): lo prueba un test.
 *
 * Regla de la pieza: ninguna cifra se calcula acá. Cada celda es un dato que
 * la base ya guarda (total de la venta, monto del gasto, IGV registrado); el
 * contador suma lo que quiera en su hoja.
 */
import { limaDateKey } from "@/lib/utils";
import { formatTime } from "@/lib/format";
import {
  ROTULO_GASTO,
  ROTULO_VENTA,
  type ColumnaGasto,
  type ColumnaVenta,
} from "./columnas";

export interface VentaApi {
  id: string | number;
  createdAt: string;
  total?: number;
  payment?: string;
  comprobanteTipo?: string;
  comprobanteRuc?: string;
  descuentoMonto?: number;
  cashierId?: string;
}

export interface GastoApi {
  id: string | number;
  date: string;
  category?: string;
  description?: string;
  amount?: number;
  paymentMethod?: string | null;
  supplierName?: string | null;
  supplierRuc?: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
  igvAmount?: number | null;
}

const num = (v: unknown): number | "" => (typeof v === "number" && Number.isFinite(v) ? v : "");
const txt = (v: unknown): string => (typeof v === "string" ? v : "");

/** Una celda de texto que Excel leería como fórmula se vuelve texto (cajero y descripción los escribe gente). */
export function celdaSegura(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

/**
 * Un gasto se guarda con la FECHA del día (`<input type="date">` → medianoche UTC), no con una
 * hora real. Mostrarlo en Lima lo correría un día atrás («01-09» saldría «31-08»): se lee el día
 * UTC, igual que el resto del panel (`formatDate(..., { soloFecha: true })`).
 */
function diaDelGasto(v: string): string {
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "";
}

/**
 * La consulta de gastos de un mes con los MISMOS bordes que la pestaña Gastos: días sin hora,
 * que `/api/expenses` toma como días UTC. Con bordes de Lima, un gasto del 01-09 (00:00 UTC)
 * quedaba en el Excel de agosto.
 */
export function consultaDeGastos(desde: string, hasta: string): string {
  return `from=${desde}&to=${hasta}`;
}

const VALOR_VENTA: Record<ColumnaVenta, (v: VentaApi) => string | number> = {
  fecha: (v) => limaDateKey(v.createdAt),
  hora: (v) => formatTime(v.createdAt),
  comprobante: (v) => txt(v.comprobanteTipo) || "ticket",
  ruc: (v) => celdaSegura(txt(v.comprobanteRuc)),
  pago: (v) => txt(v.payment),
  descuento: (v) => num(v.descuentoMonto),
  cajero: (v) => celdaSegura(txt(v.cashierId)),
  total: (v) => num(v.total),
};

const VALOR_GASTO: Record<ColumnaGasto, (g: GastoApi) => string | number> = {
  fecha: (g) => diaDelGasto(g.date),
  categoria: (g) => txt(g.category),
  descripcion: (g) => celdaSegura(txt(g.description)),
  proveedor: (g) => celdaSegura(txt(g.supplierName)),
  ruc: (g) => celdaSegura(txt(g.supplierRuc)),
  tipoDoc: (g) => txt(g.documentType),
  numeroDoc: (g) => celdaSegura(txt(g.documentNumber)),
  pago: (g) => txt(g.paymentMethod),
  igv: (g) => num(g.igvAmount),
  monto: (g) => num(g.amount),
};

/** Del más antiguo al más nuevo: las rutas devuelven lo último primero y un cierre se lee de arriba abajo. */
export function filasDeVentas(ventas: readonly VentaApi[], columnas: readonly ColumnaVenta[]): Record<string, unknown>[] {
  return [...ventas]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((v) => Object.fromEntries(columnas.map((c) => [ROTULO_VENTA[c], VALOR_VENTA[c](v)])));
}

export function filasDeGastos(gastos: readonly GastoApi[], columnas: readonly ColumnaGasto[]): Record<string, unknown>[] {
  return [...gastos]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((g) => Object.fromEntries(columnas.map((c) => [ROTULO_GASTO[c], VALOR_GASTO[c](g)])));
}

/** Primer y último día del mes `YYYY-MM` como `YYYY-MM-DD` (los dos formatos que entienden las rutas). */
export function rangoDelMes(mes: string): { desde: string; hasta: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) return null;
  const anio = Number(m[1]);
  const mm = Number(m[2]);
  if (mm < 1 || mm > 12) return null;
  const ultimo = new Date(Date.UTC(anio, mm, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

/** `cierre-2026-09-juan-perez`: sin tildes ni espacios, para que no rompa en ningún sistema. */
export function nombreDelArchivo(mes: string, contador: string): string {
  const quien = contador
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return quien ? `cierre-${mes}-${quien}` : `cierre-${mes}`;
}
