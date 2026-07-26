"use client";

/**
 * module-primitives — las piezas visuales que comparten los módulos de
 * especialización (forestal, agrícola…) dentro de una cabina `libro-chrome`.
 *
 * Nacieron en el Libro CTP y se mudaron acá cuando el Acopio de Cacao necesitó
 * las mismas: un módulo agrícola no debería importar de `admin/forestal/`.
 * `ctp-shared` las re-exporta para no tocar los imports que ya existían.
 */

import type React from "react";

// ── Esqueletos de carga ─────────────────────────────────────────────────────
// Un spinner centrado con "Cargando registros…" no dice nada mientras se
// espera; una silueta de la tabla que viene sí: el ojo ya sabe dónde va a
// aparecer cada dato y la vista no salta cuando llega.
export function TablaSkeleton({ filas = 5, columnas = 6 }: { filas?: number; columnas?: number }) {
  return (
    <div
      role="status"
      aria-label="Cargando registros"
      className="overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]"
    >
      <div className="flex gap-4 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3">
        {Array.from({ length: columnas }, (_, i) => (
          <span key={i} className="h-3 flex-1 animate-pulse rounded bg-[var(--rule-base)]" />
        ))}
      </div>
      {Array.from({ length: filas }, (_, f) => (
        <div key={f} className="flex gap-4 border-b border-[var(--rule-soft)] px-4 py-3.5 last:border-0">
          {Array.from({ length: columnas }, (_, c) => (
            <span
              key={c}
              className="h-3.5 flex-1 animate-pulse rounded bg-[var(--surface-sunken)]"
              // Escalonado: la fila entera latiendo al unísono parece un error.
              style={{ animationDelay: `${(f * columnas + c) * 40}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Silueta de un panel con KPIs + cuerpo (Rentabilidad, Saldos, Cumplimiento). */
export function PanelSkeleton({ kpis = 3 }: { kpis?: number }) {
  return (
    <div role="status" aria-label="Cargando" className="space-y-4">
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${kpis}, minmax(0, 1fr))` }}>
        {Array.from({ length: kpis }, (_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]" style={{ animationDelay: "240ms" }} />
    </div>
  );
}

// ── Cabecera de vista ───────────────────────────────────────────────────────
// Cada pestaña abría con un párrafo de tres líneas explicando qué es la vista
// («Existencias del Libro (LO-CTP) en mayo de 2026 — julio de 2026: materia
// prima que entra vs. producto que sale. Es el saldo que se declara ante
// SERFOR…»). Se lee una vez y estorba siempre: acá queda el qué + el cuándo en
// una línea, y el porqué en el tooltip, que es donde se busca cuando hace falta.
export function VistaHeader({
  titulo,
  meta,
  hint,
  children,
}: {
  titulo: string;
  /** Contexto corto: período, conteo. En mono, alineado al título. */
  meta?: string;
  /** La explicación larga: tooltip, no pantalla. */
  hint?: string;
  /** Acciones de la vista, a la derecha. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="flex min-w-0 flex-wrap items-baseline gap-x-2" title={hint}>
        <strong className="text-sm font-bold text-[var(--text-primary)]">{titulo}</strong>
        {meta && <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{meta}</span>}
      </p>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

// ── Acción de fila (tablas del libro) ───────────────────────────────────────
// Cuatro botones con texto por fila ("Cadena", "Enviar a inventario",
// "Anexo 04", "Anular") medían más que las siete columnas de datos juntas y
// mandaban la tabla al scroll horizontal. Acá el ícono manda y el texto vive en
// el tooltip + `aria-label` — la card de móvil sigue mostrando las palabras.
export type IconActionTone = "success" | "info" | "accent" | "danger" | "muted";

const ICON_ACTION_TONE: Record<IconActionTone, string> = {
  success:
    "border-[var(--data-success-500)]/50 bg-[var(--data-success-50)] text-[var(--data-success-700)] hover:border-[var(--data-success-500)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]",
  info: "border-[var(--data-info-500)]/50 bg-[var(--data-info-50)] text-[var(--data-info-700)] hover:border-[var(--data-info-500)] dark:bg-[var(--data-info-500)]/12 dark:text-[var(--data-info-500)]",
  accent: "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
  danger:
    "border-[var(--data-error-500)]/50 bg-[var(--data-error-50)] text-[var(--data-error-700)] hover:border-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]",
  muted:
    "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)] hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)]",
};

export function IconAction({
  icon: Icon,
  label,
  tone = "muted",
  done,
  busy,
  className = "",
  ...props
}: {
  icon: React.ComponentType<{ className?: string }>;
  /** Qué hace, en palabras: va al tooltip y al lector de pantalla. */
  label: string;
  tone?: IconActionTone;
  /** Marca de "ya hecho" (ej. anexo emitido) — punto en la esquina. */
  done?: boolean;
  busy?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-xl border-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${ICON_ACTION_TONE[tone]} ${className}`}
      {...props}
    >
      <Icon className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
      {done && (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface-raised)] bg-[var(--data-success-500)]"
        />
      )}
    </button>
  );
}
