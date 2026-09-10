"use client";

/**
 * La meta de mix, con las MEDIDAS de las que está hecha (ADR-406).
 *
 * Brandon, 2026-09-09: «quiero que la meta también tenga sus medidas y cuadre».
 * Una meta dice «50 % de comercial», pero se cumple **cortando escuadrías**: sin
 * ver de qué medidas está hecho ese porcentaje no se sabe qué pedirle a la
 * sierra ni cuál conviene sumar para llegar.
 *
 * El detalle sale de las MISMAS piezas que evalúa la meta (`medidasDeMeta` sobre
 * el lote cubicado), así el porcentaje de arriba y la tabla de abajo no pueden
 * contradecirse — que es justo lo que hace que «cuadre».
 *
 * Vive fuera del apartado de reprocesos: la meta se mira haya o no reprocesos
 * que sugerir.
 */

import { useState } from "react";
import { ChevronRight, Target } from "@buleje/design-system/icons";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";

const TH =
  "px-2 py-1 text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";
const TD = "px-2 py-1.5 text-sm text-[var(--text-secondary)]";
const NUM = `${TD} text-right font-mono tabular-nums`;

export interface MetaConMedidasProps {
  tipo: string;
  pctMinimo: number;
  actual: number;
  cumple: boolean;
  /** Pie tablar que habría que sumar a ese tipo para llegar. */
  faltanPt: number;
  /** Lo que los reprocesos sugeridos aportarían a ESE tipo (ADR-404). */
  aporteM3: number;
  medidas: { clave: string; medida: string; piezas: number; pieTablar: number; m3: number; pctDelTipo: number }[];
  medidasPt: number;
  medidasPiezas: number;
  medidasM3: number;
}

export default function MetaConMedidas({ meta }: { meta: MetaConMedidasProps | null }) {
  const [metaAbierta, setMetaAbierta] = useState(false);
  if (!meta) return null;
  return (
    <div className="rounded-lg border border-[var(--rule-base)]">
          <button
            type="button"
            onClick={() => setMetaAbierta((v) => !v)}
            aria-expanded={metaAbierta}
            className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-left text-xs text-[var(--text-secondary)]"
          >
            <Target className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" aria-hidden />
            <b className="text-[var(--text-primary)]">
              Meta: {meta.tipo} ≥ {meta.pctMinimo} %
            </b>
            <span>· hoy {meta.actual} %</span>
            {!meta.cumple && meta.faltanPt > 0 && (
              <span>
                · faltan <b className="font-mono tabular-nums">{fmtPt(meta.faltanPt)} PT</b>
              </span>
            )}
            {meta.aporteM3 > 0 ? (
              <span>
                · los reprocesos hacia {meta.tipo.toLowerCase()} suman{" "}
                <b className="font-mono tabular-nums">{fmtM3(meta.aporteM3)} m³</b>
              </span>
            ) : (
              <span>· ninguna sugerencia apunta a ese tipo</span>
            )}
            {meta.cumple && (
              <span className="font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                · ya cumple
              </span>
            )}
            {meta.medidas.length > 0 && (
              <span className="ml-auto inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                <ChevronRight
                  className={`h-3.5 w-3.5 transition-transform ${metaAbierta ? "rotate-90" : ""}`}
                  aria-hidden
                />
                {meta.medidas.length} {meta.medidas.length === 1 ? "medida" : "medidas"}
              </span>
            )}
          </button>

          {/* Con qué escuadrías está hecho ese tipo hoy: una meta de mix se
              cumple cortando medidas, no metros cúbicos. Sale de las MISMAS
              piezas que evalúa la meta, así el % de arriba y el detalle de
              abajo no pueden contradecirse. */}
          {metaAbierta && meta.medidas.length > 0 && (
            <div className="overflow-x-auto border-t border-[var(--rule-soft)] px-3 pb-2">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--rule-soft)]">
                    <th className={TH}>Medida de {meta.tipo.toLowerCase()}</th>
                    <th className={`${TH} text-right`}>Piezas</th>
                    <th className={`${TH} text-right`}>m³</th>
                    <th className={`${TH} text-right`}>Pie tablar</th>
                    <th className={`${TH} text-right`}>% del tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {meta.medidas.map((m) => (
                    <tr key={m.clave} className="border-b border-[var(--rule-soft)] last:border-0">
                      <td className={`${TD} font-mono`}>{m.medida}</td>
                      <td className={NUM}>{fmtPiezas(m.piezas)}</td>
                      <td className={NUM}>{fmtM3(m.m3)}</td>
                      <td className={NUM}>{fmtPt(m.pieTablar)}</td>
                      <td className={`${NUM} text-[var(--text-tertiary)]`}>{m.pctDelTipo} %</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--rule-base)]">
                    <td className={`${TD} font-bold text-[var(--text-primary)]`}>
                      Total de {meta.tipo.toLowerCase()}
                    </td>
                    <td className={`${NUM} font-bold text-[var(--text-primary)]`}>
                      {fmtPiezas(meta.medidasPiezas)}
                    </td>
                    <td className={`${NUM} font-bold text-[var(--text-primary)]`}>
                      {fmtM3(meta.medidasM3)}
                    </td>
                    <td className={`${NUM} font-bold text-[var(--text-primary)]`}>
                      {fmtPt(meta.medidasPt)}
                    </td>
                    <td className={NUM}>100 %</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
  );
}
