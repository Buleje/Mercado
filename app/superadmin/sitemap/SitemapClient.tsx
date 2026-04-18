"use client";

/**
 * SitemapClient — orquestador client-side del módulo /superadmin/sitemap.
 *
 * Features:
 *   - Search bar (filtra por label, description, path, tags).
 *   - Tabs de categoría (Todas + 16 categorías).
 *   - Route cards agrupadas por categoría.
 *   - Stats cards (Total / Live / Beta / WIP / Mock).
 *   - Galería de 33 ilustraciones con copy-import.
 *
 * Lectura única: `@/lib/site-map` → SITE_ROUTES + SITE_CATEGORIES.
 */

import { useMemo, useState } from "react";
import { SITE_ROUTES, SITE_CATEGORIES, type SiteCategoryId, type SiteRoute } from "@/lib/site-map";
import SitemapHero from "@/components/superadmin/sitemap/SitemapHero";
import SitemapStats from "@/components/superadmin/sitemap/SitemapStats";
import CategoryTabs from "@/components/superadmin/sitemap/CategoryTabs";
import RoutesList from "@/components/superadmin/sitemap/RoutesList";
import IllustrationsGallery from "@/components/superadmin/sitemap/IllustrationsGallery";

export default function SitemapClient() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<SiteCategoryId | "all">("all");

  // Filtrado combinado search + categoría
  const filteredRoutes = useMemo(() => {
    const term = query.trim().toLowerCase();
    return SITE_ROUTES.filter((r) => {
      if (activeCategory !== "all" && r.category !== activeCategory) return false;
      if (!term) return true;
      const hay = [
        r.label,
        r.description,
        r.path,
        r.audience,
        r.auth,
        ...(r.tags ?? []),
        r.category,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [query, activeCategory]);

  // Count por categoría para mostrar en tabs
  const countsByCategory = useMemo(() => {
    const counts: Record<string, number> = { all: SITE_ROUTES.length };
    for (const cat of SITE_CATEGORIES) {
      counts[cat.id] = SITE_ROUTES.filter((r) => r.category === cat.id).length;
    }
    return counts;
  }, []);

  // Stats summary
  const stats = useMemo(() => {
    const byStatus = (status: SiteRoute["status"]) =>
      SITE_ROUTES.filter((r) => r.status === status).length;
    return {
      total: SITE_ROUTES.length,
      live: byStatus("live"),
      beta: byStatus("beta"),
      wip: byStatus("wip"),
      mock: byStatus("mock"),
      legacy: byStatus("legacy"),
      categories: SITE_CATEGORIES.length,
    };
  }, []);

  return (
    <div className="space-y-8 pb-16">
      <SitemapHero
        query={query}
        onQueryChange={setQuery}
        totalRoutes={stats.total}
        totalCategories={stats.categories}
        totalResults={filteredRoutes.length}
      />

      <SitemapStats stats={stats} />

      <CategoryTabs
        active={activeCategory}
        onChange={setActiveCategory}
        counts={countsByCategory}
      />

      <RoutesList routes={filteredRoutes} activeCategory={activeCategory} />

      <IllustrationsGallery />
    </div>
  );
}
