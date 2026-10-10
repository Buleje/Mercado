"use client";

/**
 * Los dos bloques de VOLUMEN de una guía importada al Libro TH (Brandon
 * 02-10-2026): el «Resumen por especie» —de la lista de trozas: cuántas,
 * cuántos m³, qué parte del volumen y ≈pt aserrable— y, al lado, el «Detalle
 * del producto (37)» tal como lo declara la guía. Van juntos en la misma fila
 * para cotejar lista contra declaración sin bajar la pantalla.
 *
 * Solo lectura: es la declaración de un documento ajeno. El ≈pt es un
 * DERIVADO (rendimiento meta 56 %) y se rotula así; no lo dice la guía.
 */

import { formatNumber } from "@/lib/format";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { ptAserrableDeRolliza } from "@/lib/forestal/loth-restante";
import type { ResumenEspecies } from "@/lib/forestal/loth-importar-guia-resumen";
import type { ProductoGtf } from "@/lib/forestal/serfor-gtf";
import { Bloque } from "./ctp-guia-bloques";
import { TONO } from "./LothImportarGuiasTablas";

const TH =
  "whitespace-nowrap px-2 py-1.5 text-left text-xs font-semibold text-[var(--text-tertiary)]";
const TD = "whitespace-nowrap px-2 py-1.5 align-top";
const NUM = "text-right font-mono tabular-nums";
const signo = (v: number) => (v > 0 ? `+${fmtM3(v)}` : fmtM3(v));

function Especie({ comun, cientifico }: { comun: string; cientifico: string | null }) {
  return (
    <div className="min-w-0 whitespace-normal">
      <span className="font-semibold text-[var(--text-primary)]">{comun}</span>
      {cientifico && (
        <span className="block text-xs italic text-[var(--text-tertiary)]">{cientifico}</span>
      )}
    </div>
  );
}

export function BloqueEspecies({ r, className = "" }: { r: ResumenEspecies; className?: string }) {
  const conCuadro = r.declaradoM3 != null;
  const chip = conCuadro ? (
    <span
      className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold ${r.descuadra ? TONO.aviso : TONO.ok}`}
    >
      {r.descuadra ? "No cuadra con el (37)" : "Cuadra con el (37)"}
    </span>
  ) : null;
  return (
    <Bloque
      titulo="Resumen por especie"
      hint="De la lista de trozas de la guía: cuántas trozas y cuántos m³ de cada especie, y qué parte del volumen es."
      nota="«Declara» es lo que la guía pone en su cuadro de productos (37). Si no coincide con la lista por más de 0,010 m³ (10 litros), la diferencia sale en ámbar. El ≈pt es la madera aserrable que se le sacaría (56 %): un derivado, no lo dice la guía."
      acciones={chip}
      className={className}
    >
      {r.filas.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)] sm:col-span-12">
          La guía no trae lista de trozas ni cuadro de productos.
        </p>
      ) : (
        <div className="-mx-1 overflow-x-auto sm:col-span-12">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={TH}>Especie</th>
                <th className={`${TH} text-right`}>Trozas</th>
                <th className={`${TH} text-right`}>m³</th>
                <th className={TH}>Del volumen</th>
                <th className={`${TH} text-right`}>≈pt</th>
                {conCuadro && <th className={`${TH} text-right`}>Declara (37)</th>}
              </tr>
            </thead>
            <tbody>
              {r.filas.map((f) => (
                <tr key={f.clave} className="border-t border-[var(--rule-soft)]">
                  <td className={TD}>
                    <Especie comun={f.comun} cientifico={f.cientifico} />
                  </td>
                  <td className={`${TD} ${NUM}`}>{f.trozas}</td>
                  <td className={`${TD} ${NUM} font-semibold text-[var(--text-primary)]`}>
                    {fmtM3(f.m3)}
                  </td>
                  <td className={TD}>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
                        aria-hidden
                      >
                        <span
                          className="block h-full rounded-full bg-[var(--accent)]"
                          style={{ width: `${Math.min(100, f.pct)}%` }}
                        />
                      </span>
                      <span className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                        {formatNumber(f.pct, 0)} %
                      </span>
                    </div>
                  </td>
                  <td className={`${TD} ${NUM} text-[var(--text-secondary)]`}>
                    ≈{fmtPt(ptAserrableDeRolliza(f.m3))}
                  </td>
                  {conCuadro && (
                    <td className={`${TD} ${NUM}`}>
                      <span
                        className={
                          f.diferenciaM3 != null
                            ? "font-semibold text-[var(--data-warning-ink)]"
                            : ""
                        }
                      >
                        {fmtM3(f.declaradoM3 ?? 0)}
                      </span>
                      {f.diferenciaM3 != null && (
                        <span className="block text-xs text-[var(--data-warning-ink)]">
                          lista {signo(f.diferenciaM3)}
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--rule-base)] font-bold text-[var(--text-primary)]">
                <td className={TD}>Total</td>
                <td className={`${TD} ${NUM}`}>{r.trozas}</td>
                <td className={`${TD} ${NUM}`}>{fmtM3(r.m3)}</td>
                <td className={TD} />
                <td className={`${TD} ${NUM}`}>≈{fmtPt(ptAserrableDeRolliza(r.m3))}</td>
                {conCuadro && <td className={`${TD} ${NUM}`}>{fmtM3(r.declaradoM3 ?? 0)}</td>}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Bloque>
  );
}

/** (37) El cuadro de productos, como lo declara la guía. */
export function BloqueProductos({
  productos,
  volumenTotal,
}: {
  productos: readonly ProductoGtf[];
  volumenTotal: number | null;
}) {
  const suma = productos.reduce((a, p) => a + (p.volumen ?? 0), 0);
  const total = volumenTotal ?? suma;
  return (
    <Bloque
      titulo="Detalle del producto (37)"
      hint="El cuadro de productos tal como lo publica SERFOR: especie, tipo de producto, presentación, cantidad y volumen declarado."
      nota="No se recalcula: es lo que dice el documento. El total es el que publica SERFOR; si no lo publica, la suma de las filas."
    >
      <div className="-mx-1 overflow-x-auto sm:col-span-12">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={TH}>Especie (37a · 37b)</th>
              <th className={TH}>Producto (37c)</th>
              <th className={TH}>Presentación</th>
              <th className={`${TH} text-right`}>Cantidad</th>
              <th className={`${TH} text-right`}>m³</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p, i) => (
              <tr
                key={`${p.comun ?? p.cientifico ?? "p"}-${i}`}
                className="border-t border-[var(--rule-soft)]"
              >
                <td className={TD}>
                  <Especie
                    comun={p.comun || p.cientifico || "—"}
                    cientifico={p.comun ? p.cientifico : null}
                  />
                </td>
                <td className={`${TD} text-[var(--text-secondary)]`}>{p.tipoProducto || "—"}</td>
                <td className={`${TD} text-[var(--text-secondary)]`}>{p.presentacion || "—"}</td>
                <td className={`${TD} ${NUM}`}>
                  {p.cantidad == null ? "—" : formatNumber(p.cantidad, 0)}
                  {p.unidad && (
                    <span className="ml-1 font-sans text-xs text-[var(--text-tertiary)]">
                      {p.unidad}
                    </span>
                  )}
                </td>
                <td className={`${TD} ${NUM} font-semibold text-[var(--text-primary)]`}>
                  {p.volumen == null ? "—" : fmtM3(p.volumen)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--rule-base)] font-bold text-[var(--text-primary)]">
              <td className={TD} colSpan={4}>
                Total declarado
              </td>
              <td className={`${TD} ${NUM}`}>{fmtM3(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Bloque>
  );
}
