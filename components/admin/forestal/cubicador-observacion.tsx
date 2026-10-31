"use client";

/**
 * El campo «Observación» de lo que se le pega a cada pieza, con su candado
 * (Brandon, 2026-09-23). La regla vive en `lib/forestal/observacion-de-pieza.ts`:
 * suelta va a la próxima pieza y se borra; con candado, a todas las que siguen.
 *
 * Compacto desde el 24-10 («Cargar compacta»): el nombre va DENTRO de la caja,
 * como en especie y dueño, en vez de un renglón propio arriba.
 *
 * La línea de abajo dice cuál de las dos va a pasar, sólo cuando hay texto: la
 * diferencia entre «una pieza» y «todas» es justo lo que no se adivina mirando
 * un candado.
 */
import { useId } from "react";
import { Kicker } from "@buleje/design-system";
import { Lock, Unlock } from "@buleje/design-system/icons";
import { OBSERVACION_MAX } from "@/lib/forestal/observacion-de-pieza";

export interface CampoObservacionProps {
  texto: string;
  fija: boolean;
  onTexto: (v: string) => void;
  onFijar: () => void;
}

export default function CampoObservacion({ texto, fija, onTexto, onFijar, className = "" }: CampoObservacionProps & { className?: string }) {
  const ayudaId = useId();
  const hay = texto.trim().length > 0;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span className="flex items-center gap-1">
        <label
          className={`flex h-11 min-w-0 flex-1 items-center gap-1.5 rounded-xl border bg-[var(--surface-raised)] pl-2.5 focus-within:border-[var(--accent)] sm:h-10 ${
            fija ? "border-[var(--accent)]" : "border-[var(--rule-base)]"
          }`}
        >
          <Kicker aria-hidden className="shrink-0">Observación</Kicker>
          <input
            type="text"
            value={texto}
            onChange={(e) => onTexto(e.target.value)}
            maxLength={OBSERVACION_MAX}
            autoComplete="off"
            aria-label="Observación"
            placeholder="Ej. rajada, para López"
            aria-describedby={hay ? ayudaId : undefined}
            className="h-full min-w-0 flex-1 bg-transparent pr-2.5 text-sm font-semibold text-[var(--text-primary)] outline-none placeholder:font-normal placeholder:text-[var(--text-tertiary)]"
          />
        </label>
        {/* El candado de las medidas, con el mismo gesto: fijo se queda. */}
        <button
          type="button"
          onClick={onFijar}
          disabled={!fija && !hay}
          aria-pressed={fija}
          aria-label={fija ? "Soltar la observación" : "Fijar la observación"}
          title={fija ? "Soltar: va sólo a la próxima pieza" : "Fijar: se pega a todas las piezas que sigan"}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition disabled:opacity-30 sm:h-10 sm:w-10 ${
            fija
              ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
              : "border-[var(--rule-base)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          }`}
        >
          {fija ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
        </button>
      </span>
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
