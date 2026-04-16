"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Eye, EyeOff, ChevronUp, ChevronDown, RotateCcw,
  TrendingUp, ShoppingCart, AlertTriangle, CreditCard,
  BarChart2, Package, UserPlus, DollarSign,
} from "lucide-react";

// ── Tipos ──────────────────────────────────────────────────────────────────────

export type WidgetId =
  | "ventas-hoy"
  | "pedidos-pendientes"
  | "stock-bajo"
  | "fiados-pendientes"
  | "grafico-ventas-semana"
  | "top-productos"
  | "clientes-nuevos"
  | "margen-diario";

interface Widget {
  id: WidgetId;
  label: string;
  icon: React.ReactNode;
  visible: boolean;
}

interface DashboardLayout {
  order: WidgetId[];
  hidden: WidgetId[];
}

const DEFAULT_ORDER: WidgetId[] = [
  "ventas-hoy",
  "pedidos-pendientes",
  "stock-bajo",
  "fiados-pendientes",
  "grafico-ventas-semana",
  "top-productos",
  "clientes-nuevos",
  "margen-diario",
];

const WIDGET_META: Record<WidgetId, { label: string; icon: React.ReactNode }> = {
  "ventas-hoy":             { label: "Ventas de Hoy",         icon: <TrendingUp className="h-4 w-4" /> },
  "pedidos-pendientes":     { label: "Pedidos Pendientes",     icon: <ShoppingCart className="h-4 w-4" /> },
  "stock-bajo":             { label: "Stock Bajo",             icon: <AlertTriangle className="h-4 w-4" /> },
  "fiados-pendientes":      { label: "Fiados Pendientes",      icon: <CreditCard className="h-4 w-4" /> },
  "grafico-ventas-semana":  { label: "Ventas de la Semana",    icon: <BarChart2 className="h-4 w-4" /> },
  "top-productos":          { label: "Top 5 Productos",        icon: <Package className="h-4 w-4" /> },
  "clientes-nuevos":        { label: "Clientes Nuevos",        icon: <UserPlus className="h-4 w-4" /> },
  "margen-diario":          { label: "Margen Diario",          icon: <DollarSign className="h-4 w-4" /> },
};

// ── Contenido de widgets ──────────────────────────────────────────────────────

function WidgetContent({ id }: { id: WidgetId }) {
  switch (id) {
    case "ventas-hoy":
      return (
        <div className="space-y-1">
          <p className="text-3xl font-bold text-green-600 dark:text-green-400">S/ 0.00</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Cargando datos…</p>
        </div>
      );
    case "pedidos-pendientes":
      return (
        <div className="space-y-1">
          <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">0</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">pedidos esperando</p>
        </div>
      );
    case "stock-bajo":
      return (
        <div className="space-y-1">
          <p className="text-3xl font-bold text-red-600 dark:text-red-400">0</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">productos con stock critico</p>
        </div>
      );
    case "fiados-pendientes":
      return (
        <div className="space-y-1">
          <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">S/ 0.00</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">por cobrar</p>
        </div>
      );
    case "grafico-ventas-semana":
      // Static mock heights (pure values — no impure calls during render)
      return (
        <div className="flex items-end gap-1 h-16">
          {[
            { day: "L", h: 22 },
            { day: "M", h: 35 },
            { day: "X", h: 18 },
            { day: "J", h: 42 },
            { day: "V", h: 30 },
            { day: "S", h: 48 },
            { day: "D", h: 25 },
          ].map(({ day, h }) => (
            <div key={day} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-green-200 dark:bg-green-800"
                style={{ height: `${h}px` }}
              />
              <span className="text-[10px] text-gray-400">{day}</span>
            </div>
          ))}
        </div>
      );
    case "top-productos":
      return (
        <ul className="space-y-1 text-sm">
          {["Arroz extra", "Aceite 1L", "Azucar 1kg", "Sal gruesa", "Fideos"].map((p, i) => (
            <li key={p} className="flex justify-between text-gray-700 dark:text-gray-300">
              <span>{i + 1}. {p}</span>
              <span className="text-gray-400">—</span>
            </li>
          ))}
        </ul>
      );
    case "clientes-nuevos":
      return (
        <div className="space-y-1">
          <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">0</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">esta semana</p>
        </div>
      );
    case "margen-diario":
      return (
        <div className="space-y-1">
          <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">0%</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">margen promedio hoy</p>
        </div>
      );
    default:
      return null;
  }
}

// ── Componente principal ──────────────────────────────────────────────────────

interface CustomizableDashboardProps {
  tenantId?: string;
}

export function CustomizableDashboard({ tenantId = "main" }: CustomizableDashboardProps) {
  const storageKey = `dashboard-layout-${tenantId}`;

  const [widgets, setWidgets] = useState<Widget[]>(() => {
    return DEFAULT_ORDER.map((id) => ({
      id,
      ...WIDGET_META[id],
      visible: true,
    }));
  });

  const [editMode, setEditMode] = useState(false);

  // Cargar desde localStorage al montar
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return;
      const layout = JSON.parse(stored) as DashboardLayout;

      setWidgets(
        layout.order.map((id) => ({
          id,
          ...WIDGET_META[id],
          visible: !layout.hidden.includes(id),
        }))
      );
    } catch {
      // ignorar error de parseo
    }
  }, [storageKey]);

  // Guardar en localStorage cuando cambia
  const saveLayout = useCallback(
    (updated: Widget[]) => {
      const layout: DashboardLayout = {
        order: updated.map((w) => w.id),
        hidden: updated.filter((w) => !w.visible).map((w) => w.id),
      };
      localStorage.setItem(storageKey, JSON.stringify(layout));
    },
    [storageKey]
  );

  const toggleVisibility = (id: WidgetId) => {
    setWidgets((prev) => {
      const updated = prev.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w));
      saveLayout(updated);
      return updated;
    });
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    setWidgets((prev) => {
      const updated = [...prev];
      [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
      saveLayout(updated);
      return updated;
    });
  };

  const moveDown = (index: number) => {
    setWidgets((prev) => {
      if (index === prev.length - 1) return prev;
      const updated = [...prev];
      [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
      saveLayout(updated);
      return updated;
    });
  };

  const restoreDefault = () => {
    const fresh = DEFAULT_ORDER.map((id) => ({
      id,
      ...WIDGET_META[id],
      visible: true,
    }));
    setWidgets(fresh);
    localStorage.removeItem(storageKey);
  };

  const visibleWidgets = widgets.filter((w) => w.visible);

  return (
    <div className="space-y-4">
      {/* Barra de herramientas */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Resumen del dia
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={restoreDefault}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Restaurar default
          </button>
          <button
            onClick={() => setEditMode((v) => !v)}
            className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-colors ${
              editMode
                ? "bg-green-600 text-white hover:bg-green-700"
                : "border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            {editMode ? "Listo" : "Personalizar"}
          </button>
        </div>
      </div>

      {/* Lista de todos los widgets en modo edicion */}
      {editMode && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 space-y-2">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Usa las flechas para reordenar. Usa el ojo para mostrar u ocultar.
          </p>
          {widgets.map((widget, index) => (
            <div
              key={widget.id}
              className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors"
                  aria-label="Subir"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  onClick={() => moveDown(index)}
                  disabled={index === widgets.length - 1}
                  className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors"
                  aria-label="Bajar"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
              <span className="text-gray-400 dark:text-gray-500">{widget.icon}</span>
              <span className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                {widget.label}
              </span>
              <button
                onClick={() => toggleVisibility(widget.id)}
                className={`p-1.5 rounded-lg transition-colors ${
                  widget.visible
                    ? "text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                    : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
                aria-label={widget.visible ? "Ocultar" : "Mostrar"}
              >
                {widget.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Grid de widgets visibles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {visibleWidgets.slice(0, 4).map((widget) => (
          <div
            key={widget.id}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 shadow-sm"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="text-gray-500 dark:text-gray-400">{widget.icon}</span>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {widget.label}
              </span>
            </div>
            <WidgetContent id={widget.id} />
          </div>
        ))}
      </div>

      {/* Segunda fila de widgets */}
      {visibleWidgets.length > 4 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {visibleWidgets.slice(4).map((widget) => (
            <div
              key={widget.id}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 shadow-sm"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-gray-500 dark:text-gray-400">{widget.icon}</span>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {widget.label}
                </span>
              </div>
              <WidgetContent id={widget.id} />
            </div>
          ))}
        </div>
      )}

      {visibleWidgets.length === 0 && (
        <div className="text-center py-12 text-gray-400 dark:text-gray-600">
          <EyeOff className="h-8 w-8 mx-auto mb-2" />
          <p className="text-sm">Todos los widgets estan ocultos.</p>
          <button
            onClick={() => setEditMode(true)}
            className="mt-2 text-green-600 text-sm underline"
          >
            Personalizar para mostrarlos
          </button>
        </div>
      )}
    </div>
  );
}

export default CustomizableDashboard;
