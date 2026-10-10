"use client";

import { useId } from "react";
import { StatCard } from "@buleje/design-system";
import { BarChart3, CheckCircle, Coins, TrendingDown, TrendingUp, Users } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { fmtMonedas } from "../shared";
import BotonPlegar from "./BotonPlegar";
import type { PorMoneda } from "./tipos";

/** Clave de la preferencia (una para todo el panel, en este navegador). */
export const CLAVE_INDICADORES_RESUMEN = "adelantos:resumen:indicadores-abiertos";

/**
 * Los indicadores del Resumen —la plata (adelantado, liquidado, le debes) y
 * los contadores (abiertos, liquidados, personas)— plegables y RECORDADOS
 * (ley de orden, patrón `LothSeccionKpis`). Arrancan plegados: lo primero es
 * el saldo y quién debe. Plegados dicen las mismas cifras en una línea, así
 * plegar no esconde el dato; abiertos son las seis tarjetas de siempre.
 */
export default function IndicadoresResumen({
  adelantadoMap,
  liquidadoMap,
  leDebesMap,
  porDevolverMap,
  excedenteMap,
  hayLeDebes,
  hayPorDevolver,
  hayExcedente,
  abiertos,
  liquidados,
  personas,
  onGoTab,
}: {
  adelantadoMap: PorMoneda;
  liquidadoMap: PorMoneda;
  leDebesMap: PorMoneda;
  porDevolverMap: PorMoneda;
  excedenteMap: PorMoneda;
  hayLeDebes: boolean;
  hayPorDevolver: boolean;
  hayExcedente: boolean;
  /** Contadores del servidor (`/api/adelantos/resumen`), no del listado. */
  abiertos: number;
  liquidados: number;
  personas: number;
  onGoTab: (tab: string) => void;
}) {
  const [abierto, setAbierto] = useLocalStorage<boolean>(CLAVE_INDICADORES_RESUMEN, false);
  const panelId = useId();
  const sep = <span aria-hidden="true">·</span>;

  return (
    <div className="mt-4 border-t border-[var(--rule-soft)] pt-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {!abierto && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm tabular-nums text-[var(--text-secondary)]">
            <span>
              Adelantado <strong className="text-[var(--text-primary)]">{fmtMonedas(adelantadoMap)}</strong>
            </span>
            {sep}
            <span>
              Liquidado <strong className="text-[var(--text-primary)]">{fmtMonedas(liquidadoMap)}</strong>
            </span>
            {sep}
            <span className={hayLeDebes ? "font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : undefined}>
              Le debes {fmtMonedas(leDebesMap)}
            </span>
            {sep}
            <span>
              {abiertos} abierto{abiertos === 1 ? "" : "s"}
            </span>
            {sep}
            <span>
              {liquidados} liquidado{liquidados === 1 ? "" : "s"}
            </span>
            {sep}
            <span>
              {personas} persona{personas === 1 ? "" : "s"}
            </span>
          </div>
        )}
        <div className="ml-auto">
          <BotonPlegar
            abierto={abierto}
            onAlternar={() => setAbierto(!abierto)}
            controla={panelId}
            texto="Indicadores"
            icono={BarChart3}
            ayuda={abierto ? "Oculta los indicadores. Se recuerda en este navegador." : "Muestra los indicadores en tarjetas"}
          />
        </div>
      </div>

      <div id={panelId} hidden={!abierto} className="mt-4 space-y-4">
        {/* Plata (secundario) */}
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Total adelantado" value={fmtMonedas(adelantadoMap)} icon={TrendingDown} subValue="Plata que diste" />
          <StatCard label="Total liquidado" value={fmtMonedas(liquidadoMap)} icon={TrendingUp} emphasis="success" subValue="Recuperado en entregas" />
          <StatCard
            label="Le debes"
            value={fmtMonedas(leDebesMap)}
            icon={Coins}
            emphasis={hayLeDebes ? "warning" : "neutral"}
            subValue={
              hayPorDevolver && hayExcedente
                ? `${fmtMonedas(porDevolverMap)} te pagaron antes · ${fmtMonedas(excedenteMap)} de más`
                : hayPorDevolver
                  ? "Te pagaron antes o te prestaron"
                  : "Entregaron de más"
            }
          />
        </div>

        {/* Contadores clickeables → llevan a la lista/personas filtrada */}
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Adelantos abiertos" value={String(abiertos)} icon={Coins} density="compact" onClick={() => onGoTab("lista")} />
          <StatCard label="Liquidados" value={String(liquidados)} icon={CheckCircle} density="compact" onClick={() => onGoTab("lista")} />
          <StatCard label="Personas" value={String(personas)} icon={Users} density="compact" onClick={() => onGoTab("personas")} />
        </div>
      </div>
    </div>
  );
}
