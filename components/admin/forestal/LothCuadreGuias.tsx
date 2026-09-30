"use client";

import { DataTable } from "@buleje/design-system";
import {
  VEREDICTOS_META,
  type CuadreGuia,
  type VeredictoGuia,
} from "@/lib/forestal/loth-cuadre-guias";
import { formatNumber } from "@/lib/format";

/**
 * Cuadre de guías: una fila por GTF, con lo que declara contra lo que el libro
 * despachó con ella. Props puras: el padre calcula `cuadrarGuias(...)` y acá
 * sólo se dibuja. El título lo pone quien lo monta (una vista = un título).
 */

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

/** Date-only: se lee en UTC (en Lima el día se corre si se formatea local). */
function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const m3 = (n: number | null) => (n == null ? "—" : formatNumber(n, { min: 3, max: 4 }));

const TONO: Record<VeredictoGuia, string> = {
  cuadra: "text-[var(--data-success-ink)]",
  no_cuadra: "text-[var(--data-error-ink)]",
  citada_sin_registrar: "text-[var(--data-error-ink)]",
  anulada_citada: "text-[var(--data-error-ink)]",
  sin_volumen: "text-[var(--data-warning-ink)]",
  registrada_sin_trozas: "text-[var(--data-warning-ink)]",
};

function diferencia(f: CuadreGuia): string {
  if (f.diferenciaM3 == null) return "—";
  const signo = f.diferenciaM3 > 0 ? "+" : "";
  return `${signo}${formatNumber(f.diferenciaM3, { min: 3, max: 4 })}`;
}

export interface LothCuadreGuiasProps {
  filas: readonly CuadreGuia[];
  /** Clic en el N.º de una guía: el padre decide qué abrir (ficha, filtro del libro…). */
  onVerGtf?: (gtf: string) => void;
}

export function LothCuadreGuias({ filas, onVerGtf }: LothCuadreGuiasProps) {
  if (filas.length === 0) {
    return <p className="text-sm text-[var(--text-tertiary)]">Todavía no hay guías emitidas ni trozas despachadas.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
      <DataTable className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            <th className="px-3 py-2">Guía</th>
            <th className="px-3 py-2">Fecha</th>
            <th className="px-3 py-2 text-right">Guía m³</th>
            <th className="px-3 py-2 text-right">Libro m³</th>
            <th className="px-3 py-2 text-right">Dif. m³</th>
            <th className="px-3 py-2 text-right">Piezas guía / trozas</th>
            <th className="px-3 py-2">Veredicto</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const meta = VEREDICTOS_META[f.veredicto];
            return (
              <tr key={f.gtf} className="border-t border-[var(--rule-base)]">
                <td className="px-3 py-2 font-mono font-bold text-[var(--text-primary)]">
                  {onVerGtf ? (
                    <button
                      type="button"
                      onClick={() => onVerGtf(f.gtf)}
                      title={f.codigos.length > 0 ? `Trozas: ${f.codigos.join(", ")}` : undefined}
                      className="underline-offset-2 hover:underline focus-visible:underline"
                    >
                      {f.gtf}
                    </button>
                  ) : (
                    f.gtf
                  )}
                  {f.placa && (
                    <span className="ml-2 text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)]">{f.placa}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-[var(--text-secondary)]">{fechaCorta(f.fecha)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{m3(f.declaradoM3)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-primary)]">
                  {f.libroTrozas > 0 ? m3(f.libroM3) : "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{diferencia(f)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                  {f.declaradoPiezas ?? "—"} / {f.libroTrozas}
                  {f.piezasCuadran === false && <span className="ml-1 text-[var(--data-warning-ink)]">≠</span>}
                </td>
                <td className={`px-3 py-2 font-bold ${TONO[f.veredicto]}`} title={meta.ayuda}>
                  {meta.label}
                </td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
    </div>
  );
}
