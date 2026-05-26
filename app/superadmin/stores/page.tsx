"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ShoppingBag,
  Ticket,
  BarChart3,
  Menu,
  ShieldCheck,
  Activity,
  Image as ImageIcon,
  Layers,
  RefreshCw,
  Sparkles,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { StoresTab } from "@/components/superadmin/stores/StoresTab";
import { BeneficiosTab } from "@/components/superadmin/stores/BeneficiosTab";
import { CouponsTab } from "@/components/superadmin/stores/CouponsTab";
import { AnalyticsTab } from "@/components/superadmin/stores/AnalyticsTab";
import { NavegacionTab } from "@/components/superadmin/stores/NavegacionTab";
import { PlantillaPanelTab } from "@/components/superadmin/stores/PlantillaPanelTab";
import { HealthTab } from "@/components/superadmin/stores/HealthTab";
import { OperationsTab } from "@/components/superadmin/stores/OperationsTab";
import { CategoriesTab } from "@/components/superadmin/stores/CategoriesTab";
import type { StoreRow, StoreTab } from "@/components/superadmin/stores/types";
import { AdminTabShell } from "../_components/_shared";

// ─── Tabs config ──────────────────────────────────────────────────────────

interface TabDef {
  key: StoreTab;
  label: string;
  icon: LucideIcon;
}

const TABS: TabDef[] = [
  { key: "stores", label: "Tiendas", icon: ShoppingBag },
  { key: "beneficios", label: "Beneficios", icon: Sparkles },
  { key: "health", label: "Salud", icon: ShieldCheck },
  { key: "operations", label: "Operaciones", icon: Activity },
  { key: "categories", label: "Categorías", icon: ImageIcon },
  { key: "coupons", label: "Cupones", icon: Ticket },
  { key: "analytics", label: "Analítica", icon: BarChart3 },
  { key: "navegacion", label: "Navegación", icon: Menu },
  { key: "plantilla", label: "Plantilla del panel", icon: Layers },
];

// ─── Page ─────────────────────────────────────────────────────────────────

export default function StoresPage() {
  const [stores, setStores] = useState<StoreRow[] | undefined>(undefined);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<StoreTab>("stores");

  const load = useCallback(async (silent = false) => {
    if (!silent) setStores(undefined);
    else setRefreshing(true);
    setError("");
    try {
      const res = await fetch("/api/superadmin/stores", { credentials: "include" });
      if (!res.ok) {
        setError("Error al cargar tiendas");
        return;
      }
      const data = (await res.json()) as { stores: StoreRow[] };
      setStores(data.stores);
    } catch {
      setError("Error de red");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRefresh = useCallback(() => void load(true), [load]);

  // Stats derivados del array de stores
  const stats = useMemo(() => {
    if (!stores) return { total: 0, published: 0, unpublished: 0, active: 0 };
    return {
      total: stores.length,
      published: stores.filter((s) => s.isPublished).length,
      unpublished: stores.filter((s) => !s.isPublished).length,
      active: stores.filter((s) => s.tenant.active).length,
    };
  }, [stores]);

  return (
    <AdminTabShell
      title="Administrar Marketplace"
      description="Gestión completa de tiendas, pedidos, cupones y métricas del marketplace."
      icon={ShoppingBag}
      kicker="Plataforma · Marketplace"
      stats={
        <>
          <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 py-2 min-w-[88px]">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
              Total
            </p>
            <p className="font-display text-xl font-extrabold tabular-nums tracking-tight mt-1 leading-none text-[var(--text-primary)]">
              {stats.total}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5 px-3.5 py-2 min-w-[88px]">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
              Publicadas
            </p>
            <p className="font-display text-xl font-extrabold tabular-nums tracking-tight mt-1 leading-none text-[var(--data-success-500)]">
              {stats.published}
            </p>
          </div>
          {stats.unpublished > 0 && (
            <div className="rounded-xl border border-amber-300/60 bg-amber-50/60 px-3.5 py-2 min-w-[88px] dark:border-amber-700/40 dark:bg-amber-950/30">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
                Borrador
              </p>
              <p className="font-display text-xl font-extrabold tabular-nums tracking-tight mt-1 leading-none text-amber-700 dark:text-amber-300">
                {stats.unpublished}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || stores === undefined}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)] disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
              strokeWidth={2.25}
            />
            Refrescar
          </button>
        </>
      }
    >
      {/* ─── Tab bar canónico ─────────────────────────────────────
          Brandon 2026-05-21 mejoras mobile:
          - sticky top-0 + backdrop-blur para mantener tabs visibles al scroll
          - scroll-snap-x para que cada tab se alinee al edge en swipe mobile
          - gradient fade-right (mask-image) indicando "hay más tabs scrolling" */}
      {/* Brandon 2026-05-21 fix mobile: tab bar wrapper con borde inferior
          mobile + scroll-snap-x para que cada tab se alinee al edge en swipe.
          Nota: sticky deshabilitado porque el SuperAdminShell main tiene
          overflow-auto (nuevo scroll context que impide sticky a window). */}
      <div className="-mx-4 sm:-mx-6 px-4 sm:px-6 py-2 bg-[var(--surface-canvas)] border-b border-[var(--rule-soft)] sm:bg-transparent sm:border-0 sm:px-0 sm:mx-0 sm:py-0">
        <div className="overflow-x-auto -mx-1 px-1 [scroll-snap-type:x_mandatory] sm:[scroll-snap-type:none]">
          <div className="inline-flex gap-1 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-1.5 min-w-full sm:min-w-0">
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.key;
            const count =
              t.key === "stores" ? stats.total : t.key === "health" ? stats.unpublished : undefined;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-bold transition whitespace-nowrap [scroll-snap-align:start] sm:[scroll-snap-align:none] ${
                  isActive
                    ? "bg-[var(--accent)]/10 text-[var(--accent)] shadow-sm"
                    : "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                {t.label}
                {typeof count === "number" && count > 0 && (
                  <span
                    className={`inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 text-[length:var(--ts-2xs)] font-extrabold tabular-nums ${
                      isActive
                        ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                        : t.key === "health"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                          : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
          </div>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-rose-300/60 bg-rose-50/40 px-4 py-3 text-sm font-semibold text-[var(--accent)] dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-[var(--accent)]"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={handleRefresh}
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white hover:brightness-110"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* ─── Tab content ─────────────────────────────────────────── */}
      {tab === "stores" && (
        <StoresTab
          stores={stores}
          loading={stores === undefined && !error}
          error={error}
          onRefresh={handleRefresh}
          refreshing={refreshing}
        />
      )}
      {tab === "beneficios" && (
        <BeneficiosTab stores={stores} onRefresh={handleRefresh} />
      )}
      {tab === "health" && <HealthTab />}
      {tab === "operations" && <OperationsTab />}
      {tab === "categories" && <CategoriesTab />}
      {tab === "coupons" && <CouponsTab />}
      {tab === "analytics" && <AnalyticsTab stores={stores} />}
      {tab === "navegacion" && <NavegacionTab />}
      {tab === "plantilla" && <PlantillaPanelTab />}
    </AdminTabShell>
  );
}
