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

const TH =
  "px-3 py-2.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const NUM = "px-3 py-2 text-right font-mono tabular-nums";

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
      <table className="w-full min-w-[40rem] text-sm">
        <caption className="sr-only">Paquetes que se van a declarar, por especie</caption>
        <thead className="bg-[var(--surface-sunken)]">
          <tr>
            <th scope="col" className={`${TH} text-left`}>
              Paquete
            </th>
            <th scope="col" className={`${TH} text-left`}>
              Tipo · producto
            </th>
            <th scope="col" className={`${TH} text-left`}>
              Medida
            </th>
            <th scope="col" className={`${TH} text-right`}>
              PT
            </th>
            <th scope="col" className={`${TH} text-right`}>
              m³
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Piezas
            </th>
          </tr>
        </thead>
        {grupos.map((g) => (
          <tbody key={claveEspecie(g.especie) || "sin-especie"}>
            <tr className="border-t border-[var(--rule-base)] bg-[var(--surface-sunken)]/50">
              <th
                scope="rowgroup"
                colSpan={6}
                className="px-3 py-2 text-left text-sm font-bold text-[var(--text-primary)]"
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
              <tr key={p.codigo} className="border-t border-[var(--rule-soft)]">
                <td className="px-3 py-2 font-mono font-bold text-[var(--text-primary)]">
                  {p.codigo}
                </td>
                <td className="px-3 py-2 text-[var(--text-secondary)]">
                  {p.tipo}
                  <span className="block text-xs text-[var(--text-tertiary)]">
                    {p.productType ?? "MADERA ASERRADA"}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-[var(--text-secondary)]">
                  {p.medida}
                  <span className="block text-xs text-[var(--text-tertiary)]">
                    {p.espesorCm} × {p.anchoCm} cm · {p.largoM} m
                  </span>
                </td>
                <td className={`${NUM} font-bold text-[var(--text-primary)]`}>
                  {fmtPtExacto(p.pieTablar)}
                </td>
                <td className={`${NUM} text-[var(--text-secondary)]`}>{fmtM3(p.volumenM3)}</td>
                <td className={`${NUM} text-[var(--text-secondary)]`}>{fmtPiezas(p.cantidad)}</td>
              </tr>
            ))}
            <tr className="border-t border-[var(--rule-base)] font-semibold text-[var(--text-primary)]">
              <th
                scope="row"
                colSpan={3}
                className="px-3 py-2 text-left text-xs uppercase tracking-wide text-[var(--text-tertiary)]"
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
            <th scope="row" colSpan={3} className="px-3 py-2.5 text-left">
              {total.n} {total.n === 1 ? "paquete" : "paquetes"} · {grupos.length}{" "}
              {grupos.length === 1 ? "especie" : "especies"}
            </th>
            <td className={NUM}>{fmtPtExacto(total.pt)}</td>
            <td className={NUM}>{fmtM3(total.m3)}</td>
            <td className={NUM}>{fmtPiezas(total.piezas)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
