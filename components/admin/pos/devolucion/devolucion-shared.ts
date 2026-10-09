import { formatCurrency, formatDateTimeShort } from "@/lib/format";
import { extractIgv } from "@/lib/tax";

/** Tipos, motivos y formato de la devolución del POS (partido de POSReturnModal, 09-10). */

export interface SaleItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  unit: string;
}

export interface SaleRecord {
  id: string;
  createdAt: string;
  total: number;
  payment: string;
  customerPhone?: string;
  customerName?: string;
  items: SaleItem[];
}

export interface ReturnItem {
  productId: number;
  name: string;
  price: number;
  maxQty: number;
  returnQty: number;
  selected: boolean;
}

export const MOTIVOS = [
  "Defectuoso",
  "Error de cobro",
  "Cliente cambió de opinión",
  "Producto equivocado",
  "Otro",
];

export function fmt(n: number) { return `${formatCurrency(n)}`; }
export function fmtDate(s: string) {
  try { return formatDateTimeShort(s); }
  catch { return s; }
}

/** Ventas que revisa la búsqueda (las más recientes; un cajero ve sólo las suyas). */
export const VENTAS_A_REVISAR = 300;

/**
 * ¿La venta coincide con lo escrito? El GET /api/sales todavía ignora `search`: sin este filtro,
 * «Buscar» devolvía las últimas 20 ventas de cualquier día, coincidieran o no.
 */
export function coincideVenta(sale: SaleRecord, consulta: string): boolean {
  const q = consulta.trim().toLowerCase().replace(/^#/, "");
  if (!q) return true;
  return (
    sale.id.toLowerCase().includes(q) ||
    (sale.customerName ?? "").toLowerCase().includes(q) ||
    (sale.customerPhone ?? "").includes(q) ||
    (sale.items ?? []).some((i) => i.name.toLowerCase().includes(q))
  );
}

/** Cuerpo de POST /api/notas-credito: mismas claves que su Zod (`motivoCodigo`, `motivoDesc`, `saleId`). */
export interface CuerpoNotaCredito {
  saleId: string;
  motivoCodigo: "06" | "07";
  motivoDesc: string;
  monto: number;
}

/**
 * La NC de lo devuelto. Antes se mandaba `orderId`/`codigoMotivo`/`descripcionMotivo`: el Zod lo
 * rechazaba siempre (0 NC en toda la base) y `orderId` saltaba el tope por venta, que sólo mira `saleId`.
 * `monto` es la BASE sin IGV (el servidor le suma 18 %, como en Notas de crédito): el POS cobra con
 * IGV incluido, así que se le quita antes para que el total de la NC sea lo devuelto.
 * SUNAT: 06 = devolución total, 07 = devolución por ítem.
 */
export function cuerpoNotaCredito(saleId: string, items: ReturnItem[], devueltoConIgv: number): CuerpoNotaCredito {
  const devueltos = items.filter((i) => i.selected && i.returnQty > 0);
  const todo = items.length > 0 && items.every((i) => i.selected && i.returnQty === i.maxQty);
  const detalle = devueltos.map((i) => `${i.returnQty}x ${i.name}`).join(", ");
  return {
    saleId,
    motivoCodigo: todo ? "06" : "07",
    motivoDesc: `Devolución de mercadería: ${detalle}`.slice(0, 500),
    monto: Math.round(extractIgv(devueltoConIgv).base * 100) / 100,
  };
}

/** Texto del error de la NC: el 400 de Zod trae un objeto en `error` (antes salía «Error: [object Object]»). */
export function mensajeErrorNc(status: number, data: unknown): string {
  const d = (data ?? {}) as { error?: unknown };
  if (status === 403) return "La Nota de Crédito la emite el dueño o un admin.";
  return typeof d.error === "string" && d.error ? d.error : "No se pudo crear la Nota de Crédito.";
}

/**
 * ¿El fallo de la devolución deja corregir y repetir? Sólo con 4xx: el servidor la rechazó sin
 * registrarla. Sin red o con 5xx no se sabe si se guardó, y el POST no tiene clave de idempotencia:
 * repetirlo podía devolver dos veces (efectivo o crédito doble).
 */
export function fallaSeguraDeRepetir(status: number | null): boolean {
  return status !== null && status >= 400 && status < 500;
}

export const DEVOLUCION_INCIERTA =
  "No sabemos si se registró. Revisa la venta en el historial antes de repetirla.";
