"use client";

/**
 * La barra de la lista del patio: qué es, cuánto es y lo que se le puede hacer.
 *
 * El conteo va PEGADO al título y no en su propio renglón: «59 piezas · 149,56
 * m³» es el subtítulo de la tabla, no un dato aparte — y un renglón menos son
 * 30 px menos antes de la primera fila.
 *
 * Los filtros de especie / permiso / guía aparecen acá sólo en el teléfono: en
 * el escritorio viven en la cabecera de su columna (`CtpTrozasTabla`), que es
 * donde se los busca cuando se mira una tabla. Es el mismo estado en los dos
 * lados, no un segundo filtro.
 */

import { CardTitle } from "@buleje/design-system";
import { Download, Search } from "@buleje/design-system/icons";
import { SIN_TITULO, type OrdenTrozas } from "@/lib/forestal/trozas-patio";
import { CampoDeFiltro, type FacetaOpcion } from "./ctp-filtros-panel";
import { ORDENES } from "./ctp-trozas-lista-shared";

const CAMPO =
  "h-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none";

export interface CtpTrozasBarraProps {
  texto: string;
  onTexto: (v: string) => void;
  orden: OrdenTrozas;
  onOrden: (v: OrdenTrozas) => void;
  /** Mientras se lee, el conteo no puede afirmar un patio vacío. */
  leyendo: boolean;
  piezasFiltradas: number;
  piezasTotales: number;
  m3Filtrados: number;
  onExportar: () => void;
  especie: readonly string[];
  onEspecie: (v: string[]) => void;
  especiesFaceta: FacetaOpcion[];
  titulo: readonly string[];
  onTitulo: (v: string[]) => void;
  titulosFaceta: FacetaOpcion[];
  guia: readonly string[];
  onGuia: (v: string[]) => void;
  guiasFaceta: FacetaOpcion[];
}

export default function CtpTrozasBarra({
  texto, onTexto, orden, onOrden, leyendo, piezasFiltradas, piezasTotales, m3Filtrados, onExportar,
  especie, onEspecie, especiesFaceta, titulo, onTitulo, titulosFaceta, guia, onGuia, guiasFaceta,
}: CtpTrozasBarraProps) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2">
        <CardTitle as="h3" className="text-sm">Piezas</CardTitle>
        <span data-conteo="lista" className="text-xs font-bold text-[var(--text-secondary)]">
          {leyendo ? (
            "Leyendo el patio…"
          ) : (
            <>
              {piezasFiltradas === piezasTotales ? `${piezasFiltradas} piezas` : `${piezasFiltradas} de ${piezasTotales} piezas`}
              {" · "}
              <span className="font-mono tabular-nums">{m3Filtrados.toLocaleString("es-PE", { maximumFractionDigits: 2 })} m³</span>
            </>
          )}
        </span>
        {/* Tope de ancho a propósito: sin él la barra llega al borde derecho y
            el botón flotante «Acciones rápidas» del panel —fijo en 1200-1256 px—
            se come la mitad del botón CSV (medido con `elementFromPoint`). Con
            el tope, lo que queda bajo el flotante es espacio vacío. */}
        <div
          /* `minWidth` inline: globals.css trae un `* { min-width: 0 }` SIN
             capa, y lo sin-capa le gana a @layer utilities — `min-w-[12rem]`
             no hacía nada y el buscador se aplastaba al agregar un control. */
          style={{ minWidth: "12rem" }}
          className="relative flex-1 sm:max-w-[22rem]"
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input
            type="search"
            value={texto}
            onChange={(e) => onTexto(e.target.value)}
            placeholder="Código, especie, guía, proveedor, título…"
            aria-label="Buscar una troza"
            className={`${CAMPO} w-full pl-9 pr-3 focus:ring-2 focus:ring-[var(--accent-muted)]`}
          />
        </div>
        <select
          value={orden}
          onChange={(e) => onOrden(e.target.value as OrdenTrozas)}
          aria-label="Ordenar por"
          className={`${CAMPO} px-2.5 font-medium`}
        >
          {ORDENES.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
        <button
          type="button" onClick={onExportar} disabled={piezasFiltradas === 0}
          className={`${CAMPO} inline-flex items-center gap-1.5 px-3 font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50`}
        >
          <Download className="h-4 w-4" /> CSV
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5 border-b border-[var(--rule-soft)] px-3 py-2 md:hidden">
        <CampoDeFiltro compacto label="Especie" value={especie} options={especiesFaceta} onChange={onEspecie} placeholder="Especie" textoVacio="Sin especies" />
        <CampoDeFiltro
          compacto
          label="Permiso (título habilitante)"
          value={titulo}
          options={titulosFaceta}
          etiqueta={(v) => (v === SIN_TITULO ? "Sin título" : v)}
          onChange={onTitulo}
          placeholder="Permiso"
          textoVacio="Sin permisos"
        />
        <CampoDeFiltro compacto label="Guía de ingreso" value={guia} options={guiasFaceta} onChange={onGuia} placeholder="Guía" textoVacio="Sin guías" />
      </div>
    </>
  );
}
