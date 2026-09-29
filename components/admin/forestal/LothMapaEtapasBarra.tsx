"use client";

/**
 * LothMapaEtapasBarra — la franja de las ETAPAS, debajo de la del censo: en
 * qué punto de la cadena está cada árbol según el libro («En pie 61 · Talado 2
 * · Trozado 2 · Despachado 0 …»). Es a la vez la leyenda (cada botón lleva el
 * MISMO símbolo que el mapa) y el filtro: tocar una etapa deja sólo esos
 * árboles; tocarla otra vez la suelta. Se suma a los filtros de especie,
 * condición y estado.
 *
 * Qué dicen las etiquetas sobre los puntos (código y etapa, sólo el código o
 * nada) se elige en el menú «Capas» de la barra del mapa: es lo que se dibuja.
 *
 * En el celular los botones van en una fila que se desliza de costado: una
 * pared de botones partida en tres renglones empujaba el mapa fuera de la vista.
 */

import { Loader2, RefreshCw } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { estadoVisualDeEtapa } from "@/lib/forestal/loth-etapa-arbol";
import { formatNumber } from "@/lib/format";
import LothMapaArbolSimbolo from "./LothMapaArbolSimbolo";
import type { LothMapaArboles } from "./hooks/use-loth-mapa-arboles";

const CHIP =
  "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--data-info-500)] disabled:cursor-default sm:h-9";
const CHIP_OFF =
  "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] enabled:hover:border-[var(--rule-strong)] enabled:hover:text-[var(--text-primary)]";
const CHIP_ON = "border-[var(--text-primary)] bg-[var(--surface-sunken)] text-[var(--text-primary)] ring-1 ring-[var(--text-primary)]";

export default function LothMapaEtapasBarra({ arb }: { arb: LothMapaArboles }) {
  const { opciones, filtro, setFiltro, etapas } = arb;
  const elegida = filtro.etapa ?? null;
  /** La forma de la condición más común: la misma que usa la leyenda del mapa. */
  const base = opciones.clases[0]?.valor ?? "aprovechable";

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--rule-soft)] px-3 py-2">
      <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--text-secondary)]">
        Etapas
        <InfoTip
          title="La etapa de cada árbol"
          what="Lo que el libro hizo con cada árbol: en pie, talado, trozado, despachado (en parte o entero) o ya recibido en tu Libro CTP. Toca una etapa para ver sólo esos árboles."
          affects="Se cuenta con el libro entero, no con lo que dice el censo. Si el censo dice otra cosa, el árbol lleva un triángulo rojo con «!» y su ficha dice por qué. «Despachado» cuenta también las trozas consumidas en tu aserradero."
          example="«Trozado 2»: dos árboles tumbados y trozados con sus trozas todavía en el monte."
        />
      </span>

      <div
        role="group"
        aria-label="Filtrar el censo por etapa"
        className="flex min-w-0 gap-1.5 overflow-x-auto max-sm:order-last max-sm:basis-full max-sm:pb-1 sm:flex-1 sm:flex-wrap"
      >
        {opciones.etapas.map((o) => {
          const activa = elegida === o.valor;
          const etapa = o.valor === "con_aviso" ? undefined : o.valor;
          return (
            <button
              key={o.valor}
              type="button"
              aria-pressed={activa}
              disabled={o.n === 0 && !activa}
              onClick={() => setFiltro((f) => ({ ...f, etapa: activa ? null : o.valor }))}
              className={`${CHIP} ${activa ? CHIP_ON : CHIP_OFF}`}
            >
              <LothMapaArbolSimbolo
                clase={base}
                estado={etapa ? estadoVisualDeEtapa(etapa) : "en_pie"}
                etapa={etapa}
                aviso={!etapa}
                lado={16}
              />
              {o.label}
              <span className={`font-black tabular-nums ${o.n === 0 ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]"}`}>
                {formatNumber(o.n)}
              </span>
            </button>
          );
        })}
      </div>

      {etapas?.cargando && (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Leyendo el libro…
        </span>
      )}
      {etapas?.error && !etapas.cargando && (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--data-error-ink)]" role="alert">
          Sin el libro: se ve lo que dice el censo
          <InfoTip title="No se pudo leer el libro" what={etapas.error} affects="Las etapas salen del censo, que puede estar atrasado." />
          <button
            type="button"
            onClick={etapas.reintentar}
            className="inline-flex h-9 items-center gap-1 rounded-lg px-2 font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Reintentar
          </button>
        </span>
      )}
      {etapas && etapas.sinCenso.length > 0 && (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--data-warning-ink)]">
          {formatNumber(etapas.sinCenso.length)} fuera del censo
          <InfoTip
            title="Árboles del libro que no están en el censo"
            what={`El libro tiene tala o trozas de ${etapas.sinCenso.slice(0, 12).join(", ")}${etapas.sinCenso.length > 12 ? "…" : ""}, pero ese código no está en el censo de este plan.`}
            affects="No se pueden poner en el mapa: sin censo no hay coordenada."
            example="Un código mal escrito en la tala («114A» por «114-A») o un árbol de otro plan."
          />
        </span>
      )}

    </div>
  );
}
