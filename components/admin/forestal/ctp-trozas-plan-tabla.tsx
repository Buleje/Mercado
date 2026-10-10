"use client";

/**
 * La lista del plan de aserrío: agrupada por especie, la más vieja primero,
 * con el subtotal de cada especie y el total del día. Cada fila se puede
 * quitar (entra la siguiente de la fila) y abajo se agregan las que quedaron
 * afuera (suman por encima de la meta).
 */

import { useState } from "react";
import { DataTable } from "@buleje/design-system";
import { Plus, X } from "@buleje/design-system/icons";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";
import type { FilaPlan, PlanAserrio } from "@/lib/forestal/plan-aserrio";
import { Btn } from "./ctp-shared";
import { claseDias, n, NUM, tituloDias } from "./ctp-trozas-lista-shared";
import { ValorMedida } from "./ctp-trozas-medidas-ui";

const pt = (v: number | null) => (v == null ? "—" : `≈${fmtPt(v)}`);
const etiqueta = (f: FilaPlan) =>
  `${f.codigo ?? "Sin código"} · ${f.especie} · ${f.m3 == null ? "sin volumen" : `${fmtM3(f.m3)} m³`}${f.dias == null ? "" : ` · ${f.dias} d`}`;

export default function CtpTrozasPlanTabla({
  plan,
  onQuitar,
  onAgregar,
  onVerFicha,
}: {
  plan: PlanAserrio;
  onQuitar: (id: string) => void;
  onAgregar: (id: string) => void;
  onVerFicha?: (id: string) => void;
}) {
  const conPt = plan.total.pt != null;
  const columnas = conPt ? 11 : 10;
  let i = 0;

  return (
    <div className="space-y-3">
      {plan.total.piezas > 0 && (
        <DataTable stickyHeader wrapperClassName="max-h-[52vh]" className="w-full text-sm [&_thead_th]:px-2!">
          <thead>
            <tr>
              <th className="w-10">N°</th>
              <th>Código</th>
              <th className="text-right">D1 cm</th>
              <th className="text-right">D2 cm</th>
              <th className="text-right">Largo m</th>
              <th className="text-right">m³</th>
              <th className="text-right">Días</th>
              <th>Cancha</th>
              {conPt && <th className="text-right" title="Estimado: m³ × rendimiento del libro × 424">pt est.</th>}
              <th className="text-right" data-label="Quitar">
                <span className="sr-only">Quitar del plan</span>
              </th>
            </tr>
          </thead>
          {plan.grupos.map((g) => (
            <tbody key={g.especie}>
              <tr className="bg-[var(--surface-sunken)]">
                <td colSpan={columnas} className="!py-1.5 text-sm font-bold text-[var(--text-primary)]">
                  {g.especie}
                  <span className="ml-2 font-mono text-xs font-bold tabular-nums text-[var(--text-secondary)]">
                    {g.piezas} {g.piezas === 1 ? "pieza" : "piezas"} · {fmtM3(g.m3)} m³{g.pt == null ? "" : ` · ${pt(g.pt)} pt`}
                  </span>
                </td>
              </tr>
              {g.filas.map((f) => {
                i += 1;
                return (
                  <tr key={f.id}>
                    <td className={`${NUM} text-[var(--text-secondary)]`}>{i}</td>
                    <td className="whitespace-nowrap font-mono font-bold text-[var(--text-primary)]">
                      {onVerFicha ? (
                        <button
                          type="button"
                          onClick={() => onVerFicha(f.id)}
                          className="underline decoration-[var(--rule-strong)] underline-offset-2 hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
                          aria-label={`Ver ficha de ${f.codigo ?? "la pieza"}`}
                        >
                          {f.codigo ?? "—"}
                        </button>
                      ) : (
                        (f.codigo ?? "—")
                      )}
                      {f.aMano && (
                        <span className="ml-1.5 rounded-md bg-[var(--accent-soft)] px-1.5 font-sans text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">
                          a mano
                        </span>
                      )}
                    </td>
                    <td className={NUM}><ValorMedida v={f.d1} fuente={f.fuente} /></td>
                    <td className={NUM}><ValorMedida v={f.d2} fuente={f.fuente} /></td>
                    <td className={`${NUM} text-[var(--text-secondary)]`}>{n(f.largoM)}</td>
                    <td className={`${NUM} font-bold text-[var(--text-primary)]`}>{f.m3 == null ? "—" : fmtM3(f.m3)}</td>
                    <td className={NUM}>
                      <span className={`inline-block whitespace-nowrap font-bold ${claseDias(f.dias)}`} title={tituloDias(f.dias)}>
                        {f.dias == null ? "—" : `${f.dias} d`}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-[var(--text-secondary)]">{f.cancha ?? "—"}</td>
                    {conPt && <td className={`${NUM} text-[var(--text-primary)]`}>{pt(f.pt)}</td>}
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() => onQuitar(f.id)}
                        aria-label={`Quitar ${f.codigo ?? "la pieza"} del plan`}
                        title="Quitar del plan (entra la siguiente de la fila)"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
          <tfoot className="sticky bottom-0 border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
            <tr>
              <td colSpan={5} className="text-right text-sm font-bold text-[var(--text-primary)]">
                Total del día · {plan.total.piezas} {plan.total.piezas === 1 ? "pieza" : "piezas"}
              </td>
              <td className={`${NUM} font-bold text-[var(--text-primary)]`}>{fmtM3(plan.total.m3)}</td>
              <td colSpan={2} />
              {conPt && <td className={`${NUM} font-bold text-[var(--text-primary)]`}>{pt(plan.total.pt)}</td>}
              <td />
            </tr>
          </tfoot>
        </DataTable>
      )}
      <AgregarAMano fuera={plan.fuera} onAgregar={onAgregar} />
    </div>
  );
}

/** Las libres que quedaron afuera, la más vieja primero: se suman a mano. */
function AgregarAMano({ fuera, onAgregar }: { fuera: readonly FilaPlan[]; onAgregar: (id: string) => void }) {
  const [id, setId] = useState("");
  if (fuera.length === 0) return null;
  const elegido = fuera.some((f) => f.id === id) ? id : "";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-bold text-[var(--text-secondary)]">
        <span className="whitespace-nowrap">Agregar a mano</span>
        <select
          value={elegido}
          onChange={(e) => setId(e.target.value)}
          className="h-11 min-w-0 flex-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-normal text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)] sm:max-w-[26rem]"
        >
          <option value="">{fuera.length} libres fuera del plan…</option>
          {fuera.map((f) => (
            <option key={f.id} value={f.id}>{etiqueta(f)}</option>
          ))}
        </select>
      </label>
      <Btn
        disabled={!elegido}
        onClick={() => {
          onAgregar(elegido);
          setId("");
        }}
      >
        <Plus className="h-4 w-4" aria-hidden="true" /> Agregar
      </Btn>
    </div>
  );
}
