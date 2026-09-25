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
 *
 * ## Un solo título y una sola jerarquía
 *
 * La vista tiene UN título (`SectionTitle`) y cada bloque el suyo (`CardTitle`).
 * Antes había dos encabezados casi iguales —«El patio, troza por troza» y «El
 * patio, pieza por pieza»— y cinco `<h3>` del mismo peso: con todo al mismo
 * nivel, nada es el título.
 */

import { useState } from "react";
import { SectionTitle } from "@buleje/design-system";
import { AlertTriangle, RefreshCw, Search } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { EstadoTroza } from "@/lib/forestal/trozas-patio";
import CtpApartarEnLoteModal from "./CtpApartarEnLoteModal";
import CtpCodigosDuplicados from "./CtpCodigosDuplicados";
import CtpTrozaFichaModal from "./CtpTrozaFichaModal";
import CtpTrozasBuscador from "./CtpTrozasBuscador";
import CtpTrozasLista from "./CtpTrozasLista";
import CtpTrozasPatio from "./CtpTrozasPatio";
import { useTrozasPatio } from "./hooks/use-trozas-patio";

export default function CtpTrozasView() {
  const { trozas, meta, cargando, error, recargar } = useTrozasPatio();
  /* Los filtros viven acá porque los tocan las dos pantallas: se elige un estado
     en el panel de arriba y la lista de abajo tiene que obedecer. */
  /* Listas y no un valor suelto (Brandon, 2026-09-10): «libre Y apartada» es la
     pregunta de todos los días —qué hay parado— y con uno solo había que mirar
     el patio dos veces y sumar a mano. */
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoTroza[]>([]);
  const [tramoFiltro, setTramoFiltro] = useState<string[]>([]);
  /**
   * Especie, guía y título suben acá con estado y tramo (ADR-400).
   *
   * Vivían adentro de la lista, así que el panorama de arriba contaba TODA la
   * pila mientras la tabla mostraba una especie: dos números que se
   * contradicen en la misma pantalla. Ahora los dos miran el mismo conjunto.
   *
   * Estado y tramo NO recortan el panorama: son su propio desglose, y filtrar
   * las tarjetas por lo que se elige EN las tarjetas las dejaría en cero.
   */
  const [especie, setEspecie] = useState<string[]>([]);
  const [guia, setGuia] = useState<string[]>([]);
  const [titulo, setTitulo] = useState<string[]>([]);
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);
  /** La pieza cuya historia se está mirando. */
  const [ficha, setFicha] = useState<string | null>(null);
  /** Las piezas que van camino a un lote. */
  const [apartando, setApartando] = useState<{ id: string; codigo: string | null; especie: string | null }[] | null>(null);

  return (
    <div data-vista-trozas className="space-y-2.5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <SectionTitle>El patio, troza por troza</SectionTitle>
          <InfoTip
            title="El patio, troza por troza"
            what="Qué hay parado hoy, qué se puede llevar a la sierra y qué lleva demasiado tiempo esperando."
            affects="Consumos cuenta m³ por guía; acá la unidad es la pieza."
          />
        </div>
        <button
          type="button" onClick={() => void recargar()} disabled={cargando}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} /> Actualizar
        </button>
      </header>

      {error && (
        <p className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> No se pudo leer el patio: {error}
        </p>
      )}

      {/* Va arriba de todo y no en una pestaña aparte: dos piezas con el mismo
          código rompen justamente lo que esta pantalla promete —pedir una troza
          por su código—. Se esconde solo cuando no queda ninguno (ADR-336) y
          entra en una línea: el problema se anuncia, pero no tapa el patio. */}
      <CtpCodigosDuplicados />

      <CtpTrozasPatio
        trozas={trozas}
        meta={meta}
        cargando={cargando}
        estadoFiltro={estadoFiltro}
        onEstadoFiltro={setEstadoFiltro}
        tramoFiltro={tramoFiltro}
        onTramoFiltro={setTramoFiltro}
        especie={especie}
        guia={guia}
        titulo={titulo}
      />

      <CtpTrozasLista
        trozas={trozas}
        cargando={cargando}
        estadoFiltro={estadoFiltro}
        onEstadoFiltro={setEstadoFiltro}
        tramoFiltro={tramoFiltro}
        onTramoFiltro={setTramoFiltro}
        especie={especie}
        onEspecie={setEspecie}
        guia={guia}
        onGuia={setGuia}
        titulo={titulo}
        onTitulo={setTitulo}
        onVerFicha={setFicha}
        onApartar={setApartando}
      />

      {ficha && (
        /* `onVerOtra` deja saltar de un pedazo a su madre sin cerrar: el
           retrozado es justo donde uno quiere ir y volver. */
        <CtpTrozaFichaModal trozaId={ficha} onClose={() => setFicha(null)} onVerOtra={setFicha} />
      )}
      {apartando && (
        <CtpApartarEnLoteModal
          piezas={apartando}
          onClose={() => setApartando(null)}
          onListo={() => void recargar()}
        />
      )}

      {/* El buscador del fiscalizador va plegado: la lista de arriba ya busca en
          lo que está cargado. Este pregunta al servidor, así que es el que vale
          cuando el patio pasa el tope y también encuentra piezas de guías ya
          consumidas hace meses. */}
      <div className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <button
          type="button"
          onClick={() => setBuscadorAbierto((v) => !v)}
          aria-expanded={buscadorAbierto}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-sunken)]"
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
          <div className="border-t border-[var(--rule-base)] p-3">
            <CtpTrozasBuscador />
          </div>
        )}
      </div>
    </div>
  );
}
