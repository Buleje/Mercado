/**
 * gtf-papel — las piezas para que una pantalla de la GTF se vea como el
 * talonario impreso (Brandon 16-10: «que se parezca lo más posible a esos
 * formatos, con ese color de texto, tamaños, formatos»): tinta celeste en
 * rótulos y rayas, franjas de sección en mayúsculas, el «(n) Rótulo:» seguido
 * de su renglón punteado, la cabecera con el titular a la izquierda y el N°
 * prenumerado en rojo, y la tabla con cabecera sombreada.
 *
 * Los colores son los tokens `--gtf-*` de globals.css (claro y oscuro). El
 * número de cada casillero sale de `casilleroGtf2024(clave)` (ADR-494): nunca
 * se escribe a mano. Sin estado: lo usan «Datos de la GTF» (sólo lectura) y el
 * formulario de la guía (con sus entradas adentro).
 */

import type { ReactNode } from "react";

/** La hoja entera: borde de tinta y papel. */
export function PapelGtf({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-md border-2 border-[var(--gtf-tinta)] bg-[var(--gtf-papel)] ${className}`}>
      {children}
    </div>
  );
}

/** Franja de sección: «DATOS DEL DESTINATARIO». `extra` va a la derecha (avisos, botones). */
export function FranjaGtf({ titulo, extra, id }: { titulo: string; extra?: ReactNode; id?: string }) {
  return (
    <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-y border-[var(--gtf-tinta)] bg-[var(--gtf-franja)] px-3 py-1">
      {/* basis-0: el título largo se parte adentro y el ⓘ no salta de renglón (a 400 px). `!`: `* { min-width: 0 }` de globals.css. */}
      <span id={id} className="min-w-[10rem]! grow basis-0 text-sm font-bold uppercase tracking-wide text-[var(--gtf-tinta)]">
        {titulo}
      </span>
      {extra}
    </div>
  );
}

/** «(12) Propietario del Producto:» en tinta. Sin `n` (un dato del sistema que el papel no numera), sólo el texto. */
export function RotuloGtf({ n, children, dosPuntos = true, className = "" }: { n?: string | number; children: ReactNode; dosPuntos?: boolean; className?: string }) {
  return (
    <span className={`text-sm font-semibold text-[var(--gtf-tinta)] ${className}`}>
      {n != null && n !== "" && <span className="tabular-nums">({n}) </span>}
      {children}
      {dosPuntos && ":"}
    </span>
  );
}

/**
 * Un renglón del papel: rótulo y, a su derecha, el valor sobre el punteado.
 * `vacio` = el texto gris que se ve cuando no hay dato («En blanco», «No lo
 * publica SERFOR»). En pantallas angostas el valor baja debajo del rótulo.
 */
export function RenglonGtf({
  n, rotulo, children, vacio, className = "",
}: { n?: string | number; rotulo: ReactNode; children?: ReactNode; vacio?: string; className?: string }) {
  const hay = children != null && children !== "" && children !== false;
  return (
    <div className={`flex min-w-0 flex-wrap items-end gap-x-1.5 gap-y-0.5 ${className}`}>
      <RotuloGtf n={n}>{rotulo}</RotuloGtf>
      <span className="min-w-[6rem]! flex-1 border-b border-dotted border-[var(--gtf-linea)] pb-px text-base font-medium text-[var(--text-primary)]">
        {hay ? children : <span className="text-sm font-normal italic text-[var(--text-tertiary)]">{vacio ?? " "}</span>}
      </span>
    </div>
  );
}

/** Casilla del (5) o del (36): cuadrito de tinta con su «X». */
export function CasillaGtf({ marcada, children }: { marcada: boolean; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-[var(--gtf-tinta)]">
      <span
        aria-hidden
        className="inline-flex h-4 w-5 shrink-0 items-center justify-center border border-[var(--gtf-tinta)] text-sm font-bold leading-none text-[var(--text-primary)]"
      >
        {marcada ? "X" : ""}
      </span>
      <span className={marcada ? "font-semibold" : ""}>{children}</span>
      {marcada && <span className="sr-only">(marcada)</span>}
    </span>
  );
}

/**
 * La cabecera de la imprenta: a la izquierda el recuadro con el titular, su
 * RUC, el título habilitante y la ubicación; a la derecha el nombre de la hoja
 * y el (1) con la serie y el N° en rojo. `extra` (p. ej. el N° de registro o
 * el (2) GTF N° de la lista) va debajo del N°.
 */
export function EncabezadoGtfPapel({
  hoja, titular, ruc, titulo, ubicacion, serie, numero, extra,
}: {
  hoja: "guia" | "lista";
  titular?: string | null;
  ruc?: string | null;
  titulo?: string | null;
  ubicacion?: string | null;
  serie?: string | null;
  numero?: string | null;
  extra?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 border-b border-[var(--gtf-tinta)] sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col items-center justify-center gap-0.5 border-b border-[var(--gtf-tinta)] px-3 py-2 text-center sm:border-b-0 sm:border-r">
        <span className="text-base font-bold uppercase leading-tight text-[var(--gtf-tinta)]">{titular || "Titular del talonario"}</span>
        {ruc && <span className="text-sm text-[var(--gtf-tinta)]">RUC. {ruc}</span>}
        {titulo && <span className="font-mono text-base font-bold text-[var(--gtf-tinta)]">{titulo}</span>}
        {ubicacion && <span className="text-sm uppercase text-[var(--gtf-tinta)]">{ubicacion}</span>}
      </div>
      <div className="flex flex-col items-center justify-center gap-1 px-3 py-2">
        <span className="text-center text-lg font-bold uppercase tracking-wide text-[var(--gtf-tinta)]">
          {hoja === "guia" ? "Guía de transporte forestal" : "Lista de trozas"}
        </span>
        <span className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-[var(--gtf-tinta)]">(1)</span>
          {serie && <span className="text-xl font-semibold tabular-nums text-[var(--gtf-tinta)]">{serie}</span>}
          <span className="font-mono text-lg tabular-nums text-[var(--gtf-folio)]">Nº {numero || "—"}</span>
        </span>
        {extra}
      </div>
    </div>
  );
}

/** Tabla con la cara del papel: rayas de tinta y cabecera sombreada. */
export const TABLA_GTF = "w-full border-collapse text-sm";
export const TH_GTF =
  "border border-[var(--gtf-tinta)] bg-[var(--gtf-franja)] px-2 py-1.5 text-center align-middle text-sm font-semibold leading-tight text-[var(--gtf-tinta)]";
export const TD_GTF = "border border-[var(--gtf-linea)] px-2 py-1 align-middle text-[var(--text-primary)]";
/** Celda numérica (diámetros, largo, m³). */
export const TD_NUM_GTF = `${TD_GTF} text-right font-mono tabular-nums`;
/** Celda del N° de fila: impreso en tinta, como en el talonario. */
export const TD_N_GTF = "border border-[var(--gtf-linea)] px-1 py-1 text-center text-sm tabular-nums text-[var(--gtf-tinta)]";
