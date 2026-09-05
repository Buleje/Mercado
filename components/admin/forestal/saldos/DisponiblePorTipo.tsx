"use client";

/**
 * Qué hay disponible, separado en rolliza y aserrada.
 *
 * Las dos son madera pero no son lo mismo: una está en el patio esperando la
 * sierra y la otra en el depósito esperando un camión. Mezclarlas en una sola
 * lista respondía «tengo 90 m³» a alguien que necesitaba saber cuánto podía
 * aserrar el lunes.
 *
 * La barra de cada fila muestra su peso en el total, así el volumen se compara
 * de un vistazo sin leer los números uno por uno.
 */

import { useState } from "react";
import { DataTable } from "@buleje/design-system";
import { History } from "@buleje/design-system/icons";
import {
  filasDeAserrada,
  filasDeTrozas,
  paraGrafico,
  resumir,
  type SaldoEspecie,
  type SaldoProducto,
} from "@/lib/forestal/ctp-saldos-vista";

const n3 = (v: number) => v.toLocaleString("es-PE", { maximumFractionDigits: 3 });
const nf = (v: number) => v.toLocaleString("es-PE");

export default function DisponiblePorTipo({
  especies,
  productos,
  onKardex,
}: {
  especies: readonly SaldoEspecie[];
  productos: readonly SaldoProducto[];
  /**
   * Abre el movimiento fila por fila de una especie. El modal ya existía en el
   * sistema pero no había forma de llegar: la tabla que tenía el botón se
   * reemplazó por esta y el atajo se perdió en el camino.
   */
  onKardex?: (especie: string) => void;
}) {
  const [vista, setVista] = useState<"trozas" | "aserrada">("trozas");
  /**
   * Qué se está mirando de esa madera.
   *
   * Eran tres paneles; el de «Resumen» se fue entero. Sus tres KPIs repetían
   * números que ya estaban en las tarjetas de arriba («La que más pesa» era
   * «Depende de» con otro nombre) y sus dos alertas ahora viven en «Qué
   * revisar», que además dice cuál especie y lleva a corregirla.
   */
  const [panel, setPanel] = useState<"reparto" | "detalle">("reparto");

  const filas = vista === "trozas" ? filasDeTrozas(especies) : filasDeAserrada(productos);
  const r = resumir(filas);
  const grafico = paraGrafico(filas);

  const resTrozas = resumir(filasDeTrozas(especies));
  const resAserrada = resumir(filasDeAserrada(productos));
  const totales = { trozas: resTrozas.disponibleM3, aserrada: resAserrada.disponibleM3 };

  return (
    <section className="space-y-4">
      {/* Las dos pestañas muestran su total: se comparan sin cambiar de vista. */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tipo de madera">
        {(
          [
            ["trozas", "Rolliza en patio", "Lo que se puede aserrar", totales.trozas, resTrozas],
            ["aserrada", "Madera Disponible", "Lo que se puede vender", totales.aserrada, resAserrada],
          ] as const
        ).map(([v, titulo, sub, total, res]) => (
          <button
            key={v}
            role="tab"
            aria-selected={vista === v}
            onClick={() => setVista(v)}
            className={`flex-1 rounded-xl border-2 px-4 py-3 text-left transition-colors ${
              vista === v ? "border-primary bg-primary/10" : "border-[var(--rule-base)] hover:border-primary/50"
            }`}
          >
            <span className="block text-base font-extrabold text-[var(--text-primary)]">{titulo}</span>
            <span className="block text-xl font-extrabold tabular-nums text-[var(--text-primary)]">{n3(total)} m³</span>
            <span className="block text-sm text-[var(--text-tertiary)]">
              {sub}
              {res.conStock > 0 && (
                <>
                  {" · "}
                  {res.conStock} {v === "trozas" ? "especies" : "productos"}
                  {res.piezas > 0 && ` · ${nf(res.piezas)} pza`}
                  {res.guias > 0 && ` · ${res.guias} guías`}
                </>
              )}
            </span>
          </button>
        ))}
      </div>

      {r.principal ? (
        <>
          {/* Sub-pestañas: una pregunta por vez. */}
          <div className="flex flex-wrap gap-1 border-b border-[var(--rule-base)]" role="tablist" aria-label="Qué mirar">
            {(
              [
                ["reparto", "Reparto", "Dónde está el volumen"],
                ["detalle", `Detalle (${filas.length})`, "Fila por fila"],
              ] as const
            ).map(([p, titulo, ayuda]) => (
              <button
                key={p}
                role="tab"
                aria-selected={panel === p}
                title={ayuda}
                onClick={() => setPanel(p)}
                className={`-mb-px border-b-2 px-4 py-2 text-base font-bold transition-colors ${
                  panel === p
                    ? "border-primary text-[var(--text-primary)]"
                    : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {titulo}
              </button>
            ))}
          </div>

          {/* ── Barras: el volumen se compara mirando, no leyendo ────────── */}
          {panel === "reparto" && (
          <div className="space-y-2 rounded-xl bg-[var(--surface-sunken)] p-4">
            <p className="text-base font-extrabold text-[var(--text-primary)]">
              Dónde está el volumen
              <span className="ml-2 text-sm font-semibold text-[var(--text-tertiary)]">
                · {n3(r.disponibleM3)} m³ disponibles
              </span>
            </p>
            {grafico.map((g) => (
              <div key={g.nombre} className="space-y-0.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-semibold text-[var(--text-primary)]">{g.nombre}</span>
                  <span className="tabular-nums text-[var(--text-secondary)]">
                    {n3(g.valor)} m³ · {g.pct}%
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-raised)]">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(1, g.pct)}%` }}
                    /* Mínimo 1% para que una especie con poco volumen siga
                       teniendo una barra visible: una barra de 0px se lee como
                       «no hay», y sí hay. */
                  />
                </div>
              </div>
            ))}
          </div>

          )}

          {/* ── El detalle, con cuánto se usó de cada una ────────────────── */}
          {panel === "detalle" && (
          <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
            <DataTable className="w-full text-base">
              <thead className="bg-[var(--surface-sunken)] text-sm">
                <tr>
                  <th className="px-3 py-2 text-left font-bold text-[var(--text-secondary)]">
                    {vista === "trozas" ? "Especie" : "Producto"}
                  </th>
                  <th className="px-3 py-2 text-right font-bold text-[var(--text-secondary)]">Disponible</th>
                  <th className="px-3 py-2 text-right font-bold text-[var(--text-secondary)]">Piezas</th>
                  <th className="px-3 py-2 text-right font-bold text-[var(--text-secondary)]">
                    {vista === "trozas" ? "Ingresó" : "Se produjo"}
                  </th>
                  {vista === "trozas" && (
                    <th className="px-3 py-2 text-right font-bold text-[var(--text-secondary)]">Guías</th>
                  )}
                  <th className="px-3 py-2 text-right font-bold text-[var(--text-secondary)]">Usado</th>
                  {vista === "trozas" && onKardex && <th className="px-3 py-2">&nbsp;</th>}
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.nombre} className="border-t border-[var(--rule-base)]">
                    <td className="px-3 py-2">
                      <span className="font-semibold text-[var(--text-primary)]">{f.nombre}</span>
                      {f.cites && (
                        /* CITES es legal con permiso: se marca como recordatorio
                           de tenerlo a mano, nunca como una falta. */
                        <span className="ml-2 rounded-full bg-[var(--data-info)]/15 px-2 py-0.5 text-sm font-bold text-[var(--data-info)]">
                          CITES
                        </span>
                      )}
                      {f.detalle && <span className="block text-sm italic text-[var(--text-tertiary)]">{f.detalle}</span>}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-extrabold tabular-nums ${
                        f.negativo ? "text-[var(--data-error)]" : "text-[var(--text-primary)]"
                      }`}
                    >
                      {n3(f.disponible)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{f.piezas > 0 ? nf(f.piezas) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{n3(f.total)}</td>
                    {vista === "trozas" && (
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">
                        {f.guias || "—"}
                        {f.promedioPorGuia > 0 && (
                          /* El promedio da la escala: 15 m³ por guía es un
                             camión; 1.5 son retazos que hay que juntar. */
                          <span className="block text-sm text-[var(--text-tertiary)]">
                            {n3(f.promedioPorGuia)} m³ c/u
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{f.usadoPct}%</td>
                    {/* El kardex es por especie: un producto transformado no
                        tiene cuenta corriente de materia prima. */}
                    {vista === "trozas" && onKardex && (
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => onKardex(f.nombre)}
                          className="inline-flex items-center gap-1 rounded-lg border-2 border-[var(--rule-base)] px-2 py-1 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:bg-primary/10 hover:text-[var(--text-primary)]"
                          title={`Movimiento de ${f.nombre}, fila por fila`}
                        >
                          <History className="h-4 w-4" aria-hidden /> Kardex
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              {/* Sin totales había que sumar cuarenta filas a mano para saber si
                  la tabla decía lo mismo que la tarjeta de arriba. */}
              <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] font-bold">
                <tr>
                  <td className="px-3 py-2.5 text-[var(--text-primary)]">
                    Total · {r.conStock} con stock de {r.totalFilas}
                    {/* La suma es de lo POSITIVO, igual que la tarjeta de
                        arriba. Sumar los negativos daría un total más chico y
                        dos cifras distintas para «lo que hay», sin decir por
                        qué difieren — que es justo el error que se acaba de
                        arreglar en el saldo de materia prima. */}
                    {r.enNegativo > 0 && (
                      <span className="block text-sm font-normal text-[var(--text-tertiary)]">
                        sin contar {r.enNegativo} en negativo, que no {r.enNegativo === 1 ? "es stock" : "son stock"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-primary)]">
                    {n3(r.disponibleM3)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-primary)]">
                    {r.piezas > 0 ? nf(r.piezas) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-primary)]">
                    {n3(filas.reduce((a, f) => a + f.total, 0))}
                  </td>
                  {vista === "trozas" && (
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-primary)]">
                      {filas.reduce((a, f) => a + f.guias, 0) || "—"}
                    </td>
                  )}
                  <td />
                  {vista === "trozas" && onKardex && <td />}
                </tr>
              </tfoot>
            </DataTable>
          </div>
          )}
        </>
      ) : (
        <p className="rounded-xl bg-[var(--surface-sunken)] p-4 text-base text-[var(--text-tertiary)]">
          No hay {vista === "trozas" ? "rolliza en el patio" : "aserrada en el depósito"} en este período.
        </p>
      )}
    </section>
  );
}
