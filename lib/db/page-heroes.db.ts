import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { logActivity } from "@/lib/activity-logger";

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

export const PageHeroesDB = {
  /** Get active heroes for a page (public, cached) */
  async getByPage(tenantId: string, pageSlug: string): Promise<DbPageHero[]> {
    return getOrSet(
      `page-heroes:${tenantId}:${pageSlug}`,
      300, // 5 min cache
      async () => {
        const heroes = await prisma.pageHero.findMany({
          where: { tenantId, pageSlug, active: true },
          orderBy: { sortOrder: "asc" },
        });
        return heroes.map((h) => ({
          id: h.id,
          tenantId: h.tenantId,
          pageSlug: h.pageSlug,
          title: h.title,
          subtitle: h.subtitle,
          imageUrl: h.imageUrl,
          ctaText: h.ctaText,
          ctaLink: h.ctaLink,
          gradientFrom: h.gradientFrom,
          gradientTo: h.gradientTo,
          active: h.active,
          sortOrder: h.sortOrder,
        }));
      },
    );
  },

  /** List all heroes for a tenant (admin) */
  async listAll(tenantId: string): Promise<DbPageHero[]> {
    const heroes = await prisma.pageHero.findMany({
      where: { tenantId },
      orderBy: [{ pageSlug: "asc" }, { sortOrder: "asc" }],
    });
    return heroes as DbPageHero[];
  },

  /** Create a hero */
  async create(tenantId: string, data: {
    pageSlug: string;
    title?: string | null;
    subtitle?: string | null;
    imageUrl?: string | null;
    ctaText?: string | null;
    ctaLink?: string | null;
    gradientFrom?: string | null;
    gradientTo?: string | null;
  }) {
    const count = await prisma.pageHero.count({ where: { tenantId, pageSlug: data.pageSlug } });
    const hero = await prisma.pageHero.create({
      data: { tenantId, ...data, sortOrder: count },
    });
    invalidateByPrefix(`page-heroes:${tenantId}`);
    logActivity("page_hero_created", "PageHero", `${data.pageSlug}: ${data.title}`, hero.id, "admin", undefined, tenantId).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
    return hero;
  },

  /** Update a hero */
  async update(tenantId: string, id: string, data: Partial<{
    title: string | null;
    subtitle: string | null;
    imageUrl: string | null;
    ctaText: string | null;
    ctaLink: string | null;
    gradientFrom: string | null;
    gradientTo: string | null;
    active: boolean;
    sortOrder: number;
  }>) {
    const hero = await prisma.pageHero.findFirst({ where: { id, tenantId } });
    if (!hero) return null;
    const updated = await prisma.pageHero.update({ where: { id }, data });
    invalidateByPrefix(`page-heroes:${tenantId}`);
    return updated;
  },

  /** Delete a hero */
  async remove(tenantId: string, id: string) {
    const hero = await prisma.pageHero.findFirst({ where: { id, tenantId } });
    if (!hero) return null;
    await prisma.pageHero.delete({ where: { id } });
    invalidateByPrefix(`page-heroes:${tenantId}`);
    return hero;
  },
};
