"use client";

/**
 * NavegacionTab — Superadmin: togglear visibilidad de enlaces del nav.
 *
 * Permite ocultar/mostrar enlaces en:
 *   - Landing (LandingHeader)
 *   - Marketplace (MarketplaceNavbar)
 *
 * Los cambios se persisten en localStorage y se propagan por evento custom
 * para que los navs re-lean el config sin refrescar.
 */

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Home, ShoppingBag, Sparkles } from "@buleje/design-system/icons";
import {
  NAV_LINK_CATALOG,
  readNavVisibility,
  writeNavVisibility,
  type NavScope,
  type NavVisibilityMap,
} from "@/lib/nav-visibility";

type Store = Record<NavScope, NavVisibilityMap>;

export function NavegacionTab() {
  const [store, setStore] = useState<Store | null>(null);

  useEffect(() => {
    setStore(readNavVisibility());
  }, []);

  const toggle = useCallback((scope: NavScope, id: string) => {
    setStore((prev) => {
      if (!prev) return prev;
      const next: Store = {
        ...prev,
        [scope]: { ...prev[scope], [id]: !prev[scope][id] },
      };
      writeNavVisibility(next);
      return next;
    });
  }, []);

  const showAll = useCallback((scope: NavScope) => {
    setStore((prev) => {
      if (!prev) return prev;
      const all: NavVisibilityMap = Object.fromEntries(
        NAV_LINK_CATALOG[scope].map((l) => [l.id, true]),
      );
      const next = { ...prev, [scope]: all };
      writeNavVisibility(next);
      return next;
    });
  }, []);

  if (!store) {
    return (
      <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-8 text-center text-sm text-[var(--text-tertiary)]">
        Cargando configuración de navegación…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--accent-soft)] px-5 py-4 text-sm text-[var(--text-secondary)]">
        Activa o desactivá cada enlace para controlar qué se muestra en la
        barra superior del sitio público. Los cambios se aplican{" "}
        <strong className="text-[var(--text-primary)]">al instante</strong> en
        todas las pestañas abiertas (misma sesión).
      </div>

      <NavScopeSection
        scope="landing"
        title="Navegación de Inicio (Landing)"
        description="Aparece en /, /abrir-tienda y rutas de landing."
        icon={<Home className="h-5 w-5" strokeWidth={1.75} />}
        values={store.landing}
        onToggle={(id) => toggle("landing", id)}
        onShowAll={() => showAll("landing")}
      />

      <NavScopeSection
        scope="marketplace"
        title="Navegación de Marketplace"
        description="Enlaces de la barra del marketplace. Por defecto En Vivo, Descubrí y Ofertas vienen ocultos (Ofertas ya está en la sub-nav)."
        icon={<ShoppingBag className="h-5 w-5" strokeWidth={1.75} />}
        values={store.marketplace}
        onToggle={(id) => toggle("marketplace", id)}
        onShowAll={() => showAll("marketplace")}
      />

      <NavScopeSection
        scope="marketplace-sections"
        title="Secciones del home de Marketplace"
        description="Tarjetas internas del home. Por defecto OFF para mantener el layout limpio. Activa lo que necesites."
        icon={<Sparkles className="h-5 w-5" strokeWidth={1.75} />}
        values={store["marketplace-sections"]}
        onToggle={(id) => toggle("marketplace-sections", id)}
        onShowAll={() => showAll("marketplace-sections")}
      />
    </div>
  );
}

function NavScopeSection({
  scope,
  title,
  description,
  icon,
  values,
  onToggle,
  onShowAll,
}: {
  scope: NavScope;
  title: string;
  description: string;
  icon: React.ReactNode;
  values: NavVisibilityMap;
  onToggle: (id: string) => void;
  onShowAll: () => void;
}) {
  const links = NAV_LINK_CATALOG[scope];
  const hiddenCount = links.filter((l) => values[l.id] === false).length;

  return (
    <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface-raised)] text-[var(--text-secondary)]">
            {icon}
          </span>
          <div>
            <h3 className="text-base font-black tracking-[-0.01em] text-[var(--text-primary)]">
              {title}
            </h3>
            <p className="text-xs text-[var(--text-tertiary)]">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="font-bold tabular-nums text-[var(--text-secondary)]">
            {hiddenCount === 0
              ? "Todos visibles"
              : `${hiddenCount} oculto${hiddenCount === 1 ? "" : "s"}`}
          </span>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={onShowAll}
              className="rounded-full border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-1 font-bold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            >
              Mostrar todos
            </button>
          )}
        </div>
      </header>

      <ul className="divide-y divide-[var(--rule-soft)]">
        {links.map((link) => {
          const visible = values[link.id] !== false;
          return (
            <li
              key={link.id}
              className="flex items-center justify-between gap-4 px-5 py-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  {link.label}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                  {link.description} ·{" "}
                  <code className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
                    {link.href}
                  </code>
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={visible}
                aria-label={`${visible ? "Ocultar" : "Mostrar"} ${link.label}`}
                onClick={() => onToggle(link.id)}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                  visible ? "bg-[var(--accent)]" : "bg-[var(--rule-base)]"
                }`}
              >
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform ${
                    visible ? "translate-x-6" : "translate-x-1"
                  }`}
                >
                  {visible ? (
                    <Eye className="h-3 w-3 text-[var(--accent)]" strokeWidth={2.5} />
                  ) : (
                    <EyeOff className="h-3 w-3 text-[var(--text-tertiary)]" strokeWidth={2.5} />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
