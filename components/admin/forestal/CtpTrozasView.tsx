"use client";

/**
 * CtpTrozasView — el patio del aserradero, pieza por pieza.
 *
 * La diferencia con Consumos, que es la confusión que esta pantalla existía para
 * causar: **Consumos cuenta metros cúbicos por guía** (cuánto de qué GTF entró a
 * qué corrida, con sus invariantes I1–I6) y mira un período. Acá la unidad es
 * **el tronco** y no hay período: es lo que hay parado HOY, con el estado de
 * cada pieza y hace cuánto está ahí. Nadie en el patio señala un porcentaje de
 * una guía; señala una troza.
 *
 * Tres lecturas, una sola carga de datos (`use-trozas-patio`) para que el
 * resumen de arriba y las filas de abajo nunca cuenten cosas distintas:
 *   1. el panorama — cuánto hay, qué se puede aserrar hoy, qué está envejeciendo;
 *   2. la lista filtrable — la pieza concreta, con sus medidas y su guía;
 *   3. el buscador del fiscalizador — pregunta al servidor, sin el tope de 5.000.
 */

import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, Search } from "@buleje/design-system/icons";
import type { EstadoTroza } from "@/lib/forestal/trozas-patio";
import CtpCodigosDuplicados from "./CtpCodigosDuplicados";
import CtpTrozasBuscador from "./CtpTrozasBuscador";
import CtpTrozasLista from "./CtpTrozasLista";
import CtpTrozasPatio from "./CtpTrozasPatio";
import { useTrozasPatio } from "./hooks/use-trozas-patio";

export default function CtpTrozasView() {
  const { trozas, meta, cargando, error, recargar } = useTrozasPatio();
  /* Los filtros viven acá porque los tocan las dos pantallas: se elige un estado
     en el panel de arriba y la lista de abajo tiene que obedecer. */
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoTroza | null>(null);
  const [tramoFiltro, setTramoFiltro] = useState<string | null>(null);
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <CardTitle className="text-lg font-bold text-[var(--text-primary)]">El patio, troza por troza</CardTitle>
        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
          Qué hay parado hoy, qué se puede llevar a la sierra y qué lleva demasiado tiempo esperando.
          Consumos cuenta m³ por guía; acá la unidad es la pieza.
        </p>
      </div>

      {error && (
        <p className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> No se pudo leer el patio: {error}
        </p>
      )}

      {/* Va arriba de todo y no en una pestaña aparte: dos piezas con el mismo
          código rompen justamente lo que esta pantalla promete —pedir una troza
          por su código—. Se esconde solo cuando no queda ninguno (ADR-336). */}
      <CtpCodigosDuplicados />

      <CtpTrozasPatio
        trozas={trozas}
        meta={meta}
        cargando={cargando}
        onRecargar={() => void recargar()}
        estadoFiltro={estadoFiltro}
        onEstadoFiltro={setEstadoFiltro}
        tramoFiltro={tramoFiltro}
        onTramoFiltro={setTramoFiltro}
      />

      <CtpTrozasLista
        trozas={trozas}
        cargando={cargando}
        estadoFiltro={estadoFiltro}
        onEstadoFiltro={setEstadoFiltro}
        tramoFiltro={tramoFiltro}
        onTramoFiltro={setTramoFiltro}
      />

      {/* El buscador del fiscalizador va plegado: la lista de arriba ya busca en
          lo que está cargado. Este pregunta al servidor, así que es el que vale
          cuando el patio pasa el tope y también encuentra piezas de guías ya
          consumidas hace meses. */}
      <div className="overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <button
          type="button"
          onClick={() => setBuscadorAbierto((v) => !v)}
          aria-expanded={buscadorAbierto}
          className="flex w-full items-center gap-2 px-3.5 py-3 text-left transition-colors hover:bg-[var(--surface-sunken)]"
        >
          <Search className="h-4 w-4 shrink-0 text-[var(--accent)]" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-[var(--text-primary)]">Buscar una pieza en todo el libro</span>
            <span className="block text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">
              La consulta del fiscalizador: llega con un código del POA y pregunta con qué guía entró esa troza.
              {meta.truncado && " Acá no rige el tope de 5.000 piezas."}
            </span>
          </span>
          <span className="shrink-0 text-[length:var(--ts-2xs)] font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
            {buscadorAbierto ? "Cerrar" : "Abrir"}
          </span>
        </button>
        {buscadorAbierto && (
          <div className="border-t-2 border-[var(--rule-base)] p-3.5">
            <CtpTrozasBuscador />
          </div>
        )}
      </div>
    </div>
  );
}
