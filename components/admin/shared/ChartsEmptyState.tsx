"use client";

/**
 * ChartsEmptyState — empty-state UNIFICADO para páginas con gráficos de datos.
 *
 * Mismo lenguaje visual que el empty-state de Inicio (EmptyDateRangeState):
 * borde punteado, aura sutil, mascota Paiche (o icono del módulo), headline +
 * descripción y acción opcional. La diferencia: NO depende de un DateRange, así
 * sirve para cualquier módulo de analítica (Analytics, Finanzas, Compras, etc.).
 *
 * Regla de negocio (Brandon 2026-06-21): los gráficos sin datos NO se muestran.
 * Cuando una página entera no tiene información, en vez de un muro de gráficos
 * en cero se muestra ESTE estado, igual que en Inicio. Reutilizable en TODA
 * página con gráficos de datos para mantener consistencia.
 */

import { SectionTitle } from "@buleje/design-system";
import { ArrowRight, type LucideIcon } from "@buleje/design-system/icons";
import { PaicheMascot } from "@/components/ui-system/illustrations/PaicheMascot";

export interface ChartsEmptyStateProps {
  /** Título principal. Default: contextual genérico. */
  title?: string;
  /** Descripción de apoyo (plain-language, estilo Feynman). */
  description?: string;
  /** Icono del módulo (reemplaza la mascota Paiche si se pasa). */
  icon?: LucideIcon;
  /** Acción opcional (ej: "Registrar primera venta"). */
  action?: { label: string; href?: string; onClick?: () => void };
  /** Clase extra del contenedor. */
  className?: string;
}

export default function ChartsEmptyState({
  title = "Todavía no hay datos para mostrar",
  description = "Cuando empieces a registrar ventas y movimientos, acá vas a ver tus gráficos y métricas automáticamente. Mientras tanto, no te mostramos gráficos vacíos.",
  icon: Icon,
  action,
  className,
}: ChartsEmptyStateProps) {
  return (
    <div
      className={[
        "relative overflow-hidden border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 py-12 sm:py-16",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Aura sutil (idéntica a EmptyDateRangeState) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, color-mix(in oklab, var(--accent) 6%, transparent) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-md text-center">
        {/* Ilustración */}
        <div className="mx-auto mb-6 flex items-center justify-center">
          {Icon ? (
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--accent-soft,color-mix(in_oklab,var(--accent)_8%,transparent))] text-[var(--accent)]">
              <Icon className="h-10 w-10" strokeWidth={1.75} />
            </div>
          ) : (
            <div className="text-[var(--accent)] opacity-90">
              <PaicheMascot size={140} strokeWidth={1.5} />
            </div>
          )}
        </div>

        {/* Headline (SectionTitle del DS para cumplir ADR-075) */}
        <SectionTitle className="text-[length:clamp(1.25rem,2.5vw,1.625rem)] font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
          {title}
        </SectionTitle>

        {/* Descripción */}
        <p className="mt-3 text-[length:var(--ts-base)] font-medium text-[var(--text-secondary)] leading-relaxed">
          {description}
        </p>

        {/* Acción opcional */}
        {action && (
          <div className="mt-6">
            {action.href ? (
              <a
                href={action.href}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-5 py-2.5 text-[length:var(--ts-sm)] font-extrabold text-white shadow-md hover:gap-2 transition-all"
              >
                {action.label}
                <ArrowRight className="h-4 w-4" />
              </a>
            ) : (
              <button
                type="button"
                onClick={action.onClick}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-5 py-2.5 text-[length:var(--ts-sm)] font-extrabold text-white shadow-md hover:gap-2 transition-all"
              >
                {action.label}
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
