"use client";

import { useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  DollarSign,
  BarChart3,
  Settings,
  CheckCircle2,
  Loader2,
  Save,
} from "@buleje/design-system/icons";
import type { PlatformSettings } from "@/lib/superadmin-types";
import { DEFAULT_SETTINGS } from "@/lib/superadmin-types";
import {
  ADMIN_TOKENS,
  AdminTabShell,
  AdminButton,
} from "../_components/_shared";
import SidebarConfigPanel from "@/components/superadmin/SidebarConfigPanel";

// Items canónicos del sidebar — debe matchear lo que renderiza
// SuperAdminShell.tsx (NAV_ITEMS).
const SIDEBAR_ITEMS = [
  { label: "Dashboard",       href: "/superadmin/dashboard" },
  { label: "Centro Control",  href: "/superadmin/control-center" },
  { label: "Tiendas",         href: "/superadmin/tenants" },
  { label: "Aplicaciones",    href: "/superadmin/vendor-applications" },
  { label: "Marketplace",     href: "/superadmin/stores" },
  { label: "Banners",         href: "/superadmin/banners" },
  { label: "Analytics",       href: "/superadmin/analytics" },
  { label: "Salud",           href: "/superadmin/health" },
  { label: "Actividad",       href: "/superadmin/activity" },
  { label: "Seguridad",       href: "/superadmin/security" },
  { label: "Config",          href: "/superadmin/settings" },
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

        if (alive) setSettings((prev) => ({ ...prev, ...flat }));
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
  };

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
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "save_failed");
    } finally {
      setSaving(false);
    }
  };

  const labelCls =
    "block text-xs font-semibold text-[var(--text-tertiary)] mb-1 uppercase tracking-wider";

  return (
    <AdminTabShell
      title="Configuración de plataforma"
      description="Ajusta precios, límites y controles globales. Los precios alimentan el MRR del dashboard."
      icon={Settings}
      actions={
        <AdminButton
          variant="primary"
          icon={saved ? CheckCircle2 : Save}
          loading={saving}
          disabled={loading}
          onClick={handleSave}
        >
          {saving ? "Guardando…" : saved ? "Guardado" : "Guardar cambios"}
        </AdminButton>
      }
    >
      {loading && (
        <p className="text-xs text-[var(--text-tertiary)] flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" aria-hidden /> Cargando desde la base de datos…
        </p>
      )}
      {error && <div className={ADMIN_TOKENS.errorBanner}>Error: {error}</div>}

      <SidebarConfigPanel items={SIDEBAR_ITEMS} />

      {/* Precios de planes */}
      <section className={ADMIN_TOKENS.cardPadded}>
        <h3 className={`${ADMIN_TOKENS.headingH3} flex items-center gap-2`}>
          <DollarSign className="w-5 h-5 text-[var(--accent)]" aria-hidden /> Precios de planes (S/ / mes)
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {([
            { key: "priceFree" as const, label: "Free" },
            { key: "pricePro" as const, label: "Pro" },
            { key: "priceBusiness" as const, label: "Business" },
            { key: "priceEnterprise" as const, label: "Enterprise" },
          ]).map(({ key, label }) => (
            <div key={key}>
              <label className={labelCls}>{label}</label>
              <input
                type="number"
                min={0}
                disabled={loading}
                value={settings[key]}
                onChange={(e) => update(key, Number(e.target.value))}
                className={ADMIN_TOKENS.input}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Comisión y límites */}
      <section className={ADMIN_TOKENS.cardPadded}>
        <h3 className={`${ADMIN_TOKENS.headingH3} flex items-center gap-2`}>
          <BarChart3 className="w-5 h-5 text-[var(--text-secondary)]" aria-hidden /> Comisión y límites
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Comisión default (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              disabled={loading}
              value={settings.commissionDefault}
              onChange={(e) => update("commissionDefault", Number(e.target.value))}
              className={ADMIN_TOKENS.input}
            />
          </div>
        </div>

        <h4 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
          Límites plan Free
        </h4>
        <div className="grid grid-cols-3 gap-4">
          {([
            { key: "limitsFreeProducts" as const, label: "Productos" },
            { key: "limitsFreeUsers" as const, label: "Usuarios" },
            { key: "limitsFreeOrders" as const, label: "Pedidos/mes" },
          ]).map(({ key, label }) => (
            <div key={key}>
              <label className={labelCls}>{label}</label>
              <input
                type="number"
                min={0}
                disabled={loading}
                value={settings[key]}
                onChange={(e) => update(key, Number(e.target.value))}
                className={ADMIN_TOKENS.input}
              />
            </div>
          ))}
        </div>

        <h4 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
          Límites plan Pro
        </h4>
        <div className="grid grid-cols-3 gap-4">
          {([
            { key: "limitsProProducts" as const, label: "Productos" },
            { key: "limitsProUsers" as const, label: "Usuarios" },
            { key: "limitsProOrders" as const, label: "Pedidos/mes" },
          ]).map(({ key, label }) => (
            <div key={key}>
              <label className={labelCls}>{label}</label>
              <input
                type="number"
                min={0}
                disabled={loading}
                value={settings[key]}
                onChange={(e) => update(key, Number(e.target.value))}
                className={ADMIN_TOKENS.input}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Controles de plataforma */}
      <section className={ADMIN_TOKENS.cardPadded}>
        <h3 className={`${ADMIN_TOKENS.headingH3} flex items-center gap-2`}>
          <Settings className="w-5 h-5 text-[var(--data-warning-500)]" aria-hidden /> Controles de plataforma
        </h3>
        <div className="space-y-4">
          {([
            {
              key: "allowNewStores" as const,
              label: "Permitir registro de nuevas tiendas",
              desc: "Si está desactivado, el formulario de registro estará cerrado",
            },
            {
              key: "maintenanceMode" as const,
              label: "Modo mantenimiento",
              desc: "Muestra una pantalla de mantenimiento a todos los usuarios",
            },
          ]).map(({ key, label, desc }) => (
            <div
              key={key}
              className="flex items-center justify-between gap-4 py-3 border-b border-[var(--rule-soft)] last:border-0"
            >
              <div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">{label}</div>
                <div className="text-xs text-[var(--text-tertiary)] mt-0.5">{desc}</div>
              </div>
              <button
                type="button"
                onClick={() => update(key, !settings[key])}
                disabled={loading}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 disabled:opacity-60 ${
                  settings[key] ? "bg-[var(--accent)]" : "bg-[var(--surface-sunken)]"
                }`}
                role="switch"
                aria-checked={settings[key]}
                aria-label={label}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                    settings[key] ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </section>
    </AdminTabShell>
  );
}
