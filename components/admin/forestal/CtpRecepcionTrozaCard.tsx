"use client";

/**
 * Una troza de la recepción, como card para el celular del patio (ADR-325).
 *
 * La <table> de 7 columnas —tres de ellas con input— se recibe parado frente a
 * la pila, que es exactamente donde no hay pantalla ancha. Acá cada pieza es una
 * card con sus campos apilados y el "¿llegó?" como par de botones grandes, no
 * como un ícono de 36px perdido en una celda.
 *
 * El dato que decide todo es el primero: si la troza NO llegó, los campos del
 * centro se apagan (no hay código de planta que marcarle a una pieza ausente).
 */

import { Check, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { CambioRecepcion } from "@/lib/forestal/recepcion-trozas";

export interface TrozaCardRecepcion {
  id: string;
  codificacion?: string | null;
  especieComun?: string | null;
  volumenM3?: number | string | null;
  codigoPlanta?: string | null;
  parcela?: string | null;
  noRecepcionada?: boolean | null;
  recepcionObs?: string | null;
}

const CAMPO =
  "h-12 w-full rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)] disabled:opacity-40";

export default function CtpRecepcionTrozaCard({
  troza: t,
  onCambio,
}: {
  /** La troza con sus ediciones ya aplicadas: lo que se ve es lo que se guarda. */
  troza: TrozaCardRecepcion;
  onCambio: (parche: Partial<CambioRecepcion>) => void;
}) {
  const falta = Boolean(t.noRecepcionada);

  return (
    <li
      className={cn(
        "rounded-2xl border-2 p-3",
        falta
          ? "border-[var(--data-error-500)] bg-[var(--data-error-50)]/40 dark:bg-[var(--data-error-500)]/10"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-base font-bold text-[var(--text-primary)]">
            {t.codificacion ?? "—"}
          </p>
          <p className="truncate text-sm text-[var(--text-secondary)]">{t.especieComun ?? "—"}</p>
        </div>
        <p className="shrink-0 text-right">
          <span className="block font-mono text-base font-bold tabular-nums text-[var(--text-primary)]">
            {t.volumenM3 != null ? Number(t.volumenM3).toFixed(4) : "—"}
          </span>
          <span className="block text-sm text-[var(--text-tertiary)]">m³</span>
        </p>
      </div>

      {/* Lo primero que se decide en el patio: si llegó o no. */}
      <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="¿La troza llegó al patio?">
        <button
          type="button"
          onClick={() => onCambio({ noRecepcionada: false })}
          aria-pressed={!falta}
          className={cn(
            "inline-flex h-12 items-center justify-center gap-2 rounded-2xl border-2 text-sm font-bold transition-colors",
            !falta
              ? "border-[var(--data-success-500)] bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/10 dark:text-[var(--data-success-500)]"
              : "border-[var(--rule-base)] text-[var(--text-secondary)]",
          )}
        >
          <Check className="h-4 w-4" aria-hidden /> Llegó
        </button>
        <button
          type="button"
          onClick={() => onCambio({ noRecepcionada: true })}
          aria-pressed={falta}
          className={cn(
            "inline-flex h-12 items-center justify-center gap-2 rounded-2xl border-2 text-sm font-bold transition-colors",
            falta
              ? "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/10 dark:text-[var(--data-error-500)]"
              : "border-[var(--rule-base)] text-[var(--text-secondary)]",
          )}
        >
          <X className="h-4 w-4" aria-hidden /> No llegó
        </button>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-[var(--text-tertiary)]">Cód. planta</span>
          <input
            value={t.codigoPlanta ?? ""}
            onChange={(e) => onCambio({ codigoPlanta: e.target.value })}
            disabled={falta}
            placeholder="Ej: 118"
            className={cn(CAMPO, "font-mono")}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-[var(--text-tertiary)]">Parcela</span>
          <input
            value={t.parcela ?? ""}
            onChange={(e) => onCambio({ parcela: e.target.value })}
            disabled={falta}
            placeholder="PC-03"
            className={cn(CAMPO, "font-mono")}
          />
        </label>
      </div>

      <label className="mt-2 block">
        <span className="mb-1 block text-sm font-bold text-[var(--text-tertiary)]">Observación</span>
        <input
          value={t.recepcionObs ?? ""}
          onChange={(e) => onCambio({ recepcionObs: e.target.value })}
          placeholder={falta ? "¿Por qué no llegó?" : "Rajadura, pudrición…"}
          className={CAMPO}
        />
      </label>
    </li>
  );
}
