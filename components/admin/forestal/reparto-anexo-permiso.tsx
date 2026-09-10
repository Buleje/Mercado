"use client";

/**
 * El Anexo 04 de un permiso, con todo lo suyo junto (ADR-406).
 *
 * El papel se presenta contra un **título habilitante**: hasta ahora había que
 * saber de memoria qué bloques eran de cuál y tildarlos uno por uno. Acá el
 * permiso es la unidad — se elige de la lista y se arma con todos sus bloques,
 * con las medidas iguales sumadas en una sola línea.
 *
 * Dos cosas que la pantalla dice y no esconde:
 *  · **Si cuadra o no**: la suma del detalle contra lo que los bloques declaran
 *    amparar. El papel no puede declarar un total que su propio detalle no
 *    sostiene, y eso se ve ANTES de imprimir.
 *  · **De qué bloques sale**: un anexo que junta cuatro guías tiene que poder
 *    decir cuáles, o no se puede reconstruir de dónde salió cada tabla.
 *
 * Y dos que pidió Brandon el 2026-09-09:
 *  · **El resumen por especie y tipo**, arriba del detalle: «de tornillo salen X
 *    m³ de comercial, en tantos PT y tantas piezas». El detalle por medida no
 *    responde eso sin sumar veinte filas a ojo.
 *  · **Ocultar las medidas queda guardado**: *«cuando voy a ocultar y voy a otra
 *    pestaña y vuelvo, la tabla debe estar oculta»*. Se recuerda por tenant en
 *    `localStorage`, como el resto de los plegados del cubicador.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronRight, Download, FileText } from "@buleje/design-system/icons";
import { fmtM3, fmtPiezas, fmtPt, fmtSoles } from "@/lib/forestal/cubicacion-formato";
import type { PrecioPt } from "@/lib/forestal/cubicacion-resumen";
import {
  filasDelAnexo,
  resumenPorEspecieTipo,
  type AnexoDePermiso,
} from "@/lib/forestal/anexo-por-permiso";
import { slugKey } from "@/lib/forestal/sembrar-reparto";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";

const TH =
  "px-2 py-1 text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";
const TD = "px-2 py-1.5 text-sm text-[var(--text-secondary)]";
const NUM = `${TD} text-right font-mono tabular-nums`;

/**
 * Dónde se recuerda que el detalle está plegado. Sufijo del lote del cubicador,
 * igual que el resto de los derivados (`-rolliza`, `-meta`): así el ajuste vive
 * por tenant y no se mezcla entre negocios.
 */
const CLAVE_MEDIDAS = () => slugKey("-anexo-permiso-medidas");

export default function AnexoPorPermiso({
  anexos,
  precioDe,
  onAbrir,
}: {
  anexos: AnexoDePermiso[];
  /**
   * Precio por pie tablar (uno para el lote o uno por especie) — el MISMO
   * resolvedor de los resúmenes. Con precio cargado, las tablas suman Precio e
   * Importe (Brandon, 2026-09-09); sin él, esas columnas no existen.
   */
  precioDe?: PrecioPt;
  /** Abre el Anexo 04 con las piezas ya unificadas de ese permiso. */
  onAbrir: (piezas: PiezaCubicada[], etiqueta: string, especie: string) => void;
}) {
  const [elegido, setElegido] = useState<string | null>(null);
  /** La tabla del detalle se puede plegar: son tantas filas como medidas, y
   *  muchas veces sólo se quiere el total o abrir el papel (Brandon). */
  const [abierta, setAbierta] = useState(true);
  /* Se hidrata en un efecto y no en el initializer: este árbol se monta dentro
     del panel (client), pero leer `localStorage` durante el primer render es
     lo que rompe si algún día esta pantalla se renderiza en el server. */
  useEffect(() => {
    try {
      if (localStorage.getItem(CLAVE_MEDIDAS()) === "0") setAbierta(false);
    } catch {
      /* modo privado: se queda abierta, que es el default */
    }
  }, []);
  const alternarMedidas = () =>
    setAbierta((v) => {
      const next = !v;
      try {
        localStorage.setItem(CLAVE_MEDIDAS(), next ? "1" : "0");
      } catch {
        /* quota / modo privado: el plegado vale para esta sesión */
      }
      return next;
    });
  const actual = useMemo(
    () => anexos.find((a) => (a.permiso ?? " sin") === (elegido ?? anexos[0]?.permiso ?? " sin")) ?? anexos[0],
    [anexos, elegido],
  );
  const precio = precioDe ?? 0;
  const filas = useMemo(() => (actual ? filasDelAnexo(actual, precio) : []), [actual, precio]);
  /** Qué sale de cada especie y tipo — la lectura de negocio del permiso. */
  const resumen = useMemo(() => (actual ? resumenPorEspecieTipo(actual, precio) : []), [actual, precio]);
  /* El importe del permiso: la suma de la columna, que es lo que se cobra. */
  const importeTotal = useMemo(() => resumen.reduce((a, r) => a + r.valor, 0), [resumen]);
  const conValor = importeTotal > 0;

  /** El detalle del permiso en CSV — para el contador o para pasar el precio. */
  const bajarCsv = () => {
    if (!actual) return;
    const cab = ["Especie", "Tipo", "Medida", "Piezas", "m3", "PieTablar", ...(conValor ? ["PrecioPT", "Importe"] : [])];
    const cuerpo = filas.map((f) => [
      f.especie, f.tipo, f.medida, f.piezas, f.m3.toFixed(4), f.pieTablar.toFixed(2),
      ...(conValor ? [(f.pieTablar > 0 ? f.valor / f.pieTablar : 0).toFixed(2), f.valor.toFixed(2)] : []),
    ].join(","));
    const total = ["TOTAL", "", "", actual.totalPiezas, actual.totalM3.toFixed(4), actual.totalPt.toFixed(2),
      ...(conValor ? ["", importeTotal.toFixed(2)] : [])].join(",");
    /* BOM: sin él Excel abre las tildes como símbolos. */
    const csv = "\ufeff" + [cab.join(","), ...cuerpo, total].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `anexo04-${(actual.permiso ?? "sin-permiso").replace(/[^\w.-]+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (anexos.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Elegir el permiso: cada uno es un papel distinto. */}
      <div className="flex flex-wrap gap-1.5">
        {anexos.map((a) => {
          const clave = a.permiso ?? " sin";
          const activo = (actual?.permiso ?? " sin") === clave;
          return (
            <button
              key={clave}
              type="button"
              onClick={() => setElegido(clave)}
              aria-pressed={activo}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors ${
                activo
                  ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                  : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
              }`}
            >
              {a.permiso ? a.label : <span className="italic">{a.label}</span>}
              <span className="font-mono tabular-nums text-[length:var(--ts-2xs)] opacity-80">
                {fmtM3(a.totalM3)} m³
              </span>
              {!a.cuadra && (
                <AlertTriangle
                  className="h-3.5 w-3.5 text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]"
                  aria-label="No cuadra"
                />
              )}
            </button>
          );
        })}
      </div>

      {actual && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2">
            <span className="text-sm font-bold text-[var(--text-primary)]">{actual.label}</span>
            <span className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">
              {fmtPiezas(actual.totalPiezas)} pzas · {fmtPt(actual.totalPt)} PT ·{" "}
              <b className="text-[var(--text-primary)]">{fmtM3(actual.totalM3)} m³</b>
            </span>
            <span className="text-xs text-[var(--text-tertiary)]">
              {actual.especies.join(" · ")} · {actual.tipos.length}{" "}
              {actual.tipos.length === 1 ? "tipo" : "tipos"} · {actual.bloques.length}{" "}
              {actual.bloques.length === 1 ? "bloque" : "bloques"}
            </span>
            <button
              type="button"
              onClick={alternarMedidas}
              aria-expanded={abierta}
              className="ml-auto inline-flex items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2 py-1 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
            >
              <ChevronRight
                className={`h-3.5 w-3.5 transition-transform ${abierta ? "rotate-90" : ""}`}
                aria-hidden
              />
              {abierta ? "Ocultar" : "Mostrar"} las {filas.length}{" "}
              {filas.length === 1 ? "medida" : "medidas"}
            </button>
            <button
              type="button"
              onClick={() =>
                onAbrir(actual.piezas, actual.label, actual.especies[0] ?? "")
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)] bg-primary/10 px-2.5 py-1 text-xs font-bold text-[var(--accent-ink)] transition-colors hover:brightness-95 dark:text-[var(--accent)]"
            >
              <FileText className="h-3.5 w-3.5" aria-hidden /> Anexo 04 de este permiso
            </button>
            {/* El mismo detalle en CSV — se abre en Excel para pasarle el
                precio al cliente o para el contador. */}
            <button
              type="button"
              onClick={bajarCsv}
              title="Bajar el detalle de este permiso en CSV (Excel): medidas, piezas, m³, PT y el importe si hay precio cargado"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
            >
              <Download className="h-3.5 w-3.5" aria-hidden /> CSV
            </button>
          </div>

          {/* El cuadre, antes que el detalle: si no cierra, no se imprime. */}
          <p
            className={`flex items-start gap-1.5 px-3 py-2 text-[length:var(--ts-2xs)] leading-snug ${
              actual.cuadra
                ? "text-[var(--text-tertiary)]"
                : "bg-[var(--data-warning-500)]/10 font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
            }`}
          >
            {actual.cuadra ? (
              <>
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  Cuadra: las {filas.length} medidas suman {fmtM3(actual.totalM3)} m³, lo mismo que
                  amparan sus bloques ({actual.bloques.map((b) => b.etiqueta).join(" · ")}).
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  No cuadra: el detalle suma {fmtM3(actual.totalM3)} m³ y sus bloques amparan{" "}
                  {fmtM3(actual.amparadoM3)} ({actual.diferenciaM3 > 0 ? "+" : ""}
                  {fmtM3(actual.diferenciaM3)}). Revisá los overrides de línea antes de imprimir.
                </span>
              </>
            )}
          </p>

          {/* Qué sale de cada especie y tipo — la lectura de negocio del
              permiso, arriba del detalle por medida. No se pliega: es el
              resumen, y son pocas filas (tipos × especies del permiso). */}
          {resumen.length > 0 && (
            <div className="overflow-x-auto px-3 pb-2">
              <p className="px-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Resumen por especie y tipo{" "}
                <span className="font-normal normal-case tracking-normal">
                  · qué sale de este permiso
                </span>
              </p>
              <table className="mt-1 w-full">
                <thead>
                  <tr className="border-b border-[var(--rule-soft)]">
                    <th className={TH}>Especie</th>
                    <th className={TH}>Tipo</th>
                    <th className={`${TH} text-right`}>Piezas</th>
                    <th className={`${TH} text-right`}>m³</th>
                    <th className={`${TH} text-right`}>Pie tablar</th>
                    {conValor && <th className={`${TH} text-right`} title="Precio unitario: importe ÷ pie tablar">Precio S/ PT</th>}
                    {conValor && <th className={`${TH} text-right`} title="Pie tablar × precio unitario">Importe S/</th>}
                    <th className={`${TH} text-right`}>% del anexo</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.map((r) => (
                    <tr key={r.clave} className="border-b border-[var(--rule-soft)] last:border-0">
                      <td className={TD}>{r.especie}</td>
                      <td className={TD}>
                        <span className="font-bold text-[var(--text-primary)]">{r.tipo}</span>{" "}
                        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                          · {r.medidas} {r.medidas === 1 ? "medida" : "medidas"}
                        </span>
                      </td>
                      <td className={NUM}>{fmtPiezas(r.piezas)}</td>
                      <td className={`${NUM} font-bold text-[var(--text-primary)]`}>{fmtM3(r.m3)}</td>
                      <td className={NUM}>{fmtPt(r.pieTablar)}</td>
                      {conValor && (
                        <td className={NUM}>{r.pieTablar > 0 ? fmtSoles(r.valor / r.pieTablar) : "—"}</td>
                      )}
                      {conValor && (
                        <td className={`${NUM} font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]`}>
                          {fmtSoles(r.valor)}
                        </td>
                      )}
                      <td className={`${NUM} text-[var(--text-tertiary)]`}>
                        {r.pctM3.toLocaleString("es-PE", { maximumFractionDigits: 1 })} %
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--rule-base)]">
                    <td className={`${TD} font-bold text-[var(--text-primary)]`} colSpan={2}>
                      Total del permiso
                    </td>
                    <td className={`${NUM} font-bold text-[var(--text-primary)]`}>
                      {fmtPiezas(actual.totalPiezas)}
                    </td>
                    <td className={`${NUM} font-bold text-[var(--text-primary)]`}>
                      {fmtM3(actual.totalM3)}
                    </td>
                    <td className={`${NUM} font-bold text-[var(--text-primary)]`}>
                      {fmtPt(actual.totalPt)}
                    </td>
                    {conValor && (
                      <td className={`${NUM} font-bold text-[var(--text-primary)]`}>
                        {actual.totalPt > 0 ? fmtSoles(importeTotal / actual.totalPt) : "—"}
                      </td>
                    )}
                    {/* La suma de la columna Importe: lo que vale este permiso. */}
                    {conValor && (
                      <td className={`${NUM} font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]`}>
                        {fmtSoles(importeTotal)}
                      </td>
                    )}
                    <td className={`${NUM} text-[var(--text-tertiary)]`}>100 %</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {abierta && (
          <div className="overflow-x-auto px-3 pb-3">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--rule-soft)]">
                  <th className={TH}>Especie</th>
                  <th className={TH}>Tipo</th>
                  <th className={TH}>Medida</th>
                  <th className={`${TH} text-right`}>Piezas</th>
                  <th className={`${TH} text-right`}>m³</th>
                  <th className={`${TH} text-right`}>Pie tablar</th>
                  {conValor && <th className={`${TH} text-right`}>Precio S/ PT</th>}
                  {conValor && <th className={`${TH} text-right`}>Importe S/</th>}
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.clave} className="border-b border-[var(--rule-soft)] last:border-0">
                    <td className={TD}>{f.especie}</td>
                    <td className={TD}>{f.tipo}</td>
                    <td className={`${TD} font-mono`}>{f.medida}</td>
                    <td className={NUM}>{fmtPiezas(f.piezas)}</td>
                    <td className={`${NUM} font-bold text-[var(--text-primary)]`}>{fmtM3(f.m3)}</td>
                    <td className={NUM}>{fmtPt(f.pieTablar)}</td>
                    {conValor && <td className={NUM}>{f.pieTablar > 0 ? fmtSoles(f.valor / f.pieTablar) : "—"}</td>}
                    {conValor && (
                      <td className={`${NUM} font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]`}>
                        {fmtSoles(f.valor)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--rule-base)]">
                  <td className={`${TD} font-bold text-[var(--text-primary)]`} colSpan={3}>
                    Total del anexo
                  </td>
                  <td className={`${NUM} font-bold text-[var(--text-primary)]`}>
                    {fmtPiezas(actual.totalPiezas)}
                  </td>
                  <td className={`${NUM} font-bold text-[var(--text-primary)]`}>
                    {fmtM3(actual.totalM3)}
                  </td>
                  <td className={`${NUM} font-bold text-[var(--text-primary)]`}>
                    {fmtPt(actual.totalPt)}
                  </td>
                  {conValor && (
                    <td className={`${NUM} font-bold text-[var(--text-primary)]`}>
                      {actual.totalPt > 0 ? fmtSoles(importeTotal / actual.totalPt) : "—"}
                    </td>
                  )}
                  {conValor && (
                    <td className={`${NUM} font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]`}>
                      {fmtSoles(importeTotal)}
                    </td>
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
          )}
        </div>
      )}
    </div>
  );
}
