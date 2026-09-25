"use client";

/**
 * El detalle fila por fila de lo disponible, con cuánto se usó de cada una.
 *
 * Las filas «sin nada» se pueden ocultar con un interruptor APAGADO por
 * defecto: esta pantalla ya escondió una vez la única fila que había que
 * corregir (la especie en negativo). Un filtro que el operador prende es otra
 * cosa que un default que decide por él qué madera no existe.
 */

import { DataTable } from "@buleje/design-system";
import { History } from "@buleje/design-system/icons";
import type { FilaDeSaldo, ResumenDeSaldo } from "@/lib/forestal/ctp-saldos-vista";
import { formatNumber } from "@/lib/format";

const n3 = (v: number) => formatNumber(v, 3);
const nf = (v: number) => formatNumber(v);
const TH = "px-3 py-2 font-bold text-[var(--text-secondary)]";

/**
 * «Sin nada» mira las CUATRO cosas a propósito: con sólo «disponible en cero»
 * se escondían las especies que muestran 0 m³ con trozas paradas en el patio
 * —justo la contradicción que hay que mirar— y la fila en negativo.
 */
const sinNada = (f: FilaDeSaldo) =>
  f.disponible === 0 && f.piezas === 0 && f.total === 0 && !f.negativo;

export default function DetalleDisponible({
  vista,
  filas,
  resumen: r,
  onKardex,
  soloConAlgo,
  onSoloConAlgo,
}: {
  vista: "trozas" | "aserrada";
  filas: readonly FilaDeSaldo[];
  resumen: ResumenDeSaldo;
  onKardex?: (especie: string) => void;
  /** Vive arriba: sobrevive a ir a «Reparto» y volver. */
  soloConAlgo: boolean;
  onSoloConAlgo: (v: boolean) => void;
}) {
  const rolliza = vista === "trozas";
  const conKardex = rolliza && Boolean(onKardex);
  const ocultables = filas.filter(sinNada).length;
  const visibles = soloConAlgo ? filas.filter((f) => !sinNada(f)) : filas;

  return (
    <div className="space-y-2">
      {/* Sólo si de verdad hay algo que recortar: «ocultar 0 filas» no hace nada. */}
      {ocultables > 0 && (
        <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={soloConAlgo}
            onChange={(e) => onSoloConAlgo(e.target.checked)}
            className="h-5 w-5 accent-[var(--accent)]"
          />
          Ver solo las que tienen volumen o trozas
          <span className="text-[var(--text-tertiary)]">
            ({ocultables} sin nada de las {filas.length})
          </span>
        </label>
      )}
      <DataTable className="w-full text-base" wrapperClassName="rounded-xl">
        <thead className="bg-[var(--surface-sunken)] text-sm">
          <tr>
            <th scope="col" className={`${TH} text-left`}>
              {rolliza ? "Especie" : "Producto"}
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Disponible (m³)
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Piezas
            </th>
            <th scope="col" className={`${TH} text-right`}>
              {rolliza ? "Ingresó" : "Se produjo"}
            </th>
            {rolliza && (
              <th scope="col" className={`${TH} text-right`}>
                Guías
              </th>
            )}
            <th scope="col" className={`${TH} text-right`}>
              Usado
            </th>
            {conKardex && (
              <th scope="col" className={TH}>
                <span className="sr-only">Acciones</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {visibles.map((f) => (
            <tr key={f.nombre} className="border-t border-[var(--rule-base)]">
              <td className="px-3 py-2">
                <span className="font-semibold text-[var(--text-primary)]">{f.nombre}</span>
                {f.cites && (
                  /* CITES es legal con permiso: recordatorio, nunca una falta. */
                  <span className="ml-2 rounded-full border border-[var(--data-info-500)] px-2 py-0.5 text-sm font-bold text-[var(--text-primary)]">
                    CITES
                  </span>
                )}
                {f.detalle && (
                  <span className="block text-sm italic text-[var(--text-tertiary)]">
                    {f.detalle}
                  </span>
                )}
              </td>
              <td
                className={`px-3 py-2 text-right font-extrabold tabular-nums ${
                  f.negativo ? "text-[var(--data-error-ink)]" : "text-[var(--text-primary)]"
                }`}
              >
                {n3(f.disponible)}
                {/* Cero al lado de piezas: dos números de la misma fila que se
                    contradicen. No se afirma la causa —ingreso sin validar o
                    troza sin cubicar—: se dice el hecho. */}
                {f.disponible === 0 && f.piezas > 0 && (
                  <span className="block text-sm font-normal text-[var(--data-warning-ink)]">
                    hay trozas, sin volumen en el saldo
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">
                {f.piezas > 0 ? nf(f.piezas) : "—"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">
                {n3(f.total)}
              </td>
              {rolliza && (
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">
                  {f.guias || "—"}
                  {/* El promedio da la escala: 15 m³ por guía es un camión; 1,5 son retazos. */}
                  {f.promedioPorGuia > 0 && (
                    <span className="block text-sm text-[var(--text-tertiary)]">
                      {n3(f.promedioPorGuia)} m³ c/u
                    </span>
                  )}
                </td>
              )}
              <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">
                {f.usadoPct} %
              </td>
              {conKardex && (
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onKardex?.(f.nombre)}
                    aria-label={`Kardex de ${f.nombre}: movimiento fila por fila`}
                    className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:bg-primary/10 hover:text-[var(--text-primary)]"
                  >
                    <History className="h-4 w-4" aria-hidden /> Kardex
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {/* Sin totales había que sumar cuarenta filas a mano para saber si la
            tabla decía lo mismo que la tarjeta de arriba. */}
        <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] font-bold">
          <tr>
            <td className="px-3 py-2.5 text-[var(--text-primary)]">
              Total · {r.conStock} con stock de {r.totalFilas}
              {/* La suma es de lo POSITIVO, igual que la tarjeta de arriba. */}
              {r.enNegativo > 0 && (
                <span className="block text-sm font-normal text-[var(--text-tertiary)]">
                  sin contar {r.enNegativo} en negativo, que no{" "}
                  {r.enNegativo === 1 ? "es stock" : "son stock"}
                </span>
              )}
            </td>
            <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-primary)]">
              {n3(r.disponibleM3)}
            </td>
            <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-primary)]">
              {/* Las piezas se cuentan TODAS, también las de una fila en negativo:
                  una troza en el patio es física, no depende del signo del m³. */}
              {r.piezasTotales > 0 ? nf(r.piezasTotales) : "—"}
            </td>
            <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-primary)]">
              {n3(filas.reduce((a, f) => a + f.total, 0))}
            </td>
            {rolliza && (
              <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-primary)]">
                {filas.reduce((a, f) => a + f.guias, 0) || "—"}
              </td>
            )}
            <td />
            {conKardex && <td />}
          </tr>
        </tfoot>
      </DataTable>
    </div>
  );
}
