/**
 * «Resumen por especie» de una guía importada, con la misma cara de papel que
 * la GTF y su lista (Brandon 16-10): cuántas trozas y m³ de cada especie según
 * la lista, qué parte del volumen es, su ≈pt y lo que declara el cuadro (34).
 * No es una hoja de SERFOR: es el cruce del libro, y lo dice su franja.
 *
 * Tabla con TH_GTF/TD_GTF y no `DataTable`: excepción a ADR-489 para que se
 * lea junto a la lista que replica el papel.
 */

import { formatNumber } from "@/lib/format";
import { casilleroGtf2024 } from "@/lib/forestal/ctp-gtf-formato";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";
import type { ResumenEspecies } from "@/lib/forestal/loth-importar-guia-resumen";
import { ptAserrableDeRolliza } from "@/lib/forestal/loth-restante";
import { FranjaGtf, PapelGtf, TABLA_GTF, TD_GTF, TD_NUM_GTF, TH_GTF } from "./gtf-papel";
import { AyudaFranja } from "./gtf-datos-papel-comun";
import { TONO } from "./LothImportarGuiasTablas";

const signo = (v: number) => (v > 0 ? `+${fmtM3(v)}` : fmtM3(v));

export function ResumenEspeciesPapel({ r, className = "" }: { r: ResumenEspecies; className?: string }) {
  const conCuadro = r.declaradoM3 != null;
  /* El cuadro de productos es el (34) del 2024; su total por especie, el (34g). */
  const nCuadro = (casilleroGtf2024("37a") ?? "").replace(/[a-z]$/, "");
  const nDeclara = casilleroGtf2024("37g");
  const chip = conCuadro ? (
    <span className={`inline-flex h-6 items-center rounded-full px-2 text-sm font-semibold ${r.descuadra ? TONO.aviso : TONO.ok}`}>
      {r.descuadra ? `No cuadra con el cuadro (${nCuadro})` : `Cuadra con el cuadro (${nCuadro})`}
    </span>
  ) : null;
  return (
    <PapelGtf className={className}>
      <FranjaGtf
        titulo="Resumen por especie"
        extra={
          <span className="flex items-center gap-2">
            {chip}
            <AyudaFranja
              titulo="Resumen por especie"
              que="De la lista de trozas de la guía: cuántas trozas y cuántos m³ de cada especie, y qué parte del volumen es."
              nota={`«Declara» es lo que la guía pone en su cuadro de productos (${nCuadro}). Si no coincide con la lista por más de 0,010 m³ (10 litros), la diferencia sale en ámbar. El ≈pt es la madera aserrable que se le sacaría (56 %): un derivado, no lo dice la guía.`}
            />
          </span>
        }
      />
      {r.filas.length === 0 ? (
        <p className="px-3 py-4 text-sm text-[var(--text-secondary)]">La guía no trae lista de trozas ni cuadro de productos.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className={TABLA_GTF} style={{ minWidth: "36rem" }}>
            <thead>
              <tr>
                <th scope="col" className={`${TH_GTF} text-left`}>Especie</th>
                <th scope="col" className={TH_GTF}>Trozas</th>
                <th scope="col" className={TH_GTF}>m³</th>
                <th scope="col" className={TH_GTF}>Del volumen</th>
                <th scope="col" className={TH_GTF}>≈pt</th>
                {conCuadro && (
                  <th scope="col" className={TH_GTF}>
                    Declara <span className="tabular-nums">({nDeclara})</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {r.filas.map((f) => (
                <tr key={f.clave}>
                  <td className={TD_GTF}>
                    <span className="font-semibold">{f.comun}</span>
                    {f.cientifico && <span className="block text-sm italic text-[var(--text-tertiary)]">{f.cientifico}</span>}
                  </td>
                  <td className={TD_NUM_GTF}>{f.trozas}</td>
                  <td className={`${TD_NUM_GTF} font-semibold`}>{fmtM3(f.m3)}</td>
                  <td className={TD_GTF}>
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--surface-sunken)]" aria-hidden>
                        <span className="block h-full rounded-full bg-[var(--gtf-tinta)]" style={{ width: `${Math.min(100, f.pct)}%` }} />
                      </span>
                      <span className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">{formatNumber(f.pct, 0)} %</span>
                    </span>
                  </td>
                  <td className={`${TD_NUM_GTF} text-[var(--text-secondary)]`}>≈{fmtPt(ptAserrableDeRolliza(f.m3))}</td>
                  {conCuadro && (
                    <td className={TD_NUM_GTF}>
                      <span className={f.diferenciaM3 != null ? "font-semibold text-[var(--data-warning-ink)]" : ""}>{fmtM3(f.declaradoM3 ?? 0)}</span>
                      {f.diferenciaM3 != null && <span className="block text-sm text-[var(--data-warning-ink)]">lista {signo(f.diferenciaM3)}</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td className={`${TD_GTF} uppercase text-[var(--gtf-tinta)]`}>Total</td>
                <td className={TD_NUM_GTF}>{r.trozas}</td>
                <td className={TD_NUM_GTF}>{fmtM3(r.m3)}</td>
                <td className={TD_GTF} />
                <td className={TD_NUM_GTF}>≈{fmtPt(ptAserrableDeRolliza(r.m3))}</td>
                {conCuadro && <td className={TD_NUM_GTF}>{fmtM3(r.declaradoM3 ?? 0)}</td>}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </PapelGtf>
  );
}
