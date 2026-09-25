"use client";

/**
 * Primitivos de los cuadros del formato oficial del LO-CTP.
 *
 * Viven acá y no dentro de `CtpResumenesSerfor` porque los apartados (1 y 2) y
 * los tres cuadros resumen se leen juntos y tienen que verse iguales: si cada
 * pantalla se dibujara su propia tabla, un casillero vacío en una sería un "0"
 * en la otra y el libro dejaría de leerse como un solo documento.
 */

import { useId } from "react";
import { CardTitle, DataTable } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";

export const n4 = (n: number) =>
  formatNumber(n, 4);

/** Un casillero sin dato se muestra vacío, nunca "0": el 0 afirma que no hubo. */
export function Celda({ v, negativo }: { v: number | null; negativo?: boolean }) {
  if (v == null) return <td className="px-3 py-2 text-center text-[var(--text-tertiary)]">—</td>;
  return (
    <td
      className={cn(
        "px-3 py-2 text-right font-mono tabular-nums",
        negativo && v < 0 && "font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
      )}
    >
      {n4(v)}
    </td>
  );
}

export function Entero({ v }: { v: number | null }) {
  if (v == null) return <td className="px-3 py-2 text-center text-[var(--text-tertiary)]">—</td>;
  return <td className="px-3 py-2 text-right font-mono tabular-nums">{formatNumber(v)}</td>;
}

/** Texto de un casillero: vacío se dibuja como raya, no como celda en blanco. */
export function Texto({ v, className }: { v: string | null | undefined; className?: string }) {
  const limpio = (v ?? "").trim();
  if (!limpio) return <td className="px-3 py-2 text-center text-[var(--text-tertiary)]">—</td>;
  return <td className={cn("px-3 py-2 text-[var(--text-secondary)]", className)}>{limpio}</td>;
}

/**
 * Cabecera de columna de un cuadro oficial. `scope="col"` por defecto: sin él,
 * un lector de pantalla no ata cada casillero a su encabezado (WCAG 1.3.1). En
 * `--text-secondary` y no `--text-tertiary`: once columnas en mayúsculas chicas
 * con el gris más claro no llegaban a 4,5:1.
 */
export function Th({
  children,
  ancho,
  scope = "col",
}: {
  children: React.ReactNode;
  ancho?: string;
  scope?: "col" | "row" | "colgroup";
}) {
  return (
    <th
      scope={scope}
      className={cn(
        "whitespace-nowrap px-3 py-2.5 text-left text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-secondary)]",
        ancho,
      )}
    >
      {children}
    </th>
  );
}

export function Cuadro({
  titulo,
  subtitulo,
  children,
  pie,
  ocupado = false,
  accion,
  barra,
}: {
  titulo: string;
  subtitulo: string;
  children: React.ReactNode;
  /** A la derecha del título: el «Opciones» del cuadro (agrupar, descargar). */
  accion?: React.ReactNode;
  /**
   * La búsqueda y los filtros, DENTRO del marco y arriba de la tabla que acotan
   * (2026-09-24, ley de Brandon regla 5): sueltos entre las cifras y el cuadro
   * se leían como otro bloque más.
   */
  barra?: React.ReactNode;
  /** Se está refrescando: el cuadro sigue a la vista y lo dice (`aria-busy`). */
  ocupado?: boolean;
  /**
   * Debajo de la tabla, dentro del marco: la paginación y los totales
   * (ADR-344). Va acá y no suelto afuera para que se lea como parte del cuadro
   * —un cuadro oficial con su pie— y no como un control que quedó flotando.
   */
  pie?: React.ReactNode;
}) {
  /* La tabla se nombra con su título (`aria-labelledby`): un lector de pantalla
     que salta de tabla en tabla oye «Sección 2 · Consumos» y no «tabla, 11
     columnas». */
  const idTitulo = useId();
  return (
    <section
      aria-labelledby={idTitulo}
      aria-busy={ocupado || undefined}
      className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] "
    >
      <header className="space-y-3 border-b border-[var(--rule-base)] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle as="h3" id={idTitulo} className="text-base font-bold text-[var(--text-primary)]">{titulo}</CardTitle>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{subtitulo}</p>
          </div>
          {accion}
        </div>
        {barra}
      </header>
      {/* Estos cuadros NO se convierten en cards: son el formato oficial y los
          casilleros numerados tienen que leerse como en la hoja de SERFOR. Lo
          que sí hace falta en el celular es avisar que la tabla sigue a la
          derecha — sin el degradé el borde se lee como el fin del cuadro. */}
      <div className="relative">
        <div className="overflow-x-auto">
          {/* La caja que scrollea a lo ancho se alcanza con Tab: sin eso, con el
              teclado no se puede leer la mitad derecha del cuadro (axe
              `scrollable-region-focusable`). */}
          <DataTable
            aria-labelledby={idTitulo}
            className="w-full text-sm hoja-grilla"
            wrapperProps={{ tabIndex: 0, role: "region", "aria-labelledby": idTitulo }}
            wrapperClassName="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {children}
          </DataTable>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-10 rounded-r-2xl bg-linear-to-l from-[var(--surface-canvas)] to-transparent sm:hidden dark:from-[var(--surface-raised)]"
        />
      </div>
      {pie && <footer className="border-t border-[var(--rule-base)] px-4 py-2.5">{pie}</footer>}
    </section>
  );
}

/** Fila de "acá no hay nada todavía", con el mismo colspan que la tabla. */
export function SinDatos({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-8 text-center text-sm text-[var(--text-secondary)]">
        {children}
      </td>
    </tr>
  );
}
