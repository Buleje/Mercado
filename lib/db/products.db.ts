import "server-only";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import type {
  Product as PProduct,
  PriceHistory as PPriceHistory,
  Bundle as PBundle,
  BundleItem as PBundleItem,
} from "@/lib/generated/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { DbProduct } from "./misc.db";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";
import { resolveTenantSlugToId } from "@/lib/resolve-tenant";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString();
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbPriceHistory = {
  id: number;
  productId: number;
  oldPrice: number;
  newPrice: number;
  changedAt: string;
};

export type DbBundleItem = { id: number; productId: number; quantity: number };
export type DbBundle = {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  active: boolean;
  createdAt: string;
  items: DbBundleItem[];
};

/** Una fila de «Precios en bloque»: lo que el usuario vio (esperado) y lo que eligió. */
export type FilaPrecioLote = {
  productId: number;
  precioEsperado: number;
  costoEsperado: number | null;
  precioNuevo: number;
  /** undefined = el costo no se toca. */
  costoNuevo?: number | null;
};
export type PrecioYCosto = { precio: number; costo: number | null };
export type ResultadoPreciosLote = {
  aplicadas: Array<{ productId: number; antes: PrecioYCosto; despues: PrecioYCosto }>;
  rechazadas: Array<{ productId: number; motivo: "cambio" | "no-existe"; precioActual: number | null; costoActual: number | null }>;
  reciboId: string | null;
};

// ── Mappers ───────────────────────────────────────────────────────────────────

// Audit 2026-06-10 P2: select acotado a los campos que mapProduct consume.
// Antes getAll traía el modelo Product completo (incl. timestamps y campos
// internos) para TODOS los productos del tenant en cada revalidación.
const PRODUCT_SELECT = {
  id: true, name: true, category: true, price: true, costPrice: true,
  image: true, description: true, unit: true, badge: true, barcode: true,
  stock: true, stockMin: true, stockMax: true, active: true, tenantId: true,
  type: true, isPrepared: true, brand: true, sku: true, taxType: true, weightKg: true,
  dimensions: true, durationLabel: true, pricingUnit: true, notes: true,
  specsJson: true, richContentJson: true,
} as const;

function mapProduct(p: PProduct): DbProduct {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    price: toNumOrZero(p.price),
    ...(p.costPrice != null && { costPrice: toNumOrZero(p.costPrice) }),
    image: p.image,
    ...(p.description != null && { description: p.description }),
    unit: p.unit,
    ...(p.badge != null && { badge: p.badge }),
    ...(p.barcode != null && { barcode: p.barcode }),
    ...(p.stock != null && { stock: p.stock }),
    ...(p.stockMin != null && { stockMin: p.stockMin }),
    ...(p.stockMax != null && { stockMax: p.stockMax }),
    active: p.active,
    tenantId: p.tenantId,
    ...(p.type != null && { type: p.type }),
    isPrepared: p.isPrepared ?? false,
    ...(p.brand != null && { brand: p.brand }),
    ...(p.sku != null && { sku: p.sku }),
    ...(p.taxType != null && { taxType: p.taxType }),
    ...(p.weightKg != null && { weightKg: p.weightKg }),
    ...(p.dimensions != null && { dimensions: p.dimensions }),
    ...(p.durationLabel != null && { durationLabel: p.durationLabel }),
    ...(p.pricingUnit != null && { pricingUnit: p.pricingUnit }),
    ...(p.notes != null && { notes: p.notes }),
    ...(p.specsJson != null && { specsJson: p.specsJson }),
    ...(p.richContentJson != null && { richContentJson: p.richContentJson }),
  };
}

function mapPriceHistory(p: PPriceHistory): DbPriceHistory {
  return { id: p.id, productId: p.productId, oldPrice: toNumOrZero(p.oldPrice), newPrice: toNumOrZero(p.newPrice), changedAt: toISO(p.changedAt) };
}

function mapBundle(b: PBundle & { items: PBundleItem[] }): DbBundle {
  return {
    id: b.id, name: b.name, description: b.description, price: toNumOrZero(b.price),
    image: b.image, active: b.active, createdAt: toISO(b.createdAt),
    items: b.items.map(i => ({ id: i.id, productId: i.productId, quantity: i.quantity })),
  };
}

// ── Products ──────────────────────────────────────────────────────────────────

export const ProductsDB = {
  /**
   * Cuenta los productos activos con stock bajo (lte threshold) para el
   * SSE de notificaciones del admin.
   *
   * tenantId SIEMPRE 1er parámetro.
   */
  async countLowStock(tenantId: string, threshold = 5): Promise<number> {
    return prisma.product.count({
      where: {
        tenantId,
        active: true,
        deletedAt: null,
        stock: { lte: threshold },
      },
    });
  },

  async getAll(tenantId: string): Promise<DbProduct[]> {
    "use cache";
    // 5 min revalidate, 1 min stale OK, 30 min hard expire. Productos
    // cambian (precio, stock, badge) pero no en sub-segundo. Sin cache
    // /tienda y /api/products tardaban 16-18s por compile + DB roundtrip.
    cacheLife({ revalidate: 300, stale: 60, expire: 1800 });
    cacheTag(`tenant:${tenantId}:products`);

    // El header `x-tenant-id` puede venir como SLUG (desde /t/<slug>/...)
    // o como cuid. Resolvemos slug→cuid para que la query encuentre los
    // productos del tenant correcto.
    let resolvedId = tenantId;
    let rows = await prisma.product.findMany({
      where: { deletedAt: null, tenantId: resolvedId },
      orderBy: { id: "asc" },
      select: PRODUCT_SELECT,
    });
    if (rows.length === 0) {
      // FIX 2026-05-07 (audit N+1 tenant.findUnique): usar resolveTenantSlugToId
      // que tiene cache 5min + dedupe in-flight. Antes 3 callers (products,
      // settings, marketplace) hacían prisma.findUnique en paralelo para el
      // mismo slug → 3x query en 89ms warning del query-monitor.
      const resolved = await resolveTenantSlugToId(tenantId);
      if (resolved && resolved !== tenantId) {
        resolvedId = resolved;
        rows = await prisma.product.findMany({
          where: { deletedAt: null, tenantId: resolvedId },
          orderBy: { id: "asc" },
          select: PRODUCT_SELECT,
        });
      }
    }
    // PRODUCT_SELECT cubre todo lo que mapProduct lee — cast seguro.
    return rows.map((r) => mapProduct(r as PProduct));
  },

  /**
   * Cursor-based paginated listing of products.
   * Returns up to `limit` products plus the cursor for the next page.
   */
  async getPage(opts: {
    tenantId: string;
    cursor?: number;
    limit?: number;
    category?: string;
    search?: string;
    active?: boolean;
  }): Promise<{ products: DbProduct[]; nextCursor: number | null; total: number }> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);

    const where: Record<string, unknown> = { deletedAt: null };
    if (opts.tenantId) where.tenantId = opts.tenantId;
    if (opts.category) where.category = opts.category;
    if (opts.active !== undefined) where.active = opts.active;
    if (opts.search) {
      where.OR = [
        { name: { contains: opts.search, mode: "insensitive" } },
        { barcode: { contains: opts.search, mode: "insensitive" } },
      ];
    }

    const [rows, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        orderBy: { id: "asc" },
        take: limit + 1,
        ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
      }),
      prisma.product.count({ where }),
    ]);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return { products: items.map(mapProduct), nextCursor, total };
  },
  /**
   * Un producto vivo del tenant. `deletedAt: null` NO es opcional acá.
   *
   * 2026-08-11: este método era el único de lectura por identidad que no
   * filtraba borrados (`getBySku` y `listBySkus` sí lo hacían), y el borrado
   * de productos es SOFT. Efecto medido: `DELETE /api/products/<id>` devolvía
   * 200, el producto desaparecía de la lista, y un `GET` por id lo seguía
   * devolviendo con `active: true`. Lo consultan por id el recomendador, el
   * agente de pricing, las acciones del asistente IA y el generador de QR:
   * todos podían operar sobre mercadería que el bodeguero dio de baja.
   */
  async getById(tenantId: string, id: number): Promise<DbProduct | null> {
    const p = await prisma.product.findFirst({ where: { id, tenantId, deletedAt: null } });
    return p ? mapProduct(p) : null;
  },

  /**
   * Incluye los borrados. Sólo para mirar hacia atrás —una venta vieja que
   * apunta a un producto dado de baja—, nunca para operar sobre él.
   */
  async getByIdIncluyendoBorrados(tenantId: string, id: number): Promise<DbProduct | null> {
    const p = await prisma.product.findFirst({ where: { id, tenantId } });
    return p ? mapProduct(p) : null;
  },
  /** Busca por SKU interno (ej. vínculo activo↔servicio "asset:<id>"). */
  async getBySku(tenantId: string, sku: string): Promise<DbProduct | null> {
    const p = await prisma.product.findFirst({ where: { tenantId, sku, deletedAt: null } });
    return p ? mapProduct(p) : null;
  },
  async listBySkus(tenantId: string, skus: string[]): Promise<DbProduct[]> {
    if (skus.length === 0) return [];
    const rows = await prisma.product.findMany({ where: { tenantId, sku: { in: skus }, deletedAt: null } });
    return rows.map(mapProduct);
  },
  /**
   * Cuenta cuantos de los productIds dados pertenecen al tenant
   * (active + deletedAt:null). Util para ownership checks bulk
   * (ej. recetas que referencian multiples productos).
   *
   * Audit project-wide 2026-05-19 — migracion de /api/recetas.
   */
  async countOwnedByIds(tenantId: string, ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;
    return prisma.product.count({
      where: { id: { in: ids }, tenantId, deletedAt: null },
    });
  },
  /** `costPrice: null` = quitar el costo (undefined = no tocarlo). */
  async upsert(product: Omit<DbProduct, "costPrice"> & { costPrice?: number | null }): Promise<DbProduct> {
    const d = {
      name: product.name, category: product.category, price: product.price,
      costPrice: product.costPrice, image: product.image,
      description: product.description ?? null,
      unit: product.unit,
      badge: product.badge, barcode: product.barcode, stock: product.stock,
      stockMin: product.stockMin, stockMax: product.stockMax, active: product.active,
      // undefined ⇒ Prisma omite el campo (no pisa). Producto/servicio completo.
      type: product.type, isPrepared: product.isPrepared, brand: product.brand, sku: product.sku,
      taxType: product.taxType, weightKg: product.weightKg, dimensions: product.dimensions,
      durationLabel: product.durationLabel, pricingUnit: product.pricingUnit, notes: product.notes,
      specsJson: product.specsJson, richContentJson: product.richContentJson,
    };
    if (product.id) {
      const existing = await prisma.product.findUnique({
        where: { id: product.id },
        select: { tenantId: true },
      });
      if (existing && existing.tenantId !== product.tenantId) {
        throw new Error(
          `[products.db] upsert: cross-tenant access denied for product id=${product.id}`,
        );
      }
    }
    const row = await prisma.product.upsert({
      where: { id: product.id },
      create: { id: product.id, ...d, tenantId: product.tenantId },
      update: d,
    });
    // PERF 2026-05-24: invalidar el cache de getAll (cacheTag products) tras
    // el write — sin esto /tienda y /api/products sirven datos stale hasta 5min.
    // `{ expire: 0 }` y no `"max"`: con "max" la PRIMERA lectura tras el write
    // todavía devuelve la lista vieja (stale-while-revalidate); el costo viejo
    // entraba al modal de editar y, al guardarlo, se reescribía (gastos, 09-10).
    revalidateTag(`tenant:${product.tenantId}:products`, { expire: 0 });
    return mapProduct(row);
  },
  /**
   * Crea un producto NUEVO dejando que la DB asigne el id (autoincrement).
   * Usar para altas reales — `upsert` con id=0 insertaría id=0 literal (colisión).
   */
  async create(product: Omit<DbProduct, "id">): Promise<DbProduct> {
    const row = await prisma.product.create({
      data: {
        name: product.name, category: product.category, price: product.price,
        costPrice: product.costPrice, image: product.image,
        description: product.description ?? null, unit: product.unit,
        badge: product.badge, barcode: product.barcode, stock: product.stock,
        stockMin: product.stockMin, stockMax: product.stockMax, active: product.active,
        tenantId: product.tenantId,
        type: product.type, isPrepared: product.isPrepared ?? false, brand: product.brand, sku: product.sku,
        taxType: product.taxType, weightKg: product.weightKg, dimensions: product.dimensions,
        durationLabel: product.durationLabel, pricingUnit: product.pricingUnit, notes: product.notes,
        specsJson: product.specsJson ?? null, richContentJson: product.richContentJson ?? null,
      },
    });
    revalidateTag(`tenant:${product.tenantId}:products`, "max");
    return mapProduct(row);
  },
  /** Soft-delete: sets deletedAt instead of physically removing the row. */
  async delete(tenantId: string, id: number): Promise<void> {
    await prisma.$executeRaw`UPDATE "Product" SET "deletedAt" = NOW() WHERE id = ${id} AND "tenantId" = ${tenantId}`.catch((err) => {
      logger.error("[products.db] soft-delete failed", { id, tenantId, error: String(err) });
    });
    revalidateTag(`tenant:${tenantId}:products`, "max");
  },
  /** Hard-delete: permanently removes the row (admin use only). */
  async hardDelete(tenantId: string, id: number): Promise<void> {
    await prisma.product.deleteMany({ where: { id, tenantId } }).catch((err) => {
      logger.error("[products.db] hard-delete failed", { id, tenantId, error: String(err) });
    });
    revalidateTag(`tenant:${tenantId}:products`, "max");
  },

  /**
   * Devuelve productos con stock menor al umbral indicado, ordenados
   * por stock ascendente (los más críticos primero).
   * Usado por el dashboard del vendedor para mostrar alertas de stock bajo.
   */
  async getLowStock(
    tenantId: string,
    opts: { threshold?: number; limit?: number } = {},
  ): Promise<DbProduct[]> {
    const threshold = opts.threshold ?? 5;
    const limit = Math.min(opts.limit ?? 10, 50);
    const rows = await prisma.product.findMany({
      where: {
        tenantId,
        deletedAt: null,
        active: true,
        stock: { lte: threshold, not: null },
      },
      orderBy: { stock: "asc" },
      take: limit,
    });
    return rows.map(mapProduct);
  },
  /** Bulk soft-delete: sets deletedAt on multiple products at once. */
  async bulkDelete(tenantId: string, ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await prisma.product.updateMany({
      where: { id: { in: ids }, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    revalidateTag(`tenant:${tenantId}:products`, "max");
    return result.count;
  },

  /**
   * Devuelve { name, barcode } de todos los productos no eliminados del tenant.
   * Usado por bulk-import para deduplicar contra el catálogo existente.
   *
   * tenantId SIEMPRE 1er parámetro.
   */
  async findExistingForImport(
    tenantId: string,
  ): Promise<Array<{ name: string | null; barcode: string | null }>> {
    return prisma.product.findMany({
      where: { tenantId, deletedAt: null },
      select: { name: true, barcode: true },
    });
  },

  /**
   * Inserta un batch de productos en masa.
   * Cada row DEBE incluir tenantId. Preserva skipDuplicates:true igual que
   * el createMany original del bulk-import route.
   *
   * Devuelve el count de filas creadas.
   * tenantId SIEMPRE 1er parámetro (para consistencia de firma).
   */
  async bulkCreate(
    tenantId: string,
    rows: Prisma.ProductCreateManyInput[],
  ): Promise<number> {
    if (rows.length === 0) return 0;
    const result = await prisma.product.createMany({
      data: rows,
      skipDuplicates: true,
    });
    revalidateTag(`tenant:${tenantId}:products`, "max");
    return result.count;
  },

  /**
   * Cuenta productos del tenant (sin filtro deletedAt — igual que el count
   * original del demo-products route para decidir si ya tiene datos).
   *
   * tenantId SIEMPRE 1er parámetro.
   */
  async countForTenant(tenantId: string): Promise<number> {
    return prisma.product.count({ where: { tenantId } });
  },

  /**
   * Crea un producto demo con los campos exactos del seeder de bodega peruana.
   * Equivalente al prisma.product.create original del demo-products route.
   * Invalida el cache de getAll tras cada insert.
   *
   * tenantId SIEMPRE 1er parámetro.
   */
  async createDemo(
    tenantId: string,
    data: {
      name: string;
      category: string;
      price: number;
      costPrice: number;
      unit: string;
      stock: number;
      stockMin: number;
      stockMax: number;
      image: string;
      active: boolean;
      barcode: string;
    },
  ): Promise<void> {
    await prisma.product.create({
      data: {
        tenantId,
        name: data.name,
        category: data.category,
        price: data.price,
        costPrice: data.costPrice,
        unit: data.unit,
        stock: data.stock,
        stockMin: data.stockMin,
        stockMax: data.stockMax,
        image: data.image,
        active: data.active,
        barcode: data.barcode,
      },
    });
    revalidateTag(`tenant:${tenantId}:products`, "max");
  },

  /**
   * Cambia precios (y costos) de muchos productos de una vez, con la vista
   * previa como contrato — Comandos IA › Precios en bloque (aplicar y deshacer).
   *
   * En UNA transacción:
   *  1. bloquea (`FOR UPDATE`) los productos del tenant por id: una venta o una
   *     edición que llegue a la vez espera su turno;
   *  2. rechaza la fila cuyo precio o costo de HOY no es el que vio el usuario
   *     (al céntimo). Sin `parcial`, una sola rechazada = no se escribe nada y
   *     la ruta responde 409 «cambió desde la vista previa»; con `parcial`
   *     (deshacer) se aplican las que siguen igual y se informan las demás;
   *  3. escribe precio/costo con UN `UPDATE … FROM unnest` (500 filas = 1
   *     viaje, no 500), el `PriceHistory` de cada precio que cambió (la misma
   *     regla que PATCH /api/products/bulk-price) y
   *  4. el recibo en `ActivityLog` con `antes`/`despues`: sin recibo no hay
   *     deshacer, así que nace en la misma transacción que el cambio.
   *
   * Después invalida `tenant:<id>:products` como bulk-price. Las cachés del
   * tablero (dashboard/admin) las invalida la ruta.
   *
   * tenantId SIEMPRE 1er parámetro; un id de otro tenant cae en `no-existe`.
   */
  async aplicarPreciosEnLote(
    tenantId: string,
    filas: FilaPrecioLote[],
    opts: {
      parcial?: boolean;
      recibo: { action: string; entityId?: string | null; user: string; detalle: Record<string, unknown> };
    },
  ): Promise<ResultadoPreciosLote> {
    if (filas.length === 0) return { aplicadas: [], rechazadas: [], reciboId: null };
    const ids = filas.map((f) => f.productId);
    if (new Set(ids).size !== ids.length) throw new Error("aplicarPreciosEnLote: productId repetido");
    const cent = (v: number) => Math.round(Math.round(v * 1e6) / 1e4);
    const igual = (a: number | null, b: number | null) => (a == null || b == null ? a == null && b == null : cent(a) === cent(b));
    const num = (v: unknown): number | null => (v == null ? null : Number(String(v)));

    const resultado = await prisma.$transaction(
      async (tx) => {
        const hoy = await tx.$queryRaw<Array<{ id: number; price: unknown; costPrice: unknown }>>`
          SELECT "id", "price", "costPrice" FROM "Product"
          WHERE "tenantId" = ${tenantId} AND "id" = ANY(${ids}::int[]) AND "deletedAt" IS NULL
          ORDER BY "id"
          FOR UPDATE
        `;
        const porId = new Map(hoy.map((r) => [r.id, { precio: num(r.price) ?? 0, costo: num(r.costPrice) }]));
        const aplicadas: ResultadoPreciosLote["aplicadas"] = [];
        const rechazadas: ResultadoPreciosLote["rechazadas"] = [];
        for (const f of filas) {
          const actual = porId.get(f.productId);
          if (!actual) {
            rechazadas.push({ productId: f.productId, motivo: "no-existe", precioActual: null, costoActual: null });
            continue;
          }
          if (!igual(actual.precio, f.precioEsperado) || !igual(actual.costo, f.costoEsperado)) {
            rechazadas.push({ productId: f.productId, motivo: "cambio", precioActual: actual.precio, costoActual: actual.costo });
            continue;
          }
          const despues = {
            precio: cent(f.precioNuevo) / 100,
            costo: f.costoNuevo === undefined ? actual.costo : f.costoNuevo === null ? null : cent(f.costoNuevo) / 100,
          };
          if (igual(despues.precio, actual.precio) && igual(despues.costo, actual.costo)) continue;
          aplicadas.push({ productId: f.productId, antes: actual, despues });
        }
        if ((rechazadas.length > 0 && !opts.parcial) || aplicadas.length === 0) {
          return { aplicadas: opts.parcial ? aplicadas : [], rechazadas, reciboId: null };
        }

        await tx.$executeRaw`
          UPDATE "Product" AS p
          SET "price" = v.precio, "costPrice" = v.costo
          FROM unnest(
            ${aplicadas.map((a) => a.productId)}::int[],
            ${aplicadas.map((a) => a.despues.precio)}::numeric[],
            ${aplicadas.map((a) => a.despues.costo)}::numeric[]
          ) AS v(id, precio, costo)
          WHERE p."id" = v.id AND p."tenantId" = ${tenantId}
        `;
        const historial = aplicadas
          .filter((a) => !igual(a.antes.precio, a.despues.precio))
          .map((a) => ({ tenantId, productId: a.productId, oldPrice: a.antes.precio, newPrice: a.despues.precio }));
        if (historial.length > 0) await tx.priceHistory.createMany({ data: historial });

        const recibo = await tx.activityLog.create({
          data: {
            tenantId,
            action: opts.recibo.action,
            entity: "comando-ia",
            entityId: opts.recibo.entityId ?? null,
            user: opts.recibo.user,
            detail: JSON.stringify({
              v: 1,
              ...opts.recibo.detalle,
              filas: aplicadas.length,
              antes: aplicadas.map((a) => ({ productId: a.productId, ...a.antes })),
              despues: aplicadas.map((a) => ({ productId: a.productId, ...a.despues })),
            }),
          },
          select: { id: true },
        });
        return { aplicadas, rechazadas, reciboId: String(recibo.id) };
      },
      { maxWait: 10_000, timeout: 20_000 },
    );

    // `expire: 0`: con "max" el plan pedido justo después leía el precio viejo
    // (24,9 a +0 ms, 25,15 a +1500 ms) y aplicarlo daba 409 en todas las filas.
    if (resultado.reciboId) revalidateTag(`tenant:${tenantId}:products`, { expire: 0 });
    return resultado;
  },
};

// ── Price History ─────────────────────────────────────────────────────────────

export const PriceHistoryDB = {
  async getByProduct(tenantId: string, productId: number): Promise<DbPriceHistory[]> {
    return (await prisma.priceHistory.findMany({ where: { productId, tenantId }, orderBy: { changedAt: "desc" } })).map(mapPriceHistory);
  },
  /**
   * Batch: historial de N productos en UNA query (productId IN ids). Mata el N+1
   * del sparkline del inventario (84 productos = 84 requests → 1). Perf 2026-05-29.
   */
  async getByProducts(tenantId: string, productIds: number[]): Promise<Record<number, DbPriceHistory[]>> {
    if (productIds.length === 0) return {};
    const rows = await prisma.priceHistory.findMany({
      where: { tenantId, productId: { in: productIds } },
      orderBy: { changedAt: "desc" },
    });
    const map: Record<number, DbPriceHistory[]> = {};
    for (const id of productIds) map[id] = [];
    for (const r of rows) (map[r.productId] ??= []).push(mapPriceHistory(r));
    return map;
  },
  async getAll(tenantId: string, limit = 100): Promise<DbPriceHistory[]> {
    return (await prisma.priceHistory.findMany({ where: { tenantId }, orderBy: { changedAt: "desc" }, take: limit })).map(mapPriceHistory);
  },
  async record(productId: number, oldPrice: number, newPrice: number, tenantId: string): Promise<DbPriceHistory> {
    if (oldPrice === newPrice) return { id: 0, productId, oldPrice, newPrice, changedAt: new Date().toISOString() };
    const row = await prisma.priceHistory.create({ data: { productId, oldPrice, newPrice, tenantId } });
    return mapPriceHistory(row);
  },
};

// ── Bundles ───────────────────────────────────────────────────────────────────

export const BundlesDB = {
  async getAll(tenantId: string): Promise<DbBundle[]> {
    const where: Record<string, unknown> = { tenantId };
    return (await prisma.bundle.findMany({ where, include: { items: true }, orderBy: { createdAt: "desc" } })).map(mapBundle);
  },
  async getActive(tenantId: string): Promise<DbBundle[]> {
    return (await prisma.bundle.findMany({ where: { active: true, tenantId }, include: { items: true }, orderBy: { createdAt: "desc" } })).map(mapBundle);
  },
  async add(data: { name: string; description?: string; price: number; image?: string; tenantId: string; items: { productId: number; quantity: number }[] }): Promise<DbBundle> {
    // SECURITY 2026-05-06 (audit promotions #5): validar que TODOS los
    // productos del bundle pertenezcan al tenant. Antes admin de A podía
    // armar bundle con productIds de tenant B → exponía catálogo ajeno.
    const productIds = [...new Set(data.items.map((i) => i.productId))];
    if (productIds.length > 0) {
      const owned = await prisma.product.findMany({
        where: { id: { in: productIds }, tenantId: data.tenantId, deletedAt: null },
        select: { id: true, stock: true, active: true, name: true },
      });
      if (owned.length !== productIds.length) {
        throw new Error("BUNDLE_PRODUCT_CROSS_TENANT");
      }
      // SECURITY 2026-05-05 (audit promotions #6): stock check al armar bundle.
      // Antes se podía crear bundle con productos sin stock o inactivos —
      // promesas vacías al cliente.
      const stockMap = new Map(owned.map((p) => [p.id, { stock: p.stock ?? 0, active: p.active, name: p.name }]));
      for (const item of data.items) {
        const info = stockMap.get(item.productId);
        if (!info || !info.active) {
          throw new Error(`BUNDLE_PRODUCT_INACTIVE: ${info?.name ?? item.productId}`);
        }
        if (info.stock != null && info.stock < item.quantity) {
          throw new Error(`BUNDLE_INSUFFICIENT_STOCK: ${info.name}`);
        }
      }
    }
    const row = await prisma.bundle.create({
      data: { name: data.name, description: data.description ?? "", price: data.price, image: data.image ?? "", tenantId: data.tenantId, items: { create: data.items } },
      include: { items: true },
    });
    return mapBundle(row);
  },
  async update(tenantId: string, id: string, data: { name?: string; description?: string; price?: number; image?: string; active?: boolean }): Promise<DbBundle | null> {
    const updated = await prisma.bundle.updateMany({ where: { id, tenantId }, data });
    if (updated.count === 0) return null;
    const row = await prisma.bundle.findFirst({ where: { id, tenantId }, include: { items: true } });
    return row ? mapBundle(row) : null;
  },
  async delete(tenantId: string, id: string): Promise<void> {
    await prisma.bundle.deleteMany({ where: { id, tenantId } }).catch((err) => {
      logger.error("[products.db] bundle delete failed", { id, tenantId, error: String(err) });
    });
  },
};
