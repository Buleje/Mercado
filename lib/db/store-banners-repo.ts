import "server-only";
import { prisma } from "@/lib/prisma";
import type { StoreBanner as PStoreBanner } from "@/lib/generated/prisma/client";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import {
  BaseRepository,
  type PrismaDelegate,
} from "@/lib/db/base-repository";

// ── Re-export domain types from the canonical .db.ts ─────────────────────────

export type {
  DbStoreBanner,
  DbStoreBannerCreateInput,
  DbStoreBannerUpdateInput,
} from "@/lib/db/store-banners.db";

// Import types locally for internal use
import type {
  DbStoreBanner,
  DbStoreBannerCreateInput,
  DbStoreBannerUpdateInput,
} from "@/lib/db/store-banners.db";

// ── Prisma where/orderBy shapes ───────────────────────────────────────────────

type WhereInput = {
  tenantId?: string;
  id?: string;
  storeId?: string;
  section?: string;
  isActive?: boolean;
  OR?: Array<{ startDate?: null | { lte: Date }; endDate?: null | { gte: Date } }>;
  AND?: Array<{ OR?: Array<{ endDate?: null | { gte: Date } }> }>;
};

type OrderByInput = { position?: "asc" | "desc"; createdAt?: "asc" | "desc" };

// ── Row mapper ────────────────────────────────────────────────────────────────

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

// ── Concrete repo ─────────────────────────────────────────────────────────────

/**
 * StoreBannersRepo — extends BaseRepository for tenant-isolated CRUD.
 *
 * Extra method: `listActive(tenantId, storeId, section?)` for public display,
 * which adds date-range filtering on top of the base `list()`.
 */
export class StoreBannersRepo extends BaseRepository<
  DbStoreBanner,
  PStoreBanner,
  { tenantId: string; storeId: string; title: string; imageUrl: string; subtitle?: string | null; linkUrl?: string | null; position?: number; section?: string; isActive?: boolean; startDate?: Date | null; endDate?: Date | null },
  DbStoreBannerUpdateInput,
  WhereInput,
  OrderByInput
> {
  protected readonly modelName = "store-banners";
  protected readonly cacheTtl = 300;

  protected readonly delegate = prisma.storeBanner as unknown as PrismaDelegate<
    PStoreBanner,
    { tenantId: string; storeId: string; title: string; imageUrl: string; subtitle?: string | null; linkUrl?: string | null; position?: number; section?: string; isActive?: boolean; startDate?: Date | null; endDate?: Date | null },
    DbStoreBannerUpdateInput,
    WhereInput,
    OrderByInput
  >;

  protected mapRow(r: PStoreBanner): DbStoreBanner {
    return mapBanner(r);
  }

  /**
   * Active banners for a store section — with date-range filtering.
   * Cached 300s. Public display path.
   */
  async listActive(
    tenantId: string,
    storeId: string,
    section?: string,
  ): Promise<DbStoreBanner[]> {
    const now = new Date();
    const key = this.cacheKey(tenantId, `active:${storeId}:${section ?? "all"}`);

    return getOrSet(key, this.cacheTtl, async () => {
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
    });
  }

  /**
   * Reorder banners within a section.
   * Invalidates tenant cache after all updates.
   */
  async reorder(
    tenantId: string,
    storeId: string,
    section: string,
    orderedIds: string[],
  ): Promise<void> {
    await Promise.all(
      orderedIds.map((id, position) =>
        prisma.storeBanner.updateMany({
          where: { id, tenantId, storeId, section },
          data: { position },
        }),
      ),
    );
    invalidateByPrefix(`${this.modelName}:${tenantId}:`);
  }
}

// ── Singleton instance ────────────────────────────────────────────────────────

export const storeBannersRepo = new StoreBannersRepo();

// ── Backwards-compat re-exports — existing callers of StoreBannersDB keep working ──

import { StoreBannersDB } from "@/lib/db/store-banners.db";

export { StoreBannersDB };
