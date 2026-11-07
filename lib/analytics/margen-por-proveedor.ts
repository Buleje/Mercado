/**
 * Cuánto ganas con cada proveedor (Compras › Proveedores › Comparar, 11-10;
 * lo que Lightspeed llama «margen por proveedor»). El producto no guarda su
 * proveedor: cada producto vendido se le atribuye al de su ÚLTIMA compra que
 * llegó (orden recibida o parcial). Lo vendido sin ninguna compra recibida va
 * aparte («Sin compra registrada»): no se reparte a ojo.
 *
 * Ventas y costo, con la regla de Rentabilidad por producto
 * (`/api/analytics/rentabilidad-productos`): lo COBRADO por línea (descuento
 * repartido) y el costo congelado en la línea o, si falta, el costo actual del
 * producto (`costoEstimado`). Sumas en céntimos. Puro: lo prueba
 * `__tests__/margen-por-proveedor.test.ts`.
 */

export interface LineaVendida {
  productId: number;
  name: string;
  quantity: number;
  /** Lo cobrado por la línea (precio × cantidad − su parte del descuento). */
  cobrado: number;
  costPrice: number | null;
  productCostPrice: number | null;
}

export interface UltimaCompra {
  supplierId: string;
  proveedor: string;
  /** ISO de la última compra recibida. */
  fecha: string;
}

export interface ProductoDelProveedor {
  productId: number;
  nombre: string;
  unidades: number;
  ventas: number;
  ganancia: number;
}

export interface FilaProveedor {
  /** null = «Sin compra registrada». */
  supplierId: string | null;
  proveedor: string;
  productos: number;
  unidades: number;
  ventas: number;
  costo: number;
  ganancia: number;
  /** Ganancia ÷ ventas × 100, con un decimal. */
  margenPct: number;
  /** Alguna línea no traía su costo y se usó el actual del producto. */
  costoEstimado: boolean;
  /** Los que más ganancia dejaron (hasta 5). */
  top: ProductoDelProveedor[];
}

export interface MargenPorProveedor {
  filas: FilaProveedor[];
  sinProveedor: FilaProveedor | null;
  resumen: { ventas: number; costo: number; ganancia: number; margenPct: number; /** % de lo vendido que tiene proveedor. */ conProveedorPct: number };
}

const TOP = 5;
const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 1000) / 10 : 0);

type Prod = { nombre: string; unidades: number; ventas: number; costo: number; estimado: boolean };

function fila(supplierId: string | null, proveedor: string, prods: Map<number, Prod>): FilaProveedor {
  let unidades = 0, ventas = 0, costo = 0, estimado = false;
  const top: ProductoDelProveedor[] = [];
  for (const [productId, p] of prods) {
    unidades += p.unidades;
    ventas += p.ventas;
    costo += p.costo;
    estimado ||= p.estimado;
    top.push({ productId, nombre: p.nombre, unidades: p.unidades, ventas: p.ventas / 100, ganancia: (p.ventas - p.costo) / 100 });
  }
  top.sort((a, b) => b.ganancia - a.ganancia);
  return {
    supplierId,
    proveedor,
    productos: prods.size,
    unidades,
    ventas: ventas / 100,
    costo: costo / 100,
    ganancia: (ventas - costo) / 100,
    margenPct: pct(ventas - costo, ventas),
    costoEstimado: estimado,
    top: top.slice(0, TOP),
  };
}

export function margenPorProveedor(lineas: readonly LineaVendida[], ultima: ReadonlyMap<number, UltimaCompra>): MargenPorProveedor {
  /** proveedor (o "") → producto → acumulado en céntimos. */
  const por = new Map<string, { nombre: string; prods: Map<number, Prod> }>();
  for (const l of lineas) {
    const u = ultima.get(l.productId);
    const k = u?.supplierId ?? "";
    let g = por.get(k);
    if (!g) por.set(k, (g = { nombre: u?.proveedor ?? "Sin compra registrada", prods: new Map() }));
    let p = g.prods.get(l.productId);
    if (!p) g.prods.set(l.productId, (p = { nombre: l.name, unidades: 0, ventas: 0, costo: 0, estimado: false }));
    const unitario = l.costPrice ?? l.productCostPrice ?? 0;
    p.unidades += l.quantity;
    p.ventas += Math.round(l.cobrado * 100);
    p.costo += Math.round(unitario * l.quantity * 100);
    if (l.costPrice === null) p.estimado = true;
  }
  const filas: FilaProveedor[] = [];
  let sinProveedor: FilaProveedor | null = null;
  for (const [k, g] of por) {
    const f = fila(k || null, g.nombre, g.prods);
    if (k) filas.push(f);
    else sinProveedor = f;
  }
  filas.sort((a, b) => b.ganancia - a.ganancia || b.ventas - a.ventas);
  const todas = sinProveedor ? [...filas, sinProveedor] : filas;
  const cent = (n: number) => Math.round(n * 100);
  const ventas = todas.reduce((s, f) => s + cent(f.ventas), 0);
  const costo = todas.reduce((s, f) => s + cent(f.costo), 0);
  const conProveedor = filas.reduce((s, f) => s + cent(f.ventas), 0);
  return {
    filas,
    sinProveedor,
    resumen: { ventas: ventas / 100, costo: costo / 100, ganancia: (ventas - costo) / 100, margenPct: pct(ventas - costo, ventas), conProveedorPct: pct(conProveedor, ventas) },
  };
}

/** De las compras recibidas (cualquier orden), la última por producto. */
export function ultimaCompraPorProducto(
  items: readonly { productId: number; supplierId: string; proveedor: string; fecha: Date }[],
): Map<number, UltimaCompra> {
  const cuando = new Map<number, number>();
  const out = new Map<number, UltimaCompra>();
  for (const it of items) {
    const t = it.fecha.getTime();
    if (t <= (cuando.get(it.productId) ?? -Infinity)) continue;
    cuando.set(it.productId, t);
    out.set(it.productId, { supplierId: it.supplierId, proveedor: it.proveedor, fecha: it.fecha.toISOString() });
  }
  return out;
}
