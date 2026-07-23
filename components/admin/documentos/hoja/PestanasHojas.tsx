"use client";

/**
 * PestanasHojas — la fila de pestañas del libro, con la gestión de hojas.
 *
 * Como en Excel: clic cambia de hoja, doble clic renombra, clic derecho abre
 * el menú (renombrar, duplicar, eliminar) y el "+" agrega una hoja nueva.
 *
 * El menú se dibuja con `position: fixed` desde las coordenadas del clic para
 * escapar del `overflow-x` de la propia barra (patrón RowActions del drive).
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Copy, Pencil, Plus, Trash2 } from "@buleje/design-system/icons";

export interface AccionesHojas {
  activar: (indice: number) => void;
  nueva: () => void;
  renombrar: (indice: number, nombre: string) => void;
  duplicar: (indice: number) => void;
  eliminar: (indice: number) => void;
}

export default function PestanasHojas({
  hojas, activa, acciones,
}: {
  hojas: { nombre: string; oculta: boolean }[];
  activa: number;
  acciones: AccionesHojas;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number; indice: number } | null>(null);
  const [renombrando, setRenombrando] = useState<{ indice: number; valor: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menu) return;
    const cerrar = () => setMenu(null);
    window.addEventListener("click", cerrar);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    return () => {
      window.removeEventListener("click", cerrar);
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
    };
  }, [menu]);

  // Foco síncrono al abrir el input: con rAF se pierden las primeras teclas.
  useLayoutEffect(() => {
    if (renombrando) inputRef.current?.select();
  }, [renombrando?.indice]); // eslint-disable-line react-hooks/exhaustive-deps -- re-foco sólo al cambiar de pestaña

  const confirmarRenombre = () => {
    if (!renombrando) return;
    const nombre = renombrando.valor.trim();
    const actual = hojas[renombrando.indice]?.nombre ?? "";
    setRenombrando(null);
    if (nombre !== "" && nombre !== actual) acciones.renombrar(renombrando.indice, nombre);
  };

  const ITEM = "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]";

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-t-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1.5">
      {hojas.map((h, i) => h.oculta ? null : (
        renombrando?.indice === i ? (
          <input
            key={`ren-${i}`}
            ref={inputRef}
            value={renombrando.valor}
            maxLength={31}
            aria-label={`Nuevo nombre para la hoja ${h.nombre}`}
            onChange={(e) => setRenombrando({ indice: i, valor: e.target.value })}
            onBlur={confirmarRenombre}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmarRenombre();
              if (e.key === "Escape") setRenombrando(null);
            }}
            className="w-32 shrink-0 rounded-lg border-2 border-[var(--accent)] bg-[var(--surface-canvas)] px-2 py-1 text-xs font-bold text-[var(--text-primary)] outline-none"
          />
        ) : (
          <button
            key={h.nombre + i}
            type="button"
            onClick={() => acciones.activar(i)}
            onDoubleClick={() => setRenombrando({ indice: i, valor: h.nombre })}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY, indice: i });
            }}
            title={`${h.nombre} — doble clic para renombrar, clic derecho para más opciones`}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              i === activa ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
            }`}
          >
            {h.nombre}
          </button>
        )
      ))}

      <button
        type="button"
        onClick={acciones.nueva}
        title="Hoja nueva"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
      >
        <Plus className="h-4 w-4" aria-hidden />
        <span className="sr-only">Hoja nueva</span>
      </button>

      {menu && (
        <div
          role="menu"
          style={{ position: "fixed", left: menu.x, top: Math.max(8, menu.y - 132), zIndex: 50 }}
          className="w-44 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--shadow-lg)]"
        >
          <button type="button" role="menuitem" className={ITEM}
            onClick={() => { setRenombrando({ indice: menu.indice, valor: hojas[menu.indice]?.nombre ?? "" }); setMenu(null); }}>
            <Pencil className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden /> Renombrar
          </button>
          <button type="button" role="menuitem" className={ITEM}
            onClick={() => { acciones.duplicar(menu.indice); setMenu(null); }}>
            <Copy className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden /> Duplicar
          </button>
          <button type="button" role="menuitem"
            className={`${ITEM} text-[var(--data-error-600)] dark:text-[var(--data-error-500)]`}
            onClick={() => { acciones.eliminar(menu.indice); setMenu(null); }}>
            <Trash2 className="h-4 w-4" aria-hidden /> Eliminar hoja
          </button>
        </div>
      )}
    </div>
  );
}
