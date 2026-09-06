"use client";

/**
 * LothCensoImportModal — importa el censo desde la hoja del regente, mostrando
 * ANTES de tocar la base qué se leyó y qué está mal.
 *
 * El importador viejo mandaba a ciegas: 8 columnas en orden fijo, sin
 * encabezado, sin validar. Acá cada fila llega con su veredicto — errores
 * (no se importa) y avisos (se importa, pero conviene mirarlo) — y sólo se
 * envían las filas sanas.
 */

import { useMemo, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { AlertTriangle, Check, Loader2, Table, Upload, XCircle } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import {
  filasImportables,
  parseCensoTabla,
  type CensoImportContext,
  type CensoImportResult,
} from "@/lib/forestal/loth-censo-import";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

const EJEMPLO = `N° Árbol\tEspecie\tDAP (cm)\tAltura comercial\tZona\tEste\tNorte
85-TOR\tTornillo\t80\t16\t18L\t545000\t9012000
1-SHI\tShihuahuaco\t96\t16\t18L\t545200\t9012410`;

interface Props {
  open: boolean;
  ctx: CensoImportContext;
  importing: boolean;
  onClose: () => void;
  onImport: (filas: Record<string, unknown>[]) => void;
}

export default function LothCensoImportModal({ open, ctx, importing, onClose, onImport }: Props) {
  const [texto, setTexto] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);

  const res: CensoImportResult = useMemo(() => parseCensoTabla(texto, ctx), [texto, ctx]);
  const listas = useMemo(() => filasImportables(res), [res]);

  if (!open) return null;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    try {
      setTexto(await file.text());
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "No se pudo leer el archivo");
    }
  };

  return (
    // AdminModal: Escape, focus trap y scroll lock — no tenía ninguno.
    <AdminModal
      open
      onClose={onClose}
      variant="info"
      title="Importar censo forestal"
      description="Pegá la hoja del regente con sus encabezados — se detectan solos, en cualquier orden"
      icon={Table}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-12 items-center rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={listas.length === 0 || importing}
            onClick={() => onImport(listas)}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40"
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Importar {listas.length} árbol(es)
          </button>
        </div>
      }
    >
      <div className="flex flex-col">

        <div className="flex-1 space-y-3 overflow-auto px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">
              <Upload className="h-4 w-4" /> Subir CSV
              <input type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
            </label>
            {res.filas.length > 0 && (
              <span className="text-xs font-bold text-[var(--text-tertiary)]">
                {res.conEncabezado ? "Encabezados detectados" : "Sin encabezado: se lee por posición"} · columnas leídas:{" "}
                {Object.keys(res.mapeo).length}
              </span>
            )}
          </div>

          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={6}
            spellCheck={false}
            placeholder={EJEMPLO}
            className="block w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3 font-mono text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
          />

          {fileError && (
            <p className="flex items-center gap-1.5 text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              <AlertTriangle className="h-3.5 w-3.5" /> {fileError}
            </p>
          )}

          {res.filas.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm font-bold">
                <span className="text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">{res.validas} lista(s) para importar</span>
                {res.conAviso > 0 && <span className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{res.conAviso} con aviso</span>}
                {res.conError > 0 && <span className="text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{res.conError} con error (no se importan)</span>}
              </div>

              <div className="max-h-[320px] overflow-auto rounded-xl border-2 border-[var(--rule-base)]">
                <DataTable className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 bg-[var(--surface-canvas)]">
                    <tr className="text-[length:var(--ts-2xs)] uppercase tracking-wide text-[var(--text-tertiary)]">
                      <th className="px-2 py-2 text-left font-bold">#</th>
                      <th className="px-2 py-2 text-left font-bold">Código</th>
                      <th className="px-2 py-2 text-left font-bold">Especie</th>
                      <th className="px-2 py-2 text-right font-bold">DAP (m)</th>
                      <th className="px-2 py-2 text-right font-bold">Hc</th>
                      <th className="px-2 py-2 text-right font-bold">Vol. m³</th>
                      <th className="px-2 py-2 text-left font-bold">UTM</th>
                      <th className="px-2 py-2 text-left font-bold">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.filas.slice(0, 200).map((f) => (
                      <tr
                        key={`${f.linea}-${f.treeCode}`}
                        className={`border-t border-[var(--rule-subtle)] ${
                          f.errores.length ? "bg-[var(--data-error-500)]/10" : f.avisos.length ? "bg-[var(--data-warning-500)]/10" : ""
                        }`}
                      >
                        <td className="px-2 py-1.5 font-mono text-xs text-[var(--text-tertiary)]">{f.linea}</td>
                        <td className="px-2 py-1.5 font-mono font-bold text-[var(--text-primary)]">{f.treeCode || "—"}</td>
                        <td className="px-2 py-1.5 text-[var(--text-secondary)]">{f.speciesCommon || "—"}</td>
                        <td className="px-2 py-1.5 text-right font-mono tabular-nums">{f.dapM?.toFixed(2) ?? "—"}</td>
                        <td className="px-2 py-1.5 text-right font-mono tabular-nums">{f.alturaComercialM?.toFixed(1) ?? "—"}</td>
                        <td className="px-2 py-1.5 text-right font-mono tabular-nums">{f.volumenEstimadoM3 != null ? fmtM3(f.volumenEstimadoM3) : "—"}</td>
                        <td className="px-2 py-1.5 font-mono text-xs text-[var(--text-tertiary)]">
                          {f.utmX != null ? `${f.utmZona ?? ""} ${Math.round(f.utmX)}/${Math.round(f.utmY ?? 0)}` : "—"}
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
                    ))}
                  </tbody>
                </DataTable>
              </div>
              {res.filas.length > 200 && (
                <p className="text-center text-xs text-[var(--text-tertiary)]">Mostrando 200 de {res.filas.length} filas.</p>
              )}
            </>
          )}
        </div>

      </div>
    </AdminModal>
  );
}

