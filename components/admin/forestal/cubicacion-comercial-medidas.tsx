"use client";

/**
 * Lo CONGELADO de una cubicación comercial de madera aserrada (ADR-483), en
 * sólo lectura: las piezas que se copiaron del Cubicador de madera (uno por
 * uno) o las líneas por especie (rápida), y el paso bruto → descuentos → neto.
 * Las trozas siguen en `cubicador-trozas-medidas`.
 */
import { formatNumber } from "@/lib/format";
import { fmtVolumen } from "@/lib/forestal/cubicacion-cuenta";
import type { DescuentoLote, FormulaComercial, LineaTotalCongelada, PiezaCongelada } from "@/lib/forestal/cubicacion-comercial-tipos";

const TH = "px-2 py-2 text-left text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const TD = "px-2 py-1.5 tabular-nums";
const UNI: Record<PiezaCongelada["uEspesor"], string> = { pulg: "″", cm: " cm", pies: "′", m: " m" };
const medida = (v: number, u: PiezaCongelada["uEspesor"]) => `${formatNumber(v, { max: 2 })}${UNI[u]}`;

export function MedidasAserrada({ piezas, lineas }: { piezas?: readonly PiezaCongelada[]; lineas?: readonly LineaTotalCongelada[] }) {
  if (lineas?.length) {
    return (
      <div className="max-h-[22rem] overflow-auto rounded-2xl border border-[var(--rule-soft)]" data-vista="medidas-aserrada">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--surface-sunken)]">
            <tr>
              <th className={TH}>Especie</th>
              <th className={`${TH} text-right`}>PT</th>
              <th className={`${TH} text-right`}>m³ (libro)</th>
              <th className={`${TH} text-right`}>Piezas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule-soft)] text-[var(--text-primary)]">
            {lineas.map((l) => (
              <tr key={l.n}>
                <td className="px-2 py-1.5">{l.especie}</td>
                <td className={`${TD} text-right font-semibold`}>{formatNumber(l.pt, 2)}</td>
                <td className={`${TD} text-right`}>{l.m3 != null ? formatNumber(l.m3, 3) : "—"}</td>
                <td className={`${TD} text-right`}>{l.piezas ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (!piezas?.length) return null;
  const conDescuento = piezas.some((p) => p.descuento && (p.descuento.descartadas || p.descuento.pct));
  return (
    <div className="max-h-[22rem] overflow-auto rounded-2xl border border-[var(--rule-soft)]" data-vista="medidas-aserrada">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-[var(--surface-sunken)]">
          <tr>
            <th className={TH}>#</th>
            <th className={TH}>Especie</th>
            <th className={`${TH} text-right`}>Cant.</th>
            <th className={`${TH} text-right`}>Esp. × ancho × largo</th>
            {conDescuento && <th className={`${TH} text-right`}>PT bruto</th>}
            {conDescuento && <th className={`${TH} text-right`}>Descuento</th>}
            <th className={`${TH} text-right`}>PT</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--rule-soft)] text-[var(--text-primary)]">
          {piezas.map((p) => (
            <tr key={p.n}>
              <td className={`${TD} text-[var(--text-tertiary)]`}>{p.n}</td>
              <td className="px-2 py-1.5">{p.especie}</td>
              <td className={`${TD} text-right`}>{p.cantidad}</td>
              <td className={`${TD} text-right`}>{medida(p.espesor, p.uEspesor)} × {medida(p.ancho, p.uAncho)} × {medida(p.largo, p.uLargo)}</td>
              {conDescuento && <td className={`${TD} text-right`}>{formatNumber(p.bruto, 2)}</td>}
              {conDescuento && (
                <td className={`${TD} text-right text-[var(--text-secondary)]`}>
                  {[p.descuento?.descartadas ? `${p.descuento.descartadas} fuera` : null, p.descuento?.pct ? `−${formatNumber(p.descuento.pct, { max: 2 })} %` : null].filter(Boolean).join(" · ") || "—"}
                </td>
              )}
              <td className={`${TD} text-right font-semibold`}>{formatNumber(p.volumen, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** «Bruto 1 000 PT → −5 % Tornillo · −2 % general → neto 931 PT». Nada si no hubo descuentos. */
export function ResumenDescuentos({
  bruto, neto, descuentos, formula, nombres = {}, antesDelLote = null,
}: {
  bruto: number | null;
  neto: number;
  descuentos: DescuentoLote | null;
  formula: FormulaComercial;
  /** clave → nombre de la especie como se escribió («tornillo» → «Tornillo»). */
  nombres?: Readonly<Record<string, string>>;
  /**
   * Σ de las líneas por especie ANTES de los descuentos del lote (ya con los de
   * cada troza o pieza). Sin esto, «Bruto 361,73 · −2 % general → neto 305»
   * escondía los 50,51 PT de huecos y castigos de las trozas (C-V, 08-10).
   */
  antesDelLote?: number | null;
}) {
  if (bruto == null || !(bruto > neto)) return null;
  const porMedida = antesDelLote != null ? bruto - antesDelLote : 0;
  const partes = [
    porMedida >= (formula === "smalian" ? 0.0005 : 0.005)
      ? `−${fmtVolumen(porMedida, formula)} ${formula === "tablar" ? "por pieza" : "por troza"}`
      : null,
    ...(descuentos?.porEspecie ?? []).flatMap((d) => [
      d.menos ? `−${fmtVolumen(d.menos, formula)} ${nombres[d.clave] ?? d.clave}` : null,
      d.pct ? `−${formatNumber(d.pct, { max: 2 })} % ${nombres[d.clave] ?? d.clave}` : null,
    ]),
    descuentos?.pct ? `−${formatNumber(descuentos.pct, { max: 2 })} % general` : null,
  ].filter(Boolean);
  return (
    <p className="rounded-2xl bg-[var(--surface-sunken)] px-3 py-2 text-sm tabular-nums text-[var(--text-secondary)]" data-vista="resumen-descuentos">
      Bruto <b className="text-[var(--text-primary)]">{fmtVolumen(bruto, formula)}</b>
      {partes.length ? ` · ${partes.join(" · ")}` : " · descuentos por pieza o troza"}
      {" → neto "}<b className="text-[var(--text-primary)]">{fmtVolumen(neto, formula)}</b>
    </p>
  );
}
