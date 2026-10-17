import "server-only";
import { prisma } from "@/lib/prisma";
import { codigoDeOrden } from "@/lib/compras/referencia-documento";
import { diaYFecha } from "@/lib/compras/devoluciones-proveedor";

/**
 * SupplierReturnsDB
 *
 * Audit project-wide 2026-05-19 — migracion de /api/supplier-returns.
 * Devoluciones a proveedores con items + tenantId obligatorio.
 *
 * 17-10 (auditoría Compras C49/C51): lo que se puede devolver sale de lo que
 * ENTRÓ de ese proveedor (kardex «compra» de sus órdenes) menos lo que ya se le
 * devolvió sin anular; el costo, de la orden de origen o de la última compra.
 */

interface CreateData {
  proveedorId?: string;
  proveedorNombre: string;
  motivo: string;
  notas?: string;
  /** Orden de compra (ya recibida) de la que sale lo devuelto. */
  origenOrdenId?: string;
  /** Por qué se devuelve algo que no llegó de este proveedor por el sistema. */
  sinOrigenMotivo?: string;
  items: Array<{
    nombre: string;
    cantidad: number;
    unidad: string;
    // ADR-379. `productId` ausente = ítem escrito a mano: no mueve stock.
    productId?: number;
    precioUnitario?: number;
  }>;
}

/** Un ítem trae un `productId` de otro negocio (o inexistente). */
export class ProductoAjenoError extends Error {
  constructor(public readonly productId: number) {
    super(`El producto ${productId} no es de este negocio`);
    this.name = "ProductoAjenoError";
  }
}

/** La orden de origen no es de este proveedor (o no existe en este negocio). */
export class OrigenInvalidoError extends Error {
  constructor() {
    super("Esa orden no es de este proveedor.");
    this.name = "OrigenInvalidoError";
  }
}

/** Se pide devolver más de lo que entró de ese proveedor, neto de lo ya devuelto. */
export class ExcedeLoRecibidoError extends Error {
  constructor(public readonly detalle: string[]) {
    super(detalle.join(" "));
    this.name = "ExcedeLoRecibidoError";
  }
}

/** Un producto que nunca entró de ese proveedor por el sistema, sin explicar por qué. */
export class SinOrigenError extends Error {
  constructor(public readonly nombres: string[]) {
    super(`${nombres.join(", ")} no ${nombres.length === 1 ? "llegó" : "llegaron"} de este proveedor por el sistema: escribe por qué lo devuelves igual.`);
    this.name = "SinOrigenError";
  }
}

/** Cuánto de un producto se le puede devolver a un proveedor y a qué costo. */
export interface RetornableProducto {
  recibido: number;
  devuelto: number;
  retornable: number;
  /** Lo que costó en la última orden de ese proveedor donde entró. */
  ultimoCosto: { costo: number; fecha: string; ordenId: string; codigo: string } | null;
}

export interface LineaOrigen {
  productId: number;
  nombre: string;
  unidad: string;
  costo: number;
  /** Lo que entró al stock en ESTA orden. */
  llegaron: number;
  /** min(llegaron, lo que queda por devolver de ese producto a este proveedor). */
  puedesDevolver: number;
}

export interface OrigenDevolucion {
  ordenId: string;
  codigo: string;
  fecha: string;
  lineas: LineaOrigen[];
}

/** Tolerancia en la unidad del negocio (unidades o kg), no en el epsilon del float. */
const TOLERANCIA = 0.001;

/**
 * Lo que entró de un proveedor y lo que ya se le devolvió, por producto. «Entró» =
 * movimientos `compra` del kardex que apuntan a sus órdenes (la recepción usa
 * `OC-<id>`, el ingreso directo `<id>`): lo dañado al recibir es `merma`, ya va
 * como reclamo sin producto, y no cuenta.
 */
async function entradasDelProveedor(tenantId: string, proveedorId: string, productIds?: number[]) {
  const ordenes = await prisma.purchaseOrder.findMany({
    where: { tenantId, supplierId: proveedorId },
    select: { id: true, createdAt: true, receivedDate: true, items: { select: { productId: true, name: true, unit: true, unitCost: true } } },
  });
  const ordenDeRef = new Map<string, string>();
  for (const o of ordenes) { ordenDeRef.set(o.id, o.id); ordenDeRef.set(`OC-${o.id}`, o.id); }
  const filtroProducto = productIds ? { productId: { in: productIds } } : {};

  const [movs, devueltos] = await Promise.all([
    ordenDeRef.size
      ? prisma.inventoryMovement.findMany({
          where: { tenantId, type: "compra", reference: { in: [...ordenDeRef.keys()] }, ...filtroProducto },
          select: { productId: true, quantity: true, reference: true, createdAt: true },
        })
      : Promise.resolve([]),
    prisma.supplierReturnItem.findMany({
      where: { productId: productIds ? { in: productIds } : { not: null }, supplierReturn: { tenantId, proveedorId, estado: { not: "ANULADA" } } },
      select: { productId: true, cantidad: true },
    }),
  ]);

  /** ordenId → productId → unidades que entraron. */
  const porOrden = new Map<string, Map<number, number>>();
  /** ordenId → cuándo entró lo último (si la orden no guardó `receivedDate`). */
  const entroEl = new Map<string, Date>();
  const recibido = new Map<number, number>();
  for (const m of movs) {
    const ordenId = m.reference ? ordenDeRef.get(m.reference) : undefined;
    if (!ordenId) continue;
    const q = Math.abs(m.quantity);
    recibido.set(m.productId, (recibido.get(m.productId) ?? 0) + q);
    const linea = porOrden.get(ordenId) ?? new Map<number, number>();
    linea.set(m.productId, (linea.get(m.productId) ?? 0) + q);
    porOrden.set(ordenId, linea);
    const previo = entroEl.get(ordenId);
    if (!previo || m.createdAt > previo) entroEl.set(ordenId, m.createdAt);
  }
  const devuelto = new Map<number, number>();
  for (const d of devueltos) if (d.productId != null) devuelto.set(d.productId, (devuelto.get(d.productId) ?? 0) + d.cantidad);

  const fechaDe = (o: (typeof ordenes)[number]) => o.receivedDate ?? entroEl.get(o.id) ?? o.createdAt;
  const recibidas = ordenes.filter((o) => porOrden.has(o.id)).sort((a, b) => fechaDe(b).getTime() - fechaDe(a).getTime());

  const porProducto = new Map<number, RetornableProducto>();
  for (const [productId, r] of recibido) {
    const dev = devuelto.get(productId) ?? 0;
    const ultima = recibidas.find((o) => porOrden.get(o.id)?.has(productId) && o.items.some((i) => i.productId === productId));
    const item = ultima?.items.find((i) => i.productId === productId);
    porProducto.set(productId, {
      recibido: r,
      devuelto: dev,
      retornable: Math.max(0, r - dev),
      ultimoCosto: ultima && item ? { costo: Number(item.unitCost), fecha: fechaDe(ultima).toISOString(), ordenId: ultima.id, codigo: codigoDeOrden(ultima.id) } : null,
    });
  }
  return { recibidas, porOrden, porProducto, devuelto, fechaDe };
}

export const SupplierReturnsDB = {
  async listWithItems(tenantId: string) {
    return prisma.supplierReturn.findMany({
      where: { tenantId },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * Las órdenes de un proveedor de las que entró mercadería (las 15 más nuevas), con lo
   * que todavía se puede devolver de cada línea, y lo retornable por producto (C49).
   */
  async origenes(tenantId: string, proveedorId: string) {
    const { recibidas, porOrden, porProducto, fechaDe } = await entradasDelProveedor(tenantId, proveedorId);
    const ordenes: OrigenDevolucion[] = recibidas.slice(0, 15).map((o) => {
      const entro = porOrden.get(o.id)!;
      const lineas: LineaOrigen[] = [];
      for (const item of o.items) {
        const llegaron = entro.get(item.productId) ?? 0;
        if (llegaron <= 0 || lineas.some((l) => l.productId === item.productId)) continue;
        lineas.push({
          productId: item.productId,
          nombre: item.name,
          unidad: item.unit || "und",
          costo: Number(item.unitCost),
          llegaron,
          puedesDevolver: Math.min(llegaron, porProducto.get(item.productId)?.retornable ?? 0),
        });
      }
      return { ordenId: o.id, codigo: codigoDeOrden(o.id), fecha: fechaDe(o).toISOString(), lineas };
    }).filter((o) => o.lineas.length > 0);
    return { ordenes, porProducto: Object.fromEntries(porProducto) };
  },

  /**
   * El costo de cada ítem con `productId` lo pone el servidor (regla 6: totales en backend):
   * antes guardaba el `precioUnitario` que mandaba el navegador sin mirarlo (10-10). Un
   * `productId` que no es de este negocio se rechaza: con él la devolución movería stock ajeno.
   *
   * 17-10 (C49/C51): no se devuelve más de lo que entró de ese proveedor neto de lo ya
   * devuelto; un producto que nunca entró de él pide `sinOrigenMotivo`. El costo sale de la
   * orden de origen, si no de su última compra a ese proveedor, si no de la ficha; sin
   * ninguno queda `null` = «pendiente de valoración» (nunca S/ 0).
   */
  async createWithItems(tenantId: string, data: CreateData) {
    const ids = [...new Set(data.items.map((i) => i.productId).filter((id): id is number => id != null))];
    const productos = ids.length
      ? await prisma.product.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, costPrice: true } })
      : [];
    const costoFicha = new Map(productos.map((p) => [p.id, p.costPrice == null ? null : Number(p.costPrice)]));
    const ajeno = ids.find((id) => !costoFicha.has(id));
    if (ajeno !== undefined) throw new ProductoAjenoError(ajeno);

    const lineasNotas: string[] = [];
    const costoOrigen = new Map<number, number>();
    if (ids.length > 0) {
      const ent = data.proveedorId ? await entradasDelProveedor(tenantId, data.proveedorId, ids) : null;
      const origen = data.origenOrdenId ? ent?.recibidas.find((o) => o.id === data.origenOrdenId) : undefined;
      if (data.origenOrdenId && !origen) throw new OrigenInvalidoError();
      if (origen && ent) {
        for (const i of origen.items) if (!costoOrigen.has(i.productId)) costoOrigen.set(i.productId, Number(i.unitCost));
        lineasNotas.push(`Origen: orden ${codigoDeOrden(origen.id)} recibida el ${diaYFecha(ent.fechaDe(origen))}.`);
      }

      const pedido = new Map<number, { nombre: string; cantidad: number }>();
      for (const i of data.items) {
        if (i.productId == null) continue;
        const p = pedido.get(i.productId);
        pedido.set(i.productId, { nombre: p?.nombre ?? i.nombre, cantidad: (p?.cantidad ?? 0) + i.cantidad });
      }
      const sinOrigen: string[] = [];
      const excede: string[] = [];
      for (const [productId, { nombre, cantidad }] of pedido) {
        const r = ent?.porProducto.get(productId);
        if (!r || r.recibido <= 0) { sinOrigen.push(nombre); continue; }
        const enOrigen = origen ? ent?.porOrden.get(origen.id)?.get(productId) : undefined;
        const tope = enOrigen != null ? Math.min(enOrigen, r.retornable) : r.retornable;
        if (cantidad > tope + TOLERANCIA) {
          excede.push(`${nombre}: pides ${cantidad} y puedes devolver hasta ${tope} (${enOrigen != null ? `en esa orden llegaron ${enOrigen}` : `te llegaron ${r.recibido}`}, ya le devolviste ${r.devuelto}).`);
        }
      }
      if (excede.length > 0) throw new ExcedeLoRecibidoError(excede);
      const motivoSinOrigen = data.sinOrigenMotivo?.trim();
      if (sinOrigen.length > 0) {
        if (!motivoSinOrigen) throw new SinOrigenError(sinOrigen);
        lineasNotas.push(`Sin recepción en el sistema (${sinOrigen.join(", ")}): ${motivoSinOrigen}`);
      }
      // El costo de la última compra a ESE proveedor: es lo que se le reclama.
      for (const id of ids) {
        if (costoOrigen.has(id)) continue;
        const ultimo = ent?.porProducto.get(id)?.ultimoCosto;
        if (ultimo) costoOrigen.set(id, ultimo.costo);
      }
    }

    const notas = [data.notas?.trim(), ...lineasNotas].filter(Boolean).join("\n") || undefined;
    return prisma.supplierReturn.create({
      data: {
        proveedorId: data.proveedorId,
        proveedorNombre: data.proveedorNombre,
        motivo: data.motivo,
        notas,
        estado: "PENDIENTE",
        tenantId,
        items: {
          create: data.items.map((i) => ({
            nombre: i.nombre,
            cantidad: i.cantidad,
            unidad: i.unidad,
            productId: i.productId ?? null,
            precioUnitario: i.productId != null
              ? (costoOrigen.get(i.productId) ?? costoFicha.get(i.productId) ?? null)
              : (i.precioUnitario ?? null),
          })),
        },
      },
      include: { items: true },
    });
  },
};
