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
import { Eye, EyeOff, Home, ShoppingBag, Sparkles, Building2, Package, LayoutGrid, CheckCircle2 } from "@buleje/design-system/icons";
import {
  NAV_LINK_CATALOG,
  readNavVisibility,
  writeNavVisibility,
  type NavScope,
  type NavVisibilityMap,
} from "@/lib/nav-visibility";

type Store = Record<NavScope, NavVisibilityMap>;

// Modos preset que la dueña puede activar con un click. Cada uno aplica un
// patrón completo de visibilidad sobre el scope "marketplace".
type NavMode = {
  id: "full" | "tiendas-only" | "minimo";
  label: string;
  description: string;
  icon: React.ReactNode;
  marketplace: NavVisibilityMap;
};

const NAV_MODES: NavMode[] = [
  {
    id: "full",
    label: "Marketplace completo",
    description: "Todos los enlaces visibles (Explorar, Bodegas, Recetas, etc).",
    icon: <LayoutGrid className="h-5 w-5" strokeWidth={1.75} />,
    marketplace: { explorar: true, bodegas: true, recetas: true, descubri: true, "en-vivo": true, ofertas: true },
  },
  {
    id: "tiendas-only",
    label: "Solo Tiendas (estilo PedidosYa / piwi)",
    description: "Solo se muestra el listado de tiendas. Se ocultan Explorar, Recetas, En Vivo, Descubrí, Ofertas.",
    icon: <Building2 className="h-5 w-5" strokeWidth={1.75} />,
    marketplace: { explorar: false, bodegas: true, recetas: false, descubri: false, "en-vivo": false, ofertas: false },
  },
  {
    id: "minimo",
    label: "Mínimo (Tiendas + Ofertas)",
    description: "Tiendas + Ofertas. Para clientes que solo buscan precio y proximidad.",
    icon: <Package className="h-5 w-5" strokeWidth={1.75} />,
    marketplace: { explorar: false, bodegas: true, recetas: false, descubri: false, "en-vivo": false, ofertas: true },
  },
];

export function NavegacionTab() {
  const [store, setStore] = useState<Store | null>(null);
  const [toast, setToast] = useState<{ msg: string; modeLabel: string } | null>(null);

  useEffect(() => {
    setStore(readNavVisibility());
  }, []);

  // Auto-dismiss del toast 3.5s después de mostrar.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

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

  // IMPORTANTE: este `useCallback` debe estar ANTES del `if (!store) return`.
  // React no permite hooks después de un return condicional — fix del bug
  // "Rendered more hooks than during the previous render".
  const applyMode = useCallback((mode: NavMode) => {
    setStore((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        marketplace: { ...prev.marketplace, ...mode.marketplace },
      };
      writeNavVisibility(next);
      return next;
    });
    setToast({
      msg: `Modo aplicado: ${mode.label}`,
      modeLabel: mode.id,
    });
    // Redirección automática a la página correspondiente para verlo en vivo.
    // Abre en nueva tab para no perder el panel admin.
    if (typeof window !== "undefined") {
      const target =
        mode.id === "tiendas-only"
          ? "/tiendas"
          : mode.id === "full"
            ? "/marketplace/explorar"
            : null;
      if (target) {
        setTimeout(() => {
          window.open(target, "_blank", "noopener");
        }, 600);
      }
    }
  }, []);

  if (!store) {
    return (
      <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-8 text-center text-sm text-[var(--text-tertiary)]">
        Cargando configuración de navegación…
      </div>
    );
  }

  // Detecta el modo activo: el preset cuyas keys matchean al store actual.
  const activeMode = NAV_MODES.find((m) =>
    Object.entries(m.marketplace).every(
      ([k, v]) => store.marketplace[k] === v,
    ),
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--accent-soft)] px-5 py-4 text-sm text-[var(--text-secondary)]">
        Activa o desactivá cada enlace para controlar qué se muestra en la
        barra superior del sitio público. Los cambios se aplican{" "}
        <strong className="text-[var(--text-primary)]">al instante</strong> en
        todas las pestañas abiertas (misma sesión).
      </div>

      {/* Modos preset de navegación marketplace */}
      <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5 sm:p-6">
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            MODOS DE NAVEGACIÓN
          </p>
          <h3 className="text-xl font-extrabold text-[var(--text-primary)] mt-1">
            Activá un preset con un click
          </h3>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Aplicá un patrón completo de visibilidad para el navbar del marketplace.
            Podés ajustar links individuales más abajo.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {NAV_MODES.map((mode) => {
            const isActive = activeMode?.id === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => applyMode(mode)}
                className={[
                  "text-left rounded-xl border-2 p-4 transition-colors",
                  isActive
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--rule-soft)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/50",
                ].join(" ")}
                aria-pressed={isActive}
              >
                <div className={[
                  "inline-flex h-10 w-10 items-center justify-center rounded-lg",
                  isActive ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                ].join(" ")}>
                  {mode.icon}
                </div>
                <p className="mt-3 text-base font-extrabold text-[var(--text-primary)]">
                  {mode.label}
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {mode.description}
                </p>
                {isActive && (
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
                    Activo
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

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

      {/* Toast de confirmación — visible en superadmin y se replica en
          marketplace via CustomEvent. */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl bg-[var(--data-success-600)] px-5 py-3.5 text-sm font-bold text-white shadow-2xl animate-[fadeUp_0.3s_ease-out]"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <div>
            <p>{toast.msg}</p>
            <p className="text-xs font-medium opacity-90 mt-0.5">
              Cambios visibles al instante en el marketplace público
            </p>
          </div>
        </div>
      )}
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
            <h3 className="text-base font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
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
                  <code className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">
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
