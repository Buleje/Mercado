"use client";

/**
 * Margen árbol por árbol. Contesta «¿convino tumbar ESTE?», que el promedio por
 * especie no puede contestar: un fuste que rindió 30% y otro que rindió 80%
 * viven en la misma fila de la especie.
 */

import { StatCard, DataTable } from "@buleje/design-system";
import { Award, Coins, TrendingUp } from "@buleje/design-system/icons";
import type { margenPorArbol, resumirMargenArbol } from "@/lib/forestal/loth-margen-arbol";
import { useKpisPlegables } from "./kpis-plegables";
import { BarraMargen, Td, Th, soles } from "./loth-rentabilidad-celdas";
import {
  BarraFiltrosTabla,
  FiltroEnCabecera,
  SinCoincidenciasFila,
  useFiltrosTabla,
  type ColumnaFiltro,
} from "./filtros-tabla-forestal";

type FilaArbol = ReturnType<typeof margenPorArbol>[number];

/** Ingreso y Margen en blanco (—) cuando no hay plata que contar: un rango no los trae. */
const COLUMNAS_ARBOLES: ColumnaFiltro<FilaArbol>[] = [
  { id: "arbol", label: "Árbol", tipo: "texto", valor: (f) => f.tree },
  { id: "especie", label: "Especie", tipo: "multi", valor: (f) => f.especie },
  { id: "talado", label: "Talado", tipo: "rango", numero: (f) => f.taladoM3, unidad: "m³", paso: 0.1 },
  { id: "movilizado", label: "Movilizado", tipo: "rango", numero: (f) => (f.movilizadoM3 > 0 ? f.movilizadoM3 : null), unidad: "m³", paso: 0.1 },
  { id: "rend", label: "Rend.", tipo: "rango", numero: (f) => f.rendimientoPct, unidad: "%", paso: 1 },
  { id: "ingreso", label: "Ingreso", tipo: "rango", numero: (f) => (f.ingreso > 0 ? f.ingreso : null), unidad: "S/", paso: 100 },
  { id: "margen", label: "Margen", tipo: "rango", numero: (f) => (f.margen > 0 ? f.margen : null), unidad: "S/", paso: 100 },
];

type FilasArbol = ReturnType<typeof margenPorArbol>;
type ResumenArbol = ReturnType<typeof resumirMargenArbol>;
export type KpisArboles = ReturnType<typeof useKpisPlegables>;

/**
 * Las tres cifras plegables (Brandon 05-10). Es un hook aparte para que la vista
 * pueda poner su botón «Indicadores» en la fila del encabezado del bloque, junto
 * a «Por especie / Por árbol», y no en una fila propia sobre la tabla (08-10).
 */
export function useKpisArboles(filas: FilasArbol, resumen: ResumenArbol): KpisArboles {
  return useKpisPlegables({
    claveMemoria: "loth-rentabilidad-arboles",
    resumen: filas.length === 0
      ? undefined
      : `${resumen.conMovimiento}/${resumen.arboles} rindieron · margen ${soles(resumen.margen)}`,
    tarjetas: filas.length === 0 ? [] : [
        <StatCard
          key="rinden"
          density="compact"
          label="Árboles que rindieron"
          value={`${resumen.conMovimiento}/${resumen.arboles}`}
          subValue={resumen.sinMovilizar > 0 ? `${Number(resumen.sinMovilizarM3).toFixed(2)} m³ tumbados sin salir` : "todos movilizados"}
          icon={TrendingUp}
          emphasis={resumen.sinMovilizar > 0 ? "warning" : "success"}
        />,
        <StatCard
          key="margen"
          density="compact"
          label="Margen de trozas vendidas"
          value={soles(resumen.margen)}
          subValue={
            resumen.consumidoM3 > 0
              ? `${Number(resumen.consumidoM3).toFixed(2)} m³ fueron al aserrío (su plata está en el producto)`
              : `ingreso ${soles(resumen.ingreso)}`
          }
          icon={Coins}
          emphasis={resumen.margen > 0 ? "success" : "neutral"}
        />,
        <StatCard
          key="mejor"
          density="compact"
          label="El que más dejó"
          value={resumen.mejor?.tree ?? "—"}
          subValue={resumen.mejor ? `${soles(resumen.mejor.margen)} · ${Number(resumen.mejor.movilizadoM3).toFixed(2)} m³` : "sin movimiento"}
          icon={Award}
          emphasis="neutral"
        />,
    ],
  });
}

export default function LothRentabilidadArboles({
  filas,
  kpis,
}: {
  filas: FilasArbol;
  /** El hook `useKpisArboles` vive en la vista: acá sólo se dibuja el panel (el botón va en el encabezado del bloque). */
  kpis: KpisArboles;
}) {
  const f = useFiltrosTabla(filas, COLUMNAS_ARBOLES);
  if (filas.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--rule-base)] p-6 text-center text-sm text-[var(--text-tertiary)]">
        Todavía no hay árboles talados para valorizar.
      </div>
    );
  }
  const maxAbs = Math.max(...filas.map((a) => Math.abs(a.margen)), 1);
  return (
    <div className="space-y-3">
      {kpis.panel}
      <BarraFiltrosTabla f={f} />

      <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
        <DataTable className="w-full text-sm">
          <thead className="bg-[var(--surface-sunken)] text-left align-top">
            <tr>
              <Th>Árbol<FiltroEnCabecera id="arbol" f={f} /></Th>
              <Th>Especie<FiltroEnCabecera id="especie" f={f} /></Th>
              <Th className="text-right">Talado<FiltroEnCabecera id="talado" f={f} /></Th>
              <Th className="text-right">Movilizado<FiltroEnCabecera id="movilizado" f={f} /></Th>
              <Th className="text-right">Rend.<FiltroEnCabecera id="rend" f={f} /></Th>
              <Th className="text-right">Ingreso<FiltroEnCabecera id="ingreso" f={f} /></Th>
              <Th className="text-right">Margen<FiltroEnCabecera id="margen" f={f} /></Th>
            </tr>
          </thead>
          <tbody>
            {f.filtradas.length === 0 && <SinCoincidenciasFila colSpan={7} />}
            {f.filtradas.map((f) => (
              <tr key={f.tree} className={`border-t border-[var(--rule-soft)] ${f.movilizadoM3 <= 0 ? "opacity-60" : ""}`}>
                <Td>
                  <span className="font-mono font-bold text-[var(--text-primary)]">{f.tree}</span>
                </Td>
                <Td className="text-[var(--text-secondary)]">
                  {f.especie ?? "—"}
                  {f.sinPrecio && (
                    <span className="ml-1.5 rounded bg-[var(--data-warning-500)]/15 px-1.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                      sin precio
                    </span>
                  )}
                </Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{Number(f.taladoM3).toFixed(2)} m³</Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{f.movilizadoM3 > 0 ? `${Number(f.movilizadoM3).toFixed(2)} m³` : "—"}</Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{f.rendimientoPct != null ? `${Number(f.rendimientoPct).toFixed(1)}%` : "—"}</Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{f.ingreso > 0 ? soles(f.ingreso) : "—"}</Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <BarraMargen margen={f.margen} maxAbs={maxAbs} minimo={2} />
                    <span className={`font-mono font-bold tabular-nums ${f.margen > 0 ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "text-[var(--text-tertiary)]"}`}>
                      {f.margen > 0 ? soles(f.margen) : "—"}
                    </span>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
    </div>
  );
}
