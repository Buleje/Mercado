"use client";

/**
 * LothDespachoPorGuia — el Despacho de trozas leído «por guía» (Brandon 08-10):
 * una fila por GTF con su fecha, especie, trozas, m³, destino y si ya entró al
 * CTP. Tocar la fila despliega sus trozas con D1/D2/Largo/m³ (del trozado de
 * cada una) y el total de la guía; tocar una troza abre su detalle.
 *
 * Agrupa lo que deja pasar el filtro de la tabla «Suelto» (las tarjetas de
 * arriba filtran igual en los dos formatos). La cuenta es pura
 * (`lib/forestal/loth-despacho-por-guia`). Cada guía imprime su hoja de
 * despacho con un QR a su lista pública (QR3, `LothDespachoPorGuiaPartes`).
 */

import { useMemo, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { ChevronRight, FileText } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import { diaCorto } from "@/lib/forestal/loth-aprovechamiento";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { despachosPorGuia, filaAnulada, type FilaPorGuia, type GuiaDelDespacho } from "@/lib/forestal/loth-despacho-por-guia";
import type { PermisoDeLaHoja } from "@/lib/forestal/loth-despacho-hoja";
import type { PlanTablero } from "@/lib/forestal/loth-tablero-permiso";
import { BotonHojaDespacho, DER, Desglose, EstadoGuia, TD, TH } from "./LothDespachoPorGuiaPartes";

export default function LothDespachoPorGuia({
  lineas,
  guias,
  guiasError,
  hayCtp,
  planes,
  caratula,
  onDetalle,
  onVerGuia,
}: {
  /** Las líneas que deja el filtro de la sección (todas las páginas). */
  lineas: readonly LothEntryDTO[];
  guias: readonly GuiaDelDespacho[];
  guiasError?: string | null;
  /** El negocio lleva Libro CTP: ofrece «Ingresar al CTP». */
  hayCtp: boolean;
  /** Los permisos del libro: la hoja de cada guía dice el suyo. */
  planes: readonly PlanTablero[];
  caratula: { titularName: string | null; tituloHabilitante: string | null } | null;
  onDetalle: (e: LothEntryDTO) => void;
  onVerGuia: (gtf: string) => void;
}) {
  const filas = useMemo(() => despachosPorGuia(lineas, guias), [lineas, guias]);
  const permisoDe = (f: FilaPorGuia): PermisoDeLaHoja => {
    const p = planes.find((x) => x.id === f.planId);
    return {
      tituloHabilitante: p?.tituloHabilitante ?? caratula?.tituloHabilitante ?? null,
      planNumber: p?.planNumber ?? null,
      titular: p?.titularName ?? caratula?.titularName ?? null,
    };
  };
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
              permiso={permisoDe(f)}
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
  permiso,
  onDetalle,
  onVerGuia,
}: {
  f: FilaPorGuia;
  abierta: boolean;
  onAlternar: () => void;
  hayCtp: boolean;
  permiso: PermisoDeLaHoja;
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
            <Desglose f={f} onDetalle={onDetalle} hoja={f.gtfNumber ? <BotonHojaDespacho f={f} permiso={permiso} /> : null} />
          </td>
        </tr>
      )}
    </>
  );
}
