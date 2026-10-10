/**
 * Cuentas del Resumen de Inicio (`?tab=vendor-dashboard&vista=general`):
 * caja por día, inventario por categoría, compras por proveedor, clientes por
 * día y productos más vendidos, a partir de `useDashboardData()`.
 *
 * Movidas TAL CUAL desde `InicioMultiCharts.tsx` (2026-10-09) para que el
 * componente dibuje y estas funciones cuenten (y se puedan probar). Lo único
 * que cambió es de presentación:
 *  - las etiquetas de día salen «01 oct» (meses escritos a mano, en minúscula);
 *  - la plata NO se redondea por día: una venta de S/ 0.10 ya no se vuelve 0
 *    en la barra ni en el total (el formato redondea al dibujar);
 *  - los nombres largos ya no se cortan acá (los corta el eje; la lista y el
 *    tooltip muestran el nombre entero).
 */
import { enStockBajo } from "@/lib/inventario/stock-minimo";
import { MESES_CORTOS } from "@/lib/admin/inicio/formato-tablero";

export type Product = {
  id: number | string;
  name: string;
  active?: boolean;
  stock?: number;
  stockMin?: number;
  price: number;
  costPrice?: number;
  category?: string;
};
type OrderItem = { id: number | string; quantity: number; price?: number };
export type Order = {
  id: string | number;
  createdAt: string;
  total: number;
  status: string;
  customer?: { name?: string; phone?: string };
  items: OrderItem[];
  paid?: boolean;
};
export type Sale = {
  id?: string | number;
  createdAt: string;
  total: number;
  items: Array<{ productId: number | string; quantity: number; price?: number }>;
};
export type Purchase = {
  id: string | number;
  createdAt: string;
  total: number;
  supplierName?: string;
  supplierId?: string | number;
  paid?: boolean;
};
export type Payable = { id: string | number; amount: number; paid?: boolean; dueDate?: string };
export type Customer = { id?: string | number; phone?: string; name?: string; createdAt?: string };

const CAT_LABEL: Record<string, string> = {
  frutas: "Frutas",
  verduras: "Verduras",
  carnes: "Carnes",
  lacteos: "Lácteos",
  bebidas: "Bebidas",
  limpieza: "Limpieza",
  abarrotes: "Abarrotes",
  panaderia: "Panadería",
  snacks: "Snacks",
  otros: "Otros",
};

const MS_DAY = 24 * 60 * 60 * 1000;

/** Un tramo del eje X: «08h» (un día) o «01 oct» (semana, mes, año). */
export type Bucket = { label: string; iso: string; start: number; end: number };

const pad2 = (n: number) => String(n).padStart(2, "0");
const etiquetaDia = (d: Date) => `${pad2(d.getDate())} ${MESES_CORTOS[d.getMonth()]}`;

/**
 * Tramos que cubren [from, to]: 6 de 4 h si el rango es un día; uno por día
 * hasta 35 días; si no, como mucho 14 tramos parejos.
 */
export function buildBuckets(from: Date, to: Date): Bucket[] {
  const days = (to.getTime() - from.getTime()) / MS_DAY;

  if (days <= 1) {
    const out: Bucket[] = [];
    const fromStart = new Date(from);
    fromStart.setHours(Math.floor(fromStart.getHours() / 4) * 4, 0, 0, 0);
    for (let i = 0; i < 6; i++) {
      const start = new Date(fromStart.getTime() + i * 4 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 4 * 60 * 60 * 1000 - 1);
      out.push({
        label: `${pad2(start.getHours())}h`,
        iso: start.toISOString(),
        start: start.getTime(),
        end: end.getTime(),
      });
    }
    return out;
  }

  if (days <= 35) {
    const out: Bucket[] = [];
    const cursor = new Date(from);
    cursor.setHours(0, 0, 0, 0);
    const last = new Date(to);
    last.setHours(23, 59, 59, 999);
    while (cursor.getTime() <= last.getTime()) {
      const dayEnd = new Date(cursor);
      dayEnd.setHours(23, 59, 59, 999);
      out.push({
        label: etiquetaDia(cursor),
        iso: cursor.toISOString(),
        start: cursor.getTime(),
        end: dayEnd.getTime(),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }

  const bucketSize = Math.ceil(days / 14);
  const out: Bucket[] = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= to.getTime()) {
    const bucketEnd = new Date(cursor.getTime() + bucketSize * MS_DAY - 1);
    const actualEnd = bucketEnd.getTime() > to.getTime() ? to : bucketEnd;
    out.push({
      label: etiquetaDia(cursor),
      iso: cursor.toISOString(),
      start: cursor.getTime(),
      end: actualEnd.getTime(),
    });
    cursor.setTime(cursor.getTime() + bucketSize * MS_DAY);
  }
  return out;
}

function bucketIndex(iso: string | Date, buckets: Array<{ start: number; end: number }>): number {
  const t = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  return buckets.findIndex((b) => t >= b.start && t <= b.end);
}

const enRango = (iso: string, desde: number, hasta: number) => {
  const t = new Date(iso).getTime();
  return t >= desde && t <= hasta;
};

// ── 1. Caja: lo que entró (pedidos + ventas) y lo que salió (compras) ───────
export type FilaCaja = { day: string; iso: string; ingresos: number; egresos: number };

export function cajaPorDia(
  orders: Order[],
  sales: Sale[],
  purchases: Purchase[],
  buckets: Bucket[],
): FilaCaja[] {
  const rows = buckets.map((b) => ({ day: b.label, iso: b.iso, ingresos: 0, egresos: 0 }));
  orders.forEach((o) => {
    if (o.status === "cancelado") return;
    const i = bucketIndex(o.createdAt, buckets);
    if (i >= 0) rows[i].ingresos += Number(o.total ?? 0);
  });
  sales.forEach((s) => {
    const i = bucketIndex(s.createdAt, buckets);
    if (i >= 0) rows[i].ingresos += Number(s.total ?? 0);
  });
  purchases.forEach((p) => {
    const i = bucketIndex(p.createdAt, buckets);
    if (i >= 0) rows[i].egresos += Number(p.total ?? 0);
  });
  return rows;
}

export function kpisCaja(caja: FilaCaja[], payables: Payable[]) {
  const ingresos = caja.reduce((s, r) => s + r.ingresos, 0);
  const egresos = caja.reduce((s, r) => s + r.egresos, 0);
  const pendientePagar = payables
    .filter((p) => !p.paid)
    .reduce((s, p) => s + Number(p.amount ?? 0), 0);
  return { ingresos, egresos, neto: ingresos - egresos, pendientePagar };
}

// ── 2. Inventario por categoría (foto de hoy, no depende del rango) ─────────
export type FilaInventario = { categoria: string; stock: number; valor: number; skus: number };

/** Valor = stock × costo, sólo de productos con costo cargado (audit 2026-05-16). */
export function inventarioPorCategoria(products: Product[]): FilaInventario[] {
  const m = new Map<string, { stock: number; valor: number; skus: number }>();
  products.forEach((p) => {
    if (!p.active) return;
    const cat = p.category ?? "otros";
    const cur = m.get(cat) ?? { stock: 0, valor: 0, skus: 0 };
    const stk = p.stock ?? 0;
    cur.stock += stk;
    if (p.costPrice != null) cur.valor += stk * p.costPrice;
    cur.skus += 1;
    m.set(cat, cur);
  });
  return Array.from(m.entries())
    .sort(([, a], [, b]) => b.valor - a.valor)
    .slice(0, 7)
    .map(([cat, v]) => ({
      categoria: CAT_LABEL[cat] ?? cat,
      stock: v.stock,
      valor: v.valor,
      skus: v.skus,
    }));
}

export function kpisInventario(products: Product[], minimoGlobal: number) {
  const activos = products.filter((p) => p.active);
  const valor = activos.reduce(
    (s, p) => s + (p.costPrice != null ? (p.stock ?? 0) * p.costPrice : 0),
    0,
  );
  const sinCosto = activos.filter((p) => p.costPrice == null).length;
  const criticos = activos.filter((p) => (p.stock ?? 0) > 0 && enStockBajo(p, minimoGlobal)).length;
  const sinStock = activos.filter((p) => (p.stock ?? 0) <= 0).length;
  return { valor, skus: activos.length, sinCosto, criticos, sinStock };
}

// ── 3. Compras por proveedor (top 7 del rango) ──────────────────────────────
export type FilaCompras = { proveedor: string; monto: number; ordenes: number; pendiente: number };

export function comprasPorProveedor(
  purchases: Purchase[],
  desde: number,
  hasta: number,
): FilaCompras[] {
  const m = new Map<string, { monto: number; ordenes: number; pendiente: number }>();
  purchases
    .filter((p) => enRango(p.createdAt, desde, hasta))
    .forEach((p) => {
      const key = p.supplierName ?? "Sin proveedor";
      const cur = m.get(key) ?? { monto: 0, ordenes: 0, pendiente: 0 };
      cur.monto += Number(p.total ?? 0);
      cur.ordenes += 1;
      if (!p.paid) cur.pendiente += Number(p.total ?? 0);
      m.set(key, cur);
    });
  return Array.from(m.entries())
    .sort(([, a], [, b]) => b.monto - a.monto)
    .slice(0, 7)
    .map(([proveedor, v]) => ({ proveedor, ...v }));
}

export function kpisCompras(purchases: Purchase[], desde: number, hasta: number) {
  const recent = purchases.filter((p) => enRango(p.createdAt, desde, hasta));
  const total = recent.reduce((s, p) => s + Number(p.total ?? 0), 0);
  const provActivos = new Set(recent.map((p) => p.supplierName ?? "Sin proveedor")).size;
  const pendiente = recent.filter((p) => !p.paid).reduce((s, p) => s + Number(p.total ?? 0), 0);
  return { total, provActivos, pendiente, ordenes: recent.length };
}

// ── 4. Clientes por día: nuevos (alta) y pedidos de los que ya estaban ──────
export type FilaClientes = { day: string; iso: string; nuevos: number; recurrentes: number };

export function clientesPorDia(
  customers: Customer[],
  orders: Order[],
  buckets: Bucket[],
): FilaClientes[] {
  const rows = buckets.map((b) => ({ day: b.label, iso: b.iso, nuevos: 0, recurrentes: 0 }));
  const altaPorTelefono = new Map<string, number>();
  customers.forEach((c) => {
    if (!c.createdAt) return;
    const i = bucketIndex(c.createdAt, buckets);
    if (i >= 0) rows[i].nuevos += 1;
    if (c.phone) altaPorTelefono.set(c.phone, new Date(c.createdAt).setHours(0, 0, 0, 0));
  });
  orders.forEach((o) => {
    if (o.status === "cancelado") return;
    const i = bucketIndex(o.createdAt, buckets);
    if (i < 0) return;
    const phone = o.customer?.phone;
    const alta = phone ? altaPorTelefono.get(phone) : undefined;
    if (alta !== undefined && alta < buckets[i].start) rows[i].recurrentes += 1;
    else if (alta === undefined) rows[i].recurrentes += 1;
  });
  return rows;
}

export function kpisClientes(customers: Customer[], orders: Order[], desde: number, hasta: number) {
  const nuevos = customers.filter(
    (c) => !!c.createdAt && enRango(c.createdAt, desde, hasta),
  ).length;
  const entregados = orders.filter(
    (o) => o.status === "entregado" && enRango(o.createdAt, desde, hasta),
  );
  const activos = new Set(entregados.map((o) => o.customer?.phone).filter(Boolean)).size;
  return { total: customers.length, nuevos, activos };
}

// ── 5. Productos más vendidos (top 7 del rango por plata) ───────────────────
export type FilaProducto = {
  producto: string;
  unidades: number;
  ingresos: number;
  margen: number;
  margenIncompleto: boolean;
};

/** Margen sólo con costo REAL; sin costo el producto suma a ventas pero no a margen. */
export function productosTop(
  products: Product[],
  orders: Order[],
  sales: Sale[],
  desde: number,
  hasta: number,
): FilaProducto[] {
  const m = new Map<string | number, FilaProducto>();
  const porId = new Map(products.map((p) => [p.id, p]));
  const sumar = (id: string | number, cantidad: number, precio: number | undefined) => {
    const p = porId.get(id);
    const cur = m.get(id) ?? {
      producto: p?.name ?? "—",
      unidades: 0,
      ingresos: 0,
      margen: 0,
      margenIncompleto: false,
    };
    const unitPrice = precio ?? p?.price ?? 0;
    cur.unidades += cantidad;
    cur.ingresos += cantidad * unitPrice;
    if (p?.costPrice != null) cur.margen += cantidad * (unitPrice - p.costPrice);
    else cur.margenIncompleto = true;
    m.set(id, cur);
  };
  orders
    .filter((o) => o.status !== "cancelado" && enRango(o.createdAt, desde, hasta))
    .forEach((o) => o.items.forEach((it) => sumar(it.id, it.quantity, it.price)));
  sales
    .filter((s) => enRango(s.createdAt, desde, hasta))
    .forEach((s) => s.items.forEach((it) => sumar(it.productId, it.quantity, it.price)));
  return Array.from(m.values())
    .sort((a, b) => b.ingresos - a.ingresos)
    .slice(0, 7);
}

/** Margen % del top: null si falta el costo de alguno (no se inventa un 30 %). */
export function kpisProductos(top: FilaProducto[]) {
  const ingresos = top.reduce((s, r) => s + r.ingresos, 0);
  const margen = top.reduce((s, r) => s + r.margen, 0);
  const margenIncompleto = top.some((r) => r.margenIncompleto);
  const margenPct = ingresos > 0 && !margenIncompleto ? (margen / ingresos) * 100 : null;
  return { mejor: top[0] ?? null, ingresos, margenPct, margenIncompleto };
}

/**
 * Hora pico de pedidos + ventas (hora del navegador). null si hay menos de 5
 * registros o si el pico cae a medianoche: ninguna bodega vende más a las
 * 00:00; suele ser una fecha sin hora (movido tal cual de InicioDashboardV2).
 */
export function horaPico(
  orders: Array<{ createdAt: string; status: string }>,
  sales: Array<{ createdAt: string }>,
): string | null {
  const porHora = Array.from({ length: 24 }, () => 0);
  orders.forEach((o) => {
    if (o.status !== "cancelado") porHora[new Date(o.createdAt).getHours()] += 1;
  });
  sales.forEach((s) => {
    porHora[new Date(s.createdAt).getHours()] += 1;
  });
  const total = porHora.reduce((a, b) => a + b, 0);
  const pico = porHora.indexOf(Math.max(...porHora, 1));
  return total >= 5 && pico !== 0 ? `${String(pico).padStart(2, "0")}:00` : null;
}
