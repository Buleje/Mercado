/**
 * El detalle de lo que se declara, paquete por paquete (ADR-429).
 *
 * Ordenado especie → tipo → espesor → ancho → largo (`ordenarDetalle`): es lo
 * que se lee de arriba abajo contra la pila, así que el orden no es cosmético.
 * Cada especie cierra con su subtotal —es una corrida del Libro— y el pie da
 * el total de todo lo que se va a registrar.
 */
import { useMemo } from "react";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import {
  corridasPorEspecie,
  ordenarDetalle,
  type PaqueteDeclarable,
} from "@/lib/forestal/declarar-produccion";
import { fmtM3, fmtPiezas } from "@/lib/forestal/cubicacion-formato";
import { fmtPtExacto } from "./hooks/declarar-produccion-pantalla";
import { DataTable } from "@buleje/design-system";

const NUM = "text-right font-mono tabular-nums";

export default function CtpDetallePaquetes({
  paquetes,
}: {
  paquetes: readonly PaqueteDeclarable[];
}) {
  /* Una corrida por especie, cada una con sus paquetes ya en el orden de la pila. */
  const grupos = useMemo(() => corridasPorEspecie(ordenarDetalle(paquetes)), [paquetes]);
  const total = useMemo(
    () =>
      grupos.reduce(
        (a, g) => ({
          piezas: a.piezas + g.piezas,
          m3: a.m3 + g.m3,
          pt: a.pt + g.pt,
          n: a.n + g.paquetes.length,
        }),
        { piezas: 0, m3: 0, pt: 0, n: 0 },
      ),
    [grupos],
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
      <DataTable wrapperClassName="overflow-visible rounded-none border-0" className="w-full min-w-[40rem]">
        <caption className="sr-only">Paquetes que se van a declarar, por especie</caption>
        <thead>
          <tr>
            <th scope="col">
              Paquete
            </th>
            <th scope="col">
              Tipo · producto
            </th>
            <th scope="col">
              Medida
            </th>
            <th scope="col" className="text-right">
              PT
            </th>
            <th scope="col" className="text-right">
              m³
            </th>
            <th scope="col" className="text-right">
              Piezas
            </th>
          </tr>
        </thead>
        {grupos.map((g) => (
          <tbody key={claveEspecie(g.especie) || "sin-especie"}>
            <tr className="bg-[var(--surface-sunken)]/50">
              <th
                scope="rowgroup"
                colSpan={6}
                className="text-left font-bold"
              >
                {g.especie || (
                  <span className="text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                    Sin especie
                  </span>
                )}
                <span className="ml-2 text-xs font-normal text-[var(--text-tertiary)]">
                  {g.paquetes.length} {g.paquetes.length === 1 ? "paquete" : "paquetes"}
                </span>
              </th>
            </tr>
            {g.paquetes.map((p) => (
              <tr key={p.codigo}>
                <td className="font-mono font-bold">
                  {p.codigo}
                </td>
                <td className="text-[var(--text-secondary)]">
                  {p.tipo}
                  <span className="block text-xs text-[var(--text-tertiary)]">
                    {p.productType ?? "MADERA ASERRADA"}
                  </span>
                </td>
                <td className="font-mono text-[var(--text-secondary)]">
                  {p.medida}
                  <span className="block text-xs text-[var(--text-tertiary)]">
                    {p.espesorCm} × {p.anchoCm} cm · {p.largoM} m
                  </span>
                </td>
                <td className={`${NUM} font-bold`}>
                  {fmtPtExacto(p.pieTablar)}
                </td>
                <td className={`${NUM} text-[var(--text-secondary)]`}>{fmtM3(p.volumenM3)}</td>
                <td className={`${NUM} text-[var(--text-secondary)]`}>{fmtPiezas(p.cantidad)}</td>
              </tr>
            ))}
            <tr className="font-semibold text-[var(--text-primary)]">
              <th
                scope="row"
                colSpan={3}
                className="text-left uppercase tracking-wide text-[var(--text-tertiary)]"
              >
                Subtotal {g.especie || "sin especie"}
              </th>
              <td className={NUM}>{fmtPtExacto(g.pt)}</td>
              <td className={NUM}>{fmtM3(g.m3)}</td>
              <td className={NUM}>{fmtPiezas(g.piezas)}</td>
            </tr>
          </tbody>
        ))}
        <tfoot>
          <tr className="border-t-2 border-[var(--accent)]/40 bg-primary/10 font-bold text-[var(--text-primary)]">
            <th scope="row" colSpan={3} className="text-left">
              {total.n} {total.n === 1 ? "paquete" : "paquetes"} · {grupos.length}{" "}
              {grupos.length === 1 ? "especie" : "especies"}
            </th>
            <td className={NUM}>{fmtPtExacto(total.pt)}</td>
            <td className={NUM}>{fmtM3(total.m3)}</td>
            <td className={NUM}>{fmtPiezas(total.piezas)}</td>
          </tr>
        </tfoot>
      </DataTable>
    </div>
  );
}
