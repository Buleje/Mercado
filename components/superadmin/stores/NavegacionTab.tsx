"use client";

/**
 * NavegacionTab — Control de visibilidad de enlaces del nav.
 *
 * Rediseño 2026-05-11 — directo y visual:
 *   1. Live preview interactivo: el navbar tal cual se ve, click en cualquier
 *      enlace para ocultarlo. Los ocultos aparecen abajo como chips para traer
 *      de vuelta con un click. Desktop ↔ Mobile toggle.
 *   2. Modos preset como pills compactas con preview.
 *   3. Control fino expandible (las 3 secciones detalladas).
 *
 * Sin formularios, sin switches abstractos — manipulación directa.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Eye,
  EyeOff,
  Home,
  ShoppingBag,
  Sparkles,
  Building2,
  Package,
  LayoutGrid,
  CheckCircle2,
  Compass,
  ExternalLink,
  Monitor,
  Smartphone,
  ChevronDown,
  Settings2,
  Undo2,
  Plus,
  X,
  type LucideIcon,
} from "@buleje/design-system/icons";
import {
  NAV_LINK_CATALOG,
  readNavVisibility,
  writeNavVisibility,
  type NavScope,
  type NavVisibilityMap,
} from "@/lib/nav-visibility";

type Store = Record<NavScope, NavVisibilityMap>;

// ─── Modos preset ─────────────────────────────────────────────────────

type NavMode = {
  id: "full" | "tiendas-only" | "minimo";
  label: string;
  short: string;
  description: string;
  icon: LucideIcon;
  marketplace: NavVisibilityMap;
  tone: "accent" | "violet" | "amber";
  preview: string;
};

const NAV_MODES: NavMode[] = [
  {
    id: "full",
    label: "Marketplace completo",
    short: "Completo",
    description: "Todos los enlaces visibles (Explorar, Recetas, En Vivo, Ofertas).",
    icon: LayoutGrid,
    tone: "accent",
    preview: "Explorar · Bodegas · Recetas · En Vivo · Ofertas",
    marketplace: {
      explorar: true,
      bodegas: true,
      recetas: true,
      descubri: true,
      "en-vivo": true,
      ofertas: true,
    },
  },
  {
    id: "tiendas-only",
    label: "Solo Tiendas",
    short: "Tiendas",
    description: "Estilo PedidosYa / Rappi — directo al listado de bodegas, sin distracciones.",
    icon: Building2,
    tone: "violet",
    preview: "Bodegas",
    marketplace: {
      explorar: false,
      bodegas: true,
      recetas: false,
      descubri: false,
      "en-vivo": false,
      ofertas: false,
    },
  },
  {
    id: "minimo",
    label: "Mínimo · Tiendas + Ofertas",
    short: "Mínimo",
    description: "Tiendas + Ofertas — clientes que solo buscan precio y proximidad.",
    icon: Package,
    tone: "amber",
    preview: "Bodegas · Ofertas",
    marketplace: {
      explorar: false,
      bodegas: true,
      recetas: false,
      descubri: false,
      "en-vivo": false,
      ofertas: true,
    },
  },
];

// ─── Scope meta ───────────────────────────────────────────────────────

const SCOPE_META: Record<
  NavScope,
  { title: string; description: string; icon: LucideIcon; preview: string }
> = {
  landing: {
    title: "Inicio (Landing)",
    description: "Barra superior de /, /abrir-tienda y landing pages.",
    icon: Home,
    preview: "Inicio",
  },
  marketplace: {
    title: "Marketplace",
    description: "Barra principal del marketplace y catálogo de tiendas.",
    icon: ShoppingBag,
    preview: "Marketplace",
  },
  "marketplace-sections": {
    title: "Secciones del home",
    description: "Tarjetas internas del home /marketplace (no son links del navbar).",
    icon: Sparkles,
    preview: "Home",
  },
};

// ─── Component ────────────────────────────────────────────────────────

export function NavegacionTab() {
  const [store, setStore] = useState<Store | null>(null);
  const [history, setHistory] = useState<Store[]>([]);
  const [toast, setToast] = useState<{ msg: string; sub?: string } | null>(null);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [previewScope, setPreviewScope] = useState<NavScope>("marketplace");
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    setStore(readNavVisibility());
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const pushHistory = useCallback((current: Store) => {
    setHistory((prev) => [current, ...prev].slice(0, 10));
  }, []);

  const persist = useCallback(
    (next: Store) => {
      writeNavVisibility(next);
      setStore(next);
    },
    [],
  );

  const toggle = useCallback(
    (scope: NavScope, id: string) => {
      setStore((prev) => {
        if (!prev) return prev;
        pushHistory(prev);
        const next: Store = {
          ...prev,
          [scope]: { ...prev[scope], [id]: !(prev[scope][id] !== false) },
        };
        writeNavVisibility(next);
        return next;
      });
    },
    [pushHistory],
  );

  const setVisibility = useCallback(
    (scope: NavScope, id: string, visible: boolean) => {
      setStore((prev) => {
        if (!prev) return prev;
        pushHistory(prev);
        const next: Store = {
          ...prev,
          [scope]: { ...prev[scope], [id]: visible },
        };
        writeNavVisibility(next);
        return next;
      });
    },
    [pushHistory],
  );

  const showAll = useCallback(
    (scope: NavScope) => {
      setStore((prev) => {
        if (!prev) return prev;
        pushHistory(prev);
        const all: NavVisibilityMap = Object.fromEntries(
          NAV_LINK_CATALOG[scope].map((l) => [l.id, true]),
        );
        const next = { ...prev, [scope]: all };
        writeNavVisibility(next);
        return next;
      });
    },
    [pushHistory],
  );

  const hideAll = useCallback(
    (scope: NavScope) => {
      setStore((prev) => {
        if (!prev) return prev;
        pushHistory(prev);
        const all: NavVisibilityMap = Object.fromEntries(
          NAV_LINK_CATALOG[scope].map((l) => [l.id, false]),
        );
        const next = { ...prev, [scope]: all };
        writeNavVisibility(next);
        return next;
      });
    },
    [pushHistory],
  );

  const applyMode = useCallback(
    (mode: NavMode) => {
      setStore((prev) => {
        if (!prev) return prev;
        pushHistory(prev);
        const next = {
          ...prev,
          marketplace: { ...prev.marketplace, ...mode.marketplace },
        };
        writeNavVisibility(next);
        return next;
      });
      setToast({
        msg: `Modo aplicado: ${mode.label}`,
        sub: "Visible al instante en el sitio público",
      });
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
    },
    [pushHistory],
  );

  const undo = useCallback(() => {
    if (history.length === 0) return;
    const [prev, ...rest] = history;
    setHistory(rest);
    persist(prev);
    setToast({ msg: "Cambio deshecho", sub: "Estado anterior restaurado" });
  }, [history, persist]);

  const stats = useMemo(() => {
    if (!store) return { total: 0, visible: 0, hidden: 0 };
    let total = 0;
    let visible = 0;
    (Object.keys(NAV_LINK_CATALOG) as NavScope[]).forEach((scope) => {
      const links = NAV_LINK_CATALOG[scope];
      for (const l of links) {
        total += 1;
        if (store[scope]?.[l.id] !== false) visible += 1;
      }
    });
    return { total, visible, hidden: total - visible };
  }, [store]);

  if (!store) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-32 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] animate-pulse"
          />
        ))}
      </div>
    );
  }

  const activeMode = NAV_MODES.find((m) =>
    Object.entries(m.marketplace).every(([k, v]) => store.marketplace[k] === v),
  );

  const scopeLinks = NAV_LINK_CATALOG[previewScope];
  const scopeValues = store[previewScope];
  const visibleLinks = scopeLinks.filter((l) => scopeValues[l.id] !== false);
  const hiddenLinks = scopeLinks.filter((l) => scopeValues[l.id] === false);

  return (
    <div className="space-y-5">
      {/* ── Hero compact ─────────────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)]">
              <Compass className="h-6 w-6" strokeWidth={1.75} aria-hidden />
            </span>
            <div>
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
                Marketplace · Navegación
              </p>
              <h2 className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-[var(--text-primary)]">
                Editá tu navbar como si lo vieras
              </h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)] max-w-2xl">
                Click directo en cualquier enlace del preview para ocultarlo. Click en los ocultos
                para traerlos de vuelta. Cambios <strong>al instante</strong> en producción.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={undo}
              disabled={history.length === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed"
              title="Deshacer último cambio"
            >
              <Undo2 className="h-3.5 w-3.5" strokeWidth={2.25} />
              Deshacer
              {history.length > 0 && (
                <span className="rounded-full bg-[var(--accent)]/10 px-1.5 text-[length:var(--ts-2xs)] font-extrabold text-[var(--accent)]">
                  {history.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mini stats inline */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Pill icon={Eye} label={`${stats.visible} visibles`} tone="success" />
          <Pill icon={EyeOff} label={`${stats.hidden} ocultos`} tone="warning" />
          {activeMode ? (
            <Pill icon={LayoutGrid} label={`Modo: ${activeMode.label}`} tone="accent" />
          ) : (
            <Pill icon={Settings2} label="Modo: Personalizado" tone="neutral" />
          )}
        </div>
      </section>

      {/* ── Live preview interactivo ─────────────────────────── */}
      <section className="rounded-2xl border-2 border-[var(--accent)]/30 bg-[var(--surface-raised)] overflow-hidden shadow-md shadow-[var(--accent)]/5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
              <Eye className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </span>
            <div>
              <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
                Preview en vivo
              </h3>
              <p className="text-xs text-[var(--text-tertiary)]">
                Manipulá los enlaces directamente — click para ocultar/mostrar
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Scope switcher */}
            <div className="flex gap-1 rounded-xl bg-[var(--surface-sunken)] p-1">
              {(Object.keys(NAV_LINK_CATALOG) as NavScope[]).map((scope) => {
                const meta = SCOPE_META[scope];
                const ScopeIcon = meta.icon;
                const isActive = previewScope === scope;
                return (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => setPreviewScope(scope)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      isActive
                        ? "bg-[var(--surface-raised)] text-[var(--accent)] shadow-sm"
                        : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                    }`}
                    title={meta.title}
                  >
                    <ScopeIcon className="h-3.5 w-3.5" strokeWidth={2} />
                    <span className="hidden sm:inline">{meta.preview}</span>
                  </button>
                );
              })}
            </div>
            {/* Device toggle */}
            <div className="flex gap-1 rounded-xl bg-[var(--surface-sunken)] p-1">
              <button
                type="button"
                onClick={() => setPreviewDevice("desktop")}
                className={`inline-flex h-7 w-9 items-center justify-center rounded-lg transition ${
                  previewDevice === "desktop"
                    ? "bg-[var(--surface-raised)] text-[var(--accent)] shadow-sm"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                }`}
                title="Vista desktop"
              >
                <Monitor className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => setPreviewDevice("mobile")}
                className={`inline-flex h-7 w-9 items-center justify-center rounded-lg transition ${
                  previewDevice === "mobile"
                    ? "bg-[var(--surface-raised)] text-[var(--accent)] shadow-sm"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                }`}
                title="Vista mobile"
              >
                <Smartphone className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </div>
          </div>
        </header>

        {/* Mockup */}
        <div className="bg-gradient-to-b from-[var(--surface-sunken)] to-transparent p-6">
          <div
            className={`mx-auto transition-all ${
              previewDevice === "mobile" ? "max-w-[380px]" : "max-w-full"
            }`}
          >
            {/* Browser chrome */}
            <div className="rounded-t-2xl border-2 border-b-0 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 py-2 flex items-center gap-2">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </div>
              <div className="flex-1 rounded-md bg-[var(--surface-raised)] border border-[var(--rule-soft)] px-3 py-1 text-[length:var(--ts-2xs)] font-mono text-[var(--text-tertiary)] truncate">
                buleje.pe{scopeLinks[0]?.href ?? "/"}
              </div>
            </div>

            {/* Navbar mockup */}
            <div className="rounded-b-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
              {previewDevice === "desktop" ? (
                <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--rule-soft)]">
                  {/* Brand */}
                  <div className="inline-flex items-center gap-2 mr-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-white font-display font-extrabold text-sm">
                      B
                    </span>
                    <span className="font-display font-extrabold text-sm text-[var(--text-primary)]">
                      Buleje
                    </span>
                  </div>
                  {/* Links */}
                  <div className="flex items-center gap-1 flex-1 flex-wrap">
                    {visibleLinks.length === 0 ? (
                      <span className="text-xs text-[var(--text-tertiary)] italic">
                        Sin enlaces visibles
                      </span>
                    ) : (
                      visibleLinks.map((l) => (
                        <NavbarLinkChip
                          key={l.id}
                          label={l.label}
                          href={l.href}
                          onHide={() => setVisibility(previewScope, l.id, false)}
                        />
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="px-4 py-4 space-y-2">
                  {/* Mobile: brand + hamburger */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="inline-flex items-center gap-2">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)] text-white font-display font-extrabold text-xs">
                        B
                      </span>
                      <span className="font-display font-extrabold text-sm text-[var(--text-primary)]">
                        Buleje
                      </span>
                    </div>
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--rule-soft)] text-[var(--text-tertiary)]">
                      ☰
                    </span>
                  </div>
                  {visibleLinks.length === 0 ? (
                    <p className="text-xs text-[var(--text-tertiary)] italic py-2 text-center">
                      Sin enlaces visibles
                    </p>
                  ) : (
                    visibleLinks.map((l) => (
                      <MobileNavLink
                        key={l.id}
                        label={l.label}
                        href={l.href}
                        onHide={() => setVisibility(previewScope, l.id, false)}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Hidden links rail */}
          {hiddenLinks.length > 0 && (
            <div className="mt-5 max-w-3xl mx-auto">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] flex items-center gap-1.5">
                  <EyeOff className="h-3 w-3" strokeWidth={2.25} />
                  Enlaces ocultos ({hiddenLinks.length}) · click para mostrar
                </p>
                <button
                  type="button"
                  onClick={() => showAll(previewScope)}
                  className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)] hover:underline"
                >
                  Mostrar todos
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {hiddenLinks.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setVisibility(previewScope, l.id, true)}
                    className="group inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-1.5 text-xs font-bold text-[var(--text-tertiary)] transition hover:border-[var(--accent)]/50 hover:text-[var(--accent)] hover:bg-[var(--accent)]/5"
                    title={`Mostrar "${l.label}" — ${l.href}`}
                  >
                    <Plus
                      className="h-3 w-3 transition-transform group-hover:rotate-90"
                      strokeWidth={2.5}
                    />
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {hiddenLinks.length === 0 && visibleLinks.length > 0 && (
            <p className="mt-4 text-center text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--data-success-500)]">
              ✓ Todos los enlaces visibles
            </p>
          )}
        </div>
      </section>

      {/* ── Modos preset ─────────────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
        <header className="flex items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
            <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
              Plantillas rápidas
            </h3>
            <p className="text-xs text-[var(--text-tertiary)]">
              Aplicá un patrón completo del marketplace con un click
            </p>
          </div>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4">
          {NAV_MODES.map((mode) => {
            const isActive = activeMode?.id === mode.id;
            const Icon = mode.icon;
            const tonePill = {
              accent: "bg-[var(--accent)]/10 text-[var(--accent)]",
              violet: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
              amber: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
            }[mode.tone];
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => applyMode(mode)}
                aria-pressed={isActive}
                className={`group text-left rounded-2xl border-2 p-4 transition ${
                  isActive
                    ? "border-[var(--accent)]/50 bg-[var(--accent)]/5 shadow-md shadow-[var(--accent)]/10"
                    : "border-[var(--rule-soft)] bg-[var(--surface-canvas)] hover:border-[var(--accent)]/30 hover:-translate-y-0.5 hover:shadow-md"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${tonePill}`}
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                  </span>
                  {isActive && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-white shadow-md shadow-[var(--accent)]/20">
                      <CheckCircle2 className="h-2.5 w-2.5" strokeWidth={3} />
                      Activo
                    </span>
                  )}
                </div>
                <h4 className="mt-3 font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
                  {mode.label}
                </h4>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {mode.description}
                </p>
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-2.5 py-1.5 w-full">
                  <Eye
                    className="h-3 w-3 shrink-0 text-[var(--text-tertiary)]"
                    strokeWidth={2.25}
                  />
                  <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] truncate">
                    {mode.preview}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Control fino (expandible) ────────────────────────── */}
      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-3 px-5 py-3.5 transition hover:bg-[var(--surface-sunken)]/40"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
              <Settings2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="text-left">
              <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
                Control avanzado
              </h3>
              <p className="text-xs text-[var(--text-tertiary)]">
                Lista detallada con descripciones, toggles iOS-style y bulk actions
              </p>
            </div>
          </div>
          <ChevronDown
            className={`h-5 w-5 shrink-0 text-[var(--text-tertiary)] transition-transform ${
              detailsOpen ? "rotate-180" : ""
            }`}
            strokeWidth={2}
            aria-hidden
          />
        </button>

        {detailsOpen && (
          <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-canvas)]/40 p-4 space-y-4">
            {(Object.keys(NAV_LINK_CATALOG) as NavScope[]).map((scope) => (
              <NavScopeSection
                key={scope}
                scope={scope}
                values={store[scope]}
                onToggle={(id) => toggle(scope, id)}
                onShowAll={() => showAll(scope)}
                onHideAll={() => hideAll(scope)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Toast ────────────────────────────────────────────── */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex items-start gap-3 rounded-2xl border border-[var(--data-success-500)]/30 bg-[var(--surface-raised)] px-5 py-3.5 shadow-2xl animate-[fadeUp_0.3s_ease-out]"
        >
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]">
            <CheckCircle2 className="h-5 w-5" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="font-display text-sm font-extrabold text-[var(--text-primary)]">
              {toast.msg}
            </p>
            {toast.sub && (
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{toast.sub}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
            aria-label="Cerrar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════ components ═══════════════════════════ */

function Pill({
  icon: Icon,
  label,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  tone: "success" | "warning" | "accent" | "neutral";
}) {
  const cls = {
    success:
      "border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5 text-[var(--data-success-500)]",
    warning:
      "border-amber-300/60 bg-amber-50/60 text-amber-700 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300",
    accent: "border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]",
    neutral: "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)]",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${cls}`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
      {label}
    </span>
  );
}

function NavbarLinkChip({
  label,
  href,
  onHide,
}: {
  label: string;
  href: string;
  onHide: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onHide}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onHide();
        }
      }}
      title={`Click para ocultar "${label}"\n${href}`}
      className="group relative inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-1.5 text-sm font-bold text-[var(--text-primary)] transition cursor-pointer hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:hover:border-rose-700/40 dark:hover:bg-rose-950/30 dark:hover:text-rose-300"
    >
      <span>{label}</span>
      <X
        className="h-3 w-3 text-[var(--text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100 group-hover:text-rose-600 dark:group-hover:text-rose-300"
        strokeWidth={2.5}
      />
    </div>
  );
}

function MobileNavLink({
  label,
  href,
  onHide,
}: {
  label: string;
  href: string;
  onHide: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onHide}
      title={`Click para ocultar "${label}"\n${href}`}
      className="group flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-2 text-left transition hover:border-rose-300 hover:bg-rose-50 dark:hover:border-rose-700/40 dark:hover:bg-rose-950/30"
    >
      <span className="text-sm font-bold text-[var(--text-primary)] group-hover:text-rose-700 dark:group-hover:text-rose-300">
        {label}
      </span>
      <X
        className="h-3.5 w-3.5 text-[var(--text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100 group-hover:text-rose-600 dark:group-hover:text-rose-300"
        strokeWidth={2.5}
      />
    </button>
  );
}

/* ─────────────────── NavScopeSection (control fino) ─────────────────── */

function NavScopeSection({
  scope,
  values,
  onToggle,
  onShowAll,
  onHideAll,
}: {
  scope: NavScope;
  values: NavVisibilityMap;
  onToggle: (id: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
}) {
  const meta = SCOPE_META[scope];
  const Icon = meta.icon;
  const links = NAV_LINK_CATALOG[scope];
  const hiddenCount = links.filter((l) => values[l.id] === false).length;
  const visibleCount = links.length - hiddenCount;

  return (
    <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
            <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <h4 className="font-display text-sm font-extrabold tracking-tight text-[var(--text-primary)]">
              {meta.title}
            </h4>
            <p className="text-xs text-[var(--text-tertiary)] truncate">{meta.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider ${
              hiddenCount === 0
                ? "border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5 text-[var(--data-success-500)]"
                : "border-amber-300/60 bg-amber-50/60 text-amber-700 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300"
            }`}
          >
            <span
              className={`h-1 w-1 rounded-full ${
                hiddenCount === 0 ? "bg-[var(--data-success-500)]" : "bg-amber-500"
              }`}
            />
            {visibleCount}/{links.length}
          </span>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={onShowAll}
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-2 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
            >
              <Eye className="h-3 w-3" strokeWidth={2.25} />
              Todos
            </button>
          )}
          {visibleCount > 0 && hiddenCount !== links.length && (
            <button
              type="button"
              onClick={onHideAll}
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-2 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] transition hover:border-[var(--rule-base)] hover:text-[var(--text-primary)]"
            >
              <EyeOff className="h-3 w-3" strokeWidth={2.25} />
              Ninguno
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
              className={`flex items-center justify-between gap-4 px-5 py-3 transition ${
                visible ? "" : "bg-[var(--surface-canvas)]/40"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition ${
                    visible
                      ? "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]"
                      : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
                  }`}
                  aria-hidden
                >
                  {visible ? (
                    <Eye className="h-3 w-3" strokeWidth={2.25} />
                  ) : (
                    <EyeOff className="h-3 w-3" strokeWidth={2.25} />
                  )}
                </span>
                <div className="min-w-0">
                  <p
                    className={`text-sm font-bold transition ${
                      visible ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"
                    }`}
                  >
                    {link.label}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-tertiary)] flex flex-wrap items-center gap-1.5">
                    <span>{link.description}</span>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-1.5 py-0.5 font-mono text-[length:var(--ts-2xs)] text-[var(--text-secondary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
                    >
                      {link.href}
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={visible}
                aria-label={`${visible ? "Ocultar" : "Mostrar"} ${link.label}`}
                onClick={() => onToggle(link.id)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 ${
                  visible
                    ? "bg-[var(--accent)]"
                    : "bg-[var(--surface-sunken)] border border-[var(--rule-base)]"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform ${
                    visible ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
