"use client";

/**
 * LothDespachoPorGuia — el Despacho de trozas leído «por guía» (Brandon 08-10):
 * una fila por GTF con su fecha, especie, trozas, m³, destino y si ya entró al
 * CTP. Tocar la fila despliega sus trozas con D1/D2/Largo/m³ (del trozado de
 * cada una) y el total de la guía; tocar una troza abre su detalle.
 *
 * Agrupa lo que deja pasar el filtro de la tabla «Suelto» (las tarjetas de
 * arriba filtran igual en los dos formatos). La cuenta es pura
 * (`lib/forestal/loth-despacho-por-guia`).
 */

import { useMemo, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { ArrowRight, ChevronRight, FileText } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import { diaCorto } from "@/lib/forestal/loth-aprovechamiento";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { medidasDeLinea } from "@/lib/forestal/loth-despacho-medidas";
import { despachosPorGuia, filaAnulada, type FilaPorGuia, type GuiaDelDespacho } from "@/lib/forestal/loth-despacho-por-guia";
import { ingresarGtfAlCtp } from "./LothGtfCtp";

const TH = "px-3 py-2.5 font-bold text-[var(--text-primary)] whitespace-nowrap";
const TD = "px-3 py-2.5 align-top";
const DER = "text-right font-mono tabular-nums";
const m = (v: string | null, dp: number) => (v == null ? "—" : Number(v).toFixed(dp));

const CHIP = "inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold";
const TONO = {
  error: "bg-[var(--data-error-500)]/12 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  ok: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  aviso: "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  neutro: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
} as const;

export default function LothDespachoPorGuia({
  lineas,
  guias,
  guiasError,
  hayCtp,
  onDetalle,
  onVerGuia,
}: {
  /** Las líneas que deja el filtro de la sección (todas las páginas). */
  lineas: readonly LothEntryDTO[];
  guias: readonly GuiaDelDespacho[];
  guiasError?: string | null;
  /** El negocio lleva Libro CTP: ofrece «Ingresar al CTP». */
  hayCtp: boolean;
  onDetalle: (e: LothEntryDTO) => void;
  onVerGuia: (gtf: string) => void;
}) {
  const filas = useMemo(() => despachosPorGuia(lineas, guias), [lineas, guias]);
  /* Una sola guía se abre sola: no hay nada que elegir. */
  const [abiertas, setAbiertas] = useState<Set<string> | null>(null);
  const abierta = (k: string) => (abiertas ? abiertas.has(k) : filas.length === 1);
  const alternar = (k: string) =>
    setAbiertas((prev) => {
      const next = new Set(prev ?? (filas.length === 1 ? [filas[0].clave] : []));
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  if (filas.length === 0) return null;
  const vivas = filas.filter((f) => !filaAnulada(f));
  const trozas = vivas.reduce((a, f) => a + f.trozas, 0);
  const m3 = Math.round(vivas.reduce((a, f) => a + f.m3, 0) * 10000) / 10000;

  return (
    <div className="space-y-2" data-despacho-por-guia>
      {guiasError && (
        <p className="text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          {guiasError} Las filas salen del libro; faltan destino y estado.
        </p>
      )}
      <DataTable wrapperClassName="rounded-2xl bg-[var(--surface-raised)]" className="w-full text-sm">
        <thead className="bg-[var(--surface-sunken)]">
          <tr>
            <th className={`${TH} w-10`} aria-label="Desplegar" />
            <th className={TH}>N° GTF</th>
            <th className={TH}>Fecha</th>
            <th className={TH}>Especie</th>
            <th className={`${TH} text-right`}>Trozas</th>
            <th className={`${TH} text-right`}>m³</th>
            <th className={TH}>Destino</th>
            <th className={TH}>Estado</th>
            <th className={`${TH} w-12 text-right`} aria-label="Ver guía" />
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <FilaGuia
              key={f.clave}
              f={f}
              abierta={abierta(f.clave)}
              onAlternar={() => alternar(f.clave)}
              hayCtp={hayCtp}
              onDetalle={onDetalle}
              onVerGuia={onVerGuia}
            />
          ))}
        </tbody>
        <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
          <tr>
            <td className={TD} colSpan={4}>
              <span className="text-xs font-black uppercase tracking-widest text-[var(--text-secondary)]">
                Total · {vivas.length} guía{vivas.length === 1 ? "" : "s"}
              </span>
              {filas.length > vivas.length && (
                <span className="ml-2 text-xs text-[var(--text-tertiary)]">({filas.length - vivas.length} anuladas, no suman)</span>
              )}
            </td>
            <td className={`${TD} ${DER} font-bold`}>{trozas}</td>
            <td className={`${TD} ${DER} text-base font-black`}>{fmtM3(m3)}</td>
            <td className={TD} colSpan={3} />
          </tr>
        </tfoot>
      </DataTable>
    </div>
  );
}

function FilaGuia({
  f,
  abierta,
  onAlternar,
  hayCtp,
  onDetalle,
  onVerGuia,
}: {
  f: FilaPorGuia;
  abierta: boolean;
  onAlternar: () => void;
  hayCtp: boolean;
  onDetalle: (e: LothEntryDTO) => void;
  onVerGuia: (gtf: string) => void;
}) {
  const anulada = filaAnulada(f);
  const idDesglose = `desglose-${f.clave.replace(/[^a-zA-Z0-9-]/g, "_")}`;
  return (
    <>
      <tr
        className={`cursor-pointer border-t border-[var(--rule-soft)] hover:bg-[var(--surface-canvas)]/40 ${anulada ? "opacity-60" : ""}`}
        onClick={onAlternar}
      >
        <td className={TD}>
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              onAlternar();
            }}
            aria-expanded={abierta}
            aria-controls={idDesglose}
            aria-label={`${abierta ? "Plegar" : "Desplegar"} las trozas de la guía ${f.gtfNumber ?? "sin número"}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${abierta ? "rotate-90" : ""}`} aria-hidden="true" />
          </button>
        </td>
        <td className={`${TD} whitespace-nowrap font-mono font-bold ${anulada ? "line-through" : ""}`}>{f.gtfNumber ?? "Sin GTF"}</td>
        <td className={`${TD} whitespace-nowrap text-[var(--text-secondary)]`}>{f.fecha ? diaCorto(f.fecha) : "—"}</td>
        <td className={TD}>{f.especies.join(", ") || "—"}</td>
        <td className={`${TD} ${DER}`}>
          {anulada ? f.anuladas : f.trozas}
        </td>
        <td className={`${TD} ${DER} font-bold`}>
          {anulada ? <span className="line-through">{fmtM3(f.m3Anuladas)}</span> : fmtM3(f.m3)}
          {f.sinMedida > 0 && (
            <InfoTip
              title="Sin medida"
              what={`${f.sinMedida} troza${f.sinMedida === 1 ? "" : "s"} sin línea de Trozado en este permiso: su m³ no está en la suma.`}
            />
          )}
        </td>
        <td className={TD}>
          <span className="block">{f.guia?.destino ?? "—"}</span>
          {f.guia?.llegada && <span className="block text-xs text-[var(--text-tertiary)]">{f.guia.llegada}</span>}
        </td>
        <td className={TD} onClick={(ev) => ev.stopPropagation()}>
          <EstadoGuia f={f} hayCtp={hayCtp} />
        </td>
        <td className={`${TD} text-right`} onClick={(ev) => ev.stopPropagation()}>
          {f.gtfNumber && (
            <button
              type="button"
              onClick={() => onVerGuia(f.gtfNumber as string)}
              title="Ver la guía en la vista GTF"
              aria-label={`Ver la guía ${f.gtfNumber}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--rule-base)] text-[var(--text-primary)] hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </td>
      </tr>
      {abierta && (
        <tr id={idDesglose} className="bg-[var(--surface-canvas)]/40">
          <td className={TD} />
          <td className={`${TD} pb-4`} colSpan={8}>
            <Desglose f={f} onDetalle={onDetalle} />
          </td>
        </tr>
      )}
    </>
  );
}

function EstadoGuia({ f, hayCtp }: { f: FilaPorGuia; hayCtp: boolean }) {
  if (filaAnulada(f)) return <span className={`${CHIP} ${TONO.error}`}>Anulada</span>;
  const ctp = f.guia?.ctp ?? null;
  if (!f.guia) return <span className={`${CHIP} ${TONO.neutro}`}>Guía no encontrada</span>;
  if (ctp === "ingresada") return <span className={`${CHIP} ${TONO.ok}`}>En el CTP</span>;
  if (ctp === "otra_empresa") return <span className={`${CHIP} ${TONO.neutro}`}>Va a otra empresa</span>;
  if (ctp === "por_ingresar") {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <span className={`${CHIP} ${TONO.aviso}`}>Por ingresar al CTP</span>
        {hayCtp && f.gtfNumber && (
          <button
            type="button"
            onClick={() => ingresarGtfAlCtp(f.gtfNumber as string)}
            className="inline-flex min-h-6 items-center gap-1 text-xs font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]"
          >
            Ingresar al CTP <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </span>
    );
  }
  return <span className={`${CHIP} ${TONO.neutro}`}>Emitida</span>;
}

/** Las trozas de una guía con sus medidas (las del trozado) y el total. */
function Desglose({ f, onDetalle }: { f: FilaPorGuia; onDetalle: (e: LothEntryDTO) => void }) {
  const anulada = filaAnulada(f);
  return (
    <table className="w-full text-sm" aria-label={`Trozas de la guía ${f.gtfNumber ?? "sin número"}`}>
      <thead>
        <tr className="text-xs text-[var(--text-secondary)]">
          <th className={TH}>Cód. troza</th>
          <th className={TH}>Especie</th>
          <th className={`${TH} text-right`}>D1</th>
          <th className={`${TH} text-right`}>D2</th>
          <th className={`${TH} text-right`}>Largo</th>
          <th className={`${TH} text-right`}>m³</th>
        </tr>
      </thead>
      <tbody>
        {f.lineas.map((e) => {
          const md = medidasDeLinea(e);
          const tachada = e.status === "anulado";
          return (
            <tr key={e.id} className={tachada && !anulada ? "opacity-60" : undefined}>
              <td className={TD}>
                <button
                  type="button"
                  onClick={() => onDetalle(e)}
                  title="Abre el detalle del despacho"
                  className={`font-mono font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)] ${tachada ? "line-through" : ""}`}
                >
                  {e.trozaCode ?? "—"}
                </button>
              </td>
              <td className={TD}>{md.especie ?? "—"}</td>
              <td className={`${TD} ${DER}`}>{m(md.d1, 2)}</td>
              <td className={`${TD} ${DER}`}>{m(md.d2, 2)}</td>
              <td className={`${TD} ${DER}`}>{m(md.largo, 2)}</td>
              <td className={`${TD} ${DER} font-bold`}>{m(md.m3, 4)}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="border-t border-[var(--rule-base)]">
          <td className={TD} colSpan={5}>
            <span className="text-xs font-black uppercase tracking-widest text-[var(--text-secondary)]">
              Total · {anulada ? f.anuladas : f.trozas} troza{(anulada ? f.anuladas : f.trozas) === 1 ? "" : "s"}
            </span>
            {!anulada && f.anuladas > 0 && <span className="ml-2 text-xs text-[var(--text-tertiary)]">({f.anuladas} anuladas, no suman)</span>}
          </td>
          <td className={`${TD} ${DER} font-black`}>{anulada ? <span className="line-through">{fmtM3(f.m3Anuladas)}</span> : fmtM3(f.m3)}</td>
        </tr>
      </tfoot>
    </table>
  );
}
