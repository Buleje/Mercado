"use client";

import { useState } from "react";
import { DollarSign, BarChart3, Settings, CheckCircle2 } from "lucide-react";
import type { PlatformSettings } from "@/lib/superadmin-types";
import { DEFAULT_SETTINGS } from "@/lib/superadmin-types";

export default function SettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings>(() => {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    try {
      const stored = localStorage.getItem("superadmin-platform-settings");
      if (!stored) return DEFAULT_SETTINGS;
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(stored) as Partial<PlatformSettings>) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    localStorage.setItem("superadmin-platform-settings", JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const inputCls =
    "w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/40";
  const labelCls =
    "block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Configuración de plataforma</h1>
        <p className="text-gray-500 text-sm mt-1">Ajusta precios, límites y controles globales.</p>
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
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${
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
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-semibold transition-all"
          style={{
            background: saved
              ? "#22c55e"
              : "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)",
          }}
        >
          {saved ? (
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
