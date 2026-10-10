"use client";

/**
 * La vista previa del importador del censo: cada fila leída con su veredicto
 * (lista · con aviso · con error) ANTES de tocar la base, y con todo lo que
 * trae la hoja del regente — científico, nombre nativo, condición,
 * observación y si el volumen vino de la hoja o lo calculó el sistema.
 */

import { DataTable } from "@buleje/design-system";
import { AlertTriangle, Check, XCircle } from "@buleje/design-system/icons";
import type { CensoImportResult, FilaCenso } from "@/lib/forestal/loth-censo-import";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";

const TOPE_FILAS = 200;

export default function LothCensoImportPreview({ res }: { res: CensoImportResult }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm font-bold">
        <span className="text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">{res.validas} lista(s) para importar</span>
        {res.conAviso > 0 && <span className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{res.conAviso} con aviso</span>}
        {res.conError > 0 && <span className="text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{res.conError} con error (no se importan)</span>}
      </div>

      <DataTable className="w-full border-collapse text-sm" stickyHeader wrapperClassName="max-h-[340px] rounded-xl border border-[var(--rule-base)]">
        <thead className="bg-[var(--surface-canvas)]">
          <tr className="text-[length:var(--ts-2xs)] uppercase tracking-wide text-[var(--text-tertiary)]">
            <th className="px-2 py-2 text-left font-bold">#</th>
            <th className="px-2 py-2 text-left font-bold">Código</th>
            <th className="px-2 py-2 text-left font-bold">Especie</th>
            <th className="px-2 py-2 text-right font-bold">DAP (m)</th>
            <th className="px-2 py-2 text-right font-bold">Hc</th>
            <th className="px-2 py-2 text-right font-bold">Vol. m³</th>
            <th className="px-2 py-2 text-right font-bold">Este · Norte</th>
            <th className="px-2 py-2 text-left font-bold">Condición</th>
            <th className="px-2 py-2 text-left font-bold">Revisión</th>
          </tr>
        </thead>
        <tbody>
          {res.filas.slice(0, TOPE_FILAS).map((f) => (
            <Fila key={`${f.linea}-${f.treeCode}`} f={f} />
          ))}
        </tbody>
      </DataTable>
      {res.filas.length > TOPE_FILAS && (
        <p className="text-center text-xs text-[var(--text-tertiary)]">Mostrando {TOPE_FILAS} de {res.filas.length} filas.</p>
      )}
    </>
  );
}

function Fila({ f }: { f: FilaCenso }) {
  const fondo = f.errores.length ? "bg-[var(--data-error-500)]/10" : f.avisos.length ? "bg-[var(--data-warning-500)]/10" : "";
  const segunda = [f.speciesScientific, f.speciesNative].filter(Boolean);
  return (
    <tr className={`border-t border-[var(--rule-soft)] align-top ${fondo}`}>
      <td className="px-2 py-1.5 font-mono text-xs text-[var(--text-tertiary)]">{f.linea}</td>
      <td className="whitespace-nowrap px-2 py-1.5 font-mono font-bold text-[var(--text-primary)]">{f.treeCode || "—"}</td>
      <td className="px-2 py-1.5">
        <span className="text-[var(--text-primary)]">{f.speciesCommon || "—"}</span>
        {segunda.length > 0 && (
          <span className="block max-w-[14rem] text-xs text-[var(--text-secondary)]">
            {f.speciesScientific && <i>{f.speciesScientific}</i>}
            {f.speciesScientific && f.speciesNative && " · "}
            {f.speciesNative}
          </span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{f.dapM != null ? formatNumber(f.dapM, { min: 2, max: 3 }) : "—"}</td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{f.alturaComercialM != null ? formatNumber(f.alturaComercialM, { min: 0, max: 2 }) : "—"}</td>
      <td className="px-2 py-1.5 text-right">
        <span className="font-mono tabular-nums">{f.volumenEstimadoM3 != null ? fmtM3(f.volumenEstimadoM3) : "—"}</span>
        {f.volumenEstimadoM3 != null && (
          <span className="block text-xs text-[var(--text-tertiary)]">{f.volumenDeLaHoja ? "de la hoja" : "calculado"}</span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right font-mono text-xs leading-5 tabular-nums text-[var(--text-secondary)]">
        {f.utmX == null && f.utmY == null ? "—" : <>{f.utmX != null ? Math.round(f.utmX) : "—"}<br />{f.utmY != null ? Math.round(f.utmY) : "—"}</>}
      </td>
      <td className="px-2 py-1.5">
        <span className="text-[var(--text-primary)]">{f.condicion || "—"}</span>
        {f.notes && <span className="block max-w-[10rem] truncate text-xs text-[var(--text-tertiary)]" title={f.notes}>{f.notes}</span>}
      </td>
      <td className="px-2 py-1.5 text-xs">
        {f.errores.length > 0 ? (
          <span className="inline-flex items-start gap-1 font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {f.errores.join(" · ")}
          </span>
        ) : f.avisos.length > 0 ? (
          <span className="inline-flex items-start gap-1 font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {f.avisos.join(" · ")}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
            <Check className="h-3.5 w-3.5" /> Lista
          </span>
        )}
      </td>
    </tr>
  );
}
