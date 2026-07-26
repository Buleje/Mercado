"use client";

import { useEffect, useMemo, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  DollarSign,
  BarChart3,
  Settings,
  CheckCircle2,
  Loader2,
  Save,
  Percent,
  Package,
  Users,
  ShoppingCart,
  Store,
  AlertTriangle,
  Sparkles,
} from "@buleje/design-system/icons";
import type { LucideIcon } from "@buleje/design-system/icons";
import type { PlatformSettings } from "@/lib/superadmin-types";
import { DEFAULT_SETTINGS } from "@/lib/superadmin-types";
import {
  ADMIN_TOKENS,
  AdminTabShell,
  AdminButton,
} from "../_components/_shared";
import SidebarConfigPanel from "@/components/superadmin/SidebarConfigPanel";
import { SuperAdminModuleTabs, SETTINGS_TABS } from "@/components/superadmin/_shared/ModuleTabs";

// Items canónicos del sidebar — debe matchear lo que renderiza
// SuperAdminShell.tsx (NAV_ITEMS). Refresh 2026-05-19 — sincronía con los
// 7 grupos nuevos. Cada item es una ruta que se puede ocultar/reordenar
// desde SidebarConfigPanel.
const SIDEBAR_ITEMS = [
  // Inicio
  { label: "Dashboard",              href: "/superadmin/dashboard"          },
  { label: "Centro de control",      href: "/superadmin/control-center"     },
  { label: "Actividad",              href: "/superadmin/activity"           },
  // Tiendas
  { label: "Tenants",                href: "/superadmin/tenants"            },
  { label: "Pedidos",                href: "/superadmin/orders"             },
  { label: "Repartidores",           href: "/superadmin/repartidores"       },
  // Marketplace
  { label: "Marketplace",            href: "/superadmin/marketplace"        },
  { label: "Solicitudes vendedores", href: "/superadmin/vendor-applications" },
  { label: "Salud de vendors",       href: "/superadmin/vendor-health"      },
  { label: "Tiendas publicadas",     href: "/superadmin/stores"             },
  // Finanzas
  { label: "Pagos pendientes",       href: "/superadmin/pagos-pendientes"   },
  { label: "Pagos Yape (IA)",        href: "/superadmin/pagos-yape"         },
  { label: "Billing & Stripe",       href: "/superadmin/billing"            },
  // Diseño
  { label: "Centro de diseño",       href: "/superadmin/design-system"      },
  { label: "Plantilla del admin",    href: "/superadmin/plantilla"          },
  { label: "Marca",                  href: "/superadmin/marca"              },
  { label: "Banners",                href: "/superadmin/banners"            },
  { label: "Banco de imágenes",      href: "/superadmin/banco-imagenes"     },
  { label: "Catálogo de variantes",  href: "/superadmin/variant-catalog"    },
  { label: "Recetario",              href: "/superadmin/recetario"          },
  // Operaciones
  { label: "Analytics",              href: "/superadmin/analytics"          },
  { label: "Salud sistema",          href: "/superadmin/health"             },
  { label: "SLO & budgets",          href: "/superadmin/slo"                },
  { label: "Dead-letter",            href: "/superadmin/dlq"                },
  { label: "Setup score",            href: "/superadmin/setup"              },
  // Sistema
  { label: "Seguridad",              href: "/superadmin/security"           },
  { label: "Configuración",          href: "/superadmin/configuracion"      },
  { label: "Settings",               href: "/superadmin/settings"           },
  { label: "Sitemap",                href: "/superadmin/sitemap"            },
  { label: "Roadmap",                href: "/superadmin/roadmap"            },
];

type PlanKey = "priceFree" | "pricePro" | "priceBusiness" | "priceEnterprise";

interface PlanTier {
  key: PlanKey;
  label: string;
  tagline: string;
  accent: "neutral" | "primary" | "violet" | "indigo";
}

// Alineado con plan-tiers.ts mayo 2026 v2 (Free/Starter/Pro/Business).
// Las keys siguen siendo los PlanId DB legacy (free/pro/business/enterprise).
const PLAN_TIERS: PlanTier[] = [
  { key: "priceFree",       label: "Free",     tagline: "Gratis · siempre",           accent: "neutral" },
  { key: "pricePro",        label: "Starter",  tagline: "Bodega con flujo diario",    accent: "primary" },
  { key: "priceBusiness",   label: "Pro",      tagline: "Sweet spot · Mas elegido",   accent: "violet" },
  { key: "priceEnterprise", label: "Business", tagline: "Cadenas y productores",      accent: "indigo" },
];

/**
 * /superadmin/settings
 *
 * Fix del bug MRR fake 2026-04-09:
 *   - Antes persistía en `localStorage` → Brandon perdía los cambios al
 *     cambiar de dispositivo y el MRR del dashboard estaba desincronizado.
 *   - Ahora GET inicial + POST real a `/api/superadmin/settings`, que
 *     escribe en `PlatformSetting("plan-prices")` en la DB — single source
 *     of truth compartida con `app/api/superadmin/analytics/route.ts`.
 */
export default function SettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [initial, setInitial] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/superadmin/settings", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { settings: Record<string, unknown> };

        const flat: Partial<PlatformSettings> = {};
        const prices = data.settings["plan-prices"] as
          | Partial<Record<"free" | "pro" | "business" | "enterprise", number>>
          | undefined;
        if (prices) {
          if (typeof prices.free === "number") flat.priceFree = prices.free;
          if (typeof prices.pro === "number") flat.pricePro = prices.pro;
          if (typeof prices.business === "number") flat.priceBusiness = prices.business;
          if (typeof prices.enterprise === "number") flat.priceEnterprise = prices.enterprise;
        }

        const assignIfNumber = (k: keyof PlatformSettings, v: unknown) => {
          if (typeof v === "number") (flat as Record<string, unknown>)[k] = v;
        };
        const assignIfBool = (k: keyof PlatformSettings, v: unknown) => {
          if (typeof v === "boolean") (flat as Record<string, unknown>)[k] = v;
        };
        assignIfNumber("commissionDefault", data.settings["commission-default"]);
        assignIfNumber("limitsFreeProducts", data.settings["limits-free-products"]);
        assignIfNumber("limitsFreeUsers", data.settings["limits-free-users"]);
        assignIfNumber("limitsFreeOrders", data.settings["limits-free-orders"]);
        assignIfNumber("limitsProProducts", data.settings["limits-pro-products"]);
        assignIfNumber("limitsProUsers", data.settings["limits-pro-users"]);
        assignIfNumber("limitsProOrders", data.settings["limits-pro-orders"]);
        assignIfBool("allowNewStores", data.settings["allow-new-stores"]);
        assignIfBool("maintenanceMode", data.settings["maintenance-mode"]);

        if (alive) {
          setSettings((prev) => {
            const next = { ...prev, ...flat };
            setInitial(next);
            return next;
          });
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "load_failed");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const update = <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const dirty = useMemo(() => {
    return (Object.keys(settings) as (keyof PlatformSettings)[]).some(
      (k) => settings[k] !== initial[k],
    );
  }, [settings, initial]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        settings: {
          "plan-prices": {
            free: settings.priceFree,
            pro: settings.pricePro,
            business: settings.priceBusiness,
            enterprise: settings.priceEnterprise,
          },
          "commission-default": settings.commissionDefault,
          "limits-free-products": settings.limitsFreeProducts,
          "limits-free-users": settings.limitsFreeUsers,
          "limits-free-orders": settings.limitsFreeOrders,
          "limits-pro-products": settings.limitsProProducts,
          "limits-pro-users": settings.limitsProUsers,
          "limits-pro-orders": settings.limitsProOrders,
          "allow-new-stores": settings.allowNewStores,
          "maintenance-mode": settings.maintenanceMode,
        },
      };
      const res = await fetch("/api/superadmin/settings", {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      setSaved(true);
      setInitial(settings);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "save_failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SuperAdminModuleTabs tabs={SETTINGS_TABS} />
    <AdminTabShell
      info={{
        what: "Controla los precios de planes (S//mes), límites por plan (productos, usuarios, pedidos), comisión default y controles globales como modo mantenimiento.",
        affects: "Los precios se usan para calcular el MRR real del dashboard. Los límites se aplican a cada tienda según su plan. El modo mantenimiento afecta a todos los usuarios.",
        example: "Si subes el precio del plan Pro de S/100 a S/120, el MRR del dashboard se recalcula automáticamente con el nuevo valor.",
      }}
      title="Configuración de plataforma"
      kicker="Control global"
      description="Ajusta precios, comisiones, límites y controles de toda la plataforma. Los precios alimentan el MRR del dashboard en tiempo real."
      icon={Settings}
      stats={
        <>
          <StatPill
            label="Plan base"
            value={`S/${settings.priceFree}`}
            tone="neutral"
          />
          <StatPill
            label="Comisión"
            value={`${settings.commissionDefault}%`}
            tone="primary"
          />
          {settings.maintenanceMode && (
            <StatPill label="Estado" value="Mantenimiento" tone="warning" />
          )}
        </>
      }
      actions={
        <AdminButton
          variant="primary"
          icon={saved ? CheckCircle2 : Save}
          loading={saving}
          disabled={loading || !dirty}
          onClick={handleSave}
        >
          {saving ? "Guardando…" : saved ? "Guardado" : dirty ? "Guardar cambios" : "Sin cambios"}
        </AdminButton>
      }
    >
      {loading && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" aria-hidden />
          Cargando configuración desde la base de datos…
        </div>
      )}
      {error && (
        <div className={`${ADMIN_TOKENS.errorBanner} flex items-center gap-2`}>
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          Error: {error}
        </div>
      )}
      {dirty && !saving && !saved && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--accent)]/30 bg-primary/10/40 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-[var(--accent)]" aria-hidden />
            <span className="font-semibold text-[var(--text-primary)]">
              Tienes cambios sin guardar
            </span>
            <span className="text-[var(--text-secondary)]">— recordá presionar Guardar.</span>
          </div>
        </div>
      )}

      <JumpNav />

      <div id="set-sidebar" className="scroll-mt-28">
        <SidebarConfigPanel items={SIDEBAR_ITEMS} />
      </div>

      {/* ─── Precios de planes ─────────────────────────────────────── */}
      <SectionHeader
        id="set-precios"
        eyebrow="Monetización"
        icon={DollarSign}
        title="Precios de planes"
        subtitle="Precio mensual en soles (S/) que se cobra a cada tenant. Estos números alimentan directamente el MRR del dashboard."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_TIERS.map((tier) => (
          <PlanPriceCard
            key={tier.key}
            tier={tier}
            value={settings[tier.key]}
            disabled={loading}
            onChange={(v) => update(tier.key, v)}
          />
        ))}
      </div>

      {/* ─── Comisión por defecto ────────────────────────────────────── */}
      <SectionHeader
        eyebrow="Marketplace"
        icon={Percent}
        title="Comisión por defecto"
        subtitle="Porcentaje que la plataforma retiene de cada venta cross-vendor. Puede sobreescribirse por categoría o por vendor."
        id="set-comision"
      />
      <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
              Comisión global (%)
            </label>
            <div className="mt-2 flex items-center gap-3">
              <div className="relative max-w-xs flex-1">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  disabled={loading}
                  value={settings.commissionDefault}
                  onChange={(e) => update("commissionDefault", Number(e.target.value))}
                  className={`${ADMIN_TOKENS.input} pr-10 text-2xl font-bold h-14`}
                />
                <Percent
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)]"
                  aria-hidden
                />
              </div>
              <p className="text-sm text-[var(--text-secondary)]">
                de cada venta marketplace
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-4 sm:min-w-[200px]">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
              Sobre S/ 100
            </p>
            <p className="mt-1 font-display text-2xl font-extrabold text-[var(--accent)]">
              S/ {((settings.commissionDefault / 100) * 100).toFixed(2)}
            </p>
            <p className="text-xs text-[var(--text-secondary)]">retiene la plataforma</p>
          </div>
        </div>
      </div>

      {/* ─── Límites por plan ────────────────────────────────────────── */}
      <SectionHeader
        id="set-limites"
        eyebrow="Cuotas"
        icon={BarChart3}
        title="Límites por plan"
        subtitle="Topes que dispara el upsell al siguiente plan. Cuando un tenant los supera, el banner de upgrade aparece automáticamente."
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <PlanLimitsCard
          plan="Free"
          tone="neutral"
          values={{
            products: settings.limitsFreeProducts,
            users: settings.limitsFreeUsers,
            orders: settings.limitsFreeOrders,
          }}
          disabled={loading}
          onChange={(field, v) => {
            const map = {
              products: "limitsFreeProducts",
              users: "limitsFreeUsers",
              orders: "limitsFreeOrders",
            } as const;
            update(map[field], v);
          }}
        />
        <PlanLimitsCard
          plan="Pro"
          tone="primary"
          values={{
            products: settings.limitsProProducts,
            users: settings.limitsProUsers,
            orders: settings.limitsProOrders,
          }}
          disabled={loading}
          onChange={(field, v) => {
            const map = {
              products: "limitsProProducts",
              users: "limitsProUsers",
              orders: "limitsProOrders",
            } as const;
            update(map[field], v);
          }}
        />
      </div>

      {/* ─── Controles ───────────────────────────────────────────────── */}
      <SectionHeader
        id="set-controles"
        eyebrow="Operativa"
        icon={Settings}
        title="Controles de plataforma"
        subtitle="Switches globales con efecto inmediato sobre todos los tenants. Usá modo mantenimiento solo durante deploys o incidencias críticas."
      />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <ToggleCard
          icon={Store}
          title="Permitir nuevas tiendas"
          desc="Abre o cierra el formulario público de registro de tenants."
          active={settings.allowNewStores}
          tone="primary"
          disabled={loading}
          onToggle={() => update("allowNewStores", !settings.allowNewStores)}
        />
        <ToggleCard
          icon={AlertTriangle}
          title="Modo mantenimiento"
          desc="Bloquea el acceso público con pantalla de mantenimiento. Usar solo durante deploys críticos."
          active={settings.maintenanceMode}
          tone="warning"
          disabled={loading}
          onToggle={() => update("maintenanceMode", !settings.maintenanceMode)}
        />
      </div>
    </AdminTabShell>
    </>
  );
}

/* ───────────────────────── shared components ─────────────────────── */

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "primary" | "warning";
}) {
  const cls =
    tone === "primary"
      ? "border-[var(--accent)]/30 bg-[var(--accent-soft,var(--accent))]/10 text-[var(--accent)]"
      : tone === "warning"
        ? "border-teal-300/60 bg-teal-50/60 text-teal-700 dark:border-teal-700/40 dark:bg-teal-950/30 dark:text-teal-300"
        : "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)]";
  return (
    <div className={`rounded-xl border px-3.5 py-2 min-w-[88px] ${cls}`}>
      <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
        {label}
      </p>
      <p className="font-display text-xl font-extrabold tabular-nums tracking-tight mt-1 leading-none">
        {value}
      </p>
    </div>
  );
}

function SectionHeader({
  id,
  eyebrow,
  icon: Icon,
  title,
  subtitle,
}: {
  id?: string;
  eyebrow: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
}) {
  return (
    <div id={id} className="scroll-mt-28 flex items-start gap-3 border-b border-[var(--rule-soft)] pb-3 pt-2">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
        <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
          {eyebrow}
        </p>
        <h2 className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-[var(--text-primary)]">
          {title}
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{subtitle}</p>
      </div>
    </div>
  );
}

// ── Barra de salto entre secciones (sticky) — página muy larga (~4000px) ─────
function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? "");
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-112px 0px -60% 0px", threshold: [0.05, 0.4] },
    );
    ids.forEach((id) => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [ids]);
  return active;
}

const JUMP_SECTIONS = [
  { id: "set-sidebar", label: "Barra lateral" },
  { id: "set-precios", label: "Precios" },
  { id: "set-comision", label: "Comisión" },
  { id: "set-limites", label: "Límites" },
  { id: "set-controles", label: "Controles" },
];

function JumpNav() {
  const ids = useMemo(() => JUMP_SECTIONS.map((s) => s.id), []);
  const active = useActiveSection(ids);
  return (
    <nav
      aria-label="Ir a sección"
      className="sticky top-2 z-20 -mx-1 overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]/95 px-2 py-1.5 backdrop-blur"
    >
      <ul className="flex min-w-full items-center gap-1">
        {JUMP_SECTIONS.map((s) => {
          const isActive = active === s.id;
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={isActive ? "true" : undefined}
                className={`inline-flex whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-bold transition-colors ${
                  isActive
                    ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                }`}
              >
                {s.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function PlanPriceCard({
  tier,
  value,
  disabled,
  onChange,
}: {
  tier: PlanTier;
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  const accentMap = {
    neutral: {
      border: "border-[var(--rule-soft)]",
      badge: "bg-[var(--surface-canvas)] border border-[var(--rule-base)] text-[var(--text-secondary)]",
      ring: "focus-within:ring-[var(--text-secondary)]/30",
    },
    primary: {
      border: "border-[var(--accent)]/30",
      badge: "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
      ring: "focus-within:ring-[var(--accent)]/40",
    },
    violet: {
      border: "border-violet-300/40 dark:border-violet-700/40",
      badge:
        "bg-violet-100 dark:bg-violet-950/40 text-[var(--accent)] dark:text-[var(--accent)]",
      ring: "focus-within:ring-violet-400/40",
    },
    indigo: {
      border: "border-indigo-300/40 dark:border-indigo-700/40",
      badge:
        "bg-indigo-100 dark:bg-indigo-950/40 text-[var(--accent)] dark:text-[var(--accent)]",
      ring: "focus-within:ring-indigo-400/40",
    },
  }[tier.accent];

  return (
    <div
      className={`group rounded-2xl border-2 ${accentMap.border} bg-[var(--surface-raised)] p-5 transition hover:-translate-y-0.5 hover:shadow-md`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${accentMap.badge}`}
        >
          {tier.label}
        </span>
        <span className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
          {tier.tagline}
        </span>
      </div>
      <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
        Precio mensual
      </label>
      <div
        className={`mt-1.5 flex items-center gap-1 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-2 transition focus-within:ring-2 ${accentMap.ring}`}
      >
        <span className="font-display text-base font-bold text-[var(--text-tertiary)]">
          S/
        </span>
        <input
          type="number"
          min={0}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full bg-transparent font-display text-2xl font-extrabold text-[var(--text-primary)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="text-xs text-[var(--text-tertiary)]">/ mes</span>
      </div>
    </div>
  );
}

function PlanLimitsCard({
  plan,
  tone,
  values,
  disabled,
  onChange,
}: {
  plan: string;
  tone: "neutral" | "primary";
  values: { products: number; users: number; orders: number };
  disabled: boolean;
  onChange: (field: "products" | "users" | "orders", v: number) => void;
}) {
  const fields: { key: "products" | "users" | "orders"; label: string; icon: LucideIcon }[] = [
    { key: "products", label: "Productos", icon: Package },
    { key: "users", label: "Usuarios", icon: Users },
    { key: "orders", label: "Pedidos / mes", icon: ShoppingCart },
  ];
  const accent =
    tone === "primary"
      ? "border-[var(--accent)]/30 bg-primary/10/30"
      : "border-[var(--rule-soft)] bg-[var(--surface-canvas)]";
  const badge =
    tone === "primary"
      ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
      : "bg-[var(--surface-canvas)] border border-[var(--rule-base)] text-[var(--text-secondary)]";

  return (
    <div className={`rounded-2xl border-2 ${accent} p-6`}>
      <div className="flex items-center justify-between">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${badge}`}
        >
          Plan {plan}
        </span>
        <span className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
          Topes mensuales
        </span>
      </div>
      {/* Brandon 2026-05-20 v13 audit superadmin responsive: grid-cols-3
          forzaba 3 inputs en 320px (mobile) → ~95px c/u, casi inusable.
          Stack 1 col mobile, 3 cols desktop. */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {fields.map(({ key, label, icon: Icon }) => (
          <div key={key}>
            <label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </label>
            <input
              type="number"
              min={0}
              disabled={disabled}
              value={values[key]}
              onChange={(e) => onChange(key, Number(e.target.value))}
              className={`${ADMIN_TOKENS.input} mt-1 font-display text-lg font-bold`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function ToggleCard({
  icon: Icon,
  title,
  desc,
  active,
  tone,
  disabled,
  onToggle,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
  active: boolean;
  tone: "primary" | "warning";
  disabled: boolean;
  onToggle: () => void;
}) {
  const activeBorder =
    tone === "warning"
      ? "border-teal-400/50 dark:border-teal-600/50"
      : "border-[var(--accent)]/40";
  const inactiveBorder = "border-[var(--rule-soft)]";
  const iconBg =
    tone === "warning"
      ? active
        ? "bg-teal-100 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400"
        : "bg-[var(--surface-canvas)] text-[var(--text-tertiary)]"
      : active
        ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
        : "bg-[var(--surface-canvas)] text-[var(--text-tertiary)]";
  const switchBg =
    tone === "warning"
      ? active
        ? "bg-teal-500"
        : "bg-[var(--surface-sunken)]"
      : active
        ? "bg-[var(--accent)]"
        : "bg-[var(--surface-sunken)]";

  return (
    <div
      className={`flex items-start gap-4 rounded-2xl border-2 bg-[var(--surface-raised)] p-5 transition ${
        active ? activeBorder : inactiveBorder
      }`}
    >
      <span
        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${iconBg}`}
      >
        <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
            {title}
          </h3>
          <button
            type="button"
            onClick={onToggle}
            disabled={disabled}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 disabled:opacity-60 ${switchBg}`}
            role="switch"
            aria-checked={active}
            aria-label={title}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                active ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">{desc}</p>
        {active && tone === "warning" && (
          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-teal-100 px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-teal-700 dark:bg-teal-950/50 dark:text-teal-400">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            Activo · público bloqueado
          </p>
        )}
      </div>
    </div>
  );
}
