"use client";

import { useState } from "react";
import { Check } from "@buleje/design-system/icons";

const NAV_MODULES = [
  {
    id: "inventario",
    name: "Inventario",
    tabs: [
      { id: "stock", label: "Existencias" },
      { id: "alertas", label: "Alertas" },
      { id: "movimientos", label: "Movimientos" },
      { id: "conteo", label: "Conteo fisico" },
      { id: "valorizado", label: "Valorizado" },
    ],
  },
  {
    id: "productos",
    name: "Productos",
    tabs: [
      { id: "dashboard", label: "Dashboard" },
      { id: "catalogo", label: "Catalogo" },
      { id: "categorias", label: "Categorias" },
      { id: "precios", label: "Precios" },
      { id: "promociones", label: "Promociones" },
    ],
  },
  {
    id: "compras",
    name: "Compras",
    tabs: [
      { id: "dashboard", label: "Dashboard" },
      { id: "sugerencias", label: "Sugerencias" },
      { id: "ordenes", label: "Ordenes" },
      { id: "proveedores", label: "Proveedores" },
      { id: "recepcion", label: "Recepci\u00f3n" },
    ],
  },
  {
    id: "plata",
    name: "Mi Plata",
    tabs: [
      { id: "dashboard", label: "Dashboard" },
      { id: "pl", label: "Ingresos y egresos" },
      { id: "gastos", label: "Gastos" },
      { id: "rentabilidad", label: "Rentabilidad" },
      { id: "presupuesto", label: "Meta vs Real" },
      { id: "reportes", label: "Reportes" },
    ],
  },
  {
    id: "clientes",
    name: "CRM",
    tabs: [
      { id: "dashboard", label: "Dashboard" },
      { id: "clientes", label: "Clientes" },
      { id: "delivery", label: "Delivery" },
      { id: "fidelizacion", label: "Fidelizacion" },
      { id: "segmentos", label: "Segmentos" },
    ],
  },
];

export function NavDefaultTabsConfig() {
  const [defaults, setDefaults] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem("nav-default-tabs");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [saved, setSaved] = useState(false);

  const handleChange = (moduleId: string, tabId: string) => {
    const next = { ...defaults, [moduleId]: tabId };
    setDefaults(next);
    localStorage.setItem("nav-default-tabs", JSON.stringify(next));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setDefaults({});
    localStorage.removeItem("nav-default-tabs");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-5 ">
      <div className="space-y-1">
        {NAV_MODULES.map((mod) => (
          <div
            key={mod.id}
            className="flex items-center justify-between py-2.5 border-b border-[var(--rule-soft)] dark:border-white/5 last:border-b-0"
          >
            <span className="text-sm font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)]">{mod.name}</span>
            <select
              value={defaults[mod.id] ?? mod.tabs[0].id}
              onChange={(e) => handleChange(mod.id, e.target.value)}
              className="text-xs border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] rounded-lg px-2.5 py-1.5 text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB] outline-none transition-all"
            >
              {mod.tabs.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-[var(--rule-soft)] dark:border-white/5">
        <button
          onClick={handleReset}
          className="text-xs text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors"
        >
          Restablecer todos
        </button>
        {saved && (
          <span className="text-xs text-[var(--data-success-500)] dark:text-[var(--data-success-500)] font-semibold flex items-center gap-1">
            <Check className="h-3 w-3" /> Guardado
          </span>
        )}
      </div>
    </div>
  );
}
