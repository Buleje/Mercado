"use client";

/**
 * Las guías con saldo sin consumir, una por fila, de la más vieja a la más
 * nueva: la lista que se abre desde «Antigüedad por guía».
 *
 * La pastilla de días lleva texto primario sobre un tinte del tono, con borde.
 * El texto de color sobre su propio tinte daba 3.52:1 en claro y 2.3-3.22:1 en
 * oscuro (axe, 24-09): el color queda en el borde y el punto, y la severidad
 * va escrita («añeja», «varada»), nunca sólo en color.
 */

import { DataTable } from "@buleje/design-system";
import type { FilaAntiguedad } from "@/lib/forestal/antiguedad-por-guia";
import {
  SEVERIDAD_TRAMO_DIAS,
  TONO_TRAMO_DIAS,
  type TramoDias,
} from "@/lib/forestal/patio-resumen";
import { formatCurrency, formatNumber } from "@/lib/format";
import { Th } from "../ctp-section-shared";
import { PUNTO_TRAMO } from "./AntiguedadTramos";
import {
  BarraFiltrosTabla,
  FiltroEnCabecera,
  SinCoincidenciasFila,
  useFiltrosTabla,
  type ColumnaFiltro,
} from "../filtros-tabla-forestal";

/** «Valor inmovilizado» NO lleva rango: mezcla soles y dólares por fila. */
const COLUMNAS_ANTIGUEDAD: ColumnaFiltro<FilaAntiguedad>[] = [
  { id: "especie", label: "Especie", tipo: "multi", valor: (f) => f.species },
  { id: "gtf", label: "GTF", tipo: "texto", valor: (f) => f.code },
  { id: "sinConsumir", label: "Sin consumir", tipo: "rango", numero: (f) => f.disponible, unidad: "m³", paso: 0.01 },
  { id: "parada", label: "Parada", tipo: "rango", numero: (f) => f.dias, unidad: "días", paso: 1 },
];

const dinero = (v: number, moneda = "PEN") =>
  moneda === "USD" ? `US$ ${formatNumber(v, 2)}` : formatCurrency(v);

const PASTILLA: Record<"ok" | "warn" | "danger", string> = {
  ok: "border-[var(--rule-base)] bg-[var(--surface-sunken)]",
  warn: "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10",
  danger: "border-[var(--data-error-500)] bg-[var(--data-error-500)]/10",
};

function PastillaDias({ dias, tramo }: { dias: number | null; tramo: TramoDias | null }) {
  if (dias == null || tramo == null)
    return <span className="text-[var(--text-tertiary)]">sin fecha</span>;
  const tono = TONO_TRAMO_DIAS[tramo];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-bold text-[var(--text-primary)] ${PASTILLA[tono]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${PUNTO_TRAMO[tono]}`} aria-hidden />
      {dias} {dias === 1 ? "día" : "días"} · {SEVERIDAD_TRAMO_DIAS[tramo]}
    </span>
  );
}

export default function AntiguedadGuiasTabla({
  filas,
  idTitulo,
}: {
  filas: readonly FilaAntiguedad[];
  /** El título del bloque, para nombrar la tabla. */
  idTitulo: string;
}) {
  const f = useFiltrosTabla(filas, COLUMNAS_ANTIGUEDAD);
  return (
    <>
    <BarraFiltrosTabla f={f} className="px-4 py-2" />
    <DataTable
      className="w-full text-sm"
      wrapperClassName="rounded-none border-0"
      aria-labelledby={idTitulo}
    >
      <thead className="align-top">
        <tr>
          <Th>Especie<FiltroEnCabecera id="especie" f={f} /></Th>
          <Th>GTF<FiltroEnCabecera id="gtf" f={f} /></Th>
          <Th className="text-right">Sin consumir (m³)<FiltroEnCabecera id="sinConsumir" f={f} /></Th>
          <Th className="text-right">Parada<FiltroEnCabecera id="parada" f={f} /></Th>
          <Th className="text-right">Valor inmovilizado</Th>
        </tr>
      </thead>
      <tbody>
        {f.filtradas.length === 0 && filas.length > 0 && <SinCoincidenciasFila colSpan={5} />}
        {f.filtradas.map((f) => (
          <tr key={f.id} className="border-t border-[var(--rule-soft)]">
            <td className="px-4 py-3">
              <span className="inline-flex flex-wrap items-center gap-2 font-medium text-[var(--text-primary)]">
                {f.species ?? "—"}
                {f.cites && (
                  <span className="rounded-full border border-[var(--data-info-500)] px-2 py-0.5 text-xs font-bold text-[var(--text-primary)]">
                    CITES
                  </span>
                )}
              </span>
            </td>
            <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">
              {f.code ?? "—"}
            </td>
            <td className="px-4 py-3 text-right tabular-nums text-[var(--text-secondary)]">
              {formatNumber(f.disponible, 3)}
            </td>
            <td className="px-4 py-3 text-right">
              <PastillaDias dias={f.dias} tramo={f.tramo} />
            </td>
            <td className="px-4 py-3 text-right tabular-nums text-[var(--text-primary)]">
              {f.valor != null ? (
                dinero(f.valor, f.moneda)
              ) : (
                <span className="text-xs text-[var(--text-tertiary)]">sin costo cargado</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
    </>
  );
}
