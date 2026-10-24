"use client";

/**
 * El campo «Observación» de lo que se le pega a cada pieza, con su candado
 * (Brandon, 2026-09-23). La regla vive en `lib/forestal/observacion-de-pieza.ts`:
 * suelta va a la próxima pieza y se borra; con candado, a todas las que siguen.
 *
 * La línea de abajo dice cuál de las dos va a pasar, sólo cuando hay texto: la
 * diferencia entre «una pieza» y «todas» es justo lo que no se adivina mirando
 * un candado.
 */
import { useId } from "react";
import { Lock, Unlock } from "@buleje/design-system/icons";
import { OBSERVACION_MAX } from "@/lib/forestal/observacion-de-pieza";

export interface CampoObservacionProps {
  texto: string;
  fija: boolean;
  onTexto: (v: string) => void;
  onFijar: () => void;
}

export default function CampoObservacion({ texto, fija, onTexto, onFijar }: CampoObservacionProps) {
  const ayudaId = useId();
  const hay = texto.trim().length > 0;
  return (
    <div className="mt-2 flex flex-col gap-1">
      <label className="flex flex-col gap-1">
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Observación</span>
        <span className="flex items-center gap-1">
          <input
            type="text"
            value={texto}
            onChange={(e) => onTexto(e.target.value)}
            maxLength={OBSERVACION_MAX}
            autoComplete="off"
            placeholder="Ej. rajada, canto muerto, para López"
            aria-describedby={hay ? ayudaId : undefined}
            className={`h-11 min-w-0 flex-1 rounded-xl border bg-[var(--surface-raised)] px-2.5 text-sm font-semibold text-[var(--text-primary)] outline-none placeholder:font-normal placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] ${
              fija ? "border-[var(--accent)]" : "border-[var(--rule-base)]"
            }`}
          />
          {/* El candado de las medidas, con el mismo gesto: fijo se queda. */}
          <button
            type="button"
            onClick={onFijar}
            disabled={!fija && !hay}
            aria-pressed={fija}
            aria-label={fija ? "Soltar la observación" : "Fijar la observación"}
            title={fija ? "Soltar: va sólo a la próxima pieza" : "Fijar: se pega a todas las piezas que sigan"}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition disabled:opacity-30 ${
              fija
                ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                : "border-[var(--rule-base)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {fija ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          </button>
        </span>
      </label>
      {hay && (
        <p id={ayudaId} className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
          {fija ? (
            <>Fija: se pega a <b className="text-[var(--text-secondary)]">todas las piezas que sigan</b> hasta que sueltes el candado.</>
          ) : (
            <>Va sólo a la <b className="text-[var(--text-secondary)]">próxima pieza</b>. Con el candado se queda para todas.</>
          )}
        </p>
      )}
    </div>
  );
}
