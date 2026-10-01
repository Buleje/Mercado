"use client";

/**
 * Piezas que comparten los bloques de la Ficha de la guía (rediseño 2026-09-26).
 *
 * Un bloque = una pregunta con su respuesta a la vista: título con ícono, un
 * ⓘ para el «cómo se lee» (Brandon 09-24: «mucho texto por todos lados») y a
 * la derecha la cifra que resume el bloque. Todos entran con el mismo `megaIn`
 * escalonado; `prefers-reduced-motion` lo apaga repo-wide.
 */

import type { CSSProperties, ReactNode } from "react";
import { useId, useState } from "react";
import { ChevronDown, type LucideIcon } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";

export type Tono = "neutro" | "marca" | "exito" | "aviso" | "error" | "info";

/** Fondo tenue + texto `-ink` (el `-700` del preset no llega a 4,5:1 en chico). */
export const TONO: Record<Tono, string> = {
  neutro: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  marca: "bg-[var(--accent)]/12 text-[var(--accent-ink)]",
  exito: "bg-[var(--data-success-500)]/15 text-[var(--data-success-ink)]",
  aviso: "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-ink)]",
  error: "bg-[var(--data-error-500)]/12 text-[var(--data-error-ink)]",
  info: "bg-[var(--data-info-500)]/12 text-[var(--data-info-ink)]",
};

/** El punto de color de cada tono (línea de tiempo, leyendas). */
export const PUNTO: Record<Tono, string> = {
  neutro: "bg-[var(--text-tertiary)]",
  marca: "bg-[var(--accent)]",
  exito: "bg-[var(--data-success-500)]",
  aviso: "bg-[var(--data-warning-500)]",
  error: "bg-[var(--data-error-500)]",
  info: "bg-[var(--data-info-500)]",
};

/** Pastilla de estado: ícono + texto, nunca sólo color. */
export function Pastilla({
  tono = "neutro",
  icono: Icon,
  children,
  title,
  tam = "md",
  className = "",
}: {
  tono?: Tono;
  /** `sm` para celdas de tabla. */
  tam?: "md" | "sm";
  icono?: LucideIcon;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ${
        tam === "sm" ? "min-h-6 px-2 text-xs" : "min-h-7 px-2.5 py-0.5 text-sm"
      } ${TONO[tono]} ${className}`}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      {children}
    </span>
  );
}

/** El botón chico de un bloque («Abrir la plata», «Ver las fotos»). */
export const BOTON_BLOQUE =
  "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-muted)] disabled:cursor-not-allowed disabled:opacity-50";

/** Una cifra con su rótulo: el número manda, el rótulo acompaña. */
export function Cifra({ valor, rotulo, sufijo, className = "" }: { valor: ReactNode; rotulo: string; sufijo?: string; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="font-mono text-lg font-bold tabular-nums leading-tight text-[var(--text-primary)]">
        {valor}
        {sufijo && <span className="ml-1 text-sm font-semibold text-[var(--text-secondary)]">{sufijo}</span>}
      </div>
      <div className="text-xs font-semibold text-[var(--text-tertiary)]">{rotulo}</div>
    </div>
  );
}

/**
 * ¿La ficha abre en un teléfono? Lo secundario (plata, casilleros, papeles,
 * fotos) arranca plegado ahí: a 400 px la ficha entera medía 4,8 pantallas.
 * Se lee UNA vez al montar: girar el teléfono no pliega lo que abriste.
 */
function useAngostoAlAbrir(): boolean {
  const [angosto] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches);
  return angosto;
}

export function BloqueFicha({
  titulo,
  icono: Icon,
  info,
  extra,
  pie,
  children,
  indice = 0,
  plegable = false,
  className = "",
}: {
  titulo: string;
  icono: LucideIcon;
  /** El ⓘ al lado del título. */
  info?: ReactNode;
  /** A la derecha del título: la cifra que resume el bloque. Se ve también plegado. */
  extra?: ReactNode;
  /** Acciones del bloque, abajo. */
  pie?: ReactNode;
  children: ReactNode;
  /** Orden de entrada: cada bloque aparece 45 ms después del anterior. */
  indice?: number;
  /** El título pliega el bloque; en el teléfono arranca plegado. */
  plegable?: boolean;
  className?: string;
}) {
  const id = useId();
  const angosto = useAngostoAlAbrir();
  const [abierto, setAbierto] = useState(!(plegable && angosto));
  const estilo: CSSProperties = { animationDelay: `${indice * 45}ms` };
  const cabeza = (
    <>
      <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--accent)]/12 text-[var(--accent-ink)]">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">{titulo}</span>
    </>
  );
  return (
    <section
      aria-labelledby={`${id}-t`}
      style={estilo}
      className={`flex min-w-0 flex-col rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)] motion-safe:animate-[megaIn_var(--motion-slow)_var(--ease-editorial)_both] ${className}`}
    >
      <header className={`flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 ${abierto ? "border-b border-[var(--rule-soft)]" : ""}`}>
        {/* Disclosure = botón DENTRO del heading; el ⓘ queda afuera (no se anida un botón en otro). */}
        <CardTitle id={`${id}-t`} className="min-w-0">
          {plegable ? (
            <button
              type="button"
              aria-expanded={abierto}
              aria-controls={`${id}-c`}
              onClick={() => setAbierto((v) => !v)}
              className="-m-1 flex min-h-10 items-center gap-2 rounded-lg p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-muted)]"
            >
              {cabeza}
              <ChevronDown
                aria-hidden
                className={`h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform duration-[var(--motion-base)] ${abierto ? "" : "-rotate-90"}`}
              />
            </button>
          ) : (
            <span className="flex items-center gap-2">{cabeza}</span>
          )}
        </CardTitle>
        {info}
        {extra && <div className="ml-auto flex items-center gap-2">{extra}</div>}
      </header>
      {/* `hidden` y no desmontar: plegar no borra lo que se filtró adentro. */}
      <div id={`${id}-c`} hidden={!abierto} className="flex-1 px-4 py-3">
        {children}
      </div>
      {pie && (
        <div hidden={!abierto} className="flex flex-wrap items-center gap-2 border-t border-[var(--rule-soft)] px-4 py-2.5">
          {pie}
        </div>
      )}
    </section>
  );
}

/** Estado de carga de un bloque: tres barras, sin «Cargando…» de texto. */
export function BloqueCargando({ filas = 3 }: { filas?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-[var(--surface-sunken)]" style={{ width: `${90 - i * 18}%` }} />
      ))}
    </div>
  );
}
