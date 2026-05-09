import "server-only";
import { prisma } from "@/lib/prisma";
import type { ProductImage as PProductImage } from "@/lib/generated/prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbProductImage = {
  id: string;
  productId: number;
  url: string;
  alt: string | null;
  position: number;
  isPrimary: boolean;
  tenantId: string;
  createdAt: string;
};

export type DbProductImageCreateInput = {
  productId: number;
  url: string;
  alt?: string;
  position?: number;
  isPrimary?: boolean;
};

export type DbProductImageUpdateInput = {
  url?: string;
  alt?: string;
  position?: number;
  isPrimary?: boolean;
};

// ── Mapper ────────────────────────────────────────────────────────────────────

function mapImage(r: PProductImage): DbProductImage {
  return {
    id: r.id,
    productId: r.productId,
    url: r.url,
    alt: r.alt ?? null,
    position: r.position,
    isPrimary: r.isPrimary,
    tenantId: r.tenantId,
    createdAt: r.createdAt.toISOString(),
  };
}

// ── DB Class ──────────────────────────────────────────────────────────────────

export const ProductImagesDB = {
  async list(tenantId: string, productId: number): Promise<DbProductImage[]> {
    const rows = await prisma.productImage.findMany({
      where: { tenantId, productId },
      orderBy: { position: "asc" },
    });
    return rows.map(mapImage);
  },

  async create(tenantId: string, params: DbProductImageCreateInput): Promise<DbProductImage> {
    const row = await prisma.productImage.create({
      data: {
        tenantId,
        productId: params.productId,
        url: params.url,
        alt: params.alt ?? null,
        position: params.position ?? 0,
        isPrimary: params.isPrimary ?? false,
      },
    });
    return mapImage(row);
  },

  async update(tenantId: string, id: string, params: DbProductImageUpdateInput): Promise<DbProductImage | null> {
    const row = await prisma.productImage.updateMany({
      where: { id, tenantId },
      data: params,
    });
    if (row.count === 0) return null;
    const updated = await prisma.productImage.findFirst({ where: { id, tenantId } });
    return updated ? mapImage(updated) : null;
  },

  async delete(tenantId: string, id: string): Promise<void> {
    await prisma.productImage.deleteMany({ where: { id, tenantId } });
  },

  async reorder(tenantId: string, productId: number, orderedIds: string[]): Promise<void> {
    await prisma.$transaction(
      orderedIds.map((id, position) =>
        prisma.productImage.updateMany({
          where: { id, tenantId, productId },
          data: { position },
        })
      )
    );
  },
};
