/**
 * Las cuentas de la lista de Proveedores (Compras › Proveedores), sin pantalla:
 * quién te cobra, qué tan vencido está, a quién le compras más y cuánto
 * tarda en entregar. Todo sale de lo que el servidor ya mandó (proveedores,
 * cuentas por pagar y órdenes de compra); acá sólo se agrupa.
 */
import type { DbSupplier } from "@/lib/jsondb";
import { proveedorCoincideBusqueda } from "@/lib/compras/proveedor-identidad";

export type CuentaDeProveedor = {
  id: string;
  supplierId: string;
  supplierName: string;
  amount: number;
  paidAmount: number;
  dueDate?: string;
  status: string;
  description: string;
  createdAt: string;
  purchaseOrderId?: string;
};

/** Lo que de una orden de compra le sirve a la lista (`GET /api/purchases`). */
export type CompraDeProveedor = { id: string; supplierId: string; total: number; status: string; createdAt: string };

export type FiltroProveedor = "todos" | "con-deuda" | "con-ruc" | "sin-ruc";

const MS_DIA = 24 * 60 * 60 * 1000;

/**
 * Días de calendario entre «hoy» y el vencimiento. `dueDate` es DATE-only
 * guardado como medianoche UTC: su día de calendario es la fecha UTC, no la de
 * Lima (en hora local de Lima la cuenta salía vencida un día antes — F11,
 * 2026-09-29). Se compara por CLAVE de día, no por instante.
 */
export function diasHastaVencer(dueDate: string, hoyKey: string): number {
  const dueKey = new Date(dueDate).toISOString().slice(0, 10);
  return Math.round((Date.parse(`${dueKey}T00:00:00Z`) - Date.parse(`${hoyKey}T00:00:00Z`)) / MS_DIA);
}

export const tieneRuc = (s: Pick<DbSupplier, "ruc">) => (s.ruc ?? "").length === 11;

const saldoDe = (c: Pick<CuentaDeProveedor, "amount" | "paidAmount">) => c.amount - c.paidAmount;
const abiertas = (cuentas: readonly CuentaDeProveedor[]) => cuentas.filter((c) => c.status !== "pagado" && saldoDe(c) > 0);

export type DeudaDeProveedor = { total: number; n: number; vencida: boolean; proxima: boolean };

/** Lo que le debes a UN proveedor: cuánto, en cuántas cuentas y si alguna ya venció o vence en 7 días. */
export function deudaDe(cuentas: readonly CuentaDeProveedor[], supplierId: string, hoyKey: string): DeudaDeProveedor {
  const suyas = abiertas(cuentas).filter((c) => c.supplierId === supplierId);
  const dias = suyas.filter((c) => c.dueDate).map((c) => diasHastaVencer(c.dueDate as string, hoyKey));
  const vencida = dias.some((d) => d < 0);
  return {
    total: suyas.reduce((s, c) => s + saldoDe(c), 0),
    n: suyas.length,
    vencida,
    proxima: !vencida && dias.some((d) => d >= 0 && d <= 7),
  };
}

/** Los proveedores a los que les debes algo. */
export function conDeuda(cuentas: readonly CuentaDeProveedor[]): Set<string> {
  return new Set(abiertas(cuentas).map((c) => c.supplierId));
}

const vigentes = (compras: readonly CompraDeProveedor[]) => compras.filter((c) => c.status !== "cancelado");

/** Días desde la última compra (las canceladas no cuentan); `null` si nunca le compraste. */
export function diasSinComprar(compras: readonly CompraDeProveedor[], supplierId: string, ahora: Date): number | null {
  const fechas = vigentes(compras).filter((c) => c.supplierId === supplierId).map((c) => new Date(c.createdAt).getTime());
  if (fechas.length === 0) return null;
  return Math.floor((ahora.getTime() - Math.max(...fechas)) / MS_DIA);
}

/** A quién le compras más: el proveedor con más monto en órdenes (sin canceladas). */
export function topComprado(compras: readonly CompraDeProveedor[]): { supplierId: string; monto: number; ordenes: number } | null {
  const porProveedor = new Map<string, { monto: number; ordenes: number }>();
  for (const c of vigentes(compras)) {
    const a = porProveedor.get(c.supplierId) ?? { monto: 0, ordenes: 0 };
    porProveedor.set(c.supplierId, { monto: a.monto + (Number(c.total) || 0), ordenes: a.ordenes + 1 });
  }
  const mejor = [...porProveedor.entries()].sort((a, b) => b[1].monto - a[1].monto)[0];
  return mejor && mejor[1].monto > 0 ? { supplierId: mejor[0], ...mejor[1] } : null;
}

/** Compras de los últimos 6 meses (mes de Lima) de un proveedor, para la barrita de la fila. */
export function comprasPorMes(compras: readonly CompraDeProveedor[], supplierId: string, ahora: Date): { fecha: Date; total: number }[] {
  const clave = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
  const suyas = vigentes(compras).filter((c) => c.supplierId === supplierId);
  return Array.from({ length: 6 }, (_, i) => {
    const fecha = new Date(ahora.getFullYear(), ahora.getMonth() - (5 - i), 1);
    const total = suyas.filter((c) => clave(new Date(c.createdAt)) === clave(fecha)).reduce((s, c) => s + (Number(c.total) || 0), 0);
    return { fecha, total };
  });
}

/** Días promedio que tardan en entregar los que lo declaran en su ficha. */
export function entregaPromedio(proveedores: readonly DbSupplier[]): { dias: number; declaran: number } | null {
  const dias = proveedores.map((s) => s.leadTimeDias).filter((d): d is number => typeof d === "number" && d > 0);
  if (dias.length === 0) return null;
  return { dias: dias.reduce((s, d) => s + d, 0) / dias.length, declaran: dias.length };
}

export function filtrarProveedores(
  proveedores: readonly DbSupplier[],
  cuentas: readonly CuentaDeProveedor[],
  filtro: FiltroProveedor,
  texto: string,
): DbSupplier[] {
  const deben = conDeuda(cuentas);
  return proveedores.filter((s) => {
    if (filtro === "con-deuda" && !deben.has(s.id)) return false;
    if (filtro === "con-ruc" && !tieneRuc(s)) return false;
    if (filtro === "sin-ruc" && tieneRuc(s)) return false;
    // Nombre, razón social, contacto, correo, RUC/DNI y teléfonos, sin tildes ni guiones (C34).
    return proveedorCoincideBusqueda(s, texto);
  });
}

/** `wa.me` con el código de Perú; el número se limpia a dígitos. */
export function urlWhatsApp(phone: string, mensaje: string): string {
  return `https://wa.me/51${phone.replace(/\D/g, "")}?text=${encodeURIComponent(mensaje)}`;
}
