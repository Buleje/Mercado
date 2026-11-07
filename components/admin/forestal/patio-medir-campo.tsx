"use client";

/**
 * Una casilla de «Medir escaneando» (D1″ · D2″ · Largo′ · D1/D2 cm): grande,
 * con teclado numérico y Enter que avanza. Separada de `patio-medir-form` para
 * que la tarjeta quede en su flujo.
 */

import { cn } from "@/lib/utils";
import type { CampoPlanilla } from "@/lib/forestal/planilla-oxapampa";

export const ETIQUETA: Record<CampoPlanilla, string> = {
  d1: "D1″",
  d2: "D2″",
  largo: "Largo′",
  d1Cm: "D1 cm",
  d2Cm: "D2 cm",
};

export default function CampoMedida({
  campo,
  valor,
  error,
  grande,
  entrar,
  onCambio,
  onEnter,
  refCampo,
}: {
  campo: CampoPlanilla;
  valor: string;
  error: string | undefined;
  grande: boolean;
  entrar: "next" | "done";
  onCambio: (v: string) => void;
  onEnter: () => void;
  refCampo: (el: HTMLInputElement | null) => void;
}) {
  const id = `medir-${campo}`;
  return (
    <div className="min-w-0 space-y-1">
      <label htmlFor={id} className="block text-base font-bold text-[var(--text-primary)]">
        {ETIQUETA[campo]}
      </label>
      <input
        id={id}
        ref={refCampo}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          onEnter();
        }}
        inputMode="decimal"
        enterKeyHint={entrar}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          "w-full rounded-2xl border-2 bg-[var(--surface-raised)] px-2 text-center font-bold tabular-nums text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] dark:bg-[var(--surface-sunken)]",
          grande ? "h-14 text-2xl" : "h-12 text-xl",
          error ? "border-[var(--data-error-500)]" : "border-[var(--rule-base)]",
        )}
      />
      {error && (
        <p id={`${id}-error`} className="text-sm font-bold text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}
    </div>
  );
}

