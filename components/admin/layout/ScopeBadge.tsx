"use client";

/**
 * ScopeBadge — chip pequeño que muestra a qué scope de datos pertenece un
 * módulo del admin: Tu tienda · Marketplace · Ambos · Sistema.
 *
 * Brandon mayo 2026 v7: el dueño del negocio necesita saber si lo que está
 * mirando son datos de su tienda individual, de su puesto en el marketplace
 * cross-vendor, o de la red Buleje. Aparece al lado del nombre del módulo
 * en el sidebar (sub-tabs y flyout) y como chip más grande en el header del
 * módulo activo.
 */

import { MODULE_SCOPE_BY_ID, MODULE_SCOPE_META, type ModuleScope } from "@/lib/admin-template";
import { cn } from "@/lib/utils";

interface Props {
  /** Tab id (string). Si no encuentra, no renderiza nada. */
  tabId: string;
  /** Variante visual. Por default "dot" (compacto). */
  variant?: "dot" | "chip" | "full";
  /** Ocultar para scope=sistema (poco informativo). Default true. */
  hideForSystem?: boolean;
  className?: string;
}

export function ScopeBadge({ tabId, variant = "dot", hideForSystem = true, className }: Props) {
  const scope: ModuleScope | undefined = MODULE_SCOPE_BY_ID[tabId];
  if (!scope) return null;
  if (hideForSystem && scope === "sistema") return null;
  const meta = MODULE_SCOPE_META[scope];

  if (variant === "dot") {
    // Solo un punto de color + tooltip. Mínimo footprint visual.
    return (
      <span
        className={cn("inline-block h-1.5 w-1.5 rounded-full shrink-0", meta.dotClass, className)}
        title={`Datos: ${meta.label}`}
        aria-label={`Datos: ${meta.label}`}
      />
    );
  }
  if (variant === "chip") {
    // Chip mini con texto corto. Para sub-tabs del sidebar.
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider leading-none shrink-0",
          meta.bgClass,
          meta.textClass,
          className,
        )}
        title={`Datos: ${meta.label}`}
      >
        {meta.shortLabel}
      </span>
    );
  }
  // full — chip grande con label completo, para headers de módulo
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 h-7 text-xs font-extrabold leading-none shrink-0",
        meta.bgClass,
        meta.textClass,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dotClass)} aria-hidden />
      Datos de {meta.label.toLowerCase()}
    </span>
  );
}
