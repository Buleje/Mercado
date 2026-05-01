"use client";

/**
 * DashboardSectionHeader — header editorial reutilizable para las
 * subsecciones del admin Inicio (Ventas, Caja, Inventario, Productos,
 * Clientes, Marketplace).
 *
 * Qué hace (Feynman): cada subsección del dashboard ahora tiene la misma
 * "portada" — eyebrow pequeño + título gigante en Fraunces italic +
 * descripción breve + botón de acción a la derecha. Esto crea ritmo
 * visual entre secciones ("es la misma revista, distinta página").
 *
 * Uso:
 *   <DashboardSectionHeader
 *     eyebrow="Dashboard · Ventas y utilidad"
 *     title="Tu negocio en números"
 *     subtitle="Ingresos, margen y tickets del periodo seleccionado."
 *     action={<button>…</button>}
 *   />
 */

import type { ReactNode } from "react";
import { PageTitle, Kicker } from "@buleje/design-system";
import { cn } from "@/lib/utils";

interface Props {
  /** Pequeña línea arriba, uppercase, tracking amplio. */
  eyebrow?: string;
  /** Titular del módulo — usa PageTitle del DS (font-display, sin italic). */
  title: string;
  /** Acento opcional dentro del título (span con color primary). */
  titleAccent?: string;
  /** Descripción debajo del título. */
  subtitle?: string;
  /** Botón / control del lado derecho (refresh, export, date range). */
  action?: ReactNode;
  /** Color del acento del título. Default: accent token. */
  accentClassName?: string;
  /** Clase extra en el contenedor. */
  className?: string;
}

export function DashboardSectionHeader({
  eyebrow,
  title,
  titleAccent,
  subtitle,
  action,
  accentClassName = "text-[var(--accent)]",
  className,
}: Props) {
  return (
    <header
      className={cn(
        "flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 pb-4 border-b border-[var(--rule-soft)]",
        className,
      )}
    >
      <div>
        {eyebrow && <Kicker className="mb-1.5">{eyebrow}</Kicker>}
        <PageTitle className="font-display tracking-[var(--ls-tight)] leading-[1.05]">
          {titleAccent ? (
            <>
              {title}{" "}
              <span className={cn(accentClassName)}>{titleAccent}</span>
            </>
          ) : (
            title
          )}
        </PageTitle>
        {subtitle && (
          <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-2xl leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0 self-start sm:self-end">{action}</div>}
    </header>
  );
}

export default DashboardSectionHeader;
