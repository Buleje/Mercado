"use client";

/**
 * Las dos tablas del volumen de un permiso (ADR-432): el recorrido de cada
 * especie (entró → se consumió → se produjo → salió) y la producción por
 * especie × tipo de producto.
 *
 * El pie es `totales` del servidor, no una suma de las filas: si alguna vez no
 * coinciden, el que tiene razón es el servidor y la tabla no lo tapa.
 */

import { CardTitle, DataTable } from "@buleje/design-system";
import { TOLERANCIA_EXCESO_PT } from "@/lib/forestal/semaforo-permiso";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import type {
  FilaEspecieDelPermiso,
  FilaTipoDelPermiso,
  TotalesDelPermiso,
} from "@/lib/forestal/volumen-del-permiso";
import { SIN_DATO } from "@/lib/format";
import { esNegativo, m3, PASTILLA, Saldo, TONO, tipoCorto } from "./permiso-volumen-ui";

const NUM = "text-right font-mono tabular-nums whitespace-nowrap";
const GUION = <span className="text-[var(--text-tertiary)]">{SIN_DATO}</span>;

/** Una cifra de m³, o «—» si la fila no la tiene (especie sin ingreso, 0 corridas…). */
const celdaM3 = (v: number, hay: boolean) => (hay ? m3(v) : GUION);

function Producido({ m3v, pt, hay }: { m3v: number; pt: number; hay: boolean }) {
  if (!hay) return GUION;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span>{m3(m3v)}</span>
      <span className="text-xs text-[var(--text-secondary)]">{fmtPt(pt)} pt</span>
    </span>
  );
}

function Despachado({ aserrada, rolliza }: { aserrada: number; rolliza: number }) {
  if (aserrada <= 0 && rolliza <= 0) return GUION;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span>{m3(aserrada)}</span>
      {rolliza > 0 && (
        <span className="text-xs text-[var(--text-secondary)]">+ {m3(rolliza)} en troza</span>
      )}
    </span>
  );
}

/* En la tabla el «pt aserr.» va en la cabecera de la columna y la celda lleva
   sólo «≈ N»: repetido en cada celda, a 1280 px empujaba «Saldo» fuera de la
   caja (medido 25-09: 10 columnas en 964 px). En la tarjeta del celular el
   rótulo de la cabecera va al lado del número, así que tampoco se pierde. */
function PtCelda({ v }: { v: number }) {
  return <span className="whitespace-nowrap">≈ {fmtPt(v)}</span>;
}

/** `hay` = hubo ingreso contra el cual medir: sin él, «—» (no un exceso rojo). */
function SaldoPt({ v, hay }: { v: number; hay: boolean }) {
  if (!hay) return GUION;
  return esNegativo(v, TOLERANCIA_EXCESO_PT) ? (
    <Saldo texto={`≈ ${fmtPt(v)}`} negativo queDice="pt de más" />
  ) : (
    <PtCelda v={v} />
  );
}

/* `DataTable` fuerza `px-3` en cada celda; con diez columnas de cifras, 8 px
   menos por celda es lo que la mete entera en la caja. */
const COMPACTA = "[&_thead_th]:px-2 [&_tbody_td]:px-2 [&_tfoot_td]:px-2 [&_tfoot_th]:px-2";

export function TablaPorEspecie({
  filas,
  totales,
}: {
  filas: FilaEspecieDelPermiso[];
  totales: TotalesDelPermiso;
}) {
  return (
    <section aria-labelledby="permiso-por-especie" className="space-y-2">
      <div className="flex items-center gap-1.5">
        <CardTitle className="text-sm font-bold" id="permiso-por-especie">Por especie</CardTitle>
        <InfoTip
          title="Por especie"
          what="El recorrido de cada especie bajo este permiso: lo que entró por guía, lo que se consumió, lo que se produjo y lo que salió."
          affects="≈ pt aserr. es un derivado: el techo del 56 % sobre la rolliza ingresada. El saldo del libro no es el patio pieza por pieza."
          example="Una especie producida que ninguna guía del permiso trajo aparece al final, marcada «sin guía de ingreso», con el saldo en «—»: sin madera ingresada no hay techo que medir."
        />
      </div>
      <DataTable className={COMPACTA}>
        <thead>
          <tr>
            <th scope="col">Especie</th>
            <th scope="col" className="text-right">
              Guías
            </th>
            <th scope="col" className="text-right">
              Piezas
            </th>
            <th scope="col" className="text-right">
              Ingresado m³
            </th>
            <th scope="col" className="text-right">
              Consumido m³
            </th>
            <th scope="col" className="text-right">
              Saldo rolliza m³
            </th>
            <th scope="col" className="text-right">
              Aserrable ≈pt aserr.
            </th>
            <th scope="col" className="text-right">
              Producido m³ / pt
            </th>
            <th scope="col" className="text-right">
              Despachado m³
            </th>
            <th scope="col" className="text-right">
              Saldo ≈pt aserr.
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const entro = !f.sinIngreso && f.guias > 0;
            return (
              <tr key={f.clave}>
                <td>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold">{f.especie}</span>
                    {f.sinIngreso && (
                      <span className={`${PASTILLA} ${TONO.aviso}`}>sin guía de ingreso</span>
                    )}
                  </span>
                </td>
                <td className={NUM}>{entro ? f.guias : GUION}</td>
                <td className={NUM}>{entro && f.piezas > 0 ? fmtPiezas(f.piezas) : GUION}</td>
                <td className={NUM}>{celdaM3(f.ingresadoM3, entro)}</td>
                <td className={NUM}>{celdaM3(f.consumidoM3, entro || f.consumidoM3 > 0)}</td>
                <td className={NUM}>
                  {entro ? (
                    <Saldo
                      texto={m3(f.saldoRollizaM3)}
                      negativo={esNegativo(f.saldoRollizaM3)}
                      queDice="consumido de más"
                    />
                  ) : (
                    GUION
                  )}
                </td>
                <td className={NUM}>{entro ? <PtCelda v={f.aserrablePt} /> : GUION}</td>
                <td className={NUM}>
                  <Producido m3v={f.producidoM3} pt={f.producidoPt} hay={f.corridas > 0} />
                </td>
                <td className={NUM}>
                  <Despachado aserrada={f.despachadoM3} rolliza={f.despachadoRollizaM3} />
                </td>
                <td className={NUM}>
                  <SaldoPt v={f.saldoPt} hay={entro} />
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t-2 border-[var(--rule-strong)] bg-[var(--surface-sunken)] font-bold">
          <tr>
            <th scope="row" className="text-left">
              Total del permiso
            </th>
            <td className={NUM}>{totales.guias}</td>
            <td className={NUM}>{totales.piezas > 0 ? fmtPiezas(totales.piezas) : GUION}</td>
            <td className={NUM}>{celdaM3(totales.ingresadoM3, totales.guias > 0)}</td>
            <td className={NUM}>{m3(totales.consumidoM3)}</td>
            <td className={NUM}>
              <Saldo
                texto={m3(totales.saldoRollizaM3)}
                negativo={esNegativo(totales.saldoRollizaM3)}
                queDice="consumido de más"
              />
            </td>
            <td className={NUM}>
              {totales.guias > 0 ? <PtCelda v={totales.aserrablePt} /> : GUION}
            </td>
            <td className={NUM}>
              <Producido
                m3v={totales.producidoM3}
                pt={totales.producidoPt}
                hay={totales.corridas > 0}
              />
            </td>
            <td className={NUM}>
              {totales.despachos === 0 ? (
                GUION
              ) : (
                <span className="inline-flex flex-col items-end leading-tight">
                  <span>{m3(totales.despachadoM3)}</span>
                  {totales.despachadoRollizaM3 > 0 && (
                    <span className="text-xs text-[var(--text-secondary)]">
                      incluye {m3(totales.despachadoRollizaM3)} en troza
                    </span>
                  )}
                </span>
              )}
            </td>
            <td className={NUM}>
              <SaldoPt v={totales.saldoPt} hay={totales.guias > 0} />
            </td>
          </tr>
        </tfoot>
      </DataTable>
    </section>
  );
}

export function TablaPorTipo({
  filas,
  totales,
}: {
  filas: FilaTipoDelPermiso[];
  totales: TotalesDelPermiso;
}) {
  if (filas.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-3 py-3 text-sm text-[var(--text-secondary)]">
        Todavía no hay producción bajo este permiso.
      </p>
    );
  }
  /* Las filas con corridas en una unidad que no convierte no suman m³: si son
     todas, el total no existe («—»); si son algunas, se dice cuántas faltan. */
  const todoSinConvertir = filas.every((f) => f.m3 == null);
  const corridasSinConvertir = filas
    .filter((f) => f.m3 == null)
    .reduce((n, f) => n + f.corridas, 0);
  return (
    <section aria-labelledby="permiso-por-tipo" className="space-y-2">
      <CardTitle className="text-sm font-bold" id="permiso-por-tipo">Producción por tipo</CardTitle>
      <DataTable>
        <thead>
          <tr>
            <th scope="col">Especie</th>
            <th scope="col">Tipo</th>
            <th scope="col" className="text-right">
              Corridas
            </th>
            <th scope="col" className="text-right">
              Piezas
            </th>
            <th scope="col" className="text-right">
              m³
            </th>
            <th scope="col" className="text-right">
              pt
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => {
            /* La especie se escribe entera sólo en su primera fila; las
               siguientes la atenúan para que el grupo se lea de un vistazo
               (en el celular cada fila es una tarjeta y la necesita igual). */
            const repetida = i > 0 && filas[i - 1].especie === f.especie;
            return (
              <tr key={`${f.clave}-${f.tipo}`}>
                <td className={repetida ? "text-[var(--text-tertiary)]" : "font-semibold"}>
                  {f.especie}
                </td>
                <td>{tipoCorto(f.tipo)}</td>
                <td className={NUM}>{f.corridas}</td>
                <td className={NUM}>{f.piezas > 0 ? fmtPiezas(f.piezas) : GUION}</td>
                {/* `null` = corridas en una unidad que no pasa a m³: «—», nunca 0. */}
                <td className={NUM}>{f.m3 == null ? GUION : m3(f.m3)}</td>
                <td className={NUM}>{f.pt == null ? GUION : fmtPt(f.pt)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t-2 border-[var(--rule-strong)] bg-[var(--surface-sunken)] font-bold">
          <tr>
            <th scope="row" colSpan={2} className="text-left">
              Total producido
            </th>
            <td className={NUM}>{totales.corridas}</td>
            <td className={NUM}>{GUION}</td>
            <td className={NUM}>
              {todoSinConvertir ? (
                GUION
              ) : (
                <span className="inline-flex flex-col items-end leading-tight">
                  <span>{m3(totales.producidoM3)}</span>
                  {corridasSinConvertir > 0 && (
                    <span className="text-xs font-normal text-[var(--text-secondary)]">
                      sin contar {corridasSinConvertir}{" "}
                      {corridasSinConvertir === 1 ? "corrida" : "corridas"} en otra unidad
                    </span>
                  )}
                </span>
              )}
            </td>
            <td className={NUM}>{todoSinConvertir ? GUION : fmtPt(totales.producidoPt)}</td>
          </tr>
        </tfoot>
      </DataTable>
    </section>
  );
}
