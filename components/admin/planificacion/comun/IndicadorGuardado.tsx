"use client";

/**
 * IndicadorGuardado — en qué quedó una sección del plan (ADR-497): guardado
 * (y quién, cuándo), guardando, con cambios, sin guardar o en conflicto con
 * lo que otra persona guardó primero. Va en la fila del título de la sección.
 */
import { AlertTriangle, Check, Loader2, Pencil, WifiOff } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import type { SeccionPlanHook } from "@/hooks/use-plan-empresa";
import type { SeccionPlan } from "@/lib/planificacion/secciones";
import { cn, timeAgo } from "@/lib/utils";

type Props = Pick<
  SeccionPlanHook<SeccionPlan>,
  "estado" | "error" | "actualizado" | "autor" | "guardarAhora" | "tomarLoSuyo" | "guardarLoMio" | "suyo"
> & { className?: string };

export function IndicadorGuardado({ estado, error, actualizado, autor, guardarAhora, tomarLoSuyo, guardarLoMio, suyo, className }: Props) {
  if (estado === "conflicto") {
    return (
      <div role="alert" className={cn("flex flex-wrap items-center gap-2 text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]", className)}>
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        <span>{suyo?.autor ? `${suyo.autor} cambió esta sección mientras escribías.` : "Otra persona cambió esta sección mientras escribías."}</span>
        <button type="button" className={button({ variant: "secondary", size: "xs" })} onClick={tomarLoSuyo}>
          Ver lo suyo
        </button>
        <button type="button" className={button({ variant: "primary", size: "xs" })} onClick={guardarLoMio}>
          Guardar lo mío
        </button>
      </div>
    );
  }
  if (estado === "error") {
    return (
      <div role="alert" className={cn("flex items-center gap-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]", className)}>
        <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
        <span>{error ?? "No se guardó."}</span>
        <button type="button" className={button({ variant: "secondary", size: "xs" })} onClick={() => void guardarAhora()}>
          Reintentar
        </button>
      </div>
    );
  }
  const [Icono, texto] =
    estado === "guardando"
      ? [Loader2, "Guardando…"]
      : estado === "cambios"
        ? [Pencil, "Cambios sin guardar"]
        : actualizado
          ? [Check, `Guardado ${timeAgo(actualizado)}${autor ? ` · ${autor}` : ""}`]
          : [Pencil, "Sin escribir todavía"];
  return (
    <span role="status" aria-live="polite" className={cn("inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)]", className)}>
      <Icono className={cn("h-4 w-4 shrink-0", estado === "guardando" && "animate-spin")} aria-hidden />
      {texto}
    </span>
  );
}
