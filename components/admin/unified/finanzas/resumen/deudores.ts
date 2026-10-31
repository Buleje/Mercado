/**
 * Lo que te deben (fiados) y lo que debes (proveedores): UNA regla —el
 * saldo— para la tarjeta y para la lista de cada lado.
 *
 * La tarjeta «Fiados pendientes» sumaba el saldo y la lista «Me deben
 * (fiados)» de al lado sumaba el `total` —lo que se fió, incluido lo ya
 * cobrado—. Medido 2026-09-28 en el negocio real: un fiado de S/ 50 con S/ 20
 * pagados; la tarjeta decía 30 y la barra del mismo cliente, 50.
 *
 * Además la carga pedía sólo los fiados ACTIVO: uno VENCIDO —el que más urge
 * cobrar— no aparecía en ningún lado (en el tenant QA, S/ 150 vencidos
 * invisibles), aunque la lista ya sabía pintar de rojo los vencidos.
 *
 * PURO.
 */
import { n } from "@/components/admin/finanzas/shared";
import { netoPorPagar } from "@/lib/finance/finance-kpis";
import type { Deudor } from "./tipos";

/** Un fiado tal como lo manda `/api/fiados` (con sus alias). */
export type FiadoDeLista = {
  customerName?: string;
  customer?: { name?: string };
  description?: string;
  saldo?: number;
  balance?: number;
  total?: number;
  amount?: number;
  status?: string;
  dueDate?: string;
};

/** Los estados en los que un fiado todavía se debe. */
export const ESTADOS_FIADO_PENDIENTE = ["ACTIVO", "VENCIDO"] as const;

/** Lo que falta cobrar de un fiado: el saldo. El total sólo si el saldo no vino. */
export function loQueDebe(f: FiadoDeLista): number {
  return n(f.saldo ?? f.balance ?? f.total ?? f.amount);
}

export function totalQueTeDeben(fiados: ReadonlyArray<FiadoDeLista>): number {
  return fiados.reduce((s, f) => s + loQueDebe(f), 0);
}

/** Los `cuantos` clientes que más deben, agrupados por nombre. */
export function mayoresDeudores(fiados: ReadonlyArray<FiadoDeLista>, ahora: Date, cuantos = 5): Deudor[] {
  const porNombre = new Map<string, { monto: number; vencido: boolean }>();
  for (const f of fiados) {
    const name = f.customerName ?? f.customer?.name ?? f.description ?? "Cliente";
    const prev = porNombre.get(name) ?? { monto: 0, vencido: false };
    prev.monto += loQueDebe(f);
    if (f.status === "VENCIDO" || (f.dueDate && new Date(f.dueDate) < ahora)) prev.vencido = true;
    porNombre.set(name, prev);
  }
  return Array.from(porNombre.entries())
    .filter(([, d]) => d.monto > 0)
    .map(([name, d]) => ({ name: name.length > 18 ? name.slice(0, 18) + "..." : name, monto: Math.round(d.monto), vencido: d.vencido }))
    .sort((a, b) => b.monto - a.monto)
    .slice(0, cuantos);
}

// ── Lo que tú debes a proveedores: la misma regla, el SALDO ──────────────────
/*
 * La tarjeta «Deuda proveedores» y la lista «Debo a proveedores» sumaban
 * `amount` (o `total`) sin restar lo pagado: una cuenta de S/ 1 000 con S/ 700
 * pagados figuraba como S/ 1 000, y una ya pagada seguía en la lista. Lo que se
 * debe es `netoPorPagar()`, la regla que ya usan los KPIs canónicos.
 */
export type CuentaPorPagarDeLista = {
  amount?: number;
  total?: number;
  paidAmount?: number;
  status?: string;
  dueDate?: string;
  supplierName?: string;
  supplier?: { name?: string };
  description?: string;
};

/** Lo que falta pagar de una cuenta (0 si está pagada; nunca negativo). */
export function loQueFaltaPagar(p: CuentaPorPagarDeLista): number {
  return netoPorPagar({ amount: n(p.amount ?? p.total), paidAmount: n(p.paidAmount), status: p.status ?? "" });
}

export function totalQueDebes(cuentas: ReadonlyArray<CuentaPorPagarDeLista>): number {
  return cuentas.reduce((s, p) => s + loQueFaltaPagar(p), 0);
}

/** Los `cuantos` proveedores a los que más se les debe, agrupados por nombre. */
export function mayoresAcreedores(cuentas: ReadonlyArray<CuentaPorPagarDeLista>, ahora: Date, cuantos = 5): Deudor[] {
  const porNombre = new Map<string, { monto: number; vencido: boolean }>();
  for (const p of cuentas) {
    const falta = loQueFaltaPagar(p);
    if (falta <= 0) continue;
    const name = p.supplierName ?? p.supplier?.name ?? p.description ?? "Proveedor";
    const prev = porNombre.get(name) ?? { monto: 0, vencido: false };
    prev.monto += falta;
    if (p.status === "VENCIDO" || (p.dueDate && new Date(p.dueDate) < ahora)) prev.vencido = true;
    porNombre.set(name, prev);
  }
  return Array.from(porNombre.entries())
    .map(([name, d]) => ({ name: name.length > 18 ? name.slice(0, 18) + "..." : name, monto: Math.round(d.monto), vencido: d.vencido }))
    .sort((a, b) => b.monto - a.monto)
    .slice(0, cuantos);
}
