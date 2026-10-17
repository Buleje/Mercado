"use client";

/**
 * Los filtros de permiso y especie de «Volumen disponible», pegados a la tabla
 * que filtran (ley de organización 5; Brandon 17-10). Con pocas opciones son
 * chips (un toque); con muchas, un desplegable con búsqueda: veinte especies
 * en chips eran tres filas antes de llegar a la tabla.
 *
 * Sólo aparece si hay entre qué elegir: con todo «sin permiso» (o uno solo) no
 * filtra nada. Con algo puesto se queda SIEMPRE: si esa madera se despachó
 * entera, «Todos» es la única salida de una pantalla en cero.
 */

import { useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Search, X } from "@buleje/design-system/icons";
import { usePopoverCabecera } from "@/components/admin/shared/filtros-columna";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { OpcionPermiso } from "@/lib/forestal/volumen-disponible";

/** Hasta cuántas opciones van en chips; más, desplegable. */
const CHIPS_HASTA = 3;
/** Desde cuántas opciones el desplegable trae buscador. */
const BUSCAR_DESDE = 7;

export const muestraFiltro = (opciones: readonly OpcionPermiso[], elegidos: readonly string[]) =>
  opciones.length >= 2 || elegidos.length > 0;

interface Props {
  titulo: string;
  /** «Todos» o «Todas». */
  todos: string;
  opciones: readonly OpcionPermiso[];
  elegidos: readonly string[];
  onAlternar: (clave: string) => void;
  onTodos: () => void;
}

const color = (activo: boolean) =>
  activo
    ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
    : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--accent)]";

export function FiltroDeVolumen(props: Props) {
  if (!muestraFiltro(props.opciones, props.elegidos)) return null;
  return props.opciones.length <= CHIPS_HASTA ? <Chips {...props} /> : <Desplegable {...props} />;
}

function Chips({ titulo, todos, opciones, elegidos, onAlternar, onTodos }: Props) {
  const chip = "inline-flex h-10 items-center gap-1.5 rounded-xl border-2 px-3 text-sm font-bold transition-colors";
  return (
    <div role="group" aria-label={`Filtrar por ${titulo.toLowerCase()}`} className="flex flex-wrap items-center gap-1.5">
      <span className="text-sm font-bold text-[var(--text-secondary)]">{titulo}</span>
      <button type="button" onClick={onTodos} aria-pressed={elegidos.length === 0} className={`${chip} ${color(elegidos.length === 0)}`}>
        {todos}
      </button>
      {opciones.map((o) => {
        const activo = elegidos.includes(o.clave);
        return (
          <button
            key={o.clave || "sin-nombre"}
            type="button"
            onClick={() => onAlternar(o.clave)}
            aria-pressed={activo}
            className={`${chip} ${color(activo)}`}
          >
            {o.etiqueta}
            <span className="font-normal tabular-nums text-[var(--text-secondary)]">{fmtM3(o.m3)} m³</span>
          </button>
        );
      })}
    </div>
  );
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function Desplegable({ titulo, todos, opciones, elegidos, onAlternar, onTodos }: Props) {
  const conBuscador = opciones.length >= BUSCAR_DESDE;
  /* El alto que de verdad ocupa (buscador + «Todas» + hasta 256 px de lista):
     con 360 fijo, dos especies abrían hacia arriba, tapando las tarjetas. */
  const alto = (conBuscador ? 44 : 0) + 40 + Math.min(256, opciones.length * 40) + 14;
  const { ref, alAbrir, estilo } = usePopoverCabecera(alto, 288);
  const [buscar, setBuscar] = useState("");
  const q = sinTildes(buscar.trim());
  const visibles = q ? opciones.filter((o) => sinTildes(o.etiqueta).includes(q)) : opciones;
  const nombre = (k: string) => opciones.find((o) => o.clave === k)?.etiqueta ?? k;
  const rotulo =
    elegidos.length === 0 ? todos : elegidos.length === 1 ? nombre(elegidos[0]) : `${elegidos.length} elegidas`;
  const cerrarConEscape = (e: KeyboardEvent<HTMLDetailsElement>) => {
    if (e.key !== "Escape" || !ref.current?.open) return;
    e.stopPropagation();
    ref.current.open = false;
    ref.current.querySelector("summary")?.focus();
  };
  return (
    <details ref={ref} onToggle={alAbrir} onKeyDown={cerrarConEscape} className="relative">
      <summary
        aria-label={`Filtrar por ${titulo.toLowerCase()}: ${elegidos.length ? elegidos.map(nombre).join(", ") : todos}`}
        title={elegidos.length ? elegidos.map(nombre).join(" · ") : `Filtrar por ${titulo.toLowerCase()}`}
        className={`inline-flex h-12 max-w-72 cursor-pointer list-none items-center gap-1.5 rounded-xl border-2 px-3 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent)] [&::-webkit-details-marker]:hidden ${color(elegidos.length > 0)}`}
      >
        <span className="text-[var(--text-secondary)]">{titulo}:</span>
        <span className="truncate">{rotulo}</span>
        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
      </summary>
      <div
        role="group"
        aria-label={`Elegir ${titulo.toLowerCase()}`}
        style={estilo}
        className="z-50 w-72 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--shadow-lg)]"
      >
        {conBuscador && (
          /* El borde del campo es el anillo de foco: el global del input dibujaba otro adentro. */
          <label className="mb-1 flex h-10 items-center gap-2 rounded-lg border border-[var(--rule-base)] px-2.5 focus-within:border-[var(--accent)] focus-within:ring-1 focus-within:ring-[var(--accent)]">
            <Search className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden />
            <input
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder={`Buscar ${titulo.toLowerCase()}`}
              aria-label={`Buscar ${titulo.toLowerCase()}`}
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus-visible:ring-0! focus-visible:ring-offset-0! focus-visible:outline-none!"
            />
          </label>
        )}
        <button
          type="button"
          onClick={onTodos}
          aria-pressed={elegidos.length === 0}
          className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
        >
          {elegidos.length === 0 ? <Check className="h-4 w-4 text-[var(--accent)]" aria-hidden /> : <X className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />}
          {elegidos.length === 0 ? todos : `${todos} (quitar ${elegidos.length})`}
        </button>
        <div className="max-h-64 overflow-y-auto">
          {visibles.length === 0 && <p className="px-2 py-2 text-sm text-[var(--text-secondary)]">Nada con «{buscar}».</p>}
          {visibles.map((o) => {
            const marcado = elegidos.includes(o.clave);
            return (
              <label
                key={o.clave || "sin-nombre"}
                className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm transition-colors hover:bg-[var(--surface-sunken)] ${marcado ? "bg-primary/10 font-bold text-[var(--text-primary)]" : "text-[var(--text-primary)]"}`}
              >
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() => onAlternar(o.clave)}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
                />
                <span className="min-w-0 flex-1 truncate" title={o.etiqueta}>{o.etiqueta}</span>
                <span className="shrink-0 tabular-nums text-[var(--text-secondary)]">{fmtM3(o.m3)} m³</span>
              </label>
            );
          })}
        </div>
      </div>
    </details>
  );
}
