"use client";

/**
 * «N guías figuran recibidas después de corridas de su permiso» (ADR-434).
 *
 * Es la huella de «Recibir en bloque» con la fecha de hoy: en Blas, las 8 guías
 * de 10-HUA quedaron recibidas el 11/09 y el 23/09 con corridas de su permiso
 * y especie desde el 07/09. El operador no tiene cómo saber cuáles mirar; esto
 * se las cuenta y abre la corrección con esas arriba.
 *
 * No afirma que estén mal —esas corridas pueden venir de otra guía—: avisa.
 */

import { useMemo } from "react";
import { CalendarClock } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { llegadaSospechosa } from "@/lib/forestal/fecha-de-llegada";
import { useContextoDeLlegada } from "@/hooks/use-contexto-de-llegada";

export default function CtpAvisoLlegadaTardia({
  gtfs,
  onCorregir,
}: {
  /** Las guías YA recibidas en pantalla. */
  gtfs: readonly string[];
  onCorregir: () => void;
}) {
  const { contextoDe } = useContextoDeLlegada(gtfs, gtfs.length > 0);
  const sospechosas = useMemo(
    () => gtfs.filter((g) => {
      const ctx = contextoDe(g);
      return ctx != null && llegadaSospechosa(ctx);
    }),
    [gtfs, contextoDe],
  );
  if (sospechosas.length === 0) return null;
  const n = sospechosas.length;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 p-3">
      <CalendarClock className="h-5 w-5 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden />
      <p className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm text-[var(--text-secondary)]">
        <b className="text-[var(--text-primary)]">
          {n} guía{n === 1 ? "" : "s"} recibida{n === 1 ? "" : "s"} después de corridas de su permiso
        </b>
        <InfoTip
          icono="ayuda"
          title="Recepción posterior a la sierra"
          what={`La sierra ya cortaba esa especie del mismo permiso antes de la fecha de recepción: ${sospechosas.join(", ")}.`}
          affects="Si la madera llegó antes, corrige la fecha: con la de hoy, esas corridas no pueden descontar su madera (T3)."
          example="Recibida en bloque el 23/09, con corridas de Cachimbo desde el 07/09."
        />
      </p>
      <button
        type="button"
        onClick={onCorregir}
        className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border-2 border-[var(--data-warning-500)]/60 bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
      >
        <CalendarClock className="h-4 w-4" aria-hidden /> Corregir la recepción
      </button>
    </div>
  );
}
