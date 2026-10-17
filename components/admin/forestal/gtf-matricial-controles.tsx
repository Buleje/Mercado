"use client";

/**
 * Los controles del panel del talonario: un número en mm que se tipea con
 * coma o punto y se mueve con las flechas, unas opciones de 48 px, una casilla
 * y el botón de ícono de 48 px (la barra, alinear, plegar los costados).
 * Separados del panel para que éste no pase de 300 líneas.
 */

import { useEffect, useId, useState } from "react";
import type { LucideIcon } from "@buleje/design-system/icons";
import { POS_MAX_MM, POS_MIN_MM } from "@/lib/forestal/gtf-matricial-disposicion";
import { I } from "./ctp-shared";

const INPUT = I.replace("h-11", "h-12");
/** En una tabla: 6 rem alcanzan para «−12,25» o «1000». */
const INPUT_COMPACTO = INPUT.replace("w-full", "w-20").replace("px-3.5", "px-3");

/** «12,5» o «12.5» → 12.5; lo que no es número → null. */
export function leerNumero(texto: string): number | null {
  const t = texto.trim().replace(",", ".");
  if (!t || !/^-?\d*\.?\d*$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Con coma decimal, como se lee en Perú; sin ceros de más. */
export const fmtMm = (v: number): string => String(Math.round(v * 100) / 100).replace(".", ",");

const redondear = (n: number, entero: boolean): number => (entero ? Math.round(n) : Math.round(n * 100) / 100);

export function NumeroMm({
  label,
  value,
  onChange,
  paso = 0.5,
  min = POS_MIN_MM,
  max = POS_MAX_MM,
  sufijo = "mm",
  entero = false,
  compacto = false,
  vivo = false,
  onFocus,
  qa,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  paso?: number;
  min?: number;
  max?: number;
  sufijo?: string;
  entero?: boolean;
  /** Dentro de una tabla: el rótulo sólo para el lector de pantalla y sin el «mm» (va en la cabecera). */
  compacto?: boolean;
  /** Avisa cada cifra válida mientras se tipea (la hoja de atrás se mueve al instante), no sólo al salir. */
  vivo?: boolean;
  onFocus?: () => void;
  qa?: string;
}) {
  const id = useId();
  const [borrador, setBorrador] = useState(fmtMm(value));
  const redondo = (n: number) => redondear(n, entero);
  /* Lo de afuera (deshacer, otro control) reescribe la cifra; lo que se está tipeando y ya vale eso («12,» = 12) se respeta. */
  useEffect(() => {
    setBorrador((b) => {
      const n = leerNumero(b);
      return n != null && redondear(n, entero) === value ? b : fmtMm(value);
    });
  }, [value, entero]);
  const fijar = (n: number) => {
    const limpio = Math.min(max, Math.max(min, redondo(n)));
    onChange(limpio);
    setBorrador(fmtMm(limpio));
  };
  const confirmar = () => {
    const n = leerNumero(borrador);
    if (n == null) setBorrador(fmtMm(value));
    else fijar(n);
  };
  const tipear = (texto: string) => {
    setBorrador(texto);
    if (!vivo) return;
    const n = leerNumero(texto);
    if (n != null && texto.trim() !== "-" && n >= min && n <= max && redondo(n) !== value) onChange(redondo(n));
  };
  return (
    <label
      htmlFor={id}
      className={compacto ? "block" : "flex min-w-0 flex-col gap-1 text-sm font-semibold text-[var(--text-secondary)]"}
    >
      <span className={compacto ? "sr-only" : undefined}>{label}</span>
      <span className="relative block">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={borrador}
          data-qa={qa}
          onChange={(e) => tipear(e.target.value)}
          onFocus={onFocus}
          onBlur={confirmar}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirmar();
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              const base = leerNumero(borrador) ?? value;
              fijar(base + (e.key === "ArrowUp" ? 1 : -1) * paso * (e.shiftKey ? 10 : 1));
            }
          }}
          className={compacto ? `${INPUT_COMPACTO} font-mono tabular-nums` : `${INPUT} pr-10 font-mono tabular-nums`}
        />
        {!compacto && (
          <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-[var(--text-tertiary)]">
            {sufijo}
          </span>
        )}
      </span>
    </label>
  );
}

export function Opciones<T extends string>({
  label,
  value,
  onChange,
  opciones,
  labelOculto = false,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  opciones: ReadonlyArray<{ value: T; label: string; title?: string }>;
  /** En una barra de herramientas el rótulo sobra a la vista (lo lee el lector de pantalla). */
  labelOculto?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className={labelOculto ? "sr-only" : "text-sm font-semibold text-[var(--text-secondary)]"}>{label}</span>
      <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-1">
        {opciones.map((o) => {
          const activa = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={activa}
              title={o.title}
              onClick={() => onChange(o.value)}
              className={`min-h-12 flex-1 rounded-lg px-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${
                activa
                  ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Casilla({
  label, checked, onChange, disabled = false, ayuda,
}: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; ayuda?: string }) {
  return (
    <label
      title={ayuda}
      className={`flex min-h-12 items-center gap-3 rounded-xl px-1 text-sm font-semibold text-[var(--text-primary)] ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 shrink-0 accent-[var(--accent-dark)]"
      />
      <span className="min-w-0">{label}</span>
    </label>
  );
}

/** Botón de ícono de 48 px: dice qué hace y un ejemplo al pasar el mouse. */
export function BotonIcono({
  icon: Icono,
  label,
  ayuda,
  onClick,
  disabled,
  activo,
}: {
  icon: LucideIcon;
  label: string;
  ayuda?: string;
  onClick: () => void;
  disabled?: boolean;
  activo?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={ayuda ? `${label}\n${ayuda}` : label}
      aria-pressed={activo}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 disabled:cursor-not-allowed disabled:opacity-35 ${
        activo ? "bg-[var(--accent-muted)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
      }`}
    >
      <Icono className="h-5 w-5" aria-hidden />
    </button>
  );
}

export const Separador = () => <span aria-hidden className="mx-0.5 h-8 w-px shrink-0 bg-[var(--rule-base)]" />;
