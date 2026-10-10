"use client";

/**
 * «Volumen del permiso» por especie: la tabla plegable, con el autofiltro de
 * cada columna (Brandon 07-10). La fila del total es la del PERMISO y queda
 * siempre: filtrar esconde especies, no recalcula el total (un total armado en
 * el cliente podría discrepar del que calcula el servidor).
 */

import { useMemo } from "react";
import { DataTable } from "@buleje/design-system";
import { AlertTriangle } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import type { CascadaEspecie } from "@/lib/forestal/loth-saldo-cascada";
import { BarraFiltrosTabla, FiltroEnCabecera, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro } from "./filtros-tabla-forestal";
import { HOJA_MOVIL } from "./loth-tablero-estilos";

export interface TramoVolumen {
  k: keyof CascadaEspecie;
  label: string;
}

const TH = "px-3 py-2 text-right text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";
const TD = "px-3 py-2 text-right font-mono tabular-nums";

function columnasDe(base: string, tramos: readonly TramoVolumen[]): ColumnaFiltro<CascadaEspecie>[] {
  return [
    { id: "especie", label: "Especie", tipo: "multi", valor: (e) => e.especie, clave: claveEspecie },
    { id: "baseM3", label: base, tipo: "rango", numero: (e) => e.baseM3, unidad: "m³", paso: 0.001 },
    ...tramos.map(
      (x): ColumnaFiltro<CascadaEspecie> => ({ id: x.k, label: x.label, tipo: "rango", numero: (e) => e[x.k] as number, unidad: "m³", paso: 0.001 }),
    ),
  ];
}

export default function LothTableroVolumenEspecies({
  especies,
  total,
  base,
  tramos,
}: {
  especies: readonly CascadaEspecie[];
  /** La fila del permiso (la calcula el servidor). */
  total: CascadaEspecie;
  /** «Autorizado» o «Registrado». */
  base: string;
  tramos: readonly TramoVolumen[];
}) {
  // `tramos` es una constante de módulo del que llama: las columnas no cambian entre renders.
  const columnas = useMemo(() => columnasDe(base, tramos), [base, tramos]);
  const f = useFiltrosTabla(especies, columnas);
  const filas = [...f.filtradas, total];
  const filtro = (id: string) => <FiltroEnCabecera id={id} f={f} compacto />;

  return (
    <div className="min-w-0 space-y-2">
      <BarraFiltrosTabla f={f} />
      <DataTable className={`w-full text-sm ${HOJA_MOVIL}`} wrapperClassName="max-w-full rounded-xl">
        <thead className="bg-[var(--surface-sunken)]">
          <tr>
            <th className={`${TH} text-left`}>
              <span className="whitespace-nowrap">Especie{filtro("especie")}</span>
            </th>
            <th className={TH}>
              <span className="whitespace-nowrap">
                {base}
                {filtro("baseM3")}
              </span>
            </th>
            {tramos.map((x) => (
              <th key={x.k} className={TH}>
                <span className="whitespace-nowrap">
                  {x.label}
                  {filtro(x.k)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {f.filtradas.length === 0 && especies.length > 0 && <SinCoincidenciasFila colSpan={2 + tramos.length} />}
          {filas.map((e) => (
            <tr key={e === total ? "__total" : e.especie} className={`border-t border-[var(--rule-soft)] ${e === total ? "bg-[var(--surface-sunken)] font-bold" : ""}`}>
              <td className="px-3 py-2 text-left text-[var(--text-primary)]" title={e === total && f.activos > 0 ? "Total del permiso: no cambia con los filtros" : undefined}>
                {e.especie}
                {e.excedido && e !== total && <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-[var(--data-error-500)]" aria-label="se pasó" />}
              </td>
              <td className={`${TD} text-[var(--text-primary)]`}>{fmtM3(e.baseM3)}</td>
              {tramos.map((x) => (
                <td key={x.k} className={`${TD} ${(e[x.k] as number) < 0 ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--text-secondary)]"}`}>
                  {fmtM3(e[x.k] as number)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
