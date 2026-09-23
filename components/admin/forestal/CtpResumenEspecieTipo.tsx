"use client";

/**
 * Resumen especie × tipo, con el precio de cada especie (ADR-429).
 *
 * Una fila por especie —es una corrida del Libro: un asiento por especie— con
 * su subtotal y UN precio en S/ por pie tablar; debajo, sus tipos comerciales
 * en el orden de siempre (`ORDEN_TIPO`). PT primero, después m³ y piezas: la
 * unidad en la que se vende y se cobra va adelante.
 *
 * Qué es el precio depende del servicio: madera propia → precio de VENTA (se
 * guarda en cada paquete y se propone al despachar); servicio a un tercero →
 * el TRATO del aserrío de esta corrida (sin precio, cobra la tarifa si hay).
 * Lo que queda sin precio se dice («sin precio»): no se pinta un 0.
 */
import { Fragment } from "react";
import type { ResumenEspecieTipo, TipoServicio } from "@/lib/forestal/declarar-produccion";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { fmtM3, fmtPiezas } from "@/lib/forestal/cubicacion-formato";
import { fmtPtExacto } from "./hooks/declarar-produccion-pantalla";
import { formatCurrency } from "@/lib/format";
import {
  fmtPrecioPt,
  totalDePrecios,
  type PrecioDeEspecie,
} from "./hooks/declarar-produccion-pantalla";

const TH =
  "px-3 py-2.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const NUM = "px-3 py-2 text-right font-mono tabular-nums";
/*
 * En celular la tabla se desplaza de costado, y al tocar un precio el
 * navegador la corre hasta el campo: la columna de la especie se iba de la
 * pantalla y se tipeaba un precio sin ver de qué especie era (medido a 400 px).
 * Pegada a la izquierda, con fondo sólido para que no se transparenten las
 * cifras que pasan por debajo. En escritorio no hay desplazamiento: no cambia.
 */
const PEGADA = "max-sm:sticky max-sm:left-0 max-sm:z-10";

const TITULO_PRECIO: Record<TipoServicio, string> = {
  propia: "Precio de venta",
  tercero: "Precio del aserrío",
};
const TITULO_IMPORTE: Record<TipoServicio, string> = { propia: "Valor", tercero: "Cargo" };

function Sugerencia({
  linea,
  servicio,
  onUsar,
}: {
  linea: PrecioDeEspecie;
  servicio: TipoServicio;
  onUsar: () => void;
}) {
  if (linea.invalido) {
    return (
      <span className="text-xs font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
        No es un precio
      </span>
    );
  }
  if (servicio === "propia") {
    if (!linea.sugerido || linea.texto.trim()) return null;
    return (
      <button
        type="button"
        onClick={onUsar}
        className="rounded-md px-1.5 py-0.5 text-xs font-semibold text-[var(--accent-ink)] underline underline-offset-2 hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]"
      >
        Usar {fmtPrecioPt(linea.sugerido.valor)} (el último)
      </button>
    );
  }
  return (
    <span className="text-xs text-[var(--text-tertiary)]">
      {linea.sugerido ? `tarifa ≈ ${fmtPrecioPt(linea.sugerido.valor)}` : "sin tarifa vigente"}
    </span>
  );
}

export default function CtpResumenEspecieTipo({
  resumen,
  servicio,
  lineas,
  onPrecio,
}: {
  resumen: ResumenEspecieTipo;
  servicio: TipoServicio | null;
  /** Una por especie con nombre (`lineasDePrecio`). */
  lineas: readonly PrecioDeEspecie[];
  onPrecio: (clave: string, texto: string) => void;
}) {
  const porClave = new Map(lineas.map((l) => [l.clave, l]));
  const total = totalDePrecios(lineas);
  /* Lo «sin especie» no es una especie ni será una corrida: no se cuenta como tal. */
  const conNombre = resumen.especies.filter((e) => claveEspecie(e.especie)).length;

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
      <table className="w-full min-w-[38rem] text-sm">
        <caption className="sr-only">
          Resumen de lo que se declara, por especie y tipo, con su precio
        </caption>
        <thead className="bg-[var(--surface-sunken)]">
          <tr>
            <th scope="col" className={`${TH} ${PEGADA} bg-[var(--surface-sunken)] text-left`}>
              Especie · tipo
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
            <th scope="col" className={`${TH} text-right`}>
              {servicio ? TITULO_PRECIO[servicio] : "Precio"}
              <span className="block font-normal normal-case tracking-normal">
                {servicio ? "S/ por pie tablar" : "elige el servicio"}
              </span>
            </th>
            <th scope="col" className={`${TH} text-right`}>
              {servicio ? TITULO_IMPORTE[servicio] : "Importe"}
            </th>
          </tr>
        </thead>
        <tbody>
          {resumen.especies.map((e) => {
            const clave = claveEspecie(e.especie);
            const linea = clave ? porClave.get(clave) : undefined;
            return (
              <Fragment key={clave || "sin-especie"}>
                <tr className="border-t border-[var(--rule-base)] bg-[var(--surface-sunken)] align-top">
                  <th
                    scope="row"
                    className={`${PEGADA} bg-[var(--surface-sunken)] px-3 py-2.5 text-left font-bold text-[var(--text-primary)]`}
                  >
                    {e.especie || (
                      <span className="text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                        Sin especie
                      </span>
                    )}
                  </th>
                  <td className={`${NUM} font-bold text-[var(--text-primary)]`}>
                    {fmtPtExacto(e.pt)}
                  </td>
                  <td className={`${NUM} text-[var(--text-secondary)]`}>{fmtM3(e.m3)}</td>
                  <td className={`${NUM} text-[var(--text-secondary)]`}>{fmtPiezas(e.piezas)}</td>
                  <td className="px-3 py-1.5 text-right">
                    {linea ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="inline-flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                          <span aria-hidden>S/</span>
                          <input
                            inputMode="decimal"
                            value={linea.texto}
                            disabled={!servicio}
                            onChange={(ev) => onPrecio(linea.clave, ev.target.value)}
                            placeholder={servicio === "tercero" ? "tarifa" : "0.00"}
                            aria-label={`${servicio ? TITULO_PRECIO[servicio] : "Precio"} de ${linea.especie}, en soles por pie tablar`}
                            aria-invalid={linea.invalido || undefined}
                            className={`h-10 w-24 rounded-lg border bg-[var(--surface-raised)] px-2 text-right font-mono text-sm tabular-nums text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] disabled:cursor-not-allowed disabled:bg-[var(--surface-sunken)] ${
                              linea.invalido
                                ? "border-[var(--data-error-500)]"
                                : "border-[var(--rule-base)]"
                            }`}
                          />
                          <span aria-hidden>/PT</span>
                        </span>
                        {servicio && (
                          <Sugerencia
                            linea={linea}
                            servicio={servicio}
                            onUsar={() =>
                              linea.sugerido && onPrecio(linea.clave, String(linea.sugerido.valor))
                            }
                          />
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--text-tertiary)]">—</span>
                    )}
                  </td>
                  <td className={`${NUM} py-2.5`}>
                    {linea?.importe != null ? (
                      <>
                        <span className="font-bold text-[var(--text-primary)]">
                          {formatCurrency(linea.importe)}
                        </span>
                        {linea.desde === "tarifa" && (
                          <span className="block font-sans text-xs text-[var(--text-tertiary)]">
                            según tarifa
                          </span>
                        )}
                      </>
                    ) : servicio && linea ? (
                      <span className="font-sans text-xs text-[var(--text-tertiary)]">
                        {servicio === "propia" ? "sin precio" : "no se cobra"}
                      </span>
                    ) : (
                      <span className="text-[var(--text-tertiary)]">—</span>
                    )}
                  </td>
                </tr>
                {e.filas.map((f) => (
                  <tr key={f.tipo} className="border-t border-[var(--rule-soft)]">
                    <th
                      scope="row"
                      className={`${PEGADA} bg-[var(--surface-raised)] py-2 pl-7 pr-3 text-left font-normal text-[var(--text-secondary)]`}
                    >
                      {f.tipo}
                    </th>
                    <td className={`${NUM} text-[var(--text-secondary)]`}>{fmtPtExacto(f.pt)}</td>
                    <td className={`${NUM} text-[var(--text-tertiary)]`}>{fmtM3(f.m3)}</td>
                    <td className={`${NUM} text-[var(--text-tertiary)]`}>{fmtPiezas(f.piezas)}</td>
                    <td colSpan={2} />
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[var(--accent)]/40 bg-primary/10 font-bold text-[var(--text-primary)]">
            <th
              scope="row"
              className={`${PEGADA} max-sm:bg-[var(--surface-raised)] px-3 py-2.5 text-left`}
            >
              Total · {conNombre} {conNombre === 1 ? "especie" : "especies"}
            </th>
            <td className={NUM}>{fmtPtExacto(resumen.total.pt)}</td>
            <td className={NUM}>{fmtM3(resumen.total.m3)}</td>
            <td className={NUM}>{fmtPiezas(resumen.total.piezas)}</td>
            <td />
            <td className={NUM}>
              {servicio && total.total != null ? formatCurrency(total.total) : "—"}
              {servicio && total.sinImporte.length > 0 && (
                <span className="block font-sans text-xs font-normal text-[var(--text-tertiary)]">
                  {servicio === "propia" ? "sin precio" : "sin cobro"}:{" "}
                  {total.sinImporte.join(", ")}
                </span>
              )}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
