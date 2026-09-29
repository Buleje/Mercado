"use client";

/**
 * «Lista de trozas» del despacho con guía: qué trozas del Trozado van en el
 * camión, y lo que eso escribe en el papel — el DETALLE POR ESPECIE (37) y la
 * LISTA DE TROZAS O CUARTONES A MOVILIZAR.
 *
 * Sólo se ofrecen las trozas que todavía pueden salir (registradas, sin
 * despacho ni consumo: T1), agrupadas por árbol como se trozaron. Las medidas y
 * el volumen son los del Trozado: la guía no los recalcula, así el libro y el
 * papel dicen lo mismo de la misma pieza.
 */

import { Fragment, useMemo, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { Search, TreePine } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { detallePorEspecie, ordenarPiezas, totalM3, type TrozaDelLibro } from "@/lib/forestal/loth-guia-despacho";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import type { DespachoGuiaLoth } from "./hooks/use-despacho-guia-loth";
import { Bloque } from "./ctp-guia-bloques";
import { I } from "./ctp-shared";
import LothGuiaListaMovilizar, { MARCO, TD, TDR, TH, THR, dec } from "./LothGuiaListaMovilizar";

const cm = (m: number | null) => (m == null ? null : Math.round(m * 1000) / 10);

/** Desde cuántas trozas aparece el buscador: con cuatro filas estorba. */
const CON_BUSCADOR = 8;

interface Grupo {
  arbol: string;
  especie: string;
  trozas: TrozaDelLibro[];
}

function agrupar(trozas: readonly TrozaDelLibro[]): Grupo[] {
  const m = new Map<string, Grupo>();
  for (const t of ordenarPiezas(trozas)) {
    const k = t.arbol ?? "Sin árbol";
    const g = m.get(k) ?? { arbol: k, especie: t.comun ?? "", trozas: [] };
    g.trozas.push(t);
    m.set(k, g);
  }
  return [...m.values()];
}

export default function LothGuiaTrozas({
  g,
  cientificoDe,
}: {
  g: DespachoGuiaLoth;
  cientificoDe?: (comun: string) => string | null | undefined;
}) {
  const [q, setQ] = useState("");
  const grupos = useMemo(() => {
    const t = q.trim().toLowerCase();
    const visibles = t
      ? g.trozasDelPlan.filter((x) => x.codigo.toLowerCase().includes(t) || (x.comun ?? "").toLowerCase().includes(t))
      : g.trozasDelPlan;
    return agrupar(visibles);
  }, [g.trozasDelPlan, q]);
  const detalle = useMemo(() => detallePorEspecie(g.piezas, cientificoDe), [g.piezas, cientificoDe]);
  const total = totalM3(g.piezas);
  const variosPlanes = g.planesConTrozas.length + (g.hayTrozasSinPlan ? 1 : 0) > 1;

  function alternar(codigos: string[], marcar: boolean) {
    g.setElegidas((prev) => {
      const s = new Set(prev);
      for (const c of codigos) {
        if (marcar) s.add(c);
        else s.delete(c);
      }
      return s;
    });
  }

  return (
    /* Lado a lado sólo desde 2xl: a 1280 la lista (10 columnas) no entraba en
       la columna derecha y escondía el volumen tras un scroll lateral. */
    <div className="grid gap-3 2xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] 2xl:items-start">
      <Bloque
        titulo="Trozas sin despachar"
        hint="Las trozas del Trozado que todavía no salieron ni se consumieron. Elige las que van en este camión: se asienta una línea de Despacho por cada una."
        nota="Una guía ampara un solo título habilitante: si hay trozas de dos planes, se hace una guía por plan."
        faltan={g.piezas.length === 0 ? ["Trozas que salen"] : []}
        acciones={
          variosPlanes ? (
            <label className="inline-flex items-center gap-2 text-sm">
              <span className="font-medium text-[var(--text-secondary)]">Plan</span>
              <select
                className={`${I} h-9 w-auto max-w-[16rem]`}
                value={g.planId ?? ""}
                onChange={(e) => g.setPlanId(e.target.value || null)}
              >
                {g.planesConTrozas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {[p.planNumber || p.planType, p.titularName].filter(Boolean).join(" · ")}
                  </option>
                ))}
                {g.hayTrozasSinPlan && <option value="">Trozas sin plan</option>}
              </select>
            </label>
          ) : null
        }
      >
        {g.trozasDelPlan.length > CON_BUSCADOR && (
          <label className="flex h-11 items-center gap-2 rounded-xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 focus-within:border-[var(--accent)] sm:col-span-12">
            <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
            <span className="sr-only">Buscar troza</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Código o especie"
              className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
            />
          </label>
        )}
        {g.trozasDelPlan.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--rule-base)] p-6 text-center text-sm text-[var(--text-secondary)] sm:col-span-12">
            <TreePine className="mx-auto mb-2 h-7 w-7 opacity-40" aria-hidden="true" />
            No hay trozas sin despachar en el Trozado de este plan.
          </div>
        ) : (
          <div className={`${MARCO} max-h-[28rem] overflow-y-auto`}>
            <DataTable className="w-full text-sm">
              <thead className="sticky top-0 z-[1] bg-[var(--surface-sunken)]">
                <tr>
                  <th className={TH}>
                    <span className="sr-only">Elegir</span>
                  </th>
                  <th className={TH}>Troza</th>
                  <th className={THR}>D1 cm</th>
                  <th className={THR}>D2 cm</th>
                  <th className={THR}>L m</th>
                  <th className={THR}>m³</th>
                  <th className={TH}>Trozada</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((gr) => {
                  const codigos = gr.trozas.map((t) => t.codigo);
                  const todas = codigos.every((c) => g.elegidas.has(c));
                  const algunas = !todas && codigos.some((c) => g.elegidas.has(c));
                  return (
                    <Fragment key={gr.arbol}>
                      <tr className="border-t border-[var(--rule-base)] bg-[var(--surface-canvas)]">
                        <td className={TD}>
                          <input
                            type="checkbox"
                            checked={todas}
                            ref={(el) => {
                              if (el) el.indeterminate = algunas;
                            }}
                            onChange={(e) => alternar(codigos, e.target.checked)}
                            aria-label={`Todas las trozas del árbol ${gr.arbol}`}
                            className="h-4 w-4 accent-[var(--accent)]"
                          />
                        </td>
                        <td colSpan={6} className={`${TD} font-semibold`}>
                          Árbol <span className="font-mono">{gr.arbol}</span>
                          {gr.especie && <span className="font-normal text-[var(--text-secondary)]"> · {gr.especie}</span>}
                          <span className="font-normal text-[var(--text-tertiary)]">
                            {" "}· {gr.trozas.length} {gr.trozas.length === 1 ? "troza" : "trozas"}
                          </span>
                        </td>
                      </tr>
                      {gr.trozas.map((t) => {
                        const elegida = g.elegidas.has(t.codigo);
                        return (
                          <tr key={t.id} className={`border-t border-[var(--rule-soft)] ${elegida ? "bg-[var(--surface-sunken)]" : ""}`}>
                            <td className={TD}>
                              <input
                                id={`troza-${t.id}`}
                                type="checkbox"
                                checked={elegida}
                                onChange={(e) => alternar([t.codigo], e.target.checked)}
                                className="h-4 w-4 accent-[var(--accent)]"
                              />
                            </td>
                            <td className={TD}>
                              <label htmlFor={`troza-${t.id}`} className="cursor-pointer whitespace-nowrap font-mono font-bold">
                                {t.codigo}
                              </label>
                              {t.cites && (
                                <span className="ml-1.5 rounded bg-[var(--data-error-100)] px-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">CITES</span>
                              )}
                            </td>
                            <td className={TDR}>{dec(cm(t.diamMayorM), 1)}</td>
                            <td className={TDR}>{dec(cm(t.diamMenorM), 1)}</td>
                            <td className={TDR}>{dec(t.lengthM, 2)}</td>
                            <td className={`${TDR} font-bold`}>{t.volumeM3 == null ? "—" : fmtM3(t.volumeM3)}</td>
                            <td className={`${TD} whitespace-nowrap text-[var(--text-secondary)]`}>{t.fecha ? etiquetaLarga(t.fecha) : "—"}</td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </DataTable>
          </div>
        )}
      </Bloque>

      <div className="grid gap-3">
        <Bloque
          titulo="Detalle del producto"
          hint="Casillero (37): una línea por especie, con cuántas trozas y cuántos metros cúbicos. Se arma solo con las trozas elegidas."
        >
          <div className={MARCO}>
            <DataTable className="w-full text-sm">
              <thead className="bg-[var(--surface-sunken)]">
                <tr>
                  <th className={TH}>N. científico</th>
                  <th className={TH}>N. común</th>
                  <th className={TH}>Producto</th>
                  <th className={TH}>Embalaje</th>
                  <th className={THR}>Cant.</th>
                  <th className={TH}>Unidad</th>
                  <th className={THR}>Total</th>
                </tr>
              </thead>
              <tbody>
                {detalle.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={`${TD} py-4 text-center text-[var(--text-tertiary)]`}>Elige las trozas que salen.</td>
                  </tr>
                ) : (
                  detalle.map((l) => (
                    <tr key={l.comun} className="border-t border-[var(--rule-soft)]">
                      <td className={`${TD} italic ${l.cientifico ? "" : "text-[var(--text-tertiary)]"}`}>{l.cientifico || "Falta"}</td>
                      <td className={`${TD} font-semibold`}>{l.comun || "—"}</td>
                      <td className={`${TD} whitespace-nowrap`}>{l.tipoProducto}</td>
                      <td className={TD}>{l.presentacion}</td>
                      <td className={TDR}>{l.cantidad}</td>
                      <td className={`${TD} whitespace-nowrap`}>{l.unidad}</td>
                      <td className={`${TDR} font-bold`}>{fmtM3(l.total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {detalle.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-[var(--rule-base)]">
                    <td colSpan={6} className={`${TD} text-right text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]`}>Volumen total</td>
                    <td className={`${TDR} font-bold`}>{fmtM3(total)}</td>
                  </tr>
                </tfoot>
              )}
            </DataTable>
          </div>
        </Bloque>

        <LothGuiaListaMovilizar g={g} cientificoDe={cientificoDe} />
      </div>
    </div>
  );
}
