"use client";

/**
 * Las medidas CONGELADAS de una cubicación guardada (ADR-478), en sólo
 * lectura: lo que el servidor guardó y con lo que se pagó. Se abre desde la
 * cubicación y desde la entrega del adelanto («Ver medidas»).
 */
import { formatNumber } from "@/lib/format";
import { UNIDADES_FORMULA, type DiametrosPorTroza, type FormulaTrozas } from "@/lib/forestal/cubicacion-trozas-formula";
import type { TrozaCongelada } from "@/lib/forestal/cubicacion-cuenta";

const TH = "px-2 py-2 text-left text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const TD = "px-2 py-1.5 tabular-nums";

export default function MedidasCongeladas({
  trozas, formula, diametros,
}: {
  trozas: readonly TrozaCongelada[];
  formula: FormulaTrozas;
  diametros: DiametrosPorTroza;
}) {
  const u = UNIDADES_FORMULA[formula];
  const conCodigo = trozas.some((t) => t.codigo);
  return (
    <div className="max-h-[22rem] overflow-auto rounded-2xl border border-[var(--rule-soft)]" data-vista="medidas-congeladas">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-[var(--surface-sunken)]">
          <tr>
            <th className={TH}>#</th>
            {conCodigo && <th className={TH}>Código</th>}
            <th className={TH}>Especie</th>
            <th className={`${TH} text-right`}>{diametros === 1 ? `Ø (${u.diametro})` : `Ø1 · Ø2 (${u.diametro})`}</th>
            <th className={`${TH} text-right`}>Largo ({u.largo})</th>
            <th className={`${TH} text-right`}>{u.volumen}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--rule-soft)] text-[var(--text-primary)]">
          {trozas.map((t) => (
            <tr key={t.n} className={t.sospechosa ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/12" : undefined}>
              <td className={`${TD} text-[var(--text-tertiary)]`}>{t.n}</td>
              {conCodigo && <td className={`${TD} font-mono`}>{t.codigo ?? "—"}</td>}
              <td className="px-2 py-1.5">{t.especie}</td>
              <td className={`${TD} text-right`}>
                {diametros === 1 || t.d2 == null ? formatNumber(t.d1, { max: 2 }) : `${formatNumber(t.d1, { max: 2 })} · ${formatNumber(t.d2, { max: 2 })}`}
              </td>
              <td className={`${TD} text-right`}>{formatNumber(t.largo, { max: 2 })}</td>
              <td className={`${TD} text-right font-semibold`}>{formatNumber(t.volumen, u.decimales)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
