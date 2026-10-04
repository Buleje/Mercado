"use client";

/**
 * LothTraceEnPie — los árboles del censo que todavía no se talaron, por especie.
 *
 * Antes eran 61 tarjetas de «Censado, en pie» (Blas, 30-09) mezcladas con los
 * 6 talados: ocho pantallas de scroll para decir «falta talar». Ahora es una
 * línea plegada —«61 árboles en pie · 527 m³ por talar»— y, al abrirla, una
 * tabla chica por especie: cuántos árboles, cuántos m³ de censo y sus códigos.
 *
 * Plegado por defecto y RECORDADO (`loth:arbol:en-pie-abierto`); se abre solo
 * cuando lo pedido son justamente estos árboles (paso «Censo», estado «En
 * pie» o una búsqueda que los encuentra).
 *
 * Punto de extensión: `cupo` agrega una columna por especie (el cupo del
 * permiso lo construye otro módulo; acá sólo se le hace lugar).
 */

import { useId, useState, type ReactNode } from "react";
import { CardTitle, DataTable } from "@buleje/design-system";
import { ChevronDown, Trees } from "@buleje/design-system/icons";
import type { EnPieEspecie, EnPieResumen } from "@/lib/forestal/loth-trace-grupos";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";

/* El padding y la cabecera los pone `DataTable` (sus variantes descendientes le
   ganan a una clase en la celda): acá sólo tamaño y alineación. */
const TH = "text-left";
const TD = "align-top text-sm";

export default function LothTraceEnPie({
  enPie,
  abierto,
  onAbierto,
  forzado = false,
  cupo,
}: {
  enPie: EnPieResumen;
  abierto: boolean;
  onAbierto: (v: boolean) => void;
  /** Abierto porque el filtro lo pide (no cambia la preferencia guardada). */
  forzado?: boolean;
  /** Columna opcional con el cupo de cada especie. Sin ella, no se dibuja. */
  cupo?: (grupo: EnPieEspecie) => ReactNode;
}) {
  const id = useId();
  /* Abierto por el filtro, se puede cerrar igual — pero eso no pisa la
     preferencia guardada: al quitar el filtro vuelve a como la dejaste. */
  const [cierreManual, setCierreManual] = useState<{ forzado: boolean; visible: boolean } | null>(null);
  if (cierreManual && cierreManual.forzado !== forzado) setCierreManual(null);
  if (enPie.arboles === 0) return null;
  const visible = cierreManual?.visible ?? (abierto || forzado);
  const alternar = () => (forzado ? setCierreManual({ forzado, visible: !visible }) : onAbierto(!visible));

  return (
    <section aria-labelledby={`${id}-titulo`} className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]" data-en-pie>
      {/* Patrón acordeón: el título ENVUELVE al botón (un título dentro de un
          botón deja de ser título para el lector de pantalla). */}
      <CardTitle as="h4" id={`${id}-titulo`}>
        <button
          type="button"
          onClick={alternar}
          aria-expanded={visible}
          aria-controls={`${id}-panel`}
          title={visible ? "Plegar. Se recuerda en este navegador." : "Ver los árboles en pie por especie"}
          className="flex min-h-12 w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
        >
          <Trees className="h-5 w-5 shrink-0 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" aria-hidden="true" />
          <span>En pie</span>
          <span className="text-sm font-normal tabular-nums text-[var(--text-secondary)]" data-en-pie-resumen>
            {formatNumber(enPie.arboles)} {enPie.arboles === 1 ? "árbol" : "árboles"} · {fmtM3(enPie.m3)} m³ por talar ·{" "}
            {formatNumber(enPie.especies.length)} {enPie.especies.length === 1 ? "especie" : "especies"}
          </span>
          <ChevronDown className={`ml-auto h-5 w-5 shrink-0 text-[var(--text-tertiary)] transition-transform ${visible ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </CardTitle>

      <div id={`${id}-panel`} hidden={!visible} className="border-t border-[var(--rule-soft)] px-2 pb-2 sm:px-4 sm:pb-4">
        <DataTable className="w-full border-collapse" wrapperClassName="rounded-xl bg-[var(--surface-raised)]">
          <caption className="sr-only">Árboles del censo sin talar, por especie</caption>
          <thead>
            <tr className="border-b border-[var(--rule-base)]">
              <th scope="col" className={TH}>
                Especie
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Árboles
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Censo m³
              </th>
              {cupo && (
                <th scope="col" className={TH}>
                  Cupo
                </th>
              )}
              <th scope="col" className={TH}>
                Códigos
              </th>
            </tr>
          </thead>
          <tbody>
            {enPie.especies.map((g) => (
              <tr key={g.clave} className="border-b border-[var(--rule-soft)] last:border-0" data-especie={g.clave}>
                <td className={`${TD} font-bold text-[var(--text-primary)]`}>{g.especie}</td>
                <td className={`${TD} text-right tabular-nums text-[var(--text-primary)]`}>{formatNumber(g.arboles)}</td>
                <td className={`${TD} text-right tabular-nums text-[var(--text-secondary)]`}>{g.m3 != null ? fmtM3(g.m3) : "—"}</td>
                {cupo && <td className={TD}>{cupo(g)}</td>}
                <td className={`${TD} text-[var(--text-secondary)]`}>{g.codigos.join(", ")}</td>
              </tr>
            ))}
          </tbody>
          {enPie.especies.length > 1 && (
            <tfoot>
              <tr className="border-t-2 border-[var(--rule-base)]">
                <th scope="row" className={`${TD} text-left font-bold text-[var(--text-primary)]`}>
                  Total
                </th>
                <td className={`${TD} text-right font-bold tabular-nums text-[var(--text-primary)]`}>{formatNumber(enPie.arboles)}</td>
                <td className={`${TD} text-right font-bold tabular-nums text-[var(--text-primary)]`}>{fmtM3(enPie.m3)}</td>
                {cupo && <td className={TD} />}
                <td className={TD} />
              </tr>
            </tfoot>
          )}
        </DataTable>
      </div>
    </section>
  );
}
