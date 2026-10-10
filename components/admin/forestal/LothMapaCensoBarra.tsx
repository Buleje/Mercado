"use client";

/**
 * LothMapaCensoBarra — la franja del censo pegada DEBAJO del mapa: filtros por
 * especie, condición y estado, y el botón «¿Qué árbol tengo cerca?». Las
 * etapas van en la franja de abajo (`LothMapaEtapasBarra`).
 *
 * Abajo y no arriba: en el celular, con el mapa en la pantalla, el pulgar llega
 * abajo. Por eso en el celular el botón va primero y a lo ancho, con 48 px de
 * alto, y los filtros en controles de 44 px.
 *
 * Los filtros cuentan sobre el censo entero («Catahua · 6»), para que se vea
 * cuánto hay de cada cosa antes de elegir.
 */

import { Locate, TreePine, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { filtroActivo, FILTRO_ARBOLES_VACIO, type ClaseArbol } from "@/lib/forestal/loth-mapa-arboles";
import { formatNumber } from "@/lib/format";
import { BTN_MAPA_PRIMARIO } from "./LothMapaRegistrarTala";
import type { LothMapaArboles } from "./hooks/use-loth-mapa-arboles";

const SELECT =
  "h-11 min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm font-semibold text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--data-info-500)] sm:h-9 sm:w-auto";

export default function LothMapaCensoBarra({ arb, total }: { arb: LothMapaArboles; total: number }) {
  const { filtro, setFiltro, opciones } = arb;
  const activo = filtroActivo(filtro);

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--rule-soft)] px-3 py-2 max-sm:grid max-sm:grid-cols-2">
      <button
        type="button"
        onClick={arb.cercaActivo ? arb.dejarDeBuscar : arb.buscarCerca}
        aria-pressed={arb.cercaActivo}
        className={`${BTN_MAPA_PRIMARIO} max-sm:order-first max-sm:col-span-2 max-sm:h-12 max-sm:text-base sm:order-last sm:ml-auto`}
      >
        {arb.cercaActivo ? <X className="h-4 w-4" aria-hidden="true" /> : <Locate className="h-4 w-4" aria-hidden="true" />}
        {arb.cercaActivo ? "Dejar de buscar" : "¿Qué árbol tengo cerca?"}
      </button>

      <span className="inline-flex items-center gap-1.5 text-xs font-bold tabular-nums text-[var(--text-secondary)] max-sm:col-span-2" aria-live="polite">
        <TreePine className="h-3.5 w-3.5" aria-hidden="true" />
        {activo ? `${formatNumber(arb.filtrados.length)} de ${formatNumber(total)} árboles` : `${formatNumber(total)} árboles del censo`}
        <InfoTip
          title="Los árboles del censo"
          what="Cada árbol con la condición que declaró el regente en la hoja del censo. Si no la trae, la categoría del POA."
          affects="Toca un árbol para ver su ficha y registrar su tala. «¿Qué árbol tengo cerca?» usa el GPS del celular."
          example="Elige «Catahua» y toca el botón: te dice qué catahua en pie tienes más cerca."
        />
      </span>

      <select
        aria-label="Filtrar el censo por especie"
        value={filtro.especie ?? ""}
        onChange={(e) => setFiltro((f) => ({ ...f, especie: e.target.value || null }))}
        className={`${SELECT} max-sm:col-span-2`}
      >
        <option value="">Todas las especies</option>
        {opciones.especies.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.label} · {o.n}
          </option>
        ))}
      </select>
      <select
        aria-label="Filtrar el censo por condición"
        value={filtro.clase ?? ""}
        onChange={(e) => setFiltro((f) => ({ ...f, clase: (e.target.value || null) as ClaseArbol | null }))}
        className={SELECT}
      >
        <option value="">Toda condición</option>
        {opciones.clases.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.label} · {o.n}
          </option>
        ))}
      </select>
      <select
        aria-label="Filtrar el censo por estado"
        value={filtro.estado ?? ""}
        onChange={(e) => setFiltro((f) => ({ ...f, estado: e.target.value || null }))}
        className={SELECT}
      >
        <option value="">Todo estado</option>
        {opciones.estados.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.label} · {o.n}
          </option>
        ))}
      </select>
      {activo && (
        <button
          type="button"
          onClick={() => setFiltro(FILTRO_ARBOLES_VACIO)}
          className="inline-flex h-11 items-center justify-center gap-1 rounded-xl px-3 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] max-sm:col-span-2 sm:h-9"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" /> Quitar filtros
        </button>
      )}
    </div>
  );
}
