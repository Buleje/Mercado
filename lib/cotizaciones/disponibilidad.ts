/**
 * Disponibilidad de lo cotizado (F26): cuánto hay HOY de cada producto.
 *
 * Cotizar no aparta stock: es una promesa de precio. Esto sólo lee las
 * existencias con la regla única del panel (`stock-minimo`) para que el
 * cliente no reciba «sí hay» de algo agotado, y se vuelve a revisar al
 * convertir en pedido. Puro: lo usan el formulario, el detalle y la ruta.
 */
import { enStockBajo, stockMinimoDe } from "@/lib/inventario/stock-minimo";

export type DisponibilidadProducto = {
  id: number;
  nombre: string;
  /** `Product.type`: "product" o "service". */
  tipo: string;
  unidad: string;
  /** `null` = no lleva inventario. */
  stock: number | null;
  /** Mínimo efectivo (el suyo o el global del negocio), resuelto en el servidor. */
  minimo: number;
  activo: boolean;
};

export type NivelDisponibilidad = "servicio" | "sin-control" | "inactivo" | "agotado" | "falta" | "queda-bajo" | "hay";

export type EstadoLinea = { nivel: NivelDisponibilidad; texto: string };

/** De la fila del catálogo a lo que lee la pantalla, con el mínimo efectivo ya resuelto. */
export function disponibilidadDe(
  p: { id: number; nombre: string; tipo: string; unidad: string; stock: number | null; stockMin: number | null; activo: boolean },
  minimoGlobal: number,
): DisponibilidadProducto {
  return {
    id: p.id,
    nombre: p.nombre,
    tipo: p.tipo,
    unidad: p.unidad,
    stock: p.stock,
    minimo: stockMinimoDe(p, minimoGlobal),
    activo: p.activo,
  };
}

/** Las cuatro que piden mirar antes de prometer. */
export const NIVELES_DE_AVISO: ReadonlySet<NivelDisponibilidad> = new Set(["inactivo", "agotado", "falta", "queda-bajo"]);

const cifra = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));

/** «12 unidades» · «1 unidad» · «3,5 kg». */
export function cantidadConUnidad(n: number, unidad: string): string {
  const u = unidad.trim().toLowerCase() === "unidad" ? (n === 1 ? "unidad" : "unidades") : unidad.trim();
  return `${cifra(n).replace(".", ",")} ${u}`.trim();
}

/** `productoId` de la línea (texto en la cotización, entero en el catálogo). */
export function idDeProducto(productoId: string | null | undefined): number | null {
  if (!productoId || !/^\d+$/.test(productoId)) return null;
  const n = Number(productoId);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Qué decir de una línea que pide `cantidad` de `p`. */
export function estadoDeLinea(p: DisponibilidadProducto, cantidad: number): EstadoLinea {
  if (p.tipo === "service") return { nivel: "servicio", texto: "Servicio: no usa stock" };
  if (!p.activo) return { nivel: "inactivo", texto: "Producto desactivado" };
  if (p.stock == null) return { nivel: "sin-control", texto: "Sin control de stock" };
  const pide = Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 0;
  if (p.stock <= 0) return { nivel: "agotado", texto: "Agotado" };
  if (p.stock < pide) {
    return { nivel: "falta", texto: `Faltan ${cifra(pide - p.stock)} (hay ${cantidadConUnidad(p.stock, p.unidad)})` };
  }
  const hay = `Hay ${cantidadConUnidad(p.stock, p.unidad)}`;
  if (pide > 0 && enStockBajo({ stock: p.stock - pide, stockMin: p.minimo }, p.minimo)) {
    return { nivel: "queda-bajo", texto: `${hay}; queda bajo el mínimo (${cifra(p.minimo)})` };
  }
  return { nivel: "hay", texto: hay };
}

export type LineaARevisar = { productoId?: string | null; descripcion: string; cantidad: number };

export type Faltante = { productoId: number; descripcion: string; pide: number; hay: number; unidad: string };

/**
 * Lo que no alcanza para convertir en pedido. Suma las líneas del mismo
 * producto (dos líneas de 6 con 10 en el almacén = faltan 2). Servicios,
 * productos sin control de stock y líneas escritas a mano no faltan nunca.
 */
export function faltantesDe(
  lineas: readonly LineaARevisar[],
  productos: ReadonlyMap<number, DisponibilidadProducto>,
): Faltante[] {
  const pedido = new Map<number, { descripcion: string; pide: number }>();
  for (const l of lineas) {
    const id = idDeProducto(l.productoId);
    if (id == null || !(l.cantidad > 0)) continue;
    const previo = pedido.get(id);
    pedido.set(id, { descripcion: previo?.descripcion ?? l.descripcion, pide: (previo?.pide ?? 0) + l.cantidad });
  }
  const faltan: Faltante[] = [];
  for (const [id, { descripcion, pide }] of pedido) {
    const p = productos.get(id);
    if (!p || p.tipo === "service" || p.stock == null) continue;
    const hay = Math.max(0, p.stock);
    if (hay < pide || !p.activo) faltan.push({ productoId: id, descripcion: p.nombre || descripcion, pide, hay: p.activo ? hay : 0, unidad: p.unidad });
  }
  return faltan;
}
