"use client";

/**
 * La fila de filtros del reporte: período, cómo agrupar y de qué madera.
 *
 * Va PEGADA arriba de lo que filtra (la ley de la vista): las cifras, los
 * gráficos y la tabla de semanas cambian todos con ella. Una sola caja, no una
 * banda por control.
 *
 * Tres formas de decir el período, las tres que se piden en un aserradero:
 * «las últimas N semanas» (el ritmo), «setiembre» (el cierre del mes) y «del
 * 1 al 15» (lo que pide un comprador o el contador).
 */

import { useEffect, useState } from "react";
import { Minus, Plus, X } from "@buleje/design-system/icons";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { CampoDeFiltro } from "@/components/admin/forestal/ctp-filtros-panel";
import { hoyEnLima } from "@/lib/forestal/semana-de-registro";
import {
  etiquetaDeMes,
  SEMANAS_MAX,
  type AgrupacionReporte,
  type ReporteDeProduccion,
} from "@/lib/forestal/reportes-produccion";
import type { EleccionDePeriodo, FiltrosElegidos, TipoDePeriodo } from "../hooks/use-reporte-produccion";

const CAMPO =
  "h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";
const ROTULO = "text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";
const BOTON_PASO =
  "inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] disabled:opacity-40";

/** Los últimos 24 meses, del más nuevo al más viejo. */
function mesesElegibles(): { value: string; label: string }[] {
  const hoy = hoyEnLima();
  const [a, m] = hoy.split("-").map(Number);
  return Array.from({ length: 24 }, (_, i) => {
    const d = new Date(Date.UTC(a!, m! - 1 - i, 1)).toISOString().slice(0, 7);
    return { value: d, label: etiquetaDeMes(d) };
  });
}

/**
 * El número de semanas, escribible. Guarda el texto aparte: si sólo aceptara
 * valores válidos, borrar el «8» para escribir «12» no dejaría borrar.
 */
function CampoSemanas({ valor, onCambio }: { valor: number; onCambio: (n: number) => void }) {
  const [texto, setTexto] = useState(String(valor));
  useEffect(() => setTexto(String(valor)), [valor]);
  return (
    <input
      id="reporte-semanas"
      type="number"
      inputMode="numeric"
      min={1}
      max={SEMANAS_MAX}
      value={texto}
      onChange={(e) => {
        setTexto(e.target.value);
        const n = Math.trunc(Number(e.target.value));
        if (e.target.value !== "" && n >= 1 && n <= SEMANAS_MAX) onCambio(n);
      }}
      onBlur={() => setTexto(String(valor))}
      className={`${CAMPO} w-16 text-center tabular-nums`}
    />
  );
}

export default function ReportesFiltros({
  periodo,
  agrupacion,
  filtros,
  reporte,
  onPeriodo,
  onAgrupacion,
  onFiltro,
  onLimpiar,
}: {
  periodo: EleccionDePeriodo;
  agrupacion: AgrupacionReporte;
  filtros: FiltrosElegidos;
  reporte: ReporteDeProduccion | null;
  onPeriodo: (p: Partial<EleccionDePeriodo>) => void;
  onAgrupacion: (a: AgrupacionReporte) => void;
  onFiltro: (campo: keyof FiltrosElegidos, valores: string[]) => void;
  onLimpiar: () => void;
}) {
  const meses = mesesElegibles();
  /* El mes guardado puede ser más viejo que la lista: se agrega para que el
     desplegable no muestre otro mes que el que se está mirando. */
  if (!meses.some((m) => m.value === periodo.mes)) meses.push({ value: periodo.mes, label: etiquetaDeMes(periodo.mes) });
  const activos = filtros.duenos.length + filtros.permisos.length + filtros.especies.length;
  const opciones = reporte?.opciones;

  return (
    <section
      aria-label="Filtros del reporte"
      className="space-y-2.5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3"
    >
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2.5">
        <div className="flex flex-col gap-1">
          <span className={ROTULO}>Período</span>
          <SegmentedControl<TipoDePeriodo>
            label="Tipo de período"
            size="lg"
            value={periodo.tipo}
            onChange={(tipo) => onPeriodo({ tipo })}
            options={[
              { value: "semanas", label: "Semanas" },
              { value: "mes", label: "Mes" },
              { value: "rango", label: "Rango" },
            ]}
          />
        </div>

        {periodo.tipo === "semanas" && (
          <div className="flex flex-col gap-1">
            <label htmlFor="reporte-semanas" className={ROTULO}>
              Cuántas semanas
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Una semana menos"
                className={BOTON_PASO}
                disabled={periodo.semanas <= 1}
                onClick={() => onPeriodo({ semanas: Math.max(1, periodo.semanas - 1) })}
              >
                <Minus className="h-4 w-4" aria-hidden />
              </button>
              <CampoSemanas valor={periodo.semanas} onCambio={(semanas) => onPeriodo({ semanas })} />
              <button
                type="button"
                aria-label="Una semana más"
                className={BOTON_PASO}
                disabled={periodo.semanas >= SEMANAS_MAX}
                onClick={() => onPeriodo({ semanas: Math.min(SEMANAS_MAX, periodo.semanas + 1) })}
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        )}

        {periodo.tipo === "mes" && (
          <div className="flex flex-col gap-1">
            <label htmlFor="reporte-mes" className={ROTULO}>
              Mes
            </label>
            <select
              id="reporte-mes"
              value={periodo.mes}
              onChange={(e) => onPeriodo({ mes: e.target.value })}
              className={CAMPO}
            >
              {meses.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {periodo.tipo === "rango" && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="reporte-desde" className={ROTULO}>
                Desde
              </label>
              <input
                id="reporte-desde"
                type="date"
                value={periodo.desde}
                onChange={(e) => e.target.value && onPeriodo({ desde: e.target.value })}
                className={CAMPO}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="reporte-hasta" className={ROTULO}>
                Hasta
              </label>
              <input
                id="reporte-hasta"
                type="date"
                value={periodo.hasta}
                onChange={(e) => e.target.value && onPeriodo({ hasta: e.target.value })}
                className={CAMPO}
              />
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <span className={ROTULO}>Ver por</span>
          <SegmentedControl<AgrupacionReporte>
            label="Agrupar los gráficos por"
            size="lg"
            value={agrupacion}
            onChange={onAgrupacion}
            options={[
              { value: "dia", label: "Día" },
              { value: "semana", label: "Semana" },
              { value: "mes", label: "Mes" },
            ]}
          />
        </div>

        {reporte && (
          <p className="basis-full text-sm text-[var(--text-secondary)] sm:ml-auto sm:basis-auto sm:self-center sm:text-right">
            <span className="font-bold text-[var(--text-primary)]">{reporte.periodo.etiqueta}</span>
            {" · "}se compara con {reporte.periodo.previo.etiqueta}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2 border-t border-[var(--rule-soft)] pt-2.5">
        {(
          [
            ["duenos", "Dueño de la madera", "Todos los dueños", opciones?.dueno],
            ["permisos", "Permiso", "Todos los permisos", opciones?.permiso],
            ["especies", "Especie", "Todas las especies", opciones?.especie],
          ] as const
        ).map(([campo, label, todos, lista]) => (
          <div key={campo} style={{ minWidth: "11rem" }} className="flex flex-1 flex-col gap-1 sm:max-w-[16rem]">
            <span className={ROTULO}>{label}</span>
            <CampoDeFiltro
              label={label}
              value={filtros[campo]}
              options={lista ?? []}
              onChange={(v) => onFiltro(campo, v)}
              placeholder={todos}
              textoVacio="Sin producción en el período"
              compacto
            />
          </div>
        ))}
        {activos > 0 && (
          <button
            type="button"
            onClick={onLimpiar}
            className="flex h-10 items-center gap-1.5 self-end rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)]"
          >
            <X className="h-4 w-4" aria-hidden /> Ver todo
          </button>
        )}
      </div>
    </section>
  );
}
