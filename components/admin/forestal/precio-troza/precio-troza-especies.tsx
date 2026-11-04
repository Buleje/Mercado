"use client";

/**
 * Precio máximo por especie: lo que rinde 1 m³ de rollo en pies × el precio de
 * venta del pie − aserrío − flete − tu ganancia. La cifra grande es el máximo;
 * si ya hay compras con factura, al lado va cuánto pagas hoy y si te sobra o te pasas.
 *
 * Todo lo calcula el servidor: acá sólo se lee (`PrecioMaximoEspecie`).
 */
import { DataTable } from "@buleje/design-system";
import { AlertTriangle } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CostoNoIngresado, PrecioTrozaDTO } from "@/lib/forestal/precio-troza-tipos";
import { fmtDifSoles, fmtSoles, textoCostosNoIngresados, tonoDe } from "./precio-troza-formato";
import { ID_CASILLA_PRECIO } from "./precio-troza-casillas";
import { Insignia, PILA, PILA_DERECHA, TEXTO_TONO } from "./precio-troza-ui";

const enfocarPrecio = () => document.getElementById(ID_CASILLA_PRECIO)?.focus();

export default function PrecioTrozaEspecies({ datos }: { datos: PrecioTrozaDTO }) {
  const { porEspecie, regla } = datos;
  if (porEspecie.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">Todavía no hay corridas ni ventas de madera para calcularlo.</p>;
  }
  /* Los costos vienen de las mismas casillas: lo que falta es igual en todas las especies. */
  const faltan = [...new Set(porEspecie.flatMap((e) => e.costosNoIngresados))] as CostoNoIngresado[];
  const avisoCostos = textoCostosNoIngresados(faltan);
  const conPagado = porEspecie.some((e) => e.pagadoHoyM3 !== null);

  return (
    <div className="space-y-2">
      {avisoCostos && (
        <p className="flex items-center gap-1.5 text-sm text-[var(--data-warning-ink)]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          {avisoCostos}: el máximo se calculó con eso en S/ 0.
        </p>
      )}
      <DataTable>
        <thead>
          <tr>
            <th scope="col">Especie</th>
            <th scope="col">
              <span className="inline-flex items-center gap-1">
                Rendimiento
                <InfoTip
                  title="Con qué rendimiento se calcula"
                  what={`El de tus corridas terminadas si hay ${regla.minCorridasMedido} o más y cae entre ${regla.franjaMin} y ${regla.franjaMax} %. Si no, la regla del libro: ${regla.rendimientoPct} %.`}
                  example="Tornillo medido en 4 corridas al 63,6 %: de 1 m³ de rollo salen 269,66 pies."
                />
              </span>
            </th>
            <th scope="col" className="text-right">Pies por m³</th>
            <th scope="col" className="text-right">Vendes el pie a</th>
            <th scope="col" className="text-right">
              <span className="inline-flex items-center gap-1">
                Máximo a pagar por m³
                <InfoTip
                  title="Precio máximo del m³ de rollo"
                  what="Pies por m³ × precio del pie − aserrío − flete − tu ganancia."
                  affects="Si pagas más que esto por el m³ de rollo, pierdes. Negativo = a ese precio de venta no alcanza ni para aserrar."
                  example="269,66 pies × S/ 3,50 = S/ 943,81 − 150 − 80 − 10 % (94,38) = S/ 619,43."
                />
              </span>
            </th>
            {conPagado && <th scope="col" className="text-right">Hoy pagas</th>}
            {conPagado && <th scope="col" className="text-right">Te sobra</th>}
          </tr>
        </thead>
        <tbody>
          {porEspecie.map((e) => {
            const negativo = e.precioMaximoM3 !== null && e.precioMaximoM3 < 0;
            return (
              <tr key={e.especie}>
                <th scope="row" className="text-left font-bold">{e.especie}</th>
                <td>
                  <span className={PILA}>
                    <span className="font-mono tabular-nums">{formatNumber(e.rendimientoPct, 1)} %</span>
                    {e.fuenteRendimiento === "medido" ? (
                      <Insignia tono="info" title={e.motivoRendimiento}>
                        medido en {e.corridasMedidas} {e.corridasMedidas === 1 ? "corrida" : "corridas"}
                      </Insignia>
                    ) : (
                      <Insignia title={e.motivoRendimiento}>regla {formatNumber(regla.rendimientoPct, 0)} %</Insignia>
                    )}
                  </span>
                </td>
                <td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{formatNumber(e.ptPorM3, 2)}</td>
                <td className="text-right">
                  <span className={PILA_DERECHA}>
                    <span className="font-mono tabular-nums">{e.precioVentaPt === null ? "—" : fmtSoles(e.precioVentaPt)}</span>
                    {e.fuentePrecio && (
                      <span className="text-xs text-[var(--text-tertiary)]">{e.fuentePrecio === "ventas" ? "de tus ventas" : "el que escribiste"}</span>
                    )}
                  </span>
                </td>
                <td className="text-right">
                  {e.precioMaximoM3 === null ? (
                    <span className={PILA_DERECHA}>
                      <span className="text-sm font-semibold text-[var(--data-warning-ink)]">Falta el precio de venta</span>
                      <button type="button" onClick={enfocarPrecio} className="text-xs font-semibold text-[var(--accent-dark)] underline dark:text-[var(--accent)]">
                        Escríbelo arriba
                      </button>
                    </span>
                  ) : (
                    <span className={PILA_DERECHA}>
                      <b className={cn("font-mono text-lg font-extrabold tabular-nums", TEXTO_TONO[negativo ? "mal" : "bien"])}>{fmtSoles(e.precioMaximoM3)}</b>
                      {negativo && <span className="text-xs text-[var(--data-error-ink)]">a ese precio no alcanza</span>}
                    </span>
                  )}
                </td>
                {conPagado && (
                  <td className="text-right">
                    {e.pagadoHoyM3 ? (
                      <span className={PILA_DERECHA}>
                        <span className="font-mono tabular-nums">{fmtSoles(e.pagadoHoyM3.mediana)}</span>
                        <span className="text-xs text-[var(--text-tertiary)]">
                          {e.pagadoHoyM3.casos} {e.pagadoHoyM3.casos === 1 ? "guía" : "guías"} con factura
                        </span>
                      </span>
                    ) : (
                      <span className="text-[var(--text-tertiary)]">—</span>
                    )}
                  </td>
                )}
                {conPagado && (
                  <td className="text-right">
                    <span className={PILA_DERECHA}>
                      <span className={cn("font-mono font-bold tabular-nums", TEXTO_TONO[tonoDe(e.holguraM3)])}>{fmtDifSoles(e.holguraM3)}</span>
                      {e.holguraM3 !== null && e.holguraM3 < 0 && <span className="text-xs text-[var(--data-error-ink)]">pagas de más</span>}
                    </span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </DataTable>
    </div>
  );
}
