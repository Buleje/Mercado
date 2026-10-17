/**
 * Kits que descuentan stock (Musa, 11-10: «vender un kit resta cada producto
 * que lo forma»).
 *
 * Dónde vive la composición: una `Receta` con `categoria = "kit"` cuyo
 * `productoId` es el producto del kit; cada `RecetaIngrediente` es un
 * componente con su `cantidad` (unidades enteras). No hace falta schema nuevo:
 * `Receta` ya es «el producto X se forma con estos productos × cantidad», y la
 * categoría la separa de las recetas de cocina (esas NO descuentan al vender).
 *
 * Regla de venta:
 * - Kit SIN stock propio (`stock` null, lo normal): vender N kits descuenta
 *   cada componente `cantidad × N` en la MISMA transacción de la venta, con la
 *   misma regla que una venta normal (componente sin control de stock = sin
 *   tope; con control = nunca en negativo, guarda en el WHERE) y su fila de
 *   kardex marcada `[kit #<id>]` con el stock exacto de antes y después. Su
 *   costo en la venta es la suma del costo de los componentes.
 * - Kit CON stock propio (cajas ya armadas con «Producir»): se vende de ese
 *   stock y con su `costPrice`; sus componentes ya salieron al armarlo.
 * - Devolución: vuelve lo que el KARDEX de esa venta dice que salió (no la
 *   composición de hoy, que pudo cambiar), en proporción a lo devuelto.
 * - Sin anidar: un kit sin stock propio no puede ir dentro de otro kit.
 * - Todos los UPDATE de stock de una venta van en orden de `productId`: dos
 *   ventas cruzadas esperan una a la otra en vez de bloquearse entre sí.
 */
import { prisma } from "@/lib/prisma";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Valor de `Receta.categoria` que convierte una receta en la composición de un kit. */
export const CATEGORIA_KIT = "kit";

export function esCategoriaKit(categoria: string | null | undefined): boolean {
  return categoria?.trim().toLowerCase() === CATEGORIA_KIT;
}

export interface ComponenteKit {
  productId: number;
  cantidad: number;
}

export interface Kit {
  productId: number;
  nombre: string;
  componentes: ComponenteKit[];
  /** Σ cantidad × costo del componente (`costPrice`, o 70 % del precio si no tiene). */
  costoUnitario: number;
}

/** Una línea de venta o de devolución (el producto vendido y cuántos). */
export interface LineaConKits {
  productId: number;
  quantity: number;
}

/** Lo que sale (o vuelve) de un componente por una línea de kit. */
export interface SalidaDeComponente {
  productId: number;
  quantity: number;
  kitProductId: number;
  kitNombre: string;
}

/** Una línea vendida tal cual (el kit mismo incluido), para su UPDATE condicional. */
export interface LineaSuelta {
  productId: number;
  quantity: number;
  nombre: string;
}

export interface MovimientoDeComponente {
  productId: number;
  type: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  reference: string;
  notes: string;
  createdBy: string;
  tenantId: string;
}

/** Lo que salió de cada componente por cada kit en una venta, leído del kardex. */
export type VendidoPorKit = Map<number, { nombre: string; porComponente: Map<number, number> }>;

/** Error de armado del kit (composición mal cargada): la ruta lo responde 400. */
export class KitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KitError";
  }
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Marca del kardex que ata la salida de un componente a su kit. */
const marcaKit = (kitProductId: number) => `[kit #${kitProductId}]`;
const MARCA_KIT_RE = /componente de (.*) \[kit #(\d+)\]$/;

/**
 * Cada línea de kit → una salida por componente (`cantidad × unidades`). Las
 * líneas que no son kit no generan nada. Puro: sin base.
 */
export function salidasDeKits(lineas: LineaConKits[], kits: Map<number, Kit>): SalidaDeComponente[] {
  const salidas: SalidaDeComponente[] = [];
  for (const l of lineas) {
    const kit = kits.get(l.productId);
    if (!kit) continue;
    for (const c of kit.componentes) {
      const quantity = c.cantidad * l.quantity;
      if (!Number.isInteger(c.cantidad) || c.cantidad <= 0 || !Number.isInteger(quantity)) {
        throw new KitError(
          `El kit «${kit.nombre}» tiene un componente con cantidad ${c.cantidad}: un kit lleva unidades enteras. Corrige su composición.`,
        );
      }
      salidas.push({ productId: c.productId, quantity, kitProductId: kit.productId, kitNombre: kit.nombre });
    }
  }
  return salidas;
}

/** El costo de cada línea: un kit sin stock propio cuesta lo que sus componentes. Puro. */
export function conCostoDeKits<T extends { productId: number; costPrice?: number }>(lineas: T[], kits: Map<number, Kit>): T[] {
  return lineas.map((l) => {
    const kit = kits.get(l.productId);
    return kit ? { ...l, costPrice: kit.costoUnitario } : l;
  });
}

/** Unidades pedidas por producto (un mismo componente puede venir de dos kits o suelto). */
export function sumarPorProducto(lineas: { productId: number; quantity: number }[]): Map<number, number> {
  const total = new Map<number, number>();
  for (const s of lineas) total.set(s.productId, (total.get(s.productId) ?? 0) + s.quantity);
  return total;
}

/**
 * Lo que vuelve de cada componente al devolver kits, según lo que SALIÓ en la
 * venta (kardex), no la composición de hoy. Proporcional y acumulado: con lo
 * ya devuelto antes, la suma de todas las devoluciones nunca pasa de lo que
 * salió. Puro.
 */
export function salidasADevolver(
  vendido: VendidoPorKit,
  unidadesVendidas: Map<number, number>,
  yaDevuelto: Map<number, number>,
  devolver: LineaConKits[],
): SalidaDeComponente[] {
  const salidas: SalidaDeComponente[] = [];
  for (const d of devolver) {
    const kit = vendido.get(d.productId);
    const unidades = unidadesVendidas.get(d.productId) ?? 0;
    if (!kit || unidades <= 0) continue;
    const antes = yaDevuelto.get(d.productId) ?? 0;
    const despues = Math.min(unidades, antes + d.quantity);
    for (const [productId, salio] of kit.porComponente) {
      const quantity = Math.round((salio * despues) / unidades) - Math.round((salio * antes) / unidades);
      if (quantity > 0) salidas.push({ productId, quantity, kitProductId: d.productId, kitNombre: kit.nombre });
    }
  }
  return salidas;
}

/**
 * Por qué una composición de kit no sirve (o null). Puro: lo que se ve sin la
 * base (producto del kit, unidades enteras, sin contenerse a sí mismo).
 */
export function problemaDeComposicionKit(kit: {
  productoId: number | null | undefined;
  ingredientes: { productoId: number; cantidad: number }[];
}): string | null {
  if (kit.productoId == null) return "Un kit necesita el producto que se vende como kit.";
  if (kit.ingredientes.length === 0) return "Un kit necesita al menos un producto adentro.";
  if (kit.ingredientes.some((i) => !Number.isInteger(i.cantidad) || i.cantidad <= 0)) {
    return "Los productos de un kit van en unidades enteras (1, 2, 3…).";
  }
  if (kit.ingredientes.some((i) => i.productoId === kit.productoId)) return "Un kit no puede llevarse a sí mismo adentro.";
  return null;
}

function nombresDeKits(salidas: SalidaDeComponente[], productId: number): string {
  return [...new Set(salidas.filter((s) => s.productId === productId).map((s) => s.kitNombre))].join(", ");
}

function esNoEncontrado(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "P2025";
}

export const KitsDB = {
  /**
   * Los kits SIN stock propio entre `productIds`, con su composición y costo.
   * Un kit con stock propio no entra: se vende de sus cajas armadas.
   */
  async kitsDeProductosEnTx(tx: Tx, tenantId: string, productIds: number[]): Promise<Map<number, Kit>> {
    const kits = new Map<number, Kit>();
    if (productIds.length === 0) return kits;
    const recetas = await tx.receta.findMany({
      where: {
        tenantId,
        activa: true,
        categoria: { equals: CATEGORIA_KIT, mode: "insensitive" },
        productoId: { in: productIds },
        producto: { is: { tenantId, stock: null } },
      },
      select: {
        productoId: true,
        nombre: true,
        producto: { select: { name: true } },
        ingredientes: {
          select: { productoId: true, cantidad: true, producto: { select: { costPrice: true, price: true } } },
        },
      },
      // Dos recetas «kit» del mismo producto: manda la última que se tocó.
      orderBy: { updatedAt: "desc" },
    });
    for (const r of recetas) {
      if (r.productoId == null || kits.has(r.productoId)) continue;
      const productoId = r.productoId;
      const ingredientes = r.ingredientes.filter((i) => i.productoId !== productoId);
      if (ingredientes.length === 0) continue;
      const componentes = ingredientes.map((i) => ({ productId: i.productoId, cantidad: Number(i.cantidad) }));
      // Misma regla que el costo de un producto suelto en la venta (`costNum || precio × 0,7`).
      const costoUnitario = redondear(
        ingredientes.reduce((s, i) => {
          const costo = Number(i.producto?.costPrice ?? 0) || Number(i.producto?.price ?? 0) * 0.7;
          return s + Number(i.cantidad) * costo;
        }, 0),
      );
      kits.set(productoId, { productId: productoId, nombre: r.producto?.name ?? r.nombre, componentes, costoUnitario });
    }
    return kits;
  },

  /**
   * TODO el stock de una venta del POS en una pasada, ordenada por `productId`:
   * cada línea tal cual (el `updateMany` condicional de siempre) y cada
   * componente de los kits (con su kardex marcado). Lanza «Stock insuficiente…»
   * (la ruta lo responde 400 y la venta entera se revierte) si algo no alcanza.
   */
  async descontarVentaEnTx(
    tx: Tx,
    tenantId: string,
    sueltas: LineaSuelta[],
    salidas: SalidaDeComponente[],
    meta: { referencia: string; creadoPor: string },
  ): Promise<void> {
    const porId = new Map<number, { stock: number | null; name: string }>();
    if (salidas.length > 0) {
      const ids = [...new Set(salidas.map((s) => s.productId))];
      const productos = await tx.product.findMany({
        where: { id: { in: ids }, tenantId },
        select: { id: true, stock: true, name: true },
      });
      for (const p of productos) porId.set(p.id, p);
      // Chequeo con el total por producto (dos kits, o un kit y el mismo
      // producto suelto, salen del mismo stock): el mensaje dice cuánto falta.
      const pedido = sumarPorProducto([...sueltas, ...salidas]);
      for (const productId of new Set(salidas.map((s) => s.productId))) {
        const p = porId.get(productId);
        if (!p) {
          throw new KitError(
            `El kit «${nombresDeKits(salidas, productId)}» lleva un producto que ya no está en tu inventario (#${productId}). Corrige su composición.`,
          );
        }
        const total = pedido.get(productId) ?? 0;
        if (p.stock != null && p.stock < total) {
          throw new Error(
            `Stock insuficiente para "${p.name}" (va en ${nombresDeKits(salidas, productId)}): disponible ${p.stock}, solicitado ${total}`,
          );
        }
      }
    }

    type Paso = { productId: number; suelta?: LineaSuelta; salida?: SalidaDeComponente };
    const pasos: Paso[] = [
      ...sueltas.map((s) => ({ productId: s.productId, suelta: s })),
      ...salidas.map((s) => ({ productId: s.productId, salida: s })),
    ].sort((a, b) => a.productId - b.productId);

    const movimientos: MovimientoDeComponente[] = [];
    for (const paso of pasos) {
      if (paso.suelta) {
        const s = paso.suelta;
        // La guarda va en el WHERE: si entre la lectura y acá otra caja vendió
        // esas unidades, no se actualiza nada y la venta se revierte.
        const r = await tx.product.updateMany({
          where: { id: s.productId, tenantId, OR: [{ stock: null }, { stock: { gte: s.quantity } }] },
          data: { stock: { decrement: s.quantity } },
        });
        if (r.count === 0) throw new Error(`Stock insuficiente para "${s.nombre}" (concurrencia detectada). Reintenta.`);
        continue;
      }
      const s = paso.salida!;
      const nombre = porId.get(s.productId)?.name ?? `#${s.productId}`;
      let despues: number | null;
      try {
        const fila = await tx.product.update({
          where: { id: s.productId, tenantId, OR: [{ stock: null }, { stock: { gte: s.quantity } }] },
          data: { stock: { decrement: s.quantity } },
          select: { stock: true },
        });
        despues = fila.stock;
      } catch (err) {
        if (!esNoEncontrado(err)) throw err;
        throw new Error(`Stock insuficiente para "${nombre}" (va en ${s.kitNombre}, concurrencia detectada). Reintenta.`);
      }
      movimientos.push({
        productId: s.productId,
        type: "venta",
        quantity: s.quantity,
        // Sin control de stock: la fila deja constancia de la salida, sin saldo
        // (antes = después = 0), y la devolución sabe que no hay nada que reponer.
        previousStock: despues == null ? 0 : despues + s.quantity,
        newStock: despues ?? 0,
        reference: meta.referencia,
        notes: `Venta POS: componente de ${s.kitNombre} ${marcaKit(s.kitProductId)}`,
        createdBy: meta.creadoPor,
        tenantId,
      });
    }
    if (movimientos.length > 0) await tx.inventoryMovement.createMany({ data: movimientos });
  },

  /**
   * Lo que salió de verdad por cada kit en una venta: las filas de kardex
   * marcadas `[kit #<id>]` que bajaron stock (las de un componente sin control
   * de stock tienen antes = después y no cuentan).
   */
  async vendidoPorKitEnTx(tx: Tx, tenantId: string, saleId: string): Promise<VendidoPorKit> {
    const filas = await tx.inventoryMovement.findMany({
      where: { tenantId, reference: saleId, type: "venta", notes: { contains: "[kit #" } },
      select: { productId: true, quantity: true, previousStock: true, newStock: true, notes: true },
    });
    const vendido: VendidoPorKit = new Map();
    for (const f of filas) {
      const m = MARCA_KIT_RE.exec(f.notes ?? "");
      if (!m || f.previousStock - f.newStock !== f.quantity) continue;
      const kitId = Number(m[2]);
      const kit = vendido.get(kitId) ?? { nombre: m[1], porComponente: new Map<number, number>() };
      kit.porComponente.set(f.productId, (kit.porComponente.get(f.productId) ?? 0) + f.quantity);
      vendido.set(kitId, kit);
    }
    return vendido;
  },

  /**
   * Repone los componentes de los kits devueltos, en orden de `productId`.
   * Devuelve las filas de kardex para que quien llama las inserte junto con las
   * suyas (un solo INSERT). Un componente que hoy no lleva control de stock no
   * se toca (igual que un producto suelto).
   */
  async reponerComponentesEnTx(
    tx: Tx,
    tenantId: string,
    salidas: SalidaDeComponente[],
    meta: { referencia: string; creadoPor: string },
  ): Promise<MovimientoDeComponente[]> {
    if (salidas.length === 0) return [];
    const ids = [...new Set(salidas.map((s) => s.productId))];
    const productos = await tx.product.findMany({
      where: { id: { in: ids }, tenantId },
      select: { id: true, stock: true },
    });
    const conStock = new Set(productos.filter((p) => p.stock != null).map((p) => p.id));
    const movimientos: MovimientoDeComponente[] = [];
    for (const s of [...salidas].sort((a, b) => a.productId - b.productId)) {
      if (!conStock.has(s.productId)) continue;
      const fila = await tx.product.update({
        where: { id: s.productId, tenantId },
        data: { stock: { increment: s.quantity } },
        select: { stock: true },
      });
      const newStock = fila.stock ?? s.quantity;
      movimientos.push({
        productId: s.productId,
        type: "devolucion",
        quantity: s.quantity,
        previousStock: newStock - s.quantity,
        newStock,
        reference: meta.referencia,
        notes: `Devolución: componente de ${s.kitNombre} ${marcaKit(s.kitProductId)}`,
        createdBy: meta.creadoPor,
        tenantId,
      });
    }
    return movimientos;
  },

  /**
   * Por qué no se puede guardar esta composición de kit (o null): lo puro de
   * `problemaDeComposicionKit` y que no quede un kit dentro de otro (un kit sin
   * stock propio adentro no bajaría nada; ni este producto dentro de otro kit).
   */
  async problemaDeKit(
    tenantId: string,
    kit: { recetaId?: string; productoId: number | null | undefined; ingredientes: { productoId: number; cantidad: number }[] },
  ): Promise<string | null> {
    const puro = problemaDeComposicionKit(kit);
    if (puro) return puro;
    const adentro = await this.kitsDeProductosEnTx(prisma, tenantId, [...new Set(kit.ingredientes.map((i) => i.productoId))]);
    const anidado = [...adentro.values()][0];
    if (anidado) return `«${anidado.nombre}» ya es un kit: pon sus productos sueltos (un kit no va dentro de otro).`;
    const contenedor = await prisma.recetaIngrediente.findFirst({
      where: {
        productoId: kit.productoId!,
        receta: {
          tenantId,
          activa: true,
          categoria: { equals: CATEGORIA_KIT, mode: "insensitive" },
          ...(kit.recetaId ? { id: { not: kit.recetaId } } : {}),
          producto: { is: { tenantId, stock: null } },
        },
      },
      select: { receta: { select: { nombre: true } } },
    });
    if (contenedor) return `Este producto va dentro del kit «${contenedor.receta.nombre}»: un kit no va dentro de otro.`;
    return null;
  },
};
