"use client";

/**
 * BarraHerramientas — el formato y las operaciones de la planilla.
 *
 * Se ofrece lo que realmente se usa en una lista de precios o un catálogo:
 * negrita/cursiva, alineación, color de letra y de relleno, formato de moneda
 * y porcentaje, insertar y eliminar filas y columnas, y autosuma. Todo aplica
 * sobre la selección, sea una celda o un rango.
 */

import { useState } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDownAZ, ArrowUpAZ, Bold, CalendarDays, Combine,
  Filter, Grid3x3, Italic, Paintbrush, Palette, Percent, Plus, Redo2, Search, Sigma,
  Snowflake, Trash2, Underline, Undo2, Wand2,
} from "@buleje/design-system/icons";
import type { CambioFormato } from "@/lib/documentos/xlsx-estilos";
import { ajustarDecimales, FORMATOS } from "@/lib/documentos/xlsx-estilos";

/** Paleta corta: los colores que se usan para marcar filas en una planilla. */
const COLORES = [
  "#ffffff", "#f3f4f6", "#fee2e2", "#fef3c7", "#dcfce7", "#dbeafe", "#f3e8ff",
  "#111827", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#2563eb", "#7c3aed",
];

export interface AccionesBarra {
  formato: (f: CambioFormato) => void;
  ordenar: (direccion: "asc" | "desc") => void;
  filtrar: () => void;
  insertar: (eje: "fila" | "columna") => void;
  eliminar: (eje: "fila" | "columna") => void;
  autosuma: () => void;
  combinar: () => void;
  congelar: () => void;
  deshacer: () => void;
  rehacer: () => void;
  buscar: () => void;
  /** Pintar por regla ("todo lo que baje de 5"). */
  regla: () => void;
}

const BOTON = "flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:opacity-35 disabled:hover:bg-transparent";

/** Tamaños de letra que ofrece Excel en su propia barra. */
const TAMANOS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36];

export default function BarraHerramientas({
  acciones, puede, etiquetaSeleccion, tamanoSeleccion = 11, numFmtSeleccion,
}: {
  acciones: AccionesBarra;
  puede: { deshacer: boolean; rehacer: boolean };
  etiquetaSeleccion: string;
  /** Tamaño de letra de la celda seleccionada, para mostrarlo en el selector. */
  tamanoSeleccion?: number;
  /** Formato numérico de la celda seleccionada — base de los botones ±decimal. */
  numFmtSeleccion?: string;
}) {
  const [paleta, setPaleta] = useState<"letra" | "fondo" | null>(null);

  return (
    <div className="relative flex flex-wrap items-center gap-0.5 border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 py-1">
      <button type="button" className={BOTON} onClick={acciones.deshacer} disabled={!puede.deshacer} title="Deshacer (Ctrl+Z)">
        <Undo2 className="h-4 w-4" aria-hidden /><span className="sr-only">Deshacer</span>
      </button>
      <button type="button" className={BOTON} onClick={acciones.rehacer} disabled={!puede.rehacer} title="Rehacer (Ctrl+Y)">
        <Redo2 className="h-4 w-4" aria-hidden /><span className="sr-only">Rehacer</span>
      </button>

      <Separador />

      <button type="button" className={BOTON} onClick={() => acciones.formato({ negrita: true })} title="Negrita (Ctrl+B)">
        <Bold className="h-4 w-4" aria-hidden /><span className="sr-only">Negrita</span>
      </button>
      <button type="button" className={BOTON} onClick={() => acciones.formato({ cursiva: true })} title="Cursiva (Ctrl+I)">
        <Italic className="h-4 w-4" aria-hidden /><span className="sr-only">Cursiva</span>
      </button>
      <button type="button" className={BOTON} onClick={() => acciones.formato({ subrayado: true })} title="Subrayado (Ctrl+U)">
        <Underline className="h-4 w-4" aria-hidden /><span className="sr-only">Subrayado</span>
      </button>
      <select
        value={String(tamanoSeleccion)}
        onChange={(e) => acciones.formato({ tamano: Number(e.target.value) })}
        title="Tamaño de letra"
        aria-label="Tamaño de letra"
        className="h-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-1 text-xs font-bold text-[var(--text-secondary)] outline-none hover:bg-[var(--surface-sunken)]"
      >
        {(TAMANOS.includes(tamanoSeleccion) ? TAMANOS : [...TAMANOS, tamanoSeleccion].sort((a, b) => a - b)).map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      <Separador />

      <button type="button" className={BOTON} onClick={() => setPaleta(paleta === "letra" ? null : "letra")} title="Color de letra">
        <Palette className="h-4 w-4" aria-hidden /><span className="sr-only">Color de letra</span>
      </button>
      <button type="button" className={BOTON} onClick={() => setPaleta(paleta === "fondo" ? null : "fondo")} title="Color de relleno">
        <Paintbrush className="h-4 w-4" aria-hidden /><span className="sr-only">Color de relleno</span>
      </button>

      <Separador />

      {([["left", AlignLeft, "Alinear a la izquierda"], ["center", AlignCenter, "Centrar"], ["right", AlignRight, "Alinear a la derecha"]] as const).map(
        ([valor, Icono, titulo]) => (
          <button key={valor} type="button" className={BOTON} onClick={() => acciones.formato({ alineacion: valor })} title={titulo}>
            <Icono className="h-4 w-4" aria-hidden /><span className="sr-only">{titulo}</span>
          </button>
        ))}
      <button type="button" className={BOTON} onClick={() => acciones.formato({ bordes: true })} title="Poner todos los bordes">
        <Grid3x3 className="h-4 w-4" aria-hidden /><span className="sr-only">Todos los bordes</span>
      </button>
      <button type="button" className={BOTON} onClick={acciones.combinar} title="Combinar o separar las celdas seleccionadas">
        <Combine className="h-4 w-4" aria-hidden /><span className="sr-only">Combinar o separar celdas</span>
      </button>
      <button type="button" className={BOTON} onClick={acciones.congelar} title="Congelar los paneles en la celda seleccionada (o descongelar)">
        <Snowflake className="h-4 w-4" aria-hidden /><span className="sr-only">Congelar o descongelar paneles</span>
      </button>

      <Separador />

      <button type="button" className={`${BOTON} w-auto px-2 text-sm font-bold`} onClick={() => acciones.formato({ numFmt: FORMATOS.moneda })} title="Formato de moneda">
        S/
      </button>
      <button type="button" className={BOTON} onClick={() => acciones.formato({ numFmt: FORMATOS.porcentaje })} title="Formato de porcentaje">
        <Percent className="h-4 w-4" aria-hidden /><span className="sr-only">Porcentaje</span>
      </button>
      <button type="button" className={BOTON} onClick={() => acciones.formato({ numFmt: FORMATOS.fecha })} title="Formato de fecha (dd/mm/aaaa)">
        <CalendarDays className="h-4 w-4" aria-hidden /><span className="sr-only">Formato de fecha</span>
      </button>
      <button type="button" className={`${BOTON} w-auto px-1.5 text-xs font-bold`} onClick={() => acciones.formato({ numFmt: ajustarDecimales(numFmtSeleccion, 1) })} title="Más decimales">
        +,0<span className="sr-only"> más decimales</span>
      </button>
      <button type="button" className={`${BOTON} w-auto px-1.5 text-xs font-bold`} onClick={() => acciones.formato({ numFmt: ajustarDecimales(numFmtSeleccion, -1) })} title="Menos decimales">
        −,0<span className="sr-only"> menos decimales</span>
      </button>
      <button type="button" className={`${BOTON} w-auto px-2 text-xs font-bold`} onClick={() => acciones.formato({ numFmt: null, fondo: null, bordes: null, negrita: false, cursiva: false, subrayado: false })} title="Quitar el formato de la selección">
        Limpiar
      </button>

      <Separador />

      <button type="button" className={BOTON} onClick={acciones.autosuma} title="Sumar la columna y poner el total abajo">
        <Sigma className="h-4 w-4" aria-hidden /><span className="sr-only">Autosuma</span>
      </button>
      <button type="button" className={BOTON} onClick={acciones.regla} title="Resaltar las celdas que cumplen una regla">
        <Wand2 className="h-4 w-4" aria-hidden /><span className="sr-only">Resaltar por regla</span>
      </button>
      <button type="button" className={BOTON} onClick={acciones.buscar} title="Buscar y reemplazar (Ctrl+F)">
        <Search className="h-4 w-4" aria-hidden /><span className="sr-only">Buscar</span>
      </button>

      <Separador />

      <button type="button" className={BOTON} onClick={() => acciones.ordenar("asc")} title="Ordenar de menor a mayor por la columna seleccionada">
        <ArrowDownAZ className="h-4 w-4" aria-hidden /><span className="sr-only">Ordenar ascendente</span>
      </button>
      <button type="button" className={BOTON} onClick={() => acciones.ordenar("desc")} title="Ordenar de mayor a menor por la columna seleccionada">
        <ArrowUpAZ className="h-4 w-4" aria-hidden /><span className="sr-only">Ordenar descendente</span>
      </button>
      <button type="button" className={BOTON} onClick={acciones.filtrar} title="Filtrar por los valores de la columna seleccionada">
        <Filter className="h-4 w-4" aria-hidden /><span className="sr-only">Filtrar</span>
      </button>

      <Separador />

      <button type="button" className={`${BOTON} w-auto gap-1 px-2 text-xs font-bold`} onClick={() => acciones.insertar("fila")} title="Insertar una fila encima de la selección">
        <Plus className="h-3.5 w-3.5" aria-hidden /> Fila
      </button>
      <button type="button" className={`${BOTON} w-auto gap-1 px-2 text-xs font-bold`} onClick={() => acciones.insertar("columna")} title="Insertar una columna a la izquierda de la selección">
        <Plus className="h-3.5 w-3.5" aria-hidden /> Col
      </button>
      <button type="button" className={`${BOTON} w-auto gap-1 px-2 text-xs font-bold hover:text-[var(--data-error-600)]`} onClick={() => acciones.eliminar("fila")} title="Eliminar la fila de la selección">
        <Trash2 className="h-3.5 w-3.5" aria-hidden /> Fila
      </button>
      <button type="button" className={`${BOTON} w-auto gap-1 px-2 text-xs font-bold hover:text-[var(--data-error-600)]`} onClick={() => acciones.eliminar("columna")} title="Eliminar la columna de la selección">
        <Trash2 className="h-3.5 w-3.5" aria-hidden /> Col
      </button>

      <span className="ml-auto pr-1 text-xs font-semibold text-[var(--text-tertiary)]">{etiquetaSeleccion}</span>

      {paleta && (
        <div className="absolute left-2 top-full z-40 mt-1 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 shadow-[var(--shadow-lg)]">
          <p className="mb-1.5 text-xs font-bold text-[var(--text-secondary)]">
            {paleta === "letra" ? "Color de letra" : "Color de relleno"}
          </p>
          <div className="grid grid-cols-7 gap-1">
            {COLORES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  acciones.formato(paleta === "letra" ? { color: c } : { fondo: c });
                  setPaleta(null);
                }}
                style={{ backgroundColor: c }}
                title={c}
                className="h-6 w-6 rounded border border-[var(--rule-strong)]"
              >
                <span className="sr-only">{c}</span>
              </button>
            ))}
          </div>
          {paleta === "fondo" && (
            <button
              type="button"
              onClick={() => { acciones.formato({ fondo: null }); setPaleta(null); }}
              className="mt-2 w-full rounded-lg border border-[var(--rule-base)] px-2 py-1 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
            >
              Sin relleno
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Separador() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-[var(--rule-base)]" />;
}
