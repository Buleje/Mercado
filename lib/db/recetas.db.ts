import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { toNumOrZero } from "@/lib/decimal-utils";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import type {
  RecetaCostBreakdown,
  RecetaCostIngredientLine,
  ProductionResult,
} from "@/lib/types/recetas";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbRecetaIngrediente = {
  id: string;
  recetaId: string;
  productoId: number;
  cantidad: number;
  unidad: string;
};

export type DbReceta = {
  id: string;
  tenantId: string;
  nombre: string;
  descripcion?: string;
  productoId?: number;
  costoTotal: number;
  activa: boolean;
  ingredientes: DbRecetaIngrediente[];
  createdAt: string;
  updatedAt: string;
};

export type DbProduccionLote = {
  id: string;
  tenantId: string;
  recetaId: string;
  cantidad: number;
  costoReal: number;
  notas?: string;
  producidoEn: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString();
}

function toNum(d: Prisma.Decimal | null | undefined): number {
  return d ? Number(d) : 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapIngrediente(i: any): DbRecetaIngrediente {
  return {
    id: i.id,
    recetaId: i.recetaId,
    productoId: i.productoId,
    cantidad: toNum(i.cantidad),
    unidad: i.unidad,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapReceta(r: any): DbReceta {
  return {
    id: r.id,
    tenantId: r.tenantId,
    nombre: r.nombre,
    ...(r.descripcion != null && { descripcion: r.descripcion }),
    ...(r.productoId != null && { productoId: r.productoId }),
    costoTotal: toNum(r.costoTotal),
    activa: r.activa,
    ingredientes: (r.ingredientes ?? []).map(mapIngrediente),
    createdAt: toISO(r.createdAt),
    updatedAt: toISO(r.updatedAt),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProduccion(p: any): DbProduccionLote {
  return {
    id: p.id,
    tenantId: p.tenantId,
    recetaId: p.recetaId,
    cantidad: toNum(p.cantidad),
    costoReal: toNum(p.costoReal),
    ...(p.notas != null && { notas: p.notas }),
    producidoEn: toISO(p.producidoEn),
  };
}

// ── Recetas DB ────────────────────────────────────────────────────────────────

export const RecetasDB = {
  async list(tenantId: string): Promise<DbReceta[]> {
    const rows = await prisma.receta.findMany({
      where: { tenantId },
      include: { ingredientes: true },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapReceta);
  },

  async getById(tenantId: string, id: string): Promise<DbReceta | null> {
    const row = await prisma.receta.findFirst({
      where: { id, tenantId },
      include: { ingredientes: true },
    });
    return row ? mapReceta(row) : null;
  },

  async create(data: {
    tenantId: string;
    nombre: string;
    descripcion?: string;
    productoId?: number;
    ingredientes: { productoId: number; cantidad: number; unidad?: string }[];
  }): Promise<DbReceta> {
    const row = await prisma.receta.create({
      data: {
        tenantId: data.tenantId,
        nombre: data.nombre,
        descripcion: data.descripcion,
        productoId: data.productoId,
        ingredientes: {
          create: data.ingredientes.map((i) => ({
            productoId: i.productoId,
            cantidad: i.cantidad,
            unidad: i.unidad ?? "unidad",
          })),
        },
      },
      include: { ingredientes: true },
    });

    // Auto-calculate cost after creation
    const costo = await this.calcularCosto(row.id);
    if (costo > 0) {
      const updated = await prisma.receta.update({
        where: { id: row.id },
        data: { costoTotal: costo },
        include: { ingredientes: true },
      });
      return mapReceta(updated);
    }

    return mapReceta(row);
  },

  async calcularCosto(recetaId: string): Promise<number> {
    const receta = await prisma.receta.findUnique({
      where: { id: recetaId },
      include: { ingredientes: { include: { producto: true } } },
    });
    if (!receta) return 0;

    let total = 0;
    for (const ing of receta.ingredientes) {
      // TD-018: costPrice / price son Decimal
      const costUnit = toNumOrZero(ing.producto.costPrice) || toNumOrZero(ing.producto.price);
      total += costUnit * Number(ing.cantidad);
    }

    await prisma.receta.update({
      where: { id: recetaId },
      data: { costoTotal: total },
    });

    return total;
  },

  async registrarProduccion(data: {
    tenantId: string;
    recetaId: string;
    cantidad: number;
    costoReal?: number;
    notas?: string;
  }): Promise<DbProduccionLote> {
    const row = await prisma.produccionLote.create({
      data: {
        tenantId: data.tenantId,
        recetaId: data.recetaId,
        cantidad: data.cantidad,
        costoReal: data.costoReal ?? 0,
        notas: data.notas,
      },
    });
    return mapProduccion(row);
  },

  // ── Contract: item #13 — cost breakdown + recordProduction ─────────────────

  /**
   * Returns a full cost breakdown of a recipe following the RecetaCostBreakdown
   * contract (lib/types/recetas.ts).
   *
   * - costoIngredientes: sum of (ingredient.cantidad × product.currentCost)
   *   (currentCost = costPrice || price as fallback — same rule as producir)
   * - costoManoObra + costoIndirectos: 0 today (schema has no field yet;
   *   followup: add Receta.manoObra / Receta.indirectos or read from
   *   PlatformSetting).
   * - precioVenta: linked product.price (0 if unlinked).
   * - Cached 60s with key `recipe-cost:${tenantId}:${recetaId}`.
   *
   * Returns null if the recipe does not exist OR if it belongs to another tenant.
   */
  async getCostBreakdown(
    tenantId: string,
    recetaId: string,
  ): Promise<RecetaCostBreakdown | null> {
    const cacheKey = `recipe-cost:${tenantId}:${recetaId}`;
    return getOrSet(cacheKey, 60, async () => {
      const receta = await prisma.receta.findFirst({
        where: { id: recetaId, tenantId },
        include: {
          ingredientes: { include: { producto: true } },
          producto: true,
        },
      });
      if (!receta) return null;

      const ingredientes: RecetaCostIngredientLine[] = [];
      let costoIngredientes = 0;

      for (const ing of receta.ingredientes) {
        const cantidad = toNumOrZero(ing.cantidad);
        const costoUnitario =
          toNumOrZero(ing.producto.costPrice) || toNumOrZero(ing.producto.price);
        const costoLinea = Math.round(cantidad * costoUnitario * 100) / 100;

        ingredientes.push({
          productoId: ing.productoId,
          nombre: ing.producto.name,
          cantidad,
          unidad: ing.unidad,
          costoUnitario,
          costoLinea,
        });

        costoIngredientes += costoLinea;
      }

      costoIngredientes = Math.round(costoIngredientes * 100) / 100;

      // TODO(followup): expose costoManoObra/costoIndirectos via schema field
      // or PlatformSetting. For now default to 0.
      const costoManoObra = 0;
      const costoIndirectos = 0;
      const costoTotalUnitario =
        Math.round((costoIngredientes + costoManoObra + costoIndirectos) * 100) /
        100;

      const precioVenta = receta.producto
        ? toNumOrZero(receta.producto.price)
        : 0;
      const margenBruto =
        Math.round((precioVenta - costoTotalUnitario) * 100) / 100;
      const margenPorcentaje =
        precioVenta > 0
          ? Math.round(((margenBruto / precioVenta) * 100) * 100) / 100
          : 0;

      return {
        recetaId: receta.id,
        recetaNombre: receta.nombre,
        costoIngredientes,
        costoManoObra,
        costoIndirectos,
        costoTotalUnitario,
        precioVenta,
        margenBruto,
        margenPorcentaje,
        ingredientes,
      };
    });
  },

  /**
   * Record a production run: decrement ingredient stock, insert negative
   * InventoryMovements, and if the recipe has a linked output product
   * (productoId) increment its stock and insert a positive InventoryMovement.
   * Persists a ProduccionLote row with the real cost computed from the
   * actual ingredient costPrice values. Runs inside a single transaction so
   * either everything succeeds or nothing happens.
   *
   * Throws on: recipe not found, wrong tenant, inactive recipe, or
   * insufficient stock for any ingredient.
   */
  async recordProduction(
    tenantId: string,
    recetaId: string,
    quantity: number,
    userId: string,
    notas?: string,
  ): Promise<ProductionResult> {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error("Cantidad inválida");
    }

    const receta = await prisma.receta.findFirst({
      where: { id: recetaId, tenantId },
      include: { ingredientes: { include: { producto: true } } },
    });
    if (!receta) throw new Error("Receta no encontrada");
    if (!receta.activa) throw new Error("La receta está desactivada");

    const result = await prisma.$transaction(async (tx) => {
      let totalCosto = 0;
      let movimientosCreados = 0;
      const stockIngrediente: ProductionResult["stockIngrediente"] = [];

      // perf audit P1 (N+1): cargamos TODOS los productos de la receta en UNA
      // sola query DENTRO de la transacción (stock fresco + scoped por tenantId,
      // antes el findUnique por-id ni filtraba tenantId). Los updates siguen
      // siendo por-producto porque cada uno descuenta su propio stock.
      const ingProductIds = receta.ingredientes.map((i) => i.productoId);
      const productos = await tx.product.findMany({
        where: { id: { in: ingProductIds }, tenantId },
      });
      const productoPorId = new Map(productos.map((p) => [p.id, p]));

      for (const ing of receta.ingredientes) {
        const cantidadNecesaria = toNumOrZero(ing.cantidad) * quantity;
        const producto = productoPorId.get(ing.productoId);
        if (!producto) {
          throw new Error(`Producto ${ing.productoId} no encontrado`);
        }
        const prevStock = producto.stock ?? 0;
        if (prevStock < cantidadNecesaria) {
          throw new Error(
            `Stock insuficiente para "${producto.name}": necesita ${cantidadNecesaria}, tiene ${prevStock}`,
          );
        }
        // InventoryMovement.quantity is Int — round up to keep audit faithful.
        const deduct = Math.ceil(cantidadNecesaria);
        const newStock = prevStock - deduct;

        await tx.product.update({
          where: { id: ing.productoId },
          data: { stock: newStock },
        });

        await tx.inventoryMovement.create({
          data: {
            tenantId,
            productId: ing.productoId,
            type: "production_consumption",
            quantity: -deduct,
            previousStock: prevStock,
            newStock,
            reference: recetaId,
            notes: `Producción de "${receta.nombre}" x${quantity}`,
            createdBy: userId,
          },
        });

        movimientosCreados += 1;
        stockIngrediente.push({
          productoId: ing.productoId,
          previousStock: prevStock,
          newStock,
        });

        const unitCost =
          toNumOrZero(producto.costPrice) || toNumOrZero(producto.price);
        totalCosto += unitCost * cantidadNecesaria;
      }

      totalCosto = Math.round(totalCosto * 100) / 100;

      // Register the production batch
      const lote = await tx.produccionLote.create({
        data: {
          tenantId,
          recetaId,
          cantidad: quantity,
          costoReal: totalCosto,
          notas,
        },
      });

      // If receta has a linked output product, increment its stock
      let stockProductoFinal: ProductionResult["stockProductoFinal"] = null;
      if (receta.productoId) {
        const prod = await tx.product.findUnique({
          where: { id: receta.productoId },
        });
        if (prod) {
          const prevStock = prod.stock ?? 0;
          const newStock = prevStock + quantity;
          await tx.product.update({
            where: { id: receta.productoId },
            data: { stock: newStock },
          });
          await tx.inventoryMovement.create({
            data: {
              tenantId,
              productId: receta.productoId,
              type: "production_output",
              quantity,
              previousStock: prevStock,
              newStock,
              reference: lote.id,
              notes: `Producción de "${receta.nombre}" — ingreso producto terminado`,
              createdBy: userId,
            },
          });
          movimientosCreados += 1;
          stockProductoFinal = {
            productoId: receta.productoId,
            previousStock: prevStock,
            newStock,
          };
        }
      }

      return {
        produccionLoteId: lote.id,
        recetaId,
        cantidad: quantity,
        costoReal: totalCosto,
        movimientosCreados,
        stockIngrediente,
        stockProductoFinal,
      } satisfies ProductionResult;
    });

    // Invalidate affected caches after successful write
    invalidateByPrefix(`recipe-cost:${tenantId}:`);
    invalidateByPrefix(`product-stock:${tenantId}:`);
    invalidateByPrefix(`product-list:${tenantId}:`);

    return result;
  },
};
