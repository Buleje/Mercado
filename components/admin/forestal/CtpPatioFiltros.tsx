"use client";

/**
 * La barra de filtros del patio — una sola, y de una sola fila (ADR-347).
 *
 * Antes había dos barras: el selector de lote arriba y los del patio dentro de
 * la tabla. Se unificaron (ADR-345), pero quedaron tres renglones de campos: en
 * una pantalla de 900px de alto, la tabla —lo único que se mira— arrancaba a
 * media pantalla.
 *
 * Ahora arriba va **sólo lo que se usa siempre**: el lote, el día y la búsqueda.
 * El resto —especie, guía, permiso, resolución, proveedor— vive detrás de
 * «Filtros», con un contador de cuántos están puestos, y lo que esté activo se
 * muestra como **chip que se saca de un click**: nunca hay un filtro escondido
 * que explique por qué falta madera.
 */

import { useState } from "react";
import { Search, SlidersHorizontal, X } from "@buleje/design-system/icons";
import type { EstadoFiltroPatio } from "./hooks/use-filtro-patio";

const CAMPO =
  "h-12 w-full rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

/** Un `<select>` que sólo aparece si hay algo que elegir. */
function Filtro({
  valor,
  onCambio,
  etiqueta,
  todos,
  opciones,
}: {
  valor: string;
  onCambio: (v: string) => void;
  etiqueta: string;
  todos: string;
  opciones: readonly string[];
}) {
  if (opciones.length === 0) return null;
  return (
    <select value={valor} onChange={(e) => onCambio(e.target.value)} aria-label={etiqueta} className={CAMPO}>
      <option value="">{todos}</option>
      {opciones.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/**
 * Guía de ingreso: checkboxes y no un `<select>` (Brandon, 2026-09-01: "de esas
 * 3 quiero filtrar 2 al mismo tiempo") — comparar dos guías a la vez es el caso
 * real, y un single-select obligaba a mirar el patio dos veces y sumar a mano.
 */
function FiltroGuias({
  valor,
  onCambio,
  opciones,
}: {
  valor: readonly string[];
  onCambio: (v: string[]) => void;
  opciones: readonly string[];
}) {
  if (opciones.length === 0) return null;
  const elegidas = new Set(valor);
  return (
    <div
      role="group"
      aria-label="Filtrar por guía de ingreso"
      className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-2"
    >
      <p className="mb-1 px-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        Guía de ingreso
      </p>
      <div className="flex max-h-32 flex-col gap-0.5 overflow-y-auto">
        {opciones.map((g) => (
          <label
            key={g}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
          >
            <input
              type="checkbox"
              checked={elegidas.has(g)}
              onChange={(e) => onCambio(e.target.checked ? [...valor, g] : valor.filter((x) => x !== g))}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            {g}
          </label>
        ))}
      </div>
    </div>
  );
}

/** Lo puesto, a la vista y con su cruz. Un filtro que no se ve no se saca. */
function Chip({ texto, onQuitar }: { texto: string; onQuitar: () => void }) {
  return (
    <button
      type="button"
      onClick={onQuitar}
      title="Quitar este filtro"
      className="inline-flex items-center gap-1 rounded-full border-2 border-[var(--accent)] bg-primary/10 px-2.5 py-1 text-sm font-bold text-[var(--accent-ink)] transition-colors hover:bg-primary/20 dark:text-[var(--accent)]"
    >
      {texto}
      <X className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

export default function CtpPatioFiltros({
  filtro,
  /** Los controles de la acción —lote y fecha—: van PRIMEROS y en la misma fila. */
  accion,
  /**
   * Especie, guía y permiso ya se filtran desde la cabecera de su columna en la
   * tabla de abajo (estilo Excel, Brandon 2026-09-03). Con esto, acá sólo se
   * dibujan en móvil —donde la tabla es otra— y el panel se queda con lo que
   * no tiene columna: resolución y proveedor.
   */
  enCabecera = false,
}: {
  filtro: EstadoFiltroPatio;
  accion?: React.ReactNode;
  enCabecera?: boolean;
}) {
  const { opciones, set } = filtro;
  const [abierto, setAbierto] = useState(false);
  /* `contents` deja que el hijo ocupe su celda de la grilla; `sm:hidden` (que es
     `display:none`) le gana a partir de 640px. */
  const soloMovil = enCabecera ? "contents sm:hidden" : "contents";

  const puestos: { texto: string; quitar: () => void }[] = [
    filtro.especie && { texto: filtro.especie, quitar: () => set.especie("") },
    /* Un chip por guía elegida: sacar una no debería sacarlas todas. */
    ...filtro.guia.map((g) => ({ texto: `Guía ${g}`, quitar: () => set.guia(filtro.guia.filter((x) => x !== g)) })),
    filtro.permiso && { texto: `Permiso ${filtro.permiso}`, quitar: () => set.permiso("") },
    filtro.resolucion && { texto: `Res. ${filtro.resolucion}`, quitar: () => set.resolucion("") },
    filtro.proveedor && { texto: filtro.proveedor, quitar: () => set.proveedor("") },
  ].filter(Boolean) as { texto: string; quitar: () => void }[];

  const hayQueFiltrar =
    opciones.especies.length + opciones.guias.length + opciones.permisos.length +
    opciones.resoluciones.length + opciones.proveedores.length > 0;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {accion}

        <label className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]"
            aria-hidden
          />
          <input
            value={filtro.texto}
            onChange={(e) => set.texto(e.target.value)}
            placeholder="Código, guía o proveedor…"
            aria-label="Buscar una troza del patio"
            className={`${CAMPO} pl-9`}
          />
        </label>

        <div className="flex gap-2">
          {hayQueFiltrar && (
            <button
              type="button"
              onClick={() => setAbierto((v) => !v)}
              aria-expanded={abierto}
              className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border-2 px-3 text-sm font-bold transition-colors ${
                puestos.length > 0 || abierto
                  ? "border-[var(--accent)] text-[var(--accent-ink)] dark:text-[var(--accent)]"
                  : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              Filtros
              {puestos.length > 0 && (
                <span className="rounded-full bg-primary/15 px-1.5 text-sm tabular-nums">{puestos.length}</span>
              )}
            </button>
          )}
          <label className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={filtro.soloLibres}
              onChange={(e) => set.soloLibres(e.target.checked)}
              className="h-5 w-5 accent-[var(--accent)]"
            />
            Sólo libres
          </label>
        </div>
      </div>

      {/* Desplegado: los cinco selectores en su propia grilla. Se cierra solo
          nunca — el operador que abre para afinar suele tocar dos seguidos. */}
      {abierto && (
        <div className="grid grid-cols-1 gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-2 sm:grid-cols-2 lg:grid-cols-3">
          <div className={soloMovil}>
            <Filtro
              valor={filtro.especie}
              onCambio={set.especie}
              etiqueta="Filtrar por especie"
              todos="Todas las especies"
              opciones={opciones.especies}
            />
          </div>
          <div className={soloMovil}>
            <FiltroGuias valor={filtro.guia} onCambio={set.guia} opciones={opciones.guias} />
          </div>
          {/* El permiso y la resolución: cuando entra la carga de un título
              entero, es por ahí que el patio la busca (ADR-342/343). */}
          <div className={soloMovil}>
            <Filtro
              valor={filtro.permiso}
              onCambio={set.permiso}
              etiqueta="Filtrar por permiso o título habilitante"
              todos="Todos los permisos"
              opciones={opciones.permisos}
            />
          </div>
          {enCabecera && (
            <p className="hidden text-sm text-[var(--text-tertiary)] sm:block lg:col-span-1">
              Especie, guía y permiso se filtran{" "}
              <b className="text-[var(--text-secondary)]">desde su encabezado en la tabla</b>.
            </p>
          )}
          <Filtro
            valor={filtro.resolucion}
            onCambio={set.resolucion}
            etiqueta="Filtrar por resolución"
            todos="Todas las resoluciones"
            opciones={opciones.resoluciones}
          />
          <Filtro
            valor={filtro.proveedor}
            onCambio={set.proveedor}
            etiqueta="Filtrar por proveedor"
            todos="Todos los proveedores"
            opciones={opciones.proveedores}
          />
        </div>
      )}

      {puestos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {puestos.map((p) => (
            <Chip key={p.texto} texto={p.texto} onQuitar={p.quitar} />
          ))}
          <button
            type="button"
            onClick={filtro.limpiar}
            className="text-sm font-bold text-[var(--text-tertiary)] underline hover:text-[var(--text-primary)]"
          >
            Limpiar
          </button>
        </div>
      )}
    </div>
  );
}
