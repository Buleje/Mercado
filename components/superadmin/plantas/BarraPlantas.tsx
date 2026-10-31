"use client";

import { RefreshCw } from "@buleje/design-system/icons";
import { Button } from "@/components/ui-system/Button";
import { formatTime } from "@/lib/format";
import { CONTROL, PERIODOS, rotuloPeriodo, type ClavePeriodo } from "./formato";
import type { PeriodoPlanta } from "@/lib/superadmin/plantas-forestales/tipos";

interface Props {
  periodo: { clave: ClavePeriodo; rango: PeriodoPlanta; cambiar: (c: ClavePeriodo) => void };
  /** Sin esto no se dibuja la casilla (la ficha no la usa). */
  incluirPrueba?: { valor: boolean; cambiar: (v: boolean) => void };
  recalcular: () => void;
  recalculando: boolean;
  /** ISO de cuándo se calculó lo que se ve (para saber si viene de la memoria). */
  calculadoEn?: string | null;
  desdeCache?: boolean;
  idBase: string;
}

/** Período + «Incluir plantas de prueba» + «Recalcular», en una fila (a 400 px se acomodan). */
export function BarraPlantas({ periodo, incluirPrueba, recalcular, recalculando, calculadoEn, desdeCache, idBase }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`${idBase}-periodo`}>Período</label>
      <select
        id={`${idBase}-periodo`}
        value={periodo.clave}
        onChange={(e) => periodo.cambiar(e.target.value as ClavePeriodo)}
        className={CONTROL}
      >
        {PERIODOS.map((p) => (
          <option key={p.clave} value={p.clave}>{p.rotulo}</option>
        ))}
      </select>
      <span className="text-sm tabular-nums text-[var(--text-tertiary)]">{rotuloPeriodo(periodo.rango)}</span>
      {incluirPrueba && (
        <label className="inline-flex h-12 cursor-pointer items-center gap-2 px-1 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={incluirPrueba.valor}
            onChange={(e) => incluirPrueba.cambiar(e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Incluir plantas de prueba
        </label>
      )}
      <div className="ml-auto flex items-center gap-2">
        {calculadoEn && (
          <span className="hidden text-sm text-[var(--text-tertiary)] sm:inline" title={desdeCache ? "Guardado hace menos de 5 minutos" : undefined}>
            {desdeCache ? "Calculado" : "Recién calculado"} a las {formatTime(calculadoEn)}
          </span>
        )}
        <Button variant="secondary" onClick={recalcular} disabled={recalculando} title="Vuelve a leer el libro de cada planta sin usar la memoria de 5 minutos">
          <RefreshCw className={recalculando ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden />
          {recalculando ? "Recalculando…" : "Recalcular"}
        </Button>
      </div>
    </div>
  );
}
