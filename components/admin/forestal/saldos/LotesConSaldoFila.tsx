"use client";

/**
 * Una fila de «Lo que resta en cada lote», y cómo se escribe su plazo.
 *
 * La cuenta (al 56 %, producido, resta, plazo) ya viene hecha por
 * `lotesParaReporte`: acá sólo se dibuja. Antes la tabla hacía su propia cuenta
 * y el reporte otra.
 */

import { formatDate, formatNumber } from "@/lib/format";
import type { LoteDeReporte } from "@/lib/forestal/saldos-reporte";

const m3 = (v: number) => formatNumber(v, 3);
const fecha = (v: string | null) => (v ? formatDate(v, { soloFecha: true }) : "—");

export function TextoPlazo({ dias, vencido }: { dias: number | null; vencido: boolean }) {
  if (dias == null) return <span className="text-[var(--text-tertiary)]">sin fecha</span>;
  if (vencido) {
    return (
      <span className="font-bold text-[var(--data-error-ink)]">
        {Math.abs(dias)} {Math.abs(dias) === 1 ? "día" : "días"} vencido
      </span>
    );
  }
  if (dias === 0)
    return <span className="font-bold text-[var(--data-warning-ink)]">vence hoy</span>;
  return (
    <span
      className={
        dias <= 3 ? "font-bold text-[var(--data-warning-ink)]" : "text-[var(--text-secondary)]"
      }
    >
      quedan {dias} {dias === 1 ? "día" : "días"}
    </span>
  );
}

const TD = "px-4 py-2";
const NUM = `${TD} text-right tabular-nums`;

export default function LotesConSaldoFila({
  l,
  eligiendo,
  marcado,
  onAlternar,
}: {
  l: LoteDeReporte;
  eligiendo: boolean;
  marcado: boolean;
  onAlternar: () => void;
}) {
  return (
    <tr
      className={`border-t border-[var(--rule-soft)] ${
        l.vencido ? "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10" : ""
      }`}
    >
      {eligiendo && (
        <td className={TD}>
          {/* El label agranda el blanco a 32 px: una casilla de 16 no se acierta en la tableta. */}
          <label className="-m-2 inline-flex h-8 w-8 cursor-pointer items-center justify-center">
            <input
              type="checkbox"
              checked={marcado}
              onChange={onAlternar}
              aria-label={`Elegir el lote ${l.code}`}
              className="h-5 w-5 cursor-pointer accent-[var(--accent)]"
            />
          </label>
        </td>
      )}
      <td className={`${TD} whitespace-nowrap font-mono font-bold text-[var(--text-primary)]`}>
        {l.code}
      </td>
      {/* Más de un permiso es madera de dos títulos mezclada: se dice. */}
      <td className={`${TD} font-mono text-xs text-[var(--text-secondary)]`}>
        {l.permisos.length === 0 ? (
          <span className="text-[var(--text-tertiary)]">—</span>
        ) : l.permisos.length === 1 ? (
          l.permisos[0]
        ) : (
          <span className="font-bold text-[var(--data-warning-ink)]">
            {l.permisos.length} permisos mezclados
            <span className="sr-only">: {l.permisos.join(", ")}</span>
          </span>
        )}
      </td>
      <td className={`${TD} text-[var(--text-secondary)]`}>{l.especie}</td>
      <td className={`${TD} text-xs text-[var(--text-secondary)]`}>{l.status}</td>
      <td className={`${NUM} text-[var(--text-secondary)]`}>{m3(l.consumidoM3)}</td>
      {/* La vara, no el resultado: lo que ese consumo debería rendir al 56 %. */}
      <td className={`${NUM} text-[var(--text-tertiary)]`}>{m3(l.esperado56M3)}</td>
      {/* `null` = no se puede sumar sin inventar: se dice, no se pone 0. */}
      <td className={`${NUM} text-[var(--text-primary)]`}>
        {l.producidoM3 == null ? (
          <span className="text-xs text-[var(--text-tertiary)]">—</span>
        ) : (
          m3(l.producidoM3)
        )}
      </td>
      {/* Resta = al 56 % − producido: lo que el lote todavía admite. Negativo = pasó el techo. */}
      <td
        className={`${NUM} font-bold ${
          l.restaM3 != null && l.restaM3 < 0
            ? "text-[var(--data-error-ink)]"
            : "text-[var(--text-primary)]"
        }`}
      >
        {l.restaM3 == null ? (
          <span className="text-xs text-[var(--text-tertiary)]">—</span>
        ) : (
          m3(l.restaM3)
        )}
      </td>
      <td className={`${NUM} text-[var(--text-secondary)]`}>{l.piezas}</td>
      <td className={`${NUM} text-[var(--text-secondary)]`}>
        {l.diasParado == null ? "—" : `${l.diasParado} d`}
      </td>
      <td className={`${TD} font-mono text-xs text-[var(--text-secondary)]`}>
        {fecha(l.finProceso)}
      </td>
      <td className={`${TD} text-xs`}>
        <TextoPlazo dias={l.diasParaVencer} vencido={l.vencido} />
      </td>
    </tr>
  );
}
