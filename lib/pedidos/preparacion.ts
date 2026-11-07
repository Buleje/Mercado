/**
 * Preparación de pedidos (N02, 17-10): qué juntar, de qué pedido, y qué falta.
 *
 * El avance (qué línea ya se juntó, cuánto, quién y si el pedido quedó listo)
 * no es un estado del pedido: el estado sigue siendo `confirmado` →
 * `preparando` → `en_camino` por la transición de siempre (`PATCH
 * /api/orders/[id]`). Vive en el KV por negocio
 * (`interno:pedidos-preparacion:<tenantId>`) para que dos celulares del
 * almacén vean lo mismo y quede quién lo marcó.
 *
 * Reglas del PDF (criterio de aprobación de N02):
 *  - listo PARCIAL ≠ listo completo: lo que falta queda anotado;
 *  - un faltante no desaparece al marcar listo;
 *  - nunca se prepara más de lo pedido.
 *
 * Sin React y sin base: lo usan la ruta (para validar) y la pantalla.
 */

export interface LineaPrep {
  /** `OrderItem.id`. */
  itemId: number;
  productoId: number | null;
  nombre: string;
  unidad: string;
  cantidad: number;
  /** Categoría del producto (el recorrido del almacén va por categoría). */
  categoria: string | null;
  /** Stock que dice el sistema ahora (ya descontado lo vendido); null = sin control. */
  stock: number | null;
  /** Opciones elegidas («sin azúcar», «grande»): lo que hay que juntar distinto. */
  detalle: string | null;
}

export interface AvanceLinea {
  /** Cuánto se juntó (0…cantidad). */
  preparada: number;
}

export interface MarcaListo {
  at: string;
  por: string;
  bultos: number | null;
  /** Lo que faltaba al marcarlo listo: el faltante no se borra al empacar. */
  faltantes: { itemId: number; nombre: string; falta: number; unidad: string }[];
}

export interface AvancePrep {
  lineas: Record<string, AvanceLinea>;
  /** Quién tocó por última vez y cuándo. */
  por: string;
  at: string;
  listo: MarcaListo | null;
}

export type EstadoPedidoPrep = "confirmado" | "preparando";

export interface EntregaPrep {
  fecha: string;
  franja: string;
  nota: string | null;
}

export interface PedidoPrep {
  id: string;
  cliente: string;
  telefono: string | null;
  estado: EstadoPedidoPrep;
  creado: string;
  /** Desde cuándo está en su estado (último cambio del historial, o `updatedAt`). */
  enEstadoDesde: string;
  total: number;
  repartidor: string | null;
  notas: string | null;
  entrega: EntregaPrep | null;
  lineas: LineaPrep[];
  avance: AvancePrep | null;
}

/** «#a1b2c3»: el número que el panel muestra de cada pedido. */
export function numeroPedido(id: string): string {
  return `#${id.slice(-6)}`;
}

/** Cuánto se juntó de una línea (0 si nadie la tocó). Nunca más de lo pedido. */
export function preparadaDe(p: Pick<PedidoPrep, "avance">, l: Pick<LineaPrep, "itemId" | "cantidad">): number {
  const v = p.avance?.lineas[String(l.itemId)]?.preparada ?? 0;
  return Math.max(0, Math.min(l.cantidad, v));
}

export interface Faltante {
  itemId: number;
  nombre: string;
  falta: number;
  unidad: string;
}

/** Las líneas que todavía no se juntaron enteras. */
export function faltantesDe(p: Pick<PedidoPrep, "avance" | "lineas">): Faltante[] {
  return p.lineas
    .map((l) => ({ itemId: l.itemId, nombre: l.nombre, unidad: l.unidad, falta: l.cantidad - preparadaDe(p, l) }))
    .filter((f) => f.falta > 0);
}

export type EtapaPrep = "sin-empezar" | "en-curso" | "listo" | "listo-parcial";

/**
 * Dónde está la preparación (no el pedido):
 *  sin-empezar  nadie juntó nada;
 *  en-curso     algo juntado, todavía no se marcó listo;
 *  listo        marcado listo y sin faltantes;
 *  listo-parcial marcado listo CON faltantes (sale incompleto o espera reposición).
 */
export function etapaDe(p: Pick<PedidoPrep, "avance" | "lineas">): EtapaPrep {
  if (p.avance?.listo) return faltantesDe(p).length > 0 ? "listo-parcial" : "listo";
  const algo = p.lineas.some((l) => preparadaDe(p, l) > 0);
  return algo ? "en-curso" : "sin-empezar";
}

export const ROTULO_ETAPA: Readonly<Record<EtapaPrep, string>> = {
  "sin-empezar": "Sin empezar",
  "en-curso": "Juntando",
  listo: "Listo para salir",
  "listo-parcial": "Listo con faltante",
};

/** Líneas juntadas enteras / total de líneas. */
export function avanceDeLineas(p: Pick<PedidoPrep, "avance" | "lineas">): { listas: number; total: number } {
  return { listas: p.lineas.filter((l) => preparadaDe(p, l) >= l.cantidad).length, total: p.lineas.length };
}

export interface ProductoAJuntar {
  clave: string;
  nombre: string;
  unidad: string;
  categoria: string | null;
  /** Lo pedido sumando todos los pedidos. */
  total: number;
  /** Lo ya juntado (en todos los pedidos). */
  juntado: number;
  stock: number | null;
  /** El stock que dice el sistema no alcanza para lo que falta juntar. */
  stockCorto: boolean;
  pedidos: { id: string; cantidad: number; cliente: string }[];
}

/**
 * La lista de recojo: lo que hay que juntar sumado por producto, ordenado por
 * categoría (el recorrido del almacén) y nombre. Un producto sin id se junta
 * por nombre + unidad (ítems sueltos del marketplace).
 */
export function consolidarPorProducto(pedidos: readonly PedidoPrep[]): ProductoAJuntar[] {
  const porClave = new Map<string, ProductoAJuntar>();
  for (const p of pedidos) {
    for (const l of p.lineas) {
      const clave = `${l.productoId != null ? `p:${l.productoId}` : `n:${l.nombre.trim().toLowerCase()}`}|${l.unidad}|${l.detalle ?? ""}`;
      const fila =
        porClave.get(clave) ??
        {
          clave,
          nombre: l.detalle ? `${l.nombre} (${l.detalle})` : l.nombre,
          unidad: l.unidad,
          categoria: l.categoria,
          total: 0,
          juntado: 0,
          stock: l.stock,
          stockCorto: false,
          pedidos: [],
        };
      fila.total += l.cantidad;
      fila.juntado += preparadaDe(p, l);
      const ya = fila.pedidos.find((x) => x.id === p.id);
      if (ya) ya.cantidad += l.cantidad;
      else fila.pedidos.push({ id: p.id, cantidad: l.cantidad, cliente: p.cliente });
      porClave.set(clave, fila);
    }
  }
  const filas = [...porClave.values()];
  for (const f of filas) f.stockCorto = f.stock != null && f.stock < f.total - f.juntado;
  return filas.sort(
    (a, b) =>
      (a.categoria ?? "￿").localeCompare(b.categoria ?? "￿", "es") || a.nombre.localeCompare(b.nombre, "es"),
  );
}

/** Topes del KV: pedidos que se recuerdan y días que dura un avance sin tocar. */
export const MAX_PEDIDOS_AVANCE = 300;
export const DIAS_AVANCE = 30;

/** Quita los avances viejos (más de `DIAS_AVANCE` sin tocar) y deja los `MAX` más nuevos. */
export function podarAvances(m: Record<string, AvancePrep>, ahora: Date): Record<string, AvancePrep> {
  const corte = ahora.getTime() - DIAS_AVANCE * 86_400_000;
  const vivos = Object.entries(m).filter(([, a]) => Date.parse(a.at) >= corte);
  vivos.sort((x, y) => y[1].at.localeCompare(x[1].at));
  return Object.fromEntries(vivos.slice(0, MAX_PEDIDOS_AVANCE));
}

export type CambioPrep =
  | { accion: "linea"; itemId: number; preparada: number }
  | { accion: "todo" }
  | { accion: "listo"; bultos: number | null }
  | { accion: "deshacer-listo" }
  | { accion: "reiniciar" };

/**
 * Aplica un cambio al avance de UN pedido. Devuelve el avance nuevo (o `null`
 * si quedó vacío) o un error en palabras. `lineas` son las del pedido de la
 * base: una línea que no es del pedido o más de lo pedido se rechaza.
 */
export function aplicarCambio(
  actual: AvancePrep | null,
  lineas: readonly Pick<LineaPrep, "itemId" | "cantidad" | "nombre" | "unidad">[],
  cambio: CambioPrep,
  quien: string,
  ahora: Date,
): { ok: true; avance: AvancePrep | null } | { ok: false; error: string } {
  const at = ahora.toISOString();
  const base: AvancePrep = actual
    ? { ...actual, lineas: { ...actual.lineas } }
    : { lineas: {}, por: quien, at, listo: null };
  if (cambio.accion === "reiniciar") return { ok: true, avance: null };
  if (cambio.accion === "deshacer-listo") {
    if (!actual?.listo) return { ok: true, avance: actual };
    return { ok: true, avance: { ...base, listo: null, por: quien, at } };
  }
  if (cambio.accion === "listo") {
    const faltantes = faltantesDe({ avance: base, lineas: lineas.map(aLinea) });
    if (lineas.every((l) => (base.lineas[String(l.itemId)]?.preparada ?? 0) === 0)) {
      return { ok: false, error: "No juntaste nada de este pedido: marca al menos una línea antes de dejarlo listo." };
    }
    return { ok: true, avance: { ...base, por: quien, at, listo: { at, por: quien, bultos: cambio.bultos, faltantes } } };
  }
  if (base.listo) return { ok: false, error: "Ya está marcado listo: deshaz «Listo» para cambiar lo juntado." };
  if (cambio.accion === "todo") {
    for (const l of lineas) base.lineas[String(l.itemId)] = { preparada: l.cantidad };
    return { ok: true, avance: { ...base, por: quien, at } };
  }
  const linea = lineas.find((l) => l.itemId === cambio.itemId);
  if (!linea) return { ok: false, error: "Esa línea no es de este pedido." };
  if (!Number.isFinite(cambio.preparada) || cambio.preparada < 0) return { ok: false, error: "La cantidad juntada no puede ser negativa." };
  if (cambio.preparada > linea.cantidad) {
    return { ok: false, error: `Pidieron ${linea.cantidad} ${linea.unidad} de ${linea.nombre}: no se junta más de lo pedido.` };
  }
  if (cambio.preparada === 0) delete base.lineas[String(linea.itemId)];
  else base.lineas[String(linea.itemId)] = { preparada: cambio.preparada };
  const vacio = Object.keys(base.lineas).length === 0;
  return { ok: true, avance: vacio ? null : { ...base, por: quien, at } };
}

function aLinea(l: Pick<LineaPrep, "itemId" | "cantidad" | "nombre" | "unidad">): LineaPrep {
  return { ...l, productoId: null, categoria: null, stock: null, detalle: null };
}
