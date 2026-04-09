import "server-only";
import { prisma } from "@/lib/prisma";
import type { ProductVariant as PProductVariant } from "@/lib/generated/prisma/client";
import { toNumOrZero } from "@/lib/decimal-utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbProductVariant = {
  id: string;
  productId: number;
  name: string;
  sku: string | null;
  priceModifier: number;
  stock: number | null;
  attributesJson: string | null;
  isActive: boolean;
  position: number;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
};

export type DbProductVariantCreateInput = {
  productId: number;
  name: string;
  sku?: string;
  priceModifier?: number;
  stock?: number;
  attributesJson?: string;
  isActive?: boolean;
  position?: number;
};

export type DbProductVariantUpdateInput = {
  name?: string;
  sku?: string;
  priceModifier?: number;
  stock?: number;
  attributesJson?: string;
  isActive?: boolean;
  position?: number;
};

export type DbProductVariantFilters = {
  productId?: number;
  isActive?: boolean;
};

// ── Mapper ────────────────────────────────────────────────────────────────────

function mapVariant(r: PProductVariant): DbProductVariant {
  return {
    id: r.id,
    productId: r.productId,
    name: r.name,
    sku: r.sku ?? null,
    // TD-018: priceModifier es Decimal
    priceModifier: toNumOrZero(r.priceModifier),
    stock: r.stock ?? null,
    attributesJson: r.attributesJson ?? null,
    isActive: r.isActive,
    position: r.position,
    tenantId: r.tenantId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// ── DB Class ──────────────────────────────────────────────────────────────────

export const ProductVariantsDB = {
  async list(tenantId: string, productId: number): Promise<DbProductVariant[]> {
    const rows = await prisma.productVariant.findMany({
      where: { tenantId, productId, isActive: true },
      orderBy: { position: "asc" },
    });
    return rows.map(mapVariant);
  },

  async create(tenantId: string, params: DbProductVariantCreateInput): Promise<DbProductVariant> {
    const row = await prisma.productVariant.create({
      data: {
        tenantId,
        productId: params.productId,
        name: params.name,
        sku: params.sku ?? null,
        priceModifier: params.priceModifier ?? 0,
        stock: params.stock ?? null,
        attributesJson: params.attributesJson ?? null,
        isActive: params.isActive ?? true,
        position: params.position ?? 0,
      },
    });
    return mapVariant(row);
  },

  async update(tenantId: string, id: string, params: DbProductVariantUpdateInput): Promise<DbProductVariant | null> {
    const result = await prisma.productVariant.updateMany({
      where: { id, tenantId },
      data: params,
    });
    if (result.count === 0) return null;
    const updated = await prisma.productVariant.findUnique({ where: { id } });
    return updated ? mapVariant(updated) : null;
  },

  /** Soft delete: marca isActive=false en vez de borrar la fila. */
  async delete(tenantId: string, id: string): Promise<void> {
    await prisma.productVariant.updateMany({
      where: { id, tenantId },
      data: { isActive: false },
    });
  },

  /** Ajusta el stock de la variante (delta positivo = entrada, negativo = salida). */
  async adjustStock(tenantId: string, id: string, delta: number): Promise<DbProductVariant | null> {
    const variant = await prisma.productVariant.findFirst({ where: { id, tenantId } });
    if (!variant) return null;

    const currentStock = variant.stock ?? 0;
    const updated = await prisma.productVariant.update({
      where: { id },
      data: { stock: currentStock + delta },
    });
    return mapVariant(updated);
  },
};
