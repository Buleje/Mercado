"use client";

/** Las dos tarjetas de Análisis › Métricas: una con un gráfico, otra con dos a elegir. */

import React, { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import type { BarChart3 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── AnalyticsCard — wrapper profesional para cada grafico ────────────────────
export function AnalyticsCard({ title, subtitle, icon: Icon, children, className }: {
  title: string;
  subtitle?: string;
  icon?: typeof BarChart3;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(
      "@container bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] p-4 sm:p-5 transition-shadow hover:shadow-sm",
      className,
    )}>
      {/* Encabezado en UNA línea. Antes era un bloque de ~62px: un icono
          dentro de una caja de 36px, el título debajo y el subtítulo debajo
          de ese. Multiplicado por las tarjetas de una sección, el módulo
          gastaba más alto en presentarse que en mostrar datos.
          El subtítulo pasa a la misma línea tras un punto medio, y se va
          cuando la tarjeta es angosta: ahí el título ya alcanza. */}
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && (
            <Icon className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2} aria-hidden />
          )}
          <CardTitle className="text-[length:var(--ts-xl)] font-bold leading-tight text-[var(--text-primary)]">
            {title}
          </CardTitle>
        </div>
        {subtitle && (
          <p className="hidden min-w-0 truncate text-[length:var(--ts-sm)] text-[var(--text-secondary)] @min-[30rem]:block">
            <span aria-hidden className="mr-2 text-[var(--text-tertiary)]">·</span>
            {subtitle}
          </p>
        )}
      </div>
      <div className="w-full">{children}</div>
    </div>
  );
}


// ── TabbedCard — card con tabs internas para unificar componentes ─────────────
export function TabbedCard({ title, subtitle, icon, tabs, className }: {
  title: string;
  subtitle?: string;
  icon?: typeof BarChart3;
  tabs: { id: string; label: string; content: React.ReactNode }[];
  className?: string;
}) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? "");
  return (
    <div className={cn(
      "bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] p-6 transition-shadow hover:shadow-sm",
      className,
    )}>
      <div className="mb-4">
        <div className="flex items-center gap-2.5 mb-3">
          {icon && (
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              {React.createElement(icon, { className: "h-4.5 w-4.5 text-primary" })}
            </div>
          )}
          <div className="flex-1">
            <CardTitle className="text-[length:var(--ts-xl)] font-bold text-[var(--text-primary)] leading-tight">{title}</CardTitle>
            {subtitle && <p className="text-sm text-[var(--text-secondary)] mt-0.5">{subtitle}</p>}
          </div>
        </div>
        <div className="flex gap-1 border-b border-[var(--rule-base)]">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                "min-h-11 px-3 text-sm font-semibold rounded-t-lg transition-colors",
                activeTab === t.id
                  ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] border-b-2 border-primary"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="w-full">
        {tabs.find(t => t.id === activeTab)?.content}
      </div>
    </div>
  );
}

