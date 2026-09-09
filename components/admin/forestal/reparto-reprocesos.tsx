"use client";

/**
 * «Esto que sobra, reprocesalo en lo que falta» — el apartado de reprocesos
 * sugeridos de la distribución (ADR-404).
 *
 * Va por su tercera forma y la razón está en el pedido de Brandon (2026-09-09):
 * *«quiero el producto original con su m³ y su cantidad, y lo que se produce de
 * él: de 1.200 de comercial, paquetería larga 1.100 y paquetería corta
 * 0.050»*. Una línea por par origen→destino no dejaba ver eso: el mismo
 * producto aparecía cuatro veces y había que sumar a ojo.
 *
 * Ahora es **una tabla por producto original**: arriba lo que hay (tipo, m³,
 * piezas) y abajo en qué se convierte, con el total y lo que queda. Así se lee
 * de una la regla del reproceso —al recortar suben las piezas y baja el
 * volumen— y también cuando el respaldo cierra unos litros por encima del
 * bloque, que es el cierre por diferencia de medición del reparto (hasta 3
 * piezas, 50 litros y 1 %) y no un reproceso que fabrique madera.
 *
 * Las salidas van en dos grupos porque no se comportan igual:
 *  · **Ya está amparando** — se suman: el bloque respalda todo eso a la vez, y
 *    es lo que hay que declarar en el Libro.
 *  · **Podés cubrir con lo libre** — compiten: cada opción usaría la MISMA
 *    capacidad libre, así que se elige una. Sumarlas diría que con 0.7 m³ se
 *    tapan tres huecos.
 *
 * Es una SUGERENCIA, no un movimiento: acá no se registra nada en el Libro.
 */

import { useState } from "react";
import { ChevronRight, Info, RefreshCw, Target } from "@buleje/design-system/icons";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import type {
  CuadreDeDistribucion,
  DestinoDeReproceso,
  GrupoDeReproceso,
} from "@/lib/forestal/reproceso-sugerido";

const CHIP =
  "inline-flex items-center rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide";
const TH =
  "px-2 py-1 text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";
const TD = "px-2 py-1.5 text-sm text-[var(--text-secondary)]";
const NUM = `${TD} text-right font-mono tabular-nums`;

/** Las filas de un grupo de salidas, con su subtotal. */
function TablaSalidas({
  titulo,
  ayuda,
  destinos,
  totalM3,
  totalPiezas,
  tono,
}: {
  titulo: string;
  ayuda: string;
  destinos: DestinoDeReproceso[];
  /** `null` = este grupo NO se suma (las opciones compiten entre sí). */
  totalM3: number | null;
  totalPiezas: number | null;
  tono: "amparado" | "opcion";
}) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const alternar = (clave: string) =>
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) next.delete(clave);
      else next.add(clave);
      return next;
    });
  if (destinos.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="px-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        {titulo} <span className="font-normal normal-case tracking-normal">· {ayuda}</span>
      </p>
      <table className="mt-1 w-full">
        <thead>
          <tr className="border-b border-[var(--rule-soft)]">
            <th className={TH}>Se convierte en</th>
            <th className={`${TH} text-right`}>m³</th>
            <th className={`${TH} text-right`}>Piezas</th>
            <th className={`${TH} text-right`}>Falta</th>
          </tr>
        </thead>
        <tbody>
          {destinos.map((d) => {
            const clave = `${d.tipo}|${d.motivo}`;
            const abierto = abiertos.has(clave);
            return [
              <tr key={clave} className="border-b border-[var(--rule-soft)]">
                <td className={TD}>
                  {/* El desglose de MEDIDAS va plegado, igual que en los bloques
                      distribuidos: desplegado son 4× las filas y se pierde la
                      lectura de cuánto ampara cada tipo. */}
                  <button
                    type="button"
                    onClick={() => alternar(clave)}
                    disabled={d.medidas.length === 0}
                    aria-expanded={abierto}
                    className="inline-flex items-center gap-1 disabled:cursor-default"
                    title={d.medidas.length > 0 ? "Ver las medidas" : "Sin medidas declaradas"}
                  >
                    {d.medidas.length > 0 && (
                      <ChevronRight
                        className={`h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)] transition-transform ${abierto ? "rotate-90" : ""}`}
                        aria-hidden
                      />
                    )}
                    <span
                      className={`${CHIP} ${
                        tono === "amparado"
                          ? "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                          : "bg-[var(--data-info-500)]/15 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]"
                      }`}
                    >
                      {d.tipo}
                    </span>
                  </button>
                </td>
                <td className={`${NUM} font-bold text-[var(--text-primary)]`}>{fmtM3(d.m3)}</td>
                <td className={NUM}>{fmtPiezas(d.piezas)}</td>
                <td className={`${NUM} text-[var(--text-tertiary)]`}>
                  {d.motivo === "amparado"
                    ? "—"
                    : d.cubreTodo
                      ? "cubre todo"
                      : `${fmtM3(d.restaM3)} m³`}
                </td>
              </tr>,
              abierto ? (
                <tr key={`${clave}:medidas`} className="border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
                  <td colSpan={4} className="px-2 py-1.5">
                    <table className="w-full">
                      <tbody>
                        {d.medidas.map((m) => (
                          <tr key={m.clave}>
                            <td className="py-0.5 pl-6 text-xs text-[var(--text-secondary)]">{m.medida}</td>
                            <td className="py-0.5 text-right font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                              {fmtM3(m.m3)} m³
                            </td>
                            <td className="py-0.5 text-right font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                              {fmtPiezas(m.piezas)} pzas
                            </td>
                            <td className="py-0.5 pr-2 text-right font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                              {fmtPt(m.pieTablar)} PT
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              ) : null,
            ];
          })}
        </tbody>
        {totalM3 != null && (
          <tfoot>
            <tr className="border-t-2 border-[var(--rule-base)]">
              <td className={`${TD} font-bold text-[var(--text-primary)]`}>Total que sale</td>
              <td className={`${NUM} font-bold text-[var(--text-primary)]`}>{fmtM3(totalM3)}</td>
              <td className={`${NUM} font-bold text-[var(--text-primary)]`}>
                {totalPiezas != null ? fmtPiezas(totalPiezas) : "—"}
              </td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export default function ReprocesosSugeridos({
  grupos,
  cuadre,
  meta,
}: {
  grupos: GrupoDeReproceso[];
  cuadre: CuadreDeDistribucion;
  /** La meta de mix, si hay lote cubicado: cierra la cuenta del apartado. */
  meta?: {
    tipo: string;
    pctMinimo: number;
    actual: number;
    cumple: boolean;
    aporteM3: number;
  } | null;
}) {
  if (grupos.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* La cuenta de cierre: qué falta, con qué se tapa, qué queda. Con todo
          respaldado, cuatro ceros no dicen nada: se dice en una línea. */}
      {cuadre.faltaM3 <= 0 ? (
        <p className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          <b className="text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
            Todo lo cubicado tiene respaldo.
          </b>{" "}
          Lo de abajo es lo que ese respaldo <b>da por hecho</b>: reprocesos que el Libro todavía no
          tiene.
          {cuadre.libreM3 > 0 && (
            <span className="text-[var(--text-tertiary)]">
              {" "}
              Quedan {fmtM3(cuadre.libreM3)} m³ de capacidad sin usar.
            </span>
          )}
        </p>
      ) : (
        <div className="grid gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3 sm:grid-cols-4">
          {[
            {
              label: "Falta respaldar",
              v: cuadre.faltaM3,
              extra: `${fmtPiezas(cuadre.faltaPiezas)} pzas`,
            },
            { label: "Tapan los reprocesos", v: cuadre.cubreReprocesoM3, tono: "ok" as const },
            { label: "Capacidad libre", v: cuadre.libreM3 },
            {
              label: "Queda sin respaldo",
              v: cuadre.quedaM3,
              tono: cuadre.quedaM3 > 0 ? ("falta" as const) : ("ok" as const),
            },
          ].map((c) => (
            <div key={c.label}>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                {c.label}
              </p>
              <p
                className={`font-mono text-base font-bold tabular-nums ${
                  c.tono === "ok"
                    ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                    : c.tono === "falta"
                      ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                      : "text-[var(--text-primary)]"
                }`}
              >
                {fmtM3(c.v)} <span className="text-xs font-normal">m³</span>
              </p>
              {c.extra && (
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{c.extra}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {meta && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-[var(--rule-base)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          <Target className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" aria-hidden />
          <b className="text-[var(--text-primary)]">
            Meta: {meta.tipo} ≥ {meta.pctMinimo} %
          </b>
          <span>· hoy {meta.actual} %</span>
          {meta.aporteM3 > 0 ? (
            <span>
              · los reprocesos hacia {meta.tipo.toLowerCase()} suman{" "}
              <b className="font-mono tabular-nums">{fmtM3(meta.aporteM3)} m³</b>
            </span>
          ) : (
            <span>· ninguna sugerencia apunta a ese tipo</span>
          )}
          {meta.cumple && (
            <span className="font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
              · ya cumple
            </span>
          )}
        </p>
      )}

      {grupos.map((g) => (
        <div
          key={g.clave}
          className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)]"
        >
          {/* El producto ORIGINAL: lo que hay, con su tipo, m³ y piezas. */}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2">
            <span
              className={`${CHIP} bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]`}
            >
              {g.desdeTipo}
            </span>
            <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
              {fmtM3(g.origenM3)} m³
            </span>
            {g.origenPiezas != null && (
              <span className="text-xs text-[var(--text-secondary)]">
                {fmtPiezas(g.origenPiezas)} pzas
              </span>
            )}
            <span className="text-xs text-[var(--text-tertiary)]">· {g.especie}</span>
            <span className="ml-auto truncate text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
              {g.etiquetas.join(" · ")}
            </span>
          </div>

          <div className="px-3 pb-3">
            <TablaSalidas
              titulo="Ya está amparando"
              ayuda="se suman · falta declararlo en el Libro"
              destinos={g.amparados}
              totalM3={g.saleM3}
              totalPiezas={g.salePiezas}
              tono="amparado"
            />
            <TablaSalidas
              titulo="Podés cubrir con lo libre"
              ayuda={`compiten por los mismos ${fmtM3(g.libreM3)} m³ · elegí uno`}
              destinos={g.opciones}
              totalM3={null}
              totalPiezas={null}
              tono="opcion"
            />

            {/* La regla, con los números de este producto: sale menos de lo que
                entró, y queda lo que queda. */}
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-[var(--rule-soft)] pt-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
              <span>
                De{" "}
                <b className="font-mono tabular-nums text-[var(--text-secondary)]">
                  {fmtM3(g.origenM3)} m³
                </b>{" "}
                salen{" "}
                <b className="font-mono tabular-nums text-[var(--text-secondary)]">
                  {fmtM3(g.saleM3)} m³
                </b>
                {g.salePiezas > 0 && ` en ${fmtPiezas(g.salePiezas)} piezas`}
              </span>
              {g.excedeM3 > 0 ? (
                /* El reparto cierra hasta 3 piezas / 50 litros / 1 % por encima
                   del bloque para que las últimas tablas no queden huérfanas.
                   Decirlo es más honesto que mostrar «quedan 0.000». */
                <span className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                  · <b className="font-mono tabular-nums">{fmtM3(g.excedeM3)} m³</b> por encima:
                  cierre por diferencia de medición
                </span>
              ) : (
                <span>
                  · quedan{" "}
                  <b className="font-mono tabular-nums text-[var(--text-secondary)]">
                    {fmtM3(g.quedaM3)} m³
                  </b>
                </span>
              )}
            </p>
          </div>
        </div>
      ))}

      <p className="flex items-start gap-1.5 text-[length:var(--ts-2xs)] leading-snug text-[var(--text-tertiary)]">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Al recortar suben las piezas y <b>baja</b> el volumen: el reproceso nunca convierte más de
          lo que hay. Si el respaldo cierra unos litros por encima del bloque, es el cierre por
          diferencia de medición del reparto (hasta 3 piezas y 1 % del bloque). Esto no mueve nada
          en el Libro — el reproceso se registra desde Productos disponibles.
        </span>
      </p>
    </div>
  );
}

/** El ícono del apartado: el MISMO que «Reprocesar» en Productos disponibles —
 *  la misma acción no puede tener dos símbolos en el mismo módulo. */
export const ICONO_REPROCESOS = RefreshCw;
