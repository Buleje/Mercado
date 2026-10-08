"use client";

/**
 * «Guardar las fotos de personas N días» (Ajustes de Cámaras, 2026-10-08).
 * Pasado ese plazo las fotos que el detector del mosaico dejó en el Drive van
 * a la papelera (cron diario); lo tipeado vive acá hasta «Guardar».
 */

import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Check, Users } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { BLOQUE, BTN } from "./camaras-ui";
import { useRetencionPersonas } from "./use-retencion-personas";

export default function RetencionPersonas() {
  const { retencion, guardando, error, guardar } = useRetencionPersonas();
  const [texto, setTexto] = useState<string | null>(null);
  if (!retencion) return null;

  const valor = texto ?? String(retencion.dias);
  const dias = /^\d+$/.test(valor.trim()) ? Number(valor.trim()) : NaN;
  const valido = Number.isInteger(dias) && dias >= retencion.min && dias <= retencion.max;
  const cambio = valido && dias !== retencion.dias;

  return (
    <section className={BLOQUE} aria-labelledby="camaras-retencion-titulo" data-testid="camaras-retencion">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto flex items-center gap-1.5">
          <Users className="h-4 w-4 text-[var(--accent-ink)]" aria-hidden />
          <CardTitle as="h3" id="camaras-retencion-titulo" className="text-base font-bold">
            Fotos de personas: cuánto se guardan
          </CardTitle>
          <InfoTip
            title="Cuánto se guardan las fotos de personas"
            what="Con gente todo el día el detector deja cientos de fotos por día en el Drive. Pasados estos días van a la papelera del Drive, donde se pueden restaurar hasta que se vacíe sola."
            affects="Cuenta días enteros de Lima: las del último día que cumple el plazo se conservan. Las carpetas de cada día quedan, aunque vacías. No baja a las PC de Windows."
            example="Con 30: el 8 de octubre se conservan las fotos desde el 8 de septiembre; las del 7 de septiembre van a la papelera."
          />
        </span>
        <label className="flex items-center gap-2 text-sm font-bold text-[var(--text-secondary)]">
          <span>Guardar</span>
          <input
            value={valor}
            onChange={(e) => setTexto(e.target.value)}
            inputMode="numeric"
            disabled={!retencion.puedeEditar}
            aria-label="Días que se guardan las fotos de personas"
            aria-invalid={!valido}
            className="h-9 w-20 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-center text-sm tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-60"
          />
          <span>días</span>
        </label>
        {retencion.puedeEditar && (
          <button
            type="button"
            disabled={guardando || !cambio}
            onClick={async () => {
              if (await guardar(dias)) setTexto(null);
            }}
            className={cn(BTN, "border-[var(--accent)] text-[var(--accent-ink)] disabled:opacity-40")}
          >
            <Check className="h-4 w-4" aria-hidden /> Guardar
          </button>
        )}
      </div>
      {!valido && (
        <p className="mt-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" role="alert">
          Pon un número entero entre {retencion.min} y {retencion.max}.
        </p>
      )}
      {error && (
        <p className="mt-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" role="alert">
          {error}
        </p>
      )}
      {!retencion.puedeEditar && (
        <p className="mt-2 text-sm text-[var(--text-tertiary)]">Sólo el administrador o el dueño lo cambia.</p>
      )}
    </section>
  );
}
