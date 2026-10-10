"use client";

/**
 * Las medidas CONGELADAS de una cubicación guardada (ADR-478), en sólo
 * lectura: lo que el servidor guardó y con lo que se pagó. Se abre desde la
 * cubicación y desde la entrega del adelanto («Ver medidas»).
 *
 * K7 (ADR-483): si alguna troza trae descuento, se ven el bruto, el descuento
 * y el neto (lo que se paga); si salió de una GTF del Libro TH, el m³ que la
 * guía declara para esa troza (SERFOR), al lado.
 */
import { formatNumber } from "@/lib/format";
import { UNIDADES_FORMULA, type DiametrosPorTroza, type FormulaTrozas } from "@/lib/forestal/cubicacion-trozas-formula";
import type { TrozaCongelada } from "@/lib/forestal/cubicacion-cuenta";
import type { DescuentoTroza, TrozaCongeladaComercial } from "@/lib/forestal/cubicacion-comercial-tipos";

const TH = "px-2 py-2 text-left text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const TD = "px-2 py-1.5 tabular-nums";

/** «hueco 6″ · −2′ · 10 %»: el descuento de una troza en su unidad. */
export function textoDescuentoTroza(d: DescuentoTroza | null | undefined, formula: FormulaTrozas): string {
  if (!d) return "";
  const u = UNIDADES_FORMULA[formula];
  const partes = [
    d.hueco ? `hueco ${formatNumber(d.hueco, { max: 2 })}${u.diametroCorto}` : "",
    d.menosLargo ? `−${formatNumber(d.menosLargo, { max: 2 })}${u.largo === "pies" ? "′" : " m"}` : "",
    d.pct ? `${formatNumber(d.pct, { max: 2 })} %` : "",
  ];
  return partes.filter(Boolean).join(" · ");
}

export default function MedidasCongeladas({
  trozas, formula, diametros,
}: {
  trozas: readonly (TrozaCongelada & TrozaCongeladaComercial)[];
  formula: FormulaTrozas;
  diametros: DiametrosPorTroza;
}) {
  const u = UNIDADES_FORMULA[formula];
  const conCodigo = trozas.some((t) => t.codigo);
  const conDescuento = trozas.some((t) => t.bruto != null || t.descuento);
  const conGuia = trozas.some((t) => t.m3Guia != null);
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
            {conDescuento && <th className={`${TH} text-right`}>Bruto</th>}
            {conDescuento && <th className={TH}>Descuento</th>}
            <th className={`${TH} text-right`}>{conDescuento ? `Neto (${u.volumen})` : u.volumen}</th>
            {conGuia && <th className={`${TH} text-right`}>m³ guía</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--rule-soft)] text-[var(--text-primary)]">
          {trozas.map((t) => (
            <tr key={t.n} className={t.sospechosa ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/12" : undefined}>
              <td className={`${TD} text-[var(--text-tertiary)]`}>{t.n}</td>
              {conCodigo && <td className={`${TD} whitespace-nowrap font-mono`}>{t.codigo ?? "—"}</td>}
              <td className="px-2 py-1.5">{t.especie}</td>
              <td className={`${TD} text-right`}>
                {diametros === 1 || t.d2 == null ? formatNumber(t.d1, { max: 2 }) : `${formatNumber(t.d1, { max: 2 })} · ${formatNumber(t.d2, { max: 2 })}`}
              </td>
              <td className={`${TD} text-right`}>{formatNumber(t.largo, { max: 2 })}</td>
              {conDescuento && <td className={`${TD} text-right text-[var(--text-tertiary)]`}>{formatNumber(t.bruto ?? t.volumen, u.decimales)}</td>}
              {conDescuento && <td className="px-2 py-1.5 text-[var(--text-secondary)]">{textoDescuentoTroza(t.descuento, formula) || "—"}</td>}
              <td className={`${TD} text-right font-semibold`}>{formatNumber(t.volumen, u.decimales)}</td>
              {conGuia && <td className={`${TD} text-right text-[var(--text-tertiary)]`}>{t.m3Guia != null ? formatNumber(t.m3Guia, 3) : "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
