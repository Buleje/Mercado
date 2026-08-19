"use client";

/**
 * Primitivos de los cuadros del formato oficial del LO-CTP.
 *
 * Viven acá y no dentro de `CtpResumenesSerfor` porque los apartados (1 y 2) y
 * los tres cuadros resumen se leen juntos y tienen que verse iguales: si cada
 * pantalla se dibujara su propia tabla, un casillero vacío en una sería un "0"
 * en la otra y el libro dejaría de leerse como un solo documento.
 */

import { CardTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";

export const n4 = (n: number) =>
  n.toLocaleString("es-PE", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

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
  return <td className="px-3 py-2 text-right font-mono tabular-nums">{v.toLocaleString("es-PE")}</td>;
}

/** Texto de un casillero: vacío se dibuja como raya, no como celda en blanco. */
export function Texto({ v, className }: { v: string | null | undefined; className?: string }) {
  const limpio = (v ?? "").trim();
  if (!limpio) return <td className="px-3 py-2 text-center text-[var(--text-tertiary)]">—</td>;
  return <td className={cn("px-3 py-2 text-[var(--text-secondary)]", className)}>{limpio}</td>;
}

export function Th({ children, ancho }: { children: React.ReactNode; ancho?: string }) {
  return (
    <th
      className={cn(
        "whitespace-nowrap px-3 py-2.5 text-left text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]",
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
}: {
  titulo: string;
  subtitulo: string;
  children: React.ReactNode;
  /**
   * Debajo de la tabla, dentro del marco: la paginación y los totales
   * (ADR-344). Va acá y no suelto afuera para que se lea como parte del cuadro
   * —un cuadro oficial con su pie— y no como un control que quedó flotando.
   */
  pie?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-raised)]">
      <header className="border-b border-[var(--rule-base)] px-4 py-3">
        <CardTitle as="h3" className="text-base font-bold text-[var(--text-primary)]">{titulo}</CardTitle>
        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{subtitulo}</p>
      </header>
      {/* Estos cuadros NO se convierten en cards: son el formato oficial y los
          casilleros numerados tienen que leerse como en la hoja de SERFOR. Lo
          que sí hace falta en el celular es avisar que la tabla sigue a la
          derecha — sin el degradé el borde se lee como el fin del cuadro. */}
      <div className="relative">
        <div className="overflow-x-auto">
          <table className="w-full text-sm hoja-grilla">{children}</table>
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
