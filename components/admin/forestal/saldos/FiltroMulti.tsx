"use client";

/**
 * Un recorte de la capacidad que admite VARIOS valores (Brandon, 2026-09-08).
 *
 * Era un `<select>`: un permiso o todos. Pero la pregunta real del patio es «de
 * estos cinco permisos que tienen tornillo, ¿cuánto sale de tres?», y con un
 * solo valor había que sumarlos a mano en tres pasadas.
 *
 * Por qué un menú con casillas y no un `<select multiple>`: el nativo obliga a
 * ctrl-click para sumar —y en móvil directamente no se entiende—, no deja ver
 * cuánta madera hay detrás de cada opción y pierde la selección al primer click
 * distraído. Acá cada línea dice sus m³ y sus piezas, tildar suma y destildar
 * saca.
 *
 * El botón dice lo elegido: el valor cuando es uno («TORNILLO»), y «3 de 11»
 * cuando son varios — un contador sin el total no deja saber si falta tildar.
 */

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { OpcionFiltro } from "@/lib/forestal/capacidad-de-planta";

/** Con más opciones que esto aparece el buscador: 20 guías no se leen de un vistazo. */
const CON_BUSCADOR_DESDE = 8;

export default function FiltroMulti({
  etiqueta,
  valores,
  opciones,
  todos,
  onAlternar,
  onLimpiar,
}: {
  etiqueta: string;
  /** Lo elegido hoy. Vacío = todos. */
  valores: readonly string[];
  opciones: OpcionFiltro[];
  /** Qué decir cuando no hay nada elegido: «Todos los permisos». */
  todos: string;
  onAlternar: (valor: string) => void;
  onLimpiar: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busca, setBusca] = useState("");
  const caja = useRef<HTMLDivElement>(null);

  /* Cerrar al click afuera y con Escape — mismo comportamiento que el menú de
     columnas, para que los dos menús del módulo se usen igual. */
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    window.addEventListener("mousedown", fuera);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", fuera);
      window.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  /* Se dibuja si hay opciones O si ya hay algo elegido: con un filtro que llegó
     por la URL y el patio todavía cargando, las opciones están vacías y sin
     esto el filtro quedaba invisible — imposible de ver y de quitar. */
  if (opciones.length === 0 && valores.length === 0) return null;

  const q = busca.trim().toLowerCase();
  const visibles = q ? opciones.filter((o) => o.valor.toLowerCase().includes(q)) : opciones;
  /* Lo elegido que ya no figura entre las opciones (un link viejo, o datos que
     aún no llegaron) se muestra igual: un menú que no lista un filtro activo es
     un filtro fantasma, imposible de destildar. */
  const huerfanos = valores.filter((v) => !opciones.some((o) => o.valor === v));
  const resumen =
    valores.length === 0 ? todos : valores.length === 1 ? valores[0] : `${valores.length} de ${opciones.length}`;

  return (
    <div className="relative" ref={caja}>
      <label className="flex items-center gap-2 text-xs">
        <span className="font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          {etiqueta}
        </span>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          title={valores.length > 1 ? valores.join(" · ") : undefined}
          className={`inline-flex h-9 w-56 max-w-full items-center justify-between gap-2 rounded-lg border px-2 text-sm font-medium transition-colors ${
            valores.length > 0
              ? "border-[var(--accent)] bg-primary/5 text-[var(--accent-ink)] dark:text-[var(--accent)]"
              : "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)]"
          }`}
        >
          <span className="truncate">{resumen}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
        </button>
      </label>

      {abierto && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 max-w-[90vw] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 shadow-[var(--shadow-lg)]">
          <div className="flex items-center justify-between gap-2 px-1 pb-1">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              {etiqueta}
            </p>
            {valores.length > 0 && (
              <button
                type="button"
                onClick={onLimpiar}
                className="text-[length:var(--ts-2xs)] font-bold text-[var(--accent-dark)] underline underline-offset-2 dark:text-[var(--accent)]"
              >
                Quitar
              </button>
            )}
          </div>

          {opciones.length >= CON_BUSCADOR_DESDE && (
            <div className="mb-1 flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar…"
                aria-label={`Buscar en ${etiqueta}`}
                className="h-8 w-full bg-transparent text-sm text-[var(--text-primary)] outline-none"
              />
              {busca && (
                <button type="button" onClick={() => setBusca("")} aria-label="Limpiar la búsqueda">
                  <X className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                </button>
              )}
            </div>
          )}

          <div className="max-h-64 overflow-auto">
            {huerfanos.map((v) => (
              <label
                key={v}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
              >
                <input
                  type="checkbox"
                  checked
                  onChange={() => onAlternar(v)}
                  className="h-4 w-4 shrink-0 rounded border border-[var(--rule-base)] accent-[var(--accent)]"
                />
                <span className="truncate">{v}</span>
                <span className="ml-auto shrink-0 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                  sin madera hoy
                </span>
              </label>
            ))}
            {visibles.map((o) => {
              const tildado = valores.includes(o.valor);
              return (
                <label
                  key={o.valor}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                >
                  <input
                    type="checkbox"
                    checked={tildado}
                    onChange={() => onAlternar(o.valor)}
                    className="h-4 w-4 shrink-0 rounded border border-[var(--rule-base)] accent-[var(--accent)]"
                  />
                  <span className="truncate" title={o.valor}>
                    {o.valor}
                  </span>
                  {/* Cuánta madera hay detrás: un permiso con 0.4 m³ y otro con
                      40 se eligen distinto. */}
                  <span className="ml-auto shrink-0 font-mono tabular-nums text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                    {fmtM3(o.m3)} m³ ({o.piezas})
                  </span>
                </label>
              );
            })}
            {visibles.length === 0 && huerfanos.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-[var(--text-tertiary)]">
                {q ? "Nada con ese texto." : "Sin opciones con los otros filtros puestos."}
              </p>
            )}
          </div>

          {valores.length > 0 && (
            <p className="flex items-start gap-1 border-t border-[var(--rule-soft)] px-1 pt-1.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
              <Check className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              <span>
                {valores.length === 1
                  ? "Se muestra sólo lo de ese valor."
                  : `Se suman los ${valores.length} elegidos.`}
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
