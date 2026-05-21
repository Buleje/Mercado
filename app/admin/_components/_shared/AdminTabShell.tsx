"use client";

/**
 * AdminTabShell — wrapper canónico para cada página del admin/superadmin.
 *
 * Rediseño 2026-04-26: header hero premium consistente con /superadmin/marca y
 * /superadmin/banners. Toda página debe envolverse con este shell para evitar
 * divergencia visual entre módulos.
 *
 * Estructura del header:
 *   [icon badge teal] KICKER ACCENT
 *                     Título grande font-display extrabold
 *                     Descripción opcional
 *                     [chip Beta/Universal opcional]
 *                                                  [actions / stats →]
 *
 * El parámetro legacy `chip` sigue funcionando. Nuevo `kicker` para texto
 * uppercase encima del título (ej. "CENTRO DE CONTROL", "PLATAFORMA").
 * Nuevo `stats` para slot derecho con pills de KPI.
 */

import type { ComponentType, ReactNode } from "react";
import { ADMIN_TOKENS } from "./admin-tokens";

type LucideIcon = ComponentType<{
  className?: string;
  strokeWidth?: number;
  "aria-hidden"?: boolean;
}>;

interface ChipProps {
  label: string;
  icon?: LucideIcon;
  tone?: "accent" | "muted";
}

interface AdminTabShellProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Texto uppercase encima del título — ej. "CENTRO DE CONTROL". */
  kicker?: string;
  chip?: ChipProps;
  /** Botones u otros elementos a la derecha del header. */
  actions?: ReactNode;
  /** Slot derecho con stat pills (ej. KPIs del módulo). Si presente, reemplaza actions. */
  stats?: ReactNode;
  children: ReactNode;
}

export default function AdminTabShell({
  title,
  description,
  icon: Icon,
  kicker,
  chip,
  actions,
  stats,
  children,
}: AdminTabShellProps) {
  const ChipIcon = chip?.icon;
  return (
    <div className={ADMIN_TOKENS.sectionGap}>
      {/* ── Header hero premium ───────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          {Icon && (
            <span className={ADMIN_TOKENS.iconBadge}>
              <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            {kicker && (
              <p className={`${ADMIN_TOKENS.kicker} mb-1`}>{kicker}</p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className={ADMIN_TOKENS.headingHero}>{title}</h1>
              {chip && (
                <span
                  className={
                    chip.tone === "muted"
                      ? ADMIN_TOKENS.chipMuted
                      : ADMIN_TOKENS.chipAccent
                  }
                >
                  {ChipIcon && <ChipIcon className="h-3 w-3" aria-hidden />}
                  {chip.label}
                </span>
              )}
            </div>
            {description && (
              <p className={`${ADMIN_TOKENS.bodyTextLg} mt-1.5 max-w-3xl`}>
                {description}
              </p>
            )}
          </div>
        </div>
        {(stats || actions) && (
          // Brandon 2026-05-21 FIX bug "pedazo blanco al swipe mobile":
          // antes `shrink-0 flex-wrap` no comprimia y empujaba contenido
          // fuera del viewport. En mobile 390px, los chips de fecha (657px
          // combined) overflowearan silenciosamente — el body.scrollWidth
          // se mantenia 390 pero los hijos quedaban renderizados por
          // afuera. Al swipe-left aparecia el "pedazo blanco" reveal.
          //
          // Fix: en mobile (<sm) el wrapper es full-width abajo del
          // titulo (stack), permitiendo a sus hijos hacer su propio
          // overflow-x-auto o wrap. shrink-0 solo desde sm+ donde hay
          // espacio horizontal.
          <div className="flex items-stretch gap-2 flex-wrap w-full sm:w-auto sm:shrink-0 max-w-full overflow-x-auto">
            {stats}
            {actions}
          </div>
        )}
      </header>
      {children}
    </div>
  );
}
