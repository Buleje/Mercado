"use client";

/**
 * MenuContextual — el clic derecho de la planilla.
 *
 * Todo lo que hay acá está también en la barra o en un atajo; la diferencia es
 * que aparece DONDE está el mouse, sobre la celda que se quiere tocar. Para
 * insertar una fila en el medio de un catálogo largo eso es la diferencia
 * entre un gesto y tres.
 */

import { useEffect, useRef } from "react";
import {
  ArrowDownAZ, ArrowUpAZ, Copy, Filter, Plus, Scissors, Trash2,
} from "@buleje/design-system/icons";

export interface OpcionesMenu {
  copiar: () => void;
  cortar: () => void;
  pegar: () => void;
  insertarFila: () => void;
  insertarColumna: () => void;
  eliminarFila: () => void;
  eliminarColumna: () => void;
  ordenar: (direccion: "asc" | "desc") => void;
  filtrar: () => void;
  limpiar: () => void;
}

export default function MenuContextual({
  x, y, columna, opciones, onCerrar,
}: {
  x: number;
  y: number;
  /** Letra de la columna, para nombrar las acciones que la afectan. */
  columna: string;
  opciones: OpcionesMenu;
  onCerrar: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onCerrar();
    };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    // `capture` para cerrarlo antes de que el clic haga otra cosa.
    document.addEventListener("mousedown", fuera, true);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", fuera, true);
      document.removeEventListener("keydown", escape);
    };
  }, [onCerrar]);

  // Si el menú no entra hacia abajo o a la derecha, se abre para el otro lado.
  const ancho = 232, altoAprox = 330;
  const izq = typeof window !== "undefined" && x + ancho > window.innerWidth ? x - ancho : x;
  const arriba = typeof window !== "undefined" && y + altoAprox > window.innerHeight
    ? Math.max(8, y - altoAprox)
    : y;

  const ejecutar = (fn: () => void) => () => { fn(); onCerrar(); };

  return (
    <div
      ref={ref}
      role="menu"
      style={{ left: izq, top: arriba, width: ancho }}
      className="fixed z-50 overflow-hidden rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] py-1 shadow-[var(--shadow-lg)]"
    >
      <Item icono={Copy} texto="Copiar" atajo="Ctrl+C" onClick={ejecutar(opciones.copiar)} />
      <Item icono={Scissors} texto="Cortar" atajo="Ctrl+X" onClick={ejecutar(opciones.cortar)} />
      <Item icono={Copy} texto="Pegar" atajo="Ctrl+V" onClick={ejecutar(opciones.pegar)} />

      <Separador />

      <Item icono={Plus} texto="Insertar fila encima" onClick={ejecutar(opciones.insertarFila)} />
      <Item icono={Plus} texto={`Insertar columna en ${columna}`} onClick={ejecutar(opciones.insertarColumna)} />
      <Item icono={Trash2} texto="Eliminar la fila" peligro onClick={ejecutar(opciones.eliminarFila)} />
      <Item icono={Trash2} texto={`Eliminar la columna ${columna}`} peligro onClick={ejecutar(opciones.eliminarColumna)} />

      <Separador />

      <Item icono={ArrowDownAZ} texto={`Ordenar por ${columna} (A→Z)`} onClick={ejecutar(() => opciones.ordenar("asc"))} />
      <Item icono={ArrowUpAZ} texto={`Ordenar por ${columna} (Z→A)`} onClick={ejecutar(() => opciones.ordenar("desc"))} />
      <Item icono={Filter} texto={`Filtrar por ${columna}`} onClick={ejecutar(opciones.filtrar)} />

      <Separador />

      <Item icono={Trash2} texto="Borrar el contenido" atajo="Supr" onClick={ejecutar(opciones.limpiar)} />
    </div>
  );
}

function Item({
  icono: Icono, texto, atajo, peligro, onClick,
}: {
  icono: React.ComponentType<{ className?: string }>;
  texto: string;
  atajo?: string;
  peligro?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition hover:bg-[var(--surface-sunken)] ${
        peligro ? "text-[var(--data-error-600)] dark:text-[var(--data-error-500)]" : "text-[var(--text-primary)]"
      }`}
    >
      <Icono className="h-4 w-4 shrink-0 opacity-70" />
      <span className="flex-1 truncate">{texto}</span>
      {atajo && <span className="shrink-0 text-xs text-[var(--text-tertiary)]">{atajo}</span>}
    </button>
  );
}

function Separador() {
  return <div aria-hidden className="my-1 h-px bg-[var(--rule-base)]" />;
}
