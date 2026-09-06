"use client";

/**
 * BeneficiosTab — pestaña dedicada de /superadmin/stores para gestionar los
 * BENEFICIOS de cada tienda (nivel de card + perks de plan), con
 * previsualización de cómo se verá en /tiendas.
 *
 * Manual ahora; el campo/endpoint quedan listos para automatizar por plan.
 */

import { useCallback, useMemo, useState } from "react";
import Image from "next/image";
import {
  ShieldCheck,
  TrendingUp,
  Sparkles,
  ImageIcon,
  Percent,
  Star,
  HeartHandshake,
  BarChart3,
  Search,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { PlanBadge } from "@/components/superadmin/_shared/SABadge";
import { csrfHeaders } from "@/lib/csrf-client";
import type { StoreRow, StoreBenefitKey } from "./types";
import { TierLegend, TierSelector, type DisplayTier } from "./StoreTierControls";

interface BenefitDef {
  key: StoreBenefitKey;
  label: string;
  desc: string;
  Icon: LucideIcon;
  group: "Visibilidad & Marketing" | "Comercial & Operativo";
}

const BENEFITS: BenefitDef[] = [
  {
    key: "verified",
    label: "Verificada",
    desc: "Sello de confianza en la card y la tienda",
    Icon: ShieldCheck,
    group: "Visibilidad & Marketing",
  },
  {
    key: "searchBoost",
    label: "Boost en búsqueda",
    desc: "Prioridad de orden por encima de las demás",
    Icon: TrendingUp,
    group: "Visibilidad & Marketing",
  },
  {
    key: "featuredHome",
    label: "Destacar en Home",
    desc: "Aparece en la home del marketplace, no solo /tiendas",
    Icon: Sparkles,
    group: "Visibilidad & Marketing",
  },
  {
    key: "ownBanner",
    label: "Banner propio",
    desc: "Slot de banner promocional en /tiendas",
    Icon: ImageIcon,
    group: "Visibilidad & Marketing",
  },
  {
    key: "reducedCommission",
    label: "Comisión reducida",
    desc: "Override de comisión (ej. 0% por 90 días)",
    Icon: Percent,
    group: "Comercial & Operativo",
  },
  {
    key: "featuredProducts",
    label: "Productos destacados",
    desc: "Fijar productos arriba en su tienda",
    Icon: Star,
    group: "Comercial & Operativo",
  },
  {
    key: "prioritySupport",
    label: "Soporte prioritario",
    desc: "Cola VIP de soporte por WhatsApp",
    Icon: HeartHandshake,
    group: "Comercial & Operativo",
  },
  {
    key: "advancedAnalytics",
    label: "Analytics avanzado",
    desc: "Métricas pro en el panel de la tienda",
    Icon: BarChart3,
    group: "Comercial & Operativo",
  },
];

const GROUPS = ["Visibilidad & Marketing", "Comercial & Operativo"] as const;

interface BeneficiosTabProps {
  stores: StoreRow[] | undefined;
  onRefresh: () => void;
}

type Override = { displayTier?: DisplayTier; benefits?: Partial<Record<StoreBenefitKey, boolean>> };

export function BeneficiosTab({ stores, onRefresh }: BeneficiosTabProps) {
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  // Override optimista: refleja el cambio AL INSTANTE sin esperar el refetch.
  const [overrides, setOverrides] = useState<Record<string, Override>>({});

  const patchStore = useCallback(
    async (
      storeId: string,
      body: { displayTier?: DisplayTier; benefits?: Partial<Record<StoreBenefitKey, boolean>> },
    ) => {
      setBusyId(storeId);
      // Optimista: aplicar el cambio en UI ya.
      setOverrides((prev) => {
        const cur = prev[storeId] ?? {};
        return {
          ...prev,
          [storeId]: {
            displayTier: body.displayTier ?? cur.displayTier,
            benefits: { ...cur.benefits, ...body.benefits },
          },
        };
      });
      try {
        const res = await fetch("/api/superadmin/stores", {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({ storeId, ...body }),
        });
        if (res.ok) {
          onRefresh();
        } else {
          throw new Error("patch failed");
        }
      } catch {
        // Revertir el override si falló.
        setOverrides((prev) => {
          const { [storeId]: _drop, ...rest } = prev;
          return rest;
        });
      } finally {
        setBusyId(null);
      }
    },
    [onRefresh],
  );

  const filtered = useMemo(() => {
    const list = (stores ?? []).filter((s) => s.isPublished);
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (s) => s.name.toLowerCase().includes(q) || s.tenant.name.toLowerCase().includes(q),
    );
  }, [stores, search]);

  return (
    <div className="space-y-5">
      {/* Previsualización de niveles */}
      <TierLegend />

      {/* Buscador */}
      <div className="relative max-w-sm">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]"
          aria-hidden
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar tienda…"
          className="w-full h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)] py-8 text-center">
          No hay tiendas publicadas que coincidan.
        </p>
      ) : (
        <div className="space-y-4">
          {filtered.map((store) => {
            const ov = overrides[store.id];
            const tier = (ov?.displayTier ?? store.displayTier ?? "standard") as DisplayTier;
            const benefits = { ...store.benefits, ...ov?.benefits };
            const busy = busyId === store.id;
            const activeCount = BENEFITS.filter((b) => benefits[b.key]).length;
            return (
              <div
                key={store.id}
                className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] transition-shadow hover:shadow-md"
              >
                {/* Header tienda + nivel (franja superior) */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
                      {store.logo ? (
                        <Image src={store.logo} alt="" fill sizes="44px" className="object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-base font-black text-[var(--text-tertiary)]">
                          {store.name.trim().charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-extrabold text-[var(--text-primary)] truncate">
                          {store.name}
                        </span>
                        <PlanBadge
                          plan={store.tenant.plan as "free" | "pro" | "business" | "enterprise"}
                        />
                        {activeCount > 0 && (
                          <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs font-black text-white">
                            {activeCount} activo{activeCount === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-[var(--text-tertiary)] font-mono">
                        {store.slug}
                      </span>
                    </div>
                  </div>
                  <TierSelector
                    value={tier}
                    busy={busy}
                    size="md"
                    onChange={(t) => patchStore(store.id, { displayTier: t })}
                  />
                </div>

                {/* Beneficios por grupo */}
                <div className="grid gap-4 p-4 sm:grid-cols-2">
                  {GROUPS.map((group) => (
                    <div key={group}>
                      <p className="mb-2 text-xs font-black uppercase tracking-wider text-[var(--text-tertiary)]">
                        {group}
                      </p>
                      <div className="space-y-1.5">
                        {BENEFITS.filter((b) => b.group === group).map((b) => {
                          const on = Boolean(benefits[b.key]);
                          return (
                            <button
                              key={b.key}
                              type="button"
                              disabled={busy}
                              onClick={() => patchStore(store.id, { benefits: { [b.key]: !on } })}
                              title={b.desc}
                              className={`group flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-50 ${
                                on
                                  ? "border-[var(--accent)] bg-primary/10"
                                  : "border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--accent)]/40"
                              }`}
                            >
                              <span
                                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                                  on
                                    ? "bg-[var(--accent)] text-white"
                                    : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
                                }`}
                              >
                                <b.Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-xs font-bold text-[var(--text-primary)]">
                                  {b.label}
                                </span>
                                <span className="block text-xs leading-tight text-[var(--text-tertiary)] truncate">
                                  {b.desc}
                                </span>
                              </span>
                              {/* Switch visual */}
                              <span
                                aria-hidden
                                className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${on ? "bg-[var(--accent)]" : "bg-[var(--rule-base)]"}`}
                              >
                                <span
                                  className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${on ? "left-3.5" : "left-0.5"}`}
                                />
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
