/**
 * Rendimiento › Por especie — una fila por especie: cuánta troza entró, cuánto
 * salió, el ponderado, el rango PROPIO aprendido de sus corridas terminadas
 * (con «rango provisional» cuando son pocas), la regla con un punto por
 * corrida y la tendencia.
 */
import { DataTable } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { RendimientoAserraderoDTO } from "@/lib/forestal/rendimiento-especie";
import { MIN_CORRIDAS_RANGO } from "@/lib/forestal/rendimiento-especie";
import { agregarRendimientoPlata } from "@/lib/forestal/rendimiento-plata";
import { fechaConDia } from "@/lib/forestal/loth-plan-costeo";
import { CeldaPlata, ReglaRendimiento, TendenciaCelda, fmtM3, fmtPct, textoRango } from "./rendimiento-compartido";

const TH = "px-3 py-2 text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const TD = "px-3 py-2 align-middle";
/** Dato + aclaración apilados: a la derecha en la tarjeta del celular, a la izquierda en la tabla. */
const PILA = "inline-flex flex-col items-end gap-0.5 sm:items-start";

export default function RendimientoPorEspecie({ datos }: { datos: RendimientoAserraderoDTO }) {
  const { especies, hoy, plataVisible } = datos;
  if (especies.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">Todavía no hay corridas de producción en el Libro CTP.</p>;
  }
  /* La plata por especie se agrega con la misma regla que el total (ponderado,
     null si falta algo). Una corrida sin plata quedó fuera del tope: falta, no se omite. */
  const plataDe = (especie: string) => {
    const deEspecie = datos.corridas.filter((c) => c.especie === especie);
    const filas = deEspecie.filter((c) => c.plata).map((c) => c.plata!);
    return filas.length > 0 ? agregarRendimientoPlata(filas, { sinLeer: deEspecie.length - filas.length }) : null;
  };
  const noLeida = !!datos.plataTruncada;

  return (
    <div className="overflow-x-auto">
      <DataTable className="text-sm">
        <thead className="border-b border-[var(--rule-base)]">
          <tr>
            <th scope="col" className={TH}>Especie</th>
            <th scope="col" className={TH}>Corridas</th>
            <th scope="col" className={`${TH} text-right`}>Troza → aserrado (m³)</th>
            <th scope="col" className={`${TH} text-right`}>Rendimiento</th>
            <th scope="col" className={TH}>
              <span className="inline-flex items-center gap-1">
                Tu rango
                <InfoTip
                  title="Rango propio de la especie"
                  what={`Aprendido de tus corridas TERMINADAS de esa especie: del percentil 10 al 90 con ${MIN_CORRIDAS_RANGO} o más; con menos, lo visto ± 5 puntos y rotulado «provisional».`}
                  affects="Una corrida que sale debajo se marca «Bajo lo suyo» en Por corrida. Las corridas de un lote en proceso no enseñan rango."
                  example="Tornillo con 50 % y 52 %: rango provisional 45-57 %. Una corrida al 38 % sale bajo lo suyo."
                />
              </span>
            </th>
            <th scope="col" className={TH}>Cada corrida, de 0 a 100 %</th>
            <th scope="col" className={TH}>Tendencia</th>
            {plataVisible && <th scope="col" className={`${TH} text-right`}>Comercial (PT)</th>}
            {plataVisible && <th scope="col" className={`${TH} text-right`}>Costo por PT</th>}
          </tr>
        </thead>
        <tbody>
          {especies.map((e) => {
            const plata = plataVisible ? plataDe(e.especie) : null;
            return (
              <tr key={e.especie}>
                <th scope="row" className={`${TD} text-left font-bold text-[var(--text-primary)]`}>{e.especie}</th>
                <td className={`${TD} text-[var(--text-secondary)]`}>
                  {/* Un solo hijo por celda: en el celular la celda es una fila flex de tarjeta. */}
                  <span className={PILA}>
                    <span className="font-mono tabular-nums">{e.corridas}</span>
                    {e.enProceso > 0 && (
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {e.enProceso} en proceso{e.finProceso ? ` hasta el ${fechaConDia(e.finProceso, hoy)}` : ""}
                      </span>
                    )}
                  </span>
                </td>
                <td className={`${TD} whitespace-nowrap text-right font-mono tabular-nums text-[var(--text-secondary)]`}>
                  {fmtM3(e.m3Entrada)} → {fmtM3(e.m3Salida)}
                </td>
                <td className={`${TD} text-right`}>
                  <span className="inline-flex flex-col items-end gap-0.5">
                    <span className="font-mono text-base font-extrabold tabular-nums text-[var(--text-primary)]">{fmtPct(e.ponderadoPct, 2)}</span>
                    {e.enProceso > 0 && <span className="text-xs font-semibold text-[var(--text-tertiary)]">parcial</span>}
                  </span>
                </td>
                <td className={TD}>
                  <span className={PILA}>
                    {e.rango && (
                      <span className="whitespace-nowrap font-mono tabular-nums text-[var(--text-primary)]">
                        {fmtPct(e.rango.min)} – {fmtPct(e.rango.max)}
                      </span>
                    )}
                    <span className="text-xs text-[var(--text-tertiary)]">{textoRango(e.rango)}</span>
                  </span>
                </td>
                <td className={TD}>
                  <ReglaRendimiento rango={e.rango} puntos={e.serie} etiqueta={e.especie} />
                </td>
                <td className={TD}>
                  <TendenciaCelda t={e.tendencia} serie={e.serie} />
                </td>
                {plataVisible && (
                  <td className={`${TD} text-right`}>
                    <CeldaPlata plata={plata} campo="comercial" noLeida={noLeida} />
                  </td>
                )}
                {plataVisible && (
                  <td className={`${TD} text-right`}>
                    <CeldaPlata plata={plata} campo="costo" noLeida={noLeida} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </DataTable>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" aria-hidden /> Corrida terminada
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-[var(--text-tertiary)]" aria-hidden /> En proceso (parcial)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded bg-[var(--accent-muted)]" aria-hidden /> Tu rango
        </span>
      </p>
    </div>
  );
}
