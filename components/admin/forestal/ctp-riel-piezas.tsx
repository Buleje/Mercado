"use client";

/**
 * ctp-riel-piezas — los botones que las vistas del Libro CTP mandan al riel
 * de las pestañas (`AccionesDeLaVista`).
 *
 * Brandon (2026-10-17): «los botones que están en la página como filtros,
 * opciones, nuevo ingreso y demás se pondrán al lado de las pestañas en la
 * esquina para ocupar menos espacio». A 1280 px con la barra lateral el riel
 * mide 60rem y las pestañas de Operación se llevan ~700 px: lo que va al riel
 * cabe sólo como ícono (o palabra corta). El buscador no entra como campo, así
 * que en el riel es una lupa que abre el campo en la vista.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Search, SlidersHorizontal, X } from "@buleje/design-system/icons";
import { CLASE_TEXTO_ACCION, TextoDeAccion, useEnElLibro } from "@/components/admin/shared/libro-acciones-vista";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";

/** Botón cuadrado de 48 px del riel (lupa, «Sólo las incompletas»…). */
export const BTN_ICONO_RIEL = button({ variant: "secondary", size: "icon", className: "shrink-0 rounded-xl" });

/** Encendido: el mismo acento que Filtros e Indicadores cuando están puestos. */
export const CLASE_ENCENDIDO_RIEL =
  "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]";

/**
 * La acción principal de la vista («Nuevo ingreso», «Nuevo despacho», «Lotes»).
 * Debajo de 80rem de riel el texto pasa a la palabra corta (`TextoDeAccion`).
 */
export const CLASE_PRINCIPAL_RIEL =
  "inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-linear-to-br from-[var(--accent-600)] to-[var(--accent-dark)] px-5 text-base font-semibold text-white shadow-sm transition hover:shadow-md hover:brightness-110 @max-[80rem]/riel:px-4";

/**
 * Rótulo de la acción principal: entero con riel ancho, la palabra corta debajo
 * de 80rem y sólo el ícono debajo de 40rem (celular), con
 * `CLASE_PRINCIPAL_PLEGABLE` en el botón. Regla 6 del panel: compactar a ícono
 * antes que dejar el botón solo en otra fila (a 400 px «Nuevo» bajaba a una
 * segunda fila del riel). El nombre accesible sigue siendo el largo.
 */
export function RotuloPrincipal({ children, corto }: { children: ReactNode; corto: ReactNode }) {
  return (
    <>
      <span className={CLASE_TEXTO_ACCION}>{children}</span>
      <span aria-hidden="true" className="hidden @max-[80rem]/riel:inline @max-[40rem]/riel:hidden">
        {corto}
      </span>
    </>
  );
}

/** Con `RotuloPrincipal`: con menos de 40rem de riel, cuadrado de 48 px. */
export const CLASE_PRINCIPAL_PLEGABLE = "@max-[40rem]/riel:w-12 @max-[40rem]/riel:px-0";

/** Filtros con su rótulo: entero con riel ancho, sólo ícono (+ cuántos) debajo. */
export function BotonFiltrosDelRiel({
  activos,
  abierto,
  panelId,
  onToggle,
}: {
  activos: number;
  abierto: boolean;
  panelId: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={abierto}
      aria-controls={panelId}
      title="Filtros por especie, proveedor y producto"
      className={cn(
        button({ variant: "secondary", className: "shrink-0 rounded-xl" }),
        activos > 0 ? cn(CLASE_ENCENDIDO_RIEL, "@max-[80rem]/riel:px-3") : "@max-[80rem]/riel:w-12 @max-[80rem]/riel:px-0",
        abierto && activos === 0 && "border-[var(--accent)]",
      )}
    >
      <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden />
      <TextoDeAccion>Filtros</TextoDeAccion>
      {activos > 0 && (
        <span className="rounded-full bg-[var(--accent)] px-1.5 text-xs font-bold tabular-nums text-white">{activos}</span>
      )}
    </button>
  );
}

const CAMPO =
  "flex h-12 items-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 transition-colors focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-muted)]";

function escribiendo(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  const tag = el?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!el?.isContentEditable;
}

/**
 * El buscador de una vista. Fuera del libro, `boton` es el campo de siempre y
 * `campo` es `null`. Dentro del libro, `boton` es la lupa del riel y `campo`
 * la fila de búsqueda en la vista: aparece al tocar la lupa (o con `/`) y
 * queda a la vista mientras haya texto — un filtro puesto no se esconde.
 * El `id` del input se conserva: los atajos de la vista lo buscan por id.
 */
export function useBuscarEnRiel({
  id,
  etiqueta,
  placeholder,
  valor,
  onCambiar,
  claseFuera,
  atajo = true,
  tablaConFiltros = false,
}: {
  id: string;
  etiqueta: string;
  placeholder: string;
  valor: string;
  onCambiar: (v: string) => void;
  /** Clases del campo cuando se pinta fuera del libro (su lugar en la fila). */
  claseFuera?: string;
  /** `/` abre la lupa. Apágalo donde el hook vive pero no se pinta. */
  atajo?: boolean;
  /** La tabla ya filtra por columna (Documento, Proveedor, Especies…): en el libro no hay
   *  lupa (Brandon 17-10: «ya tengo en mi tabla filtros y no es necesario»). Si quedó un
   *  texto puesto (URL, otra sesión), el campo se ve igual para poder borrarlo. */
  tablaConFiltros?: boolean;
}): { boton: ReactNode; campo: ReactNode } {
  const enLibro = useEnElLibro();
  const campoId = useId();
  const [abierto, setAbierto] = useState(false);
  const lupaRef = useRef<HTMLButtonElement>(null);
  const enfocar = useRef(false);
  const visible = enLibro && (abierto || valor !== "");

  useEffect(() => {
    if (visible && enfocar.current) {
      enfocar.current = false;
      document.getElementById(id)?.focus();
    }
  }, [visible, id]);

  /* `/` busca. La vista ya enfoca el campo por id, pero con la lupa cerrada
     el campo no existe: acá se abre primero. */
  useEffect(() => {
    if (!enLibro || !atajo || tablaConFiltros) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "/" || ev.ctrlKey || ev.metaKey || ev.altKey || escribiendo(ev.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      ev.preventDefault();
      enfocar.current = true;
      setAbierto(true);
      document.getElementById(id)?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enLibro, atajo, tablaConFiltros, id]);

  const cerrar = () => {
    onCambiar("");
    setAbierto(false);
    lupaRef.current?.focus();
  };

  const input = (
    <>
      <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
      <label htmlFor={id} className="sr-only">
        {etiqueta}
      </label>
      <input
        id={id}
        type="text"
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Escape" || !enLibro) return;
          e.stopPropagation();
          if (valor) onCambiar("");
          else cerrar();
        }}
        placeholder={placeholder}
        className="w-full min-w-0 bg-transparent text-base text-[var(--text-primary)] outline-none"
      />
      {(valor || enLibro) && (
        <button
          type="button"
          onClick={() => (enLibro ? cerrar() : onCambiar(""))}
          aria-label={enLibro ? "Limpiar y cerrar la búsqueda" : "Limpiar búsqueda"}
          className="shrink-0 rounded-full p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </>
  );

  if (!enLibro) return { boton: <div className={cn(CAMPO, claseFuera)}>{input}</div>, campo: null };

  return {
    boton: tablaConFiltros ? null : (
      <button
        ref={lupaRef}
        type="button"
        onClick={() => {
          if (visible) {
            document.getElementById(id)?.focus();
            return;
          }
          enfocar.current = true;
          setAbierto(true);
        }}
        aria-expanded={visible}
        aria-controls={campoId}
        aria-label={valor ? `${etiqueta}: «${valor}»` : etiqueta}
        title={`${etiqueta} (atajo: /)`}
        className={cn(BTN_ICONO_RIEL, "relative", valor && CLASE_ENCENDIDO_RIEL)}
      >
        <Search className="h-4 w-4" aria-hidden />
        {valor && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[var(--accent)]" aria-hidden />}
      </button>
    ),
    campo: visible ? (
      <div id={campoId} role="search" className={CAMPO}>
        {input}
      </div>
    ) : null,
  };
}
