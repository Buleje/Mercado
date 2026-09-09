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
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronRight, FileText } from "@buleje/design-system/icons";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { filasDelAnexo, type AnexoDePermiso } from "@/lib/forestal/anexo-por-permiso";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";

const TH =
  "px-2 py-1 text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";
const TD = "px-2 py-1.5 text-sm text-[var(--text-secondary)]";
const NUM = `${TD} text-right font-mono tabular-nums`;

export default function AnexoPorPermiso({
  anexos,
  onAbrir,
}: {
  anexos: AnexoDePermiso[];
  /** Abre el Anexo 04 con las piezas ya unificadas de ese permiso. */
  onAbrir: (piezas: PiezaCubicada[], etiqueta: string, especie: string) => void;
}) {
  const [elegido, setElegido] = useState<string | null>(null);
  /** La tabla del detalle se puede plegar: son tantas filas como medidas, y
   *  muchas veces sólo se quiere el total o abrir el papel (Brandon). */
  const [abierta, setAbierta] = useState(true);
  const actual = useMemo(
    () => anexos.find((a) => (a.permiso ?? " sin") === (elegido ?? anexos[0]?.permiso ?? " sin")) ?? anexos[0],
    [anexos, elegido],
  );
  const filas = useMemo(() => (actual ? filasDelAnexo(actual) : []), [actual]);

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
              onClick={() => setAbierta((v) => !v)}
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

          {abierta && (
          <div className="overflow-x-auto px-3 pb-3">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--rule-soft)]">
                  <th className={TH}>Especie</th>
                  <th className={TH}>Tipo</th>
                  <th className={TH}>Medida</th>
                  <th className={`${TH} text-right`}>Piezas</th>
                  <th className={`${TH} text-right`}>Pie tablar</th>
                  <th className={`${TH} text-right`}>m³</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.clave} className="border-b border-[var(--rule-soft)] last:border-0">
                    <td className={TD}>{f.especie}</td>
                    <td className={TD}>{f.tipo}</td>
                    <td className={`${TD} font-mono`}>{f.medida}</td>
                    <td className={NUM}>{fmtPiezas(f.piezas)}</td>
                    <td className={NUM}>{fmtPt(f.pieTablar)}</td>
                    <td className={`${NUM} font-bold text-[var(--text-primary)]`}>{fmtM3(f.m3)}</td>
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
                    {fmtPt(actual.totalPt)}
                  </td>
                  <td className={`${NUM} font-bold text-[var(--text-primary)]`}>
                    {fmtM3(actual.totalM3)}
                  </td>
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
