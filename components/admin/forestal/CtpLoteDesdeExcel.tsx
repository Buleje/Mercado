"use client";

/**
 * «Pegar de Excel» en «Programar un lote de aserrío» (Brandon 27-10): la lista
 * de trozas del SNIFFS se pega en una grilla como la del cubicador
 * (`CtpLoteExcelGrilla`) y cada lote de la columna «Lote» entra al libro EN
 * CONSUMO, con sus trozas del patio, listo para declarar su producción. Debajo
 * de la grilla, una tarjeta por lote: su N°, la fecha del consumo (la «Fecha
 * del estado», corregible) y lo que frena o conviene saber. El estado vive en
 * `use-lote-desde-excel` (el botón Importar está en el pie del modal).
 */

import { AlertTriangle, CheckCircle2, Loader2 } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { diaLegible, fechaFueraDeRango } from "@/lib/forestal/lote-desde-excel-cruce";
import { Btn, I } from "./ctp-shared";
import CtpLoteExcelGrilla from "./CtpLoteExcelGrilla";
import type { LoteDelExcel, LoteDesdeExcel } from "./hooks/use-lote-desde-excel";

const ERROR = "text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";
const ROTULO = "mb-1 block text-sm font-semibold text-[var(--text-secondary)]";

function TarjetaLote({ l, estado }: { l: LoteDelExcel; estado: LoteDesdeExcel }) {
  const { hoy, poner, importando } = estado;
  const c = l.cruce;
  const fuera = c && !l.cargando ? fechaFueraDeRango(l.fecha, c.fechaMinima, hoy) : null;
  const id = encodeURIComponent(l.clave || "sin-lote");
  if (l.hecho) {
    return (
      <p className="flex items-start gap-2 rounded-xl bg-[var(--data-success-500)]/12 px-3 py-2 text-sm font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {l.hecho}
      </p>
    );
  }
  return (
    <section
      className="space-y-2 rounded-xl border border-[var(--rule-base)] p-3"
      aria-label={l.code.trim() ? `Lote ${l.code}` : "Lote sin N° (correlativo automático)"}
    >
      <div className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,12rem)_1fr] sm:items-end">
        <div>
          <label className={ROTULO} htmlFor={`lote-excel-code-${id}`}>
            N° de lote
          </label>
          <input
            id={`lote-excel-code-${id}`}
            value={l.code}
            onChange={(e) => poner(l.clave, { code: e.target.value })}
            placeholder="LA-2026-00N"
            maxLength={60}
            disabled={importando}
            className={`${I} font-mono`}
          />
        </div>
        <div>
          <label className={ROTULO} htmlFor={`lote-excel-fecha-${id}`}>
            Fecha del consumo
          </label>
          <input
            id={`lote-excel-fecha-${id}`}
            type="date"
            value={l.fecha}
            min={c?.fechaMinima ?? undefined}
            max={hoy}
            onChange={(e) => poner(l.clave, { fecha: e.target.value })}
            disabled={importando}
            className={I}
          />
        </div>
        <p className="text-sm text-[var(--text-secondary)] sm:pb-2.5">
          {l.cargando ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando las trozas en el libro…
            </span>
          ) : c ? (
            <>
              <b className="text-[var(--text-primary)]">{c.especie?.comun ?? "—"}</b>
              {c.permiso ? ` · permiso ${c.permiso}` : ""} ·{" "}
              <span className="font-mono tabular-nums">
                entran {c.piezas} de {l.filas.length} · {fmtM3(c.volumenM3)} m³
              </span>
              {c.conMedidas > 0 ? ` · completa D1/D2 de ${c.conMedidas}` : ""}
            </>
          ) : null}
        </p>
      </div>

      {c?.existente && c.existente.status === "abierto" && c.bloqueos.length === 0 && (
        <p className="text-sm text-[var(--text-secondary)]">
          El lote <b className="font-mono text-[var(--text-primary)]">{c.existente.code}</b> ya estaba programado: las trozas se
          le suman y queda en consumo.
        </p>
      )}
      {l.error && (
        <p className={ERROR} role="alert">
          {l.error}
        </p>
      )}
      {c?.avisos.map((a) => (
        <p key={a} className="flex items-start gap-1.5 text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {a}
        </p>
      ))}
      {c?.bloqueos.map((b) => (
        <p key={b} className={`${ERROR} flex items-start gap-1.5`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {b}
        </p>
      ))}
      {c && fuera && c.bloqueos.length === 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <p className={ERROR}>{fuera}</p>
          {c.fechaMinima && l.fecha < c.fechaMinima && c.fechaMinima <= hoy && (
            <Btn size="sm" onClick={() => poner(l.clave, { fecha: c.fechaMinima! })}>
              Usar el {diaLegible(c.fechaMinima)}
            </Btn>
          )}
        </div>
      )}
    </section>
  );
}

export default function CtpLoteDesdeExcel({ estado }: { estado: LoteDesdeExcel }) {
  return (
    <div className="space-y-3">
      <CtpLoteExcelGrilla estado={estado} />
      {estado.lotes.map((l) => (
        <TarjetaLote key={l.clave} l={l} estado={estado} />
      ))}
    </div>
  );
}
