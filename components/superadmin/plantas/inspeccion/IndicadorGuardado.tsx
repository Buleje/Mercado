"use client";

import { CheckCircle2, Loader2, Lock, WifiOff, AlertTriangle } from "@buleje/design-system/icons";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EstadoGuardado } from "./inspeccion-datos";

const TONO = {
  ok: "border-[var(--data-success-500)] text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]",
  neutro: "border-[var(--rule-strong)] text-[var(--text-secondary)]",
  mal: "border-[var(--data-error-500)] text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]",
} as const;

/**
 * Lo que el inspector necesita saber de un vistazo en la planta: si lo que
 * anotó ya está a salvo. Vive arriba, junto a las pestañas; si falla y bajaste, flota abajo.
 */
export function IndicadorGuardado({
  estado,
  guardadoEn,
  onReintentar,
}: {
  estado: EstadoGuardado;
  guardadoEn: string | null;
  onReintentar: () => void;
}) {
  const reintentar = (
    <button type="button" onClick={onReintentar} className="ml-1 min-h-8 px-1 font-bold underline underline-offset-2">
      Reintentar
    </button>
  );
  const vista = {
    guardado: { tono: TONO.ok, icono: CheckCircle2, texto: guardadoEn ? `Guardado ${formatTime(guardadoEn)}` : "Guardado", extra: null },
    pendiente: { tono: TONO.neutro, icono: Loader2, texto: "Por guardar…", extra: null },
    guardando: { tono: TONO.neutro, icono: Loader2, texto: "Guardando…", extra: null },
    "sin-conexion": { tono: TONO.mal, icono: WifiOff, texto: "Sin conexión, no se guardó", extra: reintentar },
    error: { tono: TONO.mal, icono: AlertTriangle, texto: "No se guardó", extra: reintentar },
    bloqueada: { tono: TONO.neutro, icono: Lock, texto: "Ya no se puede editar", extra: null },
  }[estado];
  const Icono = vista.icono;

  return (
    <span
      role="status"
      aria-live="polite"
      data-guardado={estado}
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-full border-2 bg-[var(--surface-raised)] px-2.5 text-sm font-semibold sm:min-h-10 sm:px-3",
        vista.tono,
      )}
    >
      <Icono className={cn("h-4 w-4 shrink-0", estado === "guardando" && "animate-spin")} aria-hidden />
      {vista.texto}
      {vista.extra}
    </span>
  );
}
