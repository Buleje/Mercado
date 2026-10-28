"use client";

/**
 * Tabla «A mano» del precio por especie × tipo (Brandon 28-10: «según tipo y
 * especie una tabla a cuánto lo acordado de corta, comercial…»). La usan el
 * modal «Guardar cubicación» y «Precio del lote»: UN editor, el mismo estado
 * (`usePrecioCubicador`), así lo que se pone en uno lo lee el otro, el papel,
 * el Excel y WhatsApp.
 *
 * Filas = especies del lote; columnas = «Toda la especie» + cada tipo que hay
 * en ESTA cubicación. Una celda vacía muestra de placeholder el precio al que
 * cae (el de la especie, si no el general); sin piezas de ese tipo, «—».
 */
import { useMemo, type HTMLAttributes } from "react";
import { DataTable } from "@buleje/design-system";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { fmtPt, fmtSoles } from "@/lib/forestal/cubicacion-formato";
import { tablaEspecieTipo } from "@/lib/forestal/tabla-precio-especie-tipo";
import { formatNumber } from "@/lib/format";
import type { PrecioCubicador } from "./hooks/use-precio-cubicador";

const precioTxt = (n: number) => formatNumber(n, { min: 2, max: 4 });
const ENTRADA =
  "h-11 w-20 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-right text-sm font-bold tabular-nums text-[var(--text-primary)] outline-none placeholder:font-normal placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]";
/* La columna de la especie queda fija al correr la tabla de lado (a 400 px no entran los tipos). */
const FIJA = "sticky left-0 z-[1]";
const CIFRAS = "mt-1 block whitespace-nowrap text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-tertiary)]";

/**
 * «120 PT» y «S/ 300.00» debajo de cada celda: cuánta madera y cuánta plata
 * mueve ese precio. En dos renglones: en uno solo, cada columna medía ~30 px
 * más y la tabla ya no entraba en la columna del modal con dos tipos (28-10).
 */
function Cifras({ pt, importe }: { pt: number; importe: number | null }) {
  return (
    <span className={CIFRAS}>
      <span className="block">{fmtPt(pt)} PT</span>
      {importe !== null && <b className="block font-semibold text-[var(--text-secondary)]">S/ {fmtSoles(importe)}</b>}
    </span>
  );
}

export default function TablaPrecioEspecieTipo({ precios, rows }: { precios: PrecioCubicador; rows: readonly PiezaCubicada[] }) {
  const tabla = useMemo(() => tablaEspecieTipo(rows, precios.ctx), [rows, precios.ctx]);
  if (tabla.filas.length === 0) return null;
  const { general } = precios;

  return (
    <DataTable className="hoja-grilla min-w-max" wrapperClassName="rounded-2xl" wrapperProps={{ "data-tabla": "precio-especie-tipo" } as HTMLAttributes<HTMLDivElement>}>
        <caption className="sr-only">
          Precio a mano por especie y tipo, en soles por pie tablar. Vacío: el tipo usa el de su especie y la especie, el general.
        </caption>
        <thead>
          <tr>
            <th scope="col" className={FIJA}>Especie</th>
            <th scope="col" className="text-right">Toda la especie</th>
            {tabla.tipos.map((t) => <th key={t} scope="col" className="whitespace-nowrap text-right">{t}</th>)}
          </tr>
        </thead>
        <tbody>
          {tabla.filas.map((f) => {
            const propio = Number(precios.preciosEspecie[f.clave]);
            const cae = propio > 0 ? propio : general;
            return (
              <tr key={f.clave} data-especie={f.clave}>
                <th scope="row" className={`${FIJA} bg-[var(--surface-raised)] text-left align-top font-normal`}>
                  <span className="block max-w-[9rem] truncate font-bold text-[var(--text-primary)]" title={f.especie}>{f.especie}</span>
                  <Cifras pt={f.pt} importe={f.importe} />
                </th>
                <td className="text-right align-top">
                  <input type="number" inputMode="decimal" min={0} step="0.01" className={ENTRADA}
                    value={precios.preciosEspecie[f.clave] ?? ""}
                    placeholder={general > 0 ? precioTxt(general) : "0.00"}
                    aria-label={`Precio de toda la especie ${f.especie}, en soles por pie tablar`}
                    data-precio-especie={f.clave}
                    onChange={(e) => precios.cambiarPrecioEspecie(f.especie, e.target.value)} />
                </td>
                {tabla.tipos.map((t) => {
                  const c = f.celdas[t];
                  if (!c) {
                    return (
                      <td key={t} className="text-right align-top text-[var(--text-tertiary)]">
                        <span className="inline-flex h-11 items-center px-2.5" aria-label={`${f.especie} no tiene piezas ${t}`}>—</span>
                      </td>
                    );
                  }
                  return (
                    <td key={t} className="text-right align-top">
                      <input type="number" inputMode="decimal" min={0} step="0.01" className={ENTRADA}
                        value={precios.preciosEspecieTipo[c.clave] ?? ""}
                        placeholder={cae > 0 ? precioTxt(cae) : "0.00"}
                        aria-label={`Precio de ${f.especie} ${t}, en soles por pie tablar`}
                        data-precio-especie-tipo={c.clave}
                        onChange={(e) => precios.cambiarPrecioEspecieTipo(f.especie, t, e.target.value)} />
                      <Cifras pt={c.pt} importe={c.importe} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
    </DataTable>
  );
}
