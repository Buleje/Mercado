"use client";

/**
 * Cuánta madera le queda a cada lote, y para cuándo prometió terminar.
 *
 * Saldos contestaba cuánto hay en el patio y de qué especie, pero no en qué
 * lote está parado. Y un lote NO es una carpeta: es madera apartada. Mientras
 * está en un lote abierto, esa troza no se ofrece para ninguna otra corrida —
 * así que un lote olvidado es volumen que el patio tiene y no puede usar.
 *
 * Las tres preguntas que contesta, en ese orden:
 *   · ¿cuánto le RESTA? — `volumenLibre`, las piezas que todavía no entraron a
 *     la sierra. Ojo: una troza atada a una corrida ANULADA volvió al patio y
 *     cuenta como libre (ADR-326 §6); por eso el cálculo sale de la lógica del
 *     módulo y no de contar `consumidaEnId IS NULL`, que da otro número.
 *   · ¿hace cuánto está parado? — `diasDeEspera`.
 *   · ¿se le pasó la fecha? — `finProceso` es lo que el lote declaró al SNIFFS
 *     (ADR-342). Vencido sólo aplica a lotes ABIERTOS: uno consumido ya terminó
 *     su proceso, pasara o no la fecha.
 *
 * Los lotes sin nada libre NO se esconden: un lote abierto y vacío es
 * justamente el que hay que cerrar, y esconderlo lo deja abierto para siempre.
 */

import { CardTitle, DataTable } from "@buleje/design-system";
import { AlertTriangle, Clock } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { DIAS_LOTE_ANEJO } from "@/lib/forestal/lotes-aserrio";
import type { LoteDeReporte } from "@/lib/forestal/saldos-reporte";
import { formatNumber } from "@/lib/format";
import { Th } from "../ctp-section-shared";
import LotesConSaldoFila from "./LotesConSaldoFila";

/* Vive en `lib/forestal/saldos-reporte` (la usan el reporte y la tabla); se
   re-exporta para quien la importaba de acá. */
export { diasParaVencer } from "@/lib/forestal/saldos-reporte";

const m3 = (v: number) => formatNumber(v, 3);
const TOT = "px-4 py-2.5 text-right tabular-nums";
const ID_TITULO = "saldos-lotes-titulo";

/** Primero lo que apura: vencidos, después lo que menos plazo tiene, y a
 *  igualdad de plazo el que más madera tiene parada. */
function ordenar(a: LoteDeReporte, b: LoteDeReporte): number {
  if (a.vencido !== b.vencido) return a.vencido ? -1 : 1;
  const da = a.diasParaVencer ?? 9_999;
  const db = b.diasParaVencer ?? 9_999;
  return da !== db ? da - db : b.apartadoM3 - a.apartadoM3;
}

export default function LotesConSaldo({
  lotes,
  seleccion,
  onSeleccion,
  vacioMotivo,
  mezcladosFuera = 0,
}: {
  /** Ya calculados por `lotesParaReporte`: la misma fila que baja el reporte. */
  lotes: readonly LoteDeReporte[];
  /** Ids tildados. La selección vive ARRIBA porque el reporte la necesita. */
  seleccion?: Set<string>;
  onSeleccion?: (ids: Set<string>) => void;
  /** Por qué no hay filas cuando es por un filtro y no porque no haya lotes. */
  vacioMotivo?: string;
  /** Con «Solo este permiso»: lotes que mezclan ese permiso con otro, que quedan afuera. */
  mezcladosFuera?: number;
}) {
  const avisoMezcla =
    mezcladosFuera > 0 ? (
      <p className="px-4 py-2 text-sm text-[var(--text-secondary)]">
        {mezcladosFuera} {mezcladosFuera === 1 ? "lote mezcla" : "lotes mezclan"} este permiso con
        otro y no {mezcladosFuera === 1 ? "se muestra" : "se muestran"}: su madera no se puede
        atribuir a un solo permiso.
      </p>
    ) : null;

  if (lotes.length === 0) {
    if (!vacioMotivo && !avisoMezcla) return null;
    return (
      <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] py-3">
        <CardTitle as="h3" className="px-4 text-base font-bold text-[var(--text-primary)]">
          Lo que resta en cada lote
        </CardTitle>
        {vacioMotivo && (
          <p className="mt-0.5 px-4 text-sm text-[var(--text-secondary)]">{vacioMotivo}</p>
        )}
        {avisoMezcla}
      </section>
    );
  }

  const filas = [...lotes].sort(ordenar);
  const eligiendo = Boolean(seleccion && onSeleccion);
  const marcados = seleccion ?? new Set<string>();
  const todosMarcados = filas.every((f) => marcados.has(f.id));
  const alguno = filas.some((f) => marcados.has(f.id));

  const alternar = (id: string) => {
    if (!onSeleccion) return;
    const siguiente = new Set(marcados);
    if (siguiente.has(id)) siguiente.delete(id);
    else siguiente.add(id);
    onSeleccion(siguiente);
  };
  /* Tildar la cabecera alcanza SÓLO a las filas visibles: si mañana hay
     paginación, «todos» no debe llevarse lo que no se ve. */
  const alternarTodos = () =>
    onSeleccion?.(todosMarcados ? new Set() : new Set(filas.map((f) => f.id)));

  /* `producido` y `resta` pueden ser `null` (sin producción sumable): se suma
     lo que hay y se dice sobre cuántos lotes, en vez de un cero que baja el
     total sin avisar. */
  const conProduccion = filas.filter((f) => f.producidoM3 != null);
  const suma = (xs: readonly LoteDeReporte[], k: (l: LoteDeReporte) => number) =>
    xs.reduce((a, l) => a + k(l), 0);
  const sinProduccion = filas.length - conProduccion.length;
  const vencidos = filas.filter((f) => f.vencido).length;
  const anejos = filas.filter(
    (f) => !f.vencido && f.status === "abierto" && (f.diasParado ?? 0) > DIAS_LOTE_ANEJO,
  ).length;

  return (
    <section
      aria-labelledby={ID_TITULO}
      className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[var(--rule-base)] px-4 py-3">
        <div>
          <div className="flex items-center gap-1.5">
            <CardTitle
              as="h3"
              id={ID_TITULO}
              className="text-base font-bold text-[var(--text-primary)]"
            >
              Lo que resta en cada lote
            </CardTitle>
            <InfoTip
              title="Lo que resta en cada lote"
              what="Madera apartada en un lote: mientras esté ahí no se ofrece para otra corrida."
              affects="El plazo es el que el lote declaró al SNIFFS."
            />
          </div>
        </div>
        <p className="text-right text-sm text-[var(--text-secondary)]">
          Apartado en lotes{" "}
          <span className="block text-base font-bold tabular-nums text-[var(--text-primary)]">
            {m3(suma(filas, (l) => l.apartadoM3))} m³
          </span>
        </p>
      </div>

      {(vencidos > 0 || anejos > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--rule-soft)] px-4 py-2 text-sm">
          {vencidos > 0 && (
            <span className="inline-flex items-center gap-1.5 font-bold text-[var(--data-error-ink)]">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              {vencidos} {vencidos === 1 ? "lote pasó" : "lotes pasaron"} su fecha de fin de proceso
            </span>
          )}
          {anejos > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[var(--data-warning-ink)]">
              <Clock className="h-4 w-4" aria-hidden />
              {anejos} {anejos === 1 ? "lleva" : "llevan"} más de {DIAS_LOTE_ANEJO} días sin aserrar
            </span>
          )}
        </div>
      )}
      {avisoMezcla}

      <DataTable
        className="w-full text-sm"
        wrapperClassName="rounded-none border-0"
        aria-labelledby={ID_TITULO}
      >
        <thead className="bg-[var(--surface-sunken)]">
          <tr>
            {eligiendo && (
              <Th className="w-10">
                <label className="-m-2 inline-flex h-8 w-8 cursor-pointer items-center justify-center">
                  <input
                    type="checkbox"
                    checked={todosMarcados}
                    ref={(el) => {
                      if (el) el.indeterminate = alguno && !todosMarcados;
                    }}
                    onChange={alternarTodos}
                    aria-label="Elegir todos los lotes para el reporte"
                    className="h-5 w-5 cursor-pointer accent-[var(--accent)]"
                  />
                </label>
              </Th>
            )}
            <Th>Lote</Th>
            <Th>N° de permiso</Th>
            <Th>Especie</Th>
            <Th>Estado</Th>
            <Th className="text-right">Consumido (m³)</Th>
            <Th className="text-right">Al 56 %</Th>
            <Th className="text-right">Producido (m³)</Th>
            <Th className="text-right">Resta (m³)</Th>
            <Th className="text-right">Piezas</Th>
            <Th className="text-right">Parado</Th>
            <Th>Fin de proceso</Th>
            <Th>Plazo</Th>
          </tr>
        </thead>
        <tbody>
          {filas.map((l) => (
            <LotesConSaldoFila
              key={l.id}
              l={l}
              eligiendo={eligiendo}
              marcado={marcados.has(l.id)}
              onAlternar={() => alternar(l.id)}
            />
          ))}
        </tbody>
        <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] font-bold">
          <tr>
            {eligiendo && <td />}
            <td className="px-4 py-2.5 text-[var(--text-primary)]">
              {filas.length} {filas.length === 1 ? "lote" : "lotes"}
            </td>
            <td colSpan={3} className="px-4 py-2.5 text-xs font-normal text-[var(--text-tertiary)]">
              {sinProduccion > 0
                ? `${sinProduccion} sin producción sumable, fuera de los totales de producido y resta`
                : ""}
            </td>
            <td className={`${TOT} text-[var(--text-primary)]`}>
              {m3(suma(filas, (l) => l.consumidoM3))}
            </td>
            <td className={`${TOT} text-[var(--text-tertiary)]`}>
              {m3(suma(filas, (l) => l.esperado56M3))}
            </td>
            <td className={`${TOT} text-[var(--text-primary)]`}>
              {m3(suma(conProduccion, (l) => l.producidoM3 ?? 0))}
            </td>
            <td className={`${TOT} text-[var(--text-primary)]`}>
              {m3(suma(conProduccion, (l) => l.restaM3 ?? 0))}
            </td>
            <td className={`${TOT} text-[var(--text-secondary)]`}>
              {suma(filas, (l) => l.piezas)}
            </td>
            <td colSpan={3} />
          </tr>
        </tfoot>
      </DataTable>
    </section>
  );
}
