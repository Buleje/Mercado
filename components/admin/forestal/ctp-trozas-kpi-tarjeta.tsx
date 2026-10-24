"use client";

/**
 * El marco de las tarjetas de indicadores del patio de trozas.
 *
 * Mismo cuerpo que el `StatCard` del DS que usa `CtpKpi` (rectangular, fondo
 * `surface-raised`, borde fino, `p-3`, kicker + cifra grande + contexto chico)
 * para que las dos convivan en la misma grilla sin verse de dos familias. Lo
 * que agrega es lo que el StatCard no deja: un dibujo chico debajo de la cifra
 * (barras, histograma) y una acción aparte de la cifra — un StatCard entero es
 * UN botón, y acá «filtrar las libres» y «ver las más viejas» son dos cosas.
 *
 * La explicación va en ⓘ (ley de Brandon 09-24), nunca en un párrafo.
 */

import type { ComponentType, ReactNode } from "react";
import { ArrowRight } from "@buleje/design-system/icons";
import { Caption, Kicker } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

type IconoDS = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

export type TonoCifra = "success" | "warning" | "neutral" | "muted";

const COLOR_CIFRA: Record<TonoCifra, string> = {
  success: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  warning: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  neutral: "text-[var(--text-primary)]",
  muted: "text-[var(--text-secondary)]",
};

/** El anillo de «esta tarjeta manda sobre la tabla» (el mismo de `CtpKpi`). */
const ANILLO = "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface-canvas)]";

export interface TarjetaPatioProps {
  label: string;
  icono?: IconoDS;
  valor: ReactNode;
  contexto?: ReactNode;
  tono?: TonoCifra;
  /** El ⓘ al lado del título: qué es, de dónde sale, un ejemplo. */
  info?: { what: ReactNode; affects?: ReactNode; example?: ReactNode };
  /** Tocar la cifra filtra la lista de abajo. */
  onClick?: () => void;
  titulo?: string;
  filtrando?: boolean;
  /** El dibujo chico de debajo. */
  children?: ReactNode;
  /** Una acción aparte de la cifra (el pie de la tarjeta). */
  accion?: ReactNode;
}

export function TarjetaPatio({
  label, icono: Icono, valor, contexto, tono = "neutral", info, onClick, titulo, filtrando = false, children, accion,
}: TarjetaPatioProps) {
  const cifra = (
    <>
      <span
        className={`block text-[length:var(--ts-xl)] font-extrabold leading-[var(--lh-tight)] tabular-nums sm:text-[length:var(--ts-2xl)] ${COLOR_CIFRA[tono]}`}
      >
        {valor}
      </span>
      {contexto != null && <Caption className="mt-1 block text-[var(--text-tertiary)]">{contexto}</Caption>}
    </>
  );
  return (
    <div
      className={`flex h-full w-full flex-col gap-2.5 border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 ${filtrando ? ANILLO : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <Kicker as="span" className="truncate">{label}</Kicker>
          {info && <InfoTip title={label} what={info.what} affects={info.affects} example={info.example} side="bottom" />}
        </div>
        {Icono && <Icono className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />}
      </div>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-pressed={filtrando}
          title={titulo}
          className="-m-1 rounded-md p-1 text-left transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          {cifra}
        </button>
      ) : (
        <div>{cifra}</div>
      )}
      {children}
      {accion && <div className="mt-auto border-t border-[var(--rule-soft)] pt-2">{accion}</div>}
    </div>
  );
}

/** La acción del pie: texto con flecha, en la tinta del acento. */
export function AccionTarjeta({ children, onClick, titulo }: { children: ReactNode; onClick: () => void; titulo?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      className="inline-flex min-h-8 w-full items-center justify-between gap-2 text-left text-xs font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]"
    >
      <span className="min-w-0">{children}</span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    </button>
  );
}

/** Una barra horizontal sobre una pista: `valor` de `max`, con el color de la serie. */
export function BarraMini({ valor, max, color, alto = "h-2" }: { valor: number; max: number; color: string; alto?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (valor / max) * 100)) : 0;
  return (
    <span className={`block ${alto} w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]`} aria-hidden="true">
      <span
        className="block h-full rounded-full"
        /* Un valor > 0 nunca se dibuja invisible: 2 % mínimo para que se vea que hay algo. */
        style={{ width: `${valor > 0 ? Math.max(pct, 2) : 0}%`, background: color }}
      />
    </span>
  );
}
