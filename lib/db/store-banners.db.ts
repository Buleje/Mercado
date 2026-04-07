import "server-only";
import { prisma } from "@/lib/prisma";
import type { StoreBanner as PStoreBanner } from "@/lib/generated/prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbStoreBanner = {
  id: string;
  storeId: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  linkUrl: string | null;
  position: number;
  section: string;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
};

export type DbStoreBannerCreateInput = {
  storeId: string;
  title: string;
  subtitle?: string;
  imageUrl: string;
  linkUrl?: string;
  position?: number;
  section?: string;
  isActive?: boolean;
  startDate?: string;
  endDate?: string;
};

export type DbStoreBannerUpdateInput = {
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  linkUrl?: string;
  position?: number;
  section?: string;
  isActive?: boolean;
  startDate?: string | null;
  endDate?: string | null;
};

// ── Mapper ────────────────────────────────────────────────────────────────────

function mapBanner(r: PStoreBanner): DbStoreBanner {
  return {
    id: r.id,
    storeId: r.storeId,
    title: r.title,
    subtitle: r.subtitle ?? null,
    imageUrl: r.imageUrl,
    linkUrl: r.linkUrl ?? null,
    position: r.position,
    section: r.section,
    isActive: r.isActive,
    startDate: r.startDate ? r.startDate.toISOString() : null,
    endDate: r.endDate ? r.endDate.toISOString() : null,
    tenantId: r.tenantId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// ── DB Class ──────────────────────────────────────────────────────────────────

export const StoreBannersDB = {
  async list(tenantId: string, storeId: string, section?: string): Promise<DbStoreBanner[]> {
    const now = new Date();
    const rows = await prisma.storeBanner.findMany({
      where: {
        tenantId,
        storeId,
        ...(section ? { section } : {}),
        isActive: true,
        OR: [{ startDate: null }, { startDate: { lte: now } }],
        AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
      },
      orderBy: { position: "asc" },
    });
    return rows.map(mapBanner);
  },

  async create(tenantId: string, params: DbStoreBannerCreateInput): Promise<DbStoreBanner> {
    const row = await prisma.storeBanner.create({
      data: {
        tenantId,
        storeId: params.storeId,
        title: params.title,
        subtitle: params.subtitle ?? null,
        imageUrl: params.imageUrl,
        linkUrl: params.linkUrl ?? null,
        position: params.position ?? 0,
        section: params.section ?? "hero",
        isActive: params.isActive ?? true,
        startDate: params.startDate ? new Date(params.startDate) : null,
        endDate: params.endDate ? new Date(params.endDate) : null,
      },
    });
    return mapBanner(row);
  },

  async update(
    tenantId: string,
    id: string,
    params: DbStoreBannerUpdateInput
  ): Promise<DbStoreBanner | null> {
    const result = await prisma.storeBanner.updateMany({
      where: { id, tenantId },
      data: {
        ...params,
        startDate: params.startDate !== undefined
          ? (params.startDate ? new Date(params.startDate) : null)
          : undefined,
        endDate: params.endDate !== undefined
          ? (params.endDate ? new Date(params.endDate) : null)
          : undefined,
      },
    });
    if (result.count === 0) return null;
    const updated = await prisma.storeBanner.findUnique({ where: { id } });
    return updated ? mapBanner(updated) : null;
  },

  async delete(tenantId: string, id: string): Promise<void> {
    await prisma.storeBanner.deleteMany({ where: { id, tenantId } });
  },

  async reorder(
    tenantId: string,
    storeId: string,
    section: string,
    orderedIds: string[]
  ): Promise<void> {
    await Promise.all(
      orderedIds.map((id, position) =>
        prisma.storeBanner.updateMany({
          where: { id, tenantId, storeId, section },
          data: { position },
        })
      )
    );
  },
};
