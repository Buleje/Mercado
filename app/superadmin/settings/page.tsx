"use client";

import { useEffect, useState } from "react";
import { DollarSign, BarChart3, Settings, CheckCircle2, Loader2 } from "lucide-react";
import type { PlatformSettings } from "@/lib/superadmin-types";
import { DEFAULT_SETTINGS } from "@/lib/superadmin-types";

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

  // ── GET inicial desde DB ──────────────────────────────────────────────
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

        // Aplanar el shape DB (key → JSON) al shape plano PlatformSettings
        // que usa el formulario. "plan-prices" es el único setting crítico hoy.
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

        // Otros settings que ya se persisten bajo claves top-level en DB.
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

  // ── POST a la API (single source of truth) ────────────────────────────
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
        headers: { "Content-Type": "application/json" },
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

  const inputCls =
    "w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/40 disabled:opacity-60";
  const labelCls =
    "block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Configuración de plataforma</h1>
        <p className="text-gray-500 text-sm mt-1">
          Ajusta precios, límites y controles globales. Los precios alimentan el MRR del dashboard.
        </p>
        {loading && (
          <p className="text-xs text-gray-400 mt-2 flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Cargando desde la base de datos...
          </p>
        )}
        {error && (
          <p className="text-xs text-rose-500 mt-2">Error: {error}</p>
        )}
      </div>

      {/* Precios de planes */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm dark:shadow-none">
        <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-teal-500" /> Precios de planes (S/ / mes)
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
                className={inputCls}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Comisión y límites */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm dark:shadow-none">
        <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-violet-500" /> Comisión y límites
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
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
              className={inputCls}
            />
          </div>
        </div>

        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          Límites plan Free
        </h4>
        <div className="grid grid-cols-3 gap-4 mb-4">
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
                className={inputCls}
              />
            </div>
          ))}
        </div>

        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
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
                className={inputCls}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Controles de plataforma */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm dark:shadow-none">
        <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5 text-amber-500" /> Controles de plataforma
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
              className="flex items-center justify-between gap-4 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0"
            >
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">{label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
              </div>
              <button
                type="button"
                onClick={() => update(key, !settings[key])}
                disabled={loading}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-60 ${
                  settings[key] ? "bg-teal-500" : "bg-gray-200 dark:bg-gray-700"
                }`}
                role="switch"
                aria-checked={settings[key]}
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
      </div>

      {/* Botón guardar */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || saving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-60"
          style={{
            background: saved
              ? "#22c55e"
              : "linear-gradient(135deg, #00B4A6 0%, #2dd4bf 100%)",
          }}
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Guardando...
            </>
          ) : saved ? (
            <>
              <CheckCircle2 className="w-4 h-4" /> Guardado
            </>
          ) : (
            "Guardar cambios"
          )}
        </button>
      </div>
    </div>
  );
}
