"use client";

/**
 * RoutesList — render de las rutas filtradas, agrupadas por categoría.
 *
 * Si `activeCategory === "all"` muestra headers de categoría.
 * Si es una categoría específica, muestra solo el grid sin header.
 * Si no hay resultados, muestra un EmptyState ligero.
 */

import { useMemo } from "react";
import { SITE_CATEGORIES, type SiteCategoryId, type SiteRoute } from "@/lib/site-map";
import RouteCard from "./RouteCard";
import { SectionTitle, Caption } from "@buleje/design-system";
import { LupaConfundida } from "@/components/ui-system/illustrations";

interface Props {
  routes: SiteRoute[];
  activeCategory: SiteCategoryId | "all";
}

export default function RoutesList({ routes, activeCategory }: Props) {
  const grouped = useMemo(() => {
    const map = new Map<SiteCategoryId, SiteRoute[]>();
    for (const cat of SITE_CATEGORIES) {
      const list = routes.filter((r) => r.category === cat.id);
      if (list.length > 0) map.set(cat.id, list);
    }
    return map;
  }, [routes]);

  if (routes.length === 0) {
    return (
      <div className="bg-[var(--surface-raised)] border border-dashed border-[var(--rule-base)] rounded-2xl py-12 px-6 text-center">
        <div className="mx-auto w-40 h-40 text-[var(--text-tertiary)] mb-4">
          <LupaConfundida size={160} />
        </div>
        <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">
          Sin resultados
        </h3>
        <p className="text-sm text-[var(--text-tertiary)] max-w-sm mx-auto">
          No hay rutas que coincidan con la búsqueda. Prueba otra categoría o limpiá el filtro.
        </p>
      </div>
    );
  }

  // Si hay categoría específica, render plano
  if (activeCategory !== "all") {
    return (
      <section className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {routes.map((r) => (
            <RouteCard key={`${r.path}-${r.label}`} route={r} />
          ))}
        </div>
      </section>
    );
  }

  // Vista "Todas" → agrupado por categoría
  return (
    <div className="space-y-8">
      {Array.from(grouped.entries()).map(([catId, catRoutes]) => {
        const cat = SITE_CATEGORIES.find((c) => c.id === catId);
        if (!cat) return null;
        return (
          <section key={catId}>
            <header className="flex items-end justify-between gap-3 mb-3 pb-2 border-b border-[var(--rule-base)]">
              <div>
                <SectionTitle>{cat.label}</SectionTitle>
                <Caption className="block mt-0.5">
                  {cat.description} · <span className="text-[var(--text-tertiary)]">{cat.audience}</span>
                </Caption>
              </div>
              <span className="shrink-0 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] tabular-nums">
                {catRoutes.length} {catRoutes.length === 1 ? "ruta" : "rutas"}
              </span>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {catRoutes.map((r) => (
                <RouteCard key={`${r.path}-${r.label}`} route={r} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
