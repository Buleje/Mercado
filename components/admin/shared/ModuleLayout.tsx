"use client";

import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════════
 * ModuleLayout — Estructura estandarizada para TODOS los módulos admin.
 *
 * Fuerza el orden de secciones:
 *   1. Header (icono + título + acciones)
 *   2. Tabs (pills opcionales)
 *   3. Toolbar (filtros + búsqueda + acciones)
 *   4. KPIs (grid de métricas)
 *   5. Charts (gráficos)
 *   6. Content (tabla/lista/custom)
 *
 * Loading: skeleton automático en KPIs y content.
 * ═══════════════════════════════════════════════════════════════════════════ */

interface ModuleLayoutProps {
  /** Icono del módulo (componente React) */
  icon: React.ComponentType<{ className?: string }>;
  /** Clase de color del icono, ej. "text-emerald-600 dark:text-emerald-400" */
  iconColor?: string;
  /** Clase de fondo del icono, ej. "bg-emerald-50 dark:bg-emerald-900/20" */
  iconBg?: string;
  /** Título del módulo */
  title: string;
  /** Subtítulo descriptivo */
  subtitle?: string;
  /** Botones/acciones a la derecha del header */
  headerActions?: React.ReactNode;

  /** Tabs tipo pills */
  tabs?: { id: string; label: string; count?: number }[];
  /** Tab activa */
  activeTab?: string;
  /** Callback al cambiar de tab */
  onTabChange?: (id: string) => void;

  /** Barra de herramientas (filtros + búsqueda + acciones) */
  toolbar?: React.ReactNode;

  /** Grid de KPIs */
  kpis?: React.ReactNode;

  /** Grid de gráficos */
  charts?: React.ReactNode;

  /** Contenido principal */
  children: React.ReactNode;

  /** Muestra skeletons en KPIs y content */
  loading?: boolean;
}

/* ---------- Skeleton interno ---------- */

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-zinc-800"
        />
      ))}
    </div>
  );
}

function ContentSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-12 rounded-lg bg-gray-100 dark:bg-zinc-800"
        />
      ))}
    </div>
  );
}

/* ---------- Componente principal ---------- */

export default function ModuleLayout({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  subtitle,
  headerActions,
  tabs,
  activeTab,
  onTabChange,
  toolbar,
  kpis,
  charts,
  children,
  loading = false,
}: ModuleLayoutProps) {
  return (
    <div className="space-y-6">
      {/* 1. HEADER */}
      <div className="flex items-center gap-4">
        <div
          className={cn(
            "flex items-center justify-center w-11 h-11 rounded-xl shrink-0",
            iconBg,
          )}
        >
          <Icon className={cn("w-5 h-5", iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
        {headerActions && (
          <div className="flex items-center gap-2 shrink-0">
            {headerActions}
          </div>
        )}
      </div>

      {/* 2. TABS */}
      {tabs && tabs.length > 0 && (
        <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-zinc-800 rounded-xl w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange?.(tab.id)}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-lg transition-all",
                activeTab === tab.id
                  ? "bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-zinc-400 hover:text-gray-700",
              )}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] inline-flex items-center justify-center px-1">
                  {tab.count > 99 ? "99+" : tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* 3. TOOLBAR */}
      {toolbar}

      {/* 4. KPIs */}
      {loading ? (
        <KpiSkeleton />
      ) : (
        kpis && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{kpis}</div>
        )
      )}

      {/* 5. CHARTS */}
      {charts && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{charts}</div>
      )}

      {/* 6. CONTENT */}
      {loading ? <ContentSkeleton /> : children}
    </div>
  );
}
