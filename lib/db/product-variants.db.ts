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

/**
 * Resuelve un tenantId crudo (slug o CUID) a la lista canónica de
 * identificadores con que las filas pueden estar guardadas. Histórica-
 * mente algunas filas se persistieron con slug y otras con CUID según
 * la ruta de creación. Devolver ambos permite que el WHERE matchee
 * independiente de cuál se haya usado al INSERT.
 */
async function resolveTenantAliases(tenantIdOrSlug: string): Promise<string[]> {
  const ids = new Set<string>([tenantIdOrSlug]);
  try {
    const t = await prisma.tenant.findFirst({
      where: { OR: [{ id: tenantIdOrSlug }, { slug: tenantIdOrSlug }] },
      select: { id: true, slug: true },
    });
    if (t) { ids.add(t.id); ids.add(t.slug); }
  } catch { /* tenant lookup falló — usamos solo el input */ }
  return Array.from(ids);
}

export const ProductVariantsDB = {
  async list(tenantId: string, productId: number): Promise<DbProductVariant[]> {
    // FIX 2026-05: queryamos por OR(slug, CUID) para tolerar filas legacy
    // que se persistieron con slug en vez del CUID canónico.
    const tenantIds = await resolveTenantAliases(tenantId);
    const rows = await prisma.productVariant.findMany({
      where: { tenantId: { in: tenantIds }, productId, isActive: true },
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
    const tenantIds = await resolveTenantAliases(tenantId);
    const result = await prisma.productVariant.updateMany({
      where: { id, tenantId: { in: tenantIds } },
      data: params,
    });
    if (result.count === 0) return null;
    const updated = await prisma.productVariant.findUnique({ where: { id } });
    return updated ? mapVariant(updated) : null;
  },

  /** Soft delete: marca isActive=false en vez de borrar la fila. */
  async delete(tenantId: string, id: string): Promise<void> {
    const tenantIds = await resolveTenantAliases(tenantId);
    await prisma.productVariant.updateMany({
      where: { id, tenantId: { in: tenantIds } },
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
