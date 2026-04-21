import "server-only";
import { prisma } from "@/lib/prisma";
import type { PageHero as PPageHero } from "@/lib/generated/prisma/client";
import { getOrSet } from "@/lib/cache";
import {
  BaseRepository,
  type PrismaDelegate,
} from "@/lib/db/base-repository";

// ── Domain types ──────────────────────────────────────────────────────────────

export type DbPageHero = {
  id: string;
  tenantId: string;
  pageSlug: string;
  title: string | null;
  subtitle: string | null;
  imageUrl: string | null;
  ctaText: string | null;
  ctaLink: string | null;
  gradientFrom: string | null;
  gradientTo: string | null;
  active: boolean;
  sortOrder: number;
};

export type DbPageHeroCreateInput = {
  pageSlug: string;
  title?: string | null;
  subtitle?: string | null;
  imageUrl?: string | null;
  ctaText?: string | null;
  ctaLink?: string | null;
  gradientFrom?: string | null;
  gradientTo?: string | null;
  active?: boolean;
  sortOrder?: number;
};

export type DbPageHeroUpdateInput = Partial<{
  title: string | null;
  subtitle: string | null;
  imageUrl: string | null;
  ctaText: string | null;
  ctaLink: string | null;
  gradientFrom: string | null;
  gradientTo: string | null;
  active: boolean;
  sortOrder: number;
}>;

// ── Prisma where/orderBy shapes ───────────────────────────────────────────────

type WhereInput = {
  tenantId?: string;
  id?: string;
  pageSlug?: string;
  active?: boolean;
};

type OrderByInput =
  | { sortOrder?: "asc" | "desc" }
  | { pageSlug?: "asc" | "desc" };

type PrismaCreateData = DbPageHeroCreateInput & { tenantId: string };

// ── Row mapper ────────────────────────────────────────────────────────────────

function mapHero(r: PPageHero): DbPageHero {
  return {
    id: r.id,
    tenantId: r.tenantId,
    pageSlug: r.pageSlug,
    title: r.title ?? null,
    subtitle: r.subtitle ?? null,
    imageUrl: r.imageUrl ?? null,
    ctaText: r.ctaText ?? null,
    ctaLink: r.ctaLink ?? null,
    gradientFrom: r.gradientFrom ?? null,
    gradientTo: r.gradientTo ?? null,
    active: r.active,
    sortOrder: r.sortOrder,
  };
}

// ── Concrete repo ─────────────────────────────────────────────────────────────

/**
 * PageHeroesRepo — extends BaseRepository for tenant-isolated CRUD.
 *
 * Extra method: `getByPage(tenantId, pageSlug)` for public-facing pages,
 * returns only active heroes ordered by sortOrder.
 */
export class PageHeroesRepo extends BaseRepository<
  DbPageHero,
  PPageHero,
  PrismaCreateData,
  DbPageHeroUpdateInput,
  WhereInput,
  OrderByInput
> {
  protected readonly modelName = "page-heroes";
  protected readonly cacheTtl = 300;

  protected readonly delegate = prisma.pageHero as unknown as PrismaDelegate<
    PPageHero,
    PrismaCreateData,
    DbPageHeroUpdateInput,
    WhereInput,
    OrderByInput
  >;

  protected mapRow(r: PPageHero): DbPageHero {
    return mapHero(r);
  }

  /**
   * Public display: active heroes for a page, ordered by sortOrder.
   * Cache 300s.
   */
  async getByPage(tenantId: string, pageSlug: string): Promise<DbPageHero[]> {
    const key = this.cacheKey(tenantId, `page:${pageSlug}`);
    return getOrSet(key, this.cacheTtl, async () => {
      const rows = await prisma.pageHero.findMany({
        where: { tenantId, pageSlug, active: true },
        orderBy: { sortOrder: "asc" },
      });
      return rows.map(mapHero);
    });
  }

  /**
   * Create with auto-computed sortOrder (appended to end of page).
   */
  async createForPage(
    tenantId: string,
    data: DbPageHeroCreateInput,
    actor: { userId: string },
  ): Promise<DbPageHero> {
    const count = await prisma.pageHero.count({
      where: { tenantId, pageSlug: data.pageSlug },
    });
    return this.create(
      tenantId,
      { ...data, sortOrder: data.sortOrder ?? count },
      actor,
    );
  }
}

// ── Singleton instance ────────────────────────────────────────────────────────

export const pageHeroesRepo = new PageHeroesRepo();

// ── Backwards-compat re-exports — existing callers of PageHeroesDB keep working ──

import { PageHeroesDB } from "@/lib/db/page-heroes.db";

export { PageHeroesDB };
