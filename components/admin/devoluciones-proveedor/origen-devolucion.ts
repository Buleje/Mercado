/**
 * Lo que la pantalla revisa ANTES de mandar una devolución (C49, 17-10): el mismo
 * tope que juzga el servidor en `SupplierReturnsDB.createWithItems`, para que la
 * persona lo vea mientras escribe. El servidor vuelve a decidir: esto es vista previa.
 */
import type { ItemDevuelto } from "./tipos";

/** Espejo de `LineaOrigen` de `lib/db/supplier-returns.db.ts` (lo que manda el GET). */
export interface LineaOrigen {
  productId: number;
  nombre: string;
  unidad: string;
  costo: number;
  /** Lo que entró al stock en esa orden. */
  llegaron: number;
  /** Lo que todavía se le puede devolver de ese producto (neto de lo ya devuelto). */
  puedesDevolver: number;
}

export interface OrigenDevolucion {
  ordenId: string;
  codigo: string;
  fecha: string;
  lineas: LineaOrigen[];
}

export interface RetornableProducto {
  recibido: number;
  devuelto: number;
  retornable: number;
  ultimoCosto: { costo: number; fecha: string; ordenId: string; codigo: string } | null;
}

/** Misma tolerancia que el servidor: en unidades del negocio, no el epsilon del float. */
const TOLERANCIA = 0.001;

export interface Revision {
  /** «Arroz: pides 5 y puedes devolver hasta 3.» */
  excede: string[];
  /** Productos del inventario que no entraron de este proveedor por el sistema. */
  sinRecepcion: string[];
  /** Tope por productId (lo que se puede devolver), para mostrarlo al lado del ítem. */
  tope: Map<number, number>;
}

export function revisarContraOrigen(
  items: ItemDevuelto[],
  porProducto: Record<string, RetornableProducto>,
  orden: OrigenDevolucion | undefined,
): Revision {
  const pedido = new Map<number, { nombre: string; cantidad: number }>();
  for (const i of items) {
    if (i.productId == null || !i.nombre.trim()) continue;
    const p = pedido.get(i.productId);
    pedido.set(i.productId, { nombre: p?.nombre ?? i.nombre, cantidad: (p?.cantidad ?? 0) + (Number(i.cantidad) || 0) });
  }
  const r: Revision = { excede: [], sinRecepcion: [], tope: new Map() };
  for (const [productId, { nombre, cantidad }] of pedido) {
    const prod = porProducto[String(productId)];
    if (!prod || prod.recibido <= 0) { r.sinRecepcion.push(nombre); continue; }
    const enOrden = orden?.lineas.find((l) => l.productId === productId)?.llegaron;
    const tope = enOrden != null ? Math.min(enOrden, prod.retornable) : prod.retornable;
    r.tope.set(productId, tope);
    if (cantidad > tope + TOLERANCIA) r.excede.push(`${nombre}: pides ${cantidad} y puedes devolver hasta ${tope}.`);
  }
  return r;
}

/**
 * El costo que pondrá el servidor, en el mismo orden (C51): el de la orden de
 * origen, si no el de la última compra a ese proveedor, si no el de la ficha.
 */
export function costoSugerido(item: ItemDevuelto, porProducto: Record<string, RetornableProducto>, orden: OrigenDevolucion | undefined): ItemDevuelto["precioUnitario"] {
  if (item.productId == null) return item.precioUnitario;
  return orden?.lineas.find((l) => l.productId === item.productId)?.costo
    ?? porProducto[String(item.productId)]?.ultimoCosto?.costo
    ?? item.precioUnitario;
}
