"use client";

/**
 * La cabecera de la tabla del patio, con sus autofiltros estilo Excel.
 *
 * Salió de `CtpTrozasIngresadas` (2026-09-24) cuando la tabla sumó la acción y
 * la barra de búsqueda dentro de su tarjeta y pasaba las 300 líneas. El orden
 * de columnas no cambió: del papel (guía, permiso) a la pieza (codificación,
 * código de planta), después lo que se mide y el estado (Brandon, 2026-09-02).
 */

import { FiltroColumnaMulti, FiltroColumnaRango, type Rango } from "@/components/admin/shared/filtros-columna";
import { EnOrden } from "@/components/admin/shared/columnas-ordenables";
import type { UseOrdenColumnasResult } from "@/components/admin/shared/columnas-ordenables";
import { TheadCtp } from "./ctp-tabla";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import type { FiltrosPatioColumna } from "./CtpTrozasIngresadas";

/** Las columnas que se arrastran (Brandon, 2026-09-26): la casilla de elegir
 *  queda fija, no es un dato de la pieza. */
export const ORDEN_TROZAS_INGRESADAS_DEFECTO = [
  "guia", "permiso", "codigo", "especie", "medidas", "volumen", "estado", "patio", "asiento",
] as const;

export default function CtpTrozasIngresadasThead({
  fc,
  seleccionable,
  todasElegidas,
  libres,
  seleccion,
  onSeleccion,
  orden,
}: {
  fc: FiltrosPatioColumna;
  seleccionable: boolean;
  todasElegidas: boolean;
  libres: readonly TrozaConsumible[];
  seleccion: Set<string>;
  onSeleccion: (ids: Set<string>) => void;
  /** El orden que dejó el operador arrastrando los títulos. */
  orden: Pick<UseOrdenColumnasResult, "orden" | "refCabecera">;
}) {
  return (
    <TheadCtp ref={orden.refCabecera}>
      <tr>
        {seleccionable && (
          <th scope="col" data-label="Elegir" className="px-3 py-2">
            <input
              type="checkbox"
              checked={todasElegidas}
              onChange={(e) => {
                const next = new Set(seleccion);
                for (const t of libres) {
                  if (e.target.checked) next.add(t.id);
                  else next.delete(t.id);
                }
                onSeleccion(next);
              }}
              aria-label="Elegir todas las trozas libres del filtro"
              className="h-6 w-6 cursor-pointer accent-[var(--accent)]"
            />
          </th>
        )}
        {/* Del papel (guía, permiso) a la pieza (codificación, código de
            planta), después lo que se mide y el estado (Brandon, 2026-09-02) —
            salvo que el operador las haya arrastrado a otro orden. */}
        <EnOrden
          orden={orden.orden}
          celdas={{
            guia: (
              <th scope="col" data-col="guia" data-label="Guía" className="px-2! py-2 font-bold">
                <span className="block">Guía</span>
                {fc.guia && <FiltroColumnaMulti label="Guía" {...fc.guia} placeholder="Todas" />}
              </th>
            ),
            permiso: (
              <th scope="col" data-col="permiso" data-label="Permiso" className="px-2! py-2 font-bold">
                <span className="block">Permiso</span>
                {fc.permiso && <FiltroColumnaMulti label="Permiso" {...fc.permiso} placeholder="Todos" />}
              </th>
            ),
            codigo: <th scope="col" data-col="codigo" data-label="Código" className="px-2! py-2 font-bold">Código</th>,
            especie: (
              <th scope="col" data-col="especie" data-label="Especie" className="px-2! py-2 font-bold">
                <span className="block">Especie</span>
                {fc.especie && <FiltroColumnaMulti label="Especie" {...fc.especie} placeholder="Todas" />}
              </th>
            ),
            medidas: (
              <th scope="col" data-col="medidas" data-label="Medidas" className="px-2! py-2 font-bold">
                <span className="block">Ø cm · largo m</span>
                {fc.largo && fc.largo.conDato > 0 && (
                  <FiltroColumnaRango label="Largo" unidad="m" valor={fc.largo.valor} placeholder="Largo"
                    onChange={(r) => fc.largo?.onChange(r as Rango<number>)} />
                )}
                {fc.diametro && fc.diametro.conDato > 0 && (
                  <FiltroColumnaRango label="Diámetro" unidad="cm" paso={1} valor={fc.diametro.valor} placeholder="Ø"
                    onChange={(r) => fc.diametro?.onChange(r as Rango<number>)} />
                )}
              </th>
            ),
            volumen: <th scope="col" data-col="volumen" className="px-2! py-2 text-right font-bold">m³</th>,
            estado: <th scope="col" data-col="estado" className="px-2! py-2 font-bold">Estado</th>,
            patio: (
              <th scope="col" data-col="patio" data-label="En el patio" className="px-2! py-2 font-bold">
                <span className="block">En el patio</span>
                {fc.tramos && <FiltroColumnaMulti label="Días en el patio" {...fc.tramos} placeholder="Todos" />}
              </th>
            ),
            asiento: (
              <th scope="col" data-col="asiento" data-label="Asiento de la guía" className="relative px-2! py-2 font-bold">
                Asiento<span className="sr-only"> de la guía en el libro (no es la recepción)</span>
              </th>
            ),
          }}
        />
      </tr>
    </TheadCtp>
  );
}
