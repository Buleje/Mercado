"use client";

import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
/**
 * ForecastingDashboard.tsx
 *
 * Dashboard de predicción de ventas para el panel admin.
 * Se integra como tab/sección dentro del admin panel existente.
 *
 * Paneles:
 *   A — Resumen de ventas proyectadas (7 días)  →  GET /api/inventory/forecast?productId=...
 *       Nota: se usa sin productId para el forecast global (primer producto activo como proxy)
 *             o directamente el endpoint de demand summary
 *   B — Productos para reordenar               →  GET /api/forecasting/reorder-suggestions
 *   C — Sugerencias de precios                 →  GET /api/forecasting/price-suggestions
 *   D — Top 5 productos por demanda proyectada →  derivado de reorder-suggestions
 *
 * Reglas respetadas:
 *   - "use client" solo en este archivo (sin propagar hacia arriba)
 *   - safeParse de Zod para validar respuestas de la API
 *   - No librerías de gráficos externas — barras con divs
 *   - Dark mode: todas las clases incluyen variantes dark:
 *   - Touch targets mínimo 44x44px
 *   - Estados loading / error / empty en cada panel
 *   - Colores: tokens del DS (sin hex)
 *   - Refresco manual con botón "Actualizar"
 *
 * Partido en piezas (plan «panel unificado», ola 3) SIN cambiar lo que hace:
 *   forecast-datos.ts      schemas, tipos y la proyección día a día
 *   use-forecasting.ts     la carga (los 3 paneles en paralelo) y sus acciones
 *   ForecastProyeccion     paneles A y D
 *   ForecastReorden        panel B (+ Auto-reorden) — también en Compras › Sugerencias
 *   ForecastPrecios        panel C
 *   ForecastPiezas         PanelCard, TrendBadge, MetricChip, PriceCard
 * Esta cáscara los compone con una sola carga y un solo «Actualizar».
 */

import { TrendingUp, RefreshCw } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useForecasting } from "./use-forecasting";
import { ForecastProyeccionPanel } from "./ForecastProyeccion";
import { ForecastReordenPanel } from "./ForecastReorden";
import { ForecastPreciosPanel } from "./ForecastPrecios";

export default function ForecastingDashboard() {
  const f = useForecasting();
  const { state, cargarDatos } = f;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <AdminModuleHeader
        eyebrow="Inteligencia · Inventario"
        title="Predicción de Ventas"
        description="Proyecciones basadas en media móvil ponderada (últimos 30 días). Reorden automático y sugerencias de precio listos para aplicar."
        icon={TrendingUp}
      >
        <button
          onClick={cargarDatos}
          disabled={state.loading}
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors",
            "bg-primary text-white hover:bg-primary/90",
            "disabled:opacity-60 disabled:cursor-not-allowed min-h-[44px]",
          )}
          aria-label="Actualizar datos de predicción"
        >
          <RefreshCw className={cn("w-4 h-4", state.loading && "animate-spin")} />
          {state.loading ? "Cargando..." : "Actualizar"}
        </button>
      </AdminModuleHeader>

      {/* ── Grid principal (2 columnas en desktop) ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        <ForecastProyeccionPanel f={f} />
        <ForecastReordenPanel f={f} />
        <ForecastPreciosPanel f={f} />
      </div>
    </div>
  );
}
