"use client";

/**
 * CtpImportModal — importar el Libro de Operaciones CTP desde el Excel oficial
 * LO-CTP (ADR-138). Etapa 1: ingresos.
 *
 * Flujo: subir .xlsx → parseo client-side (ctp-import) → PREVIEW en el server
 * (valida + idempotencia, sin escribir) → el operador confirma → COMMIT (crea las
 * nuevas, salta las que ya existen). Nunca escribe a ciegas.
 */

import { useRef, useState } from "react";
import AdminModal from "@/components/admin/shared/AdminModal";
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { parseProduccionXlsx, parseWoodEntriesXlsx } from "@/lib/forestal/ctp-import";

type Registro = "ingresos" | "produccion";
const REGISTRO_LABEL: Record<Registro, string> = { ingresos: "Ingresos", produccion: "Producción" };

type Action = "crear" | "creado" | "existe" | "error";
interface ResultRow { row?: number; gtf: string | null; action: Action; message: string }
interface Resumen { total: number; crear: number; creados: number; saltados: number; errores: number }

const IMPORT_URL = "/api/admin/forestal/wood-entries/import";

export default function CtpImportModal({ onClose, onImported }: { onClose: () => void; onImported: (registro: Registro) => void }) {
  const [phase, setPhase] = useState<"idle" | "parsing" | "preview" | "committing" | "done">("idle");
  const [registro, setRegistro] = useState<Registro>("ingresos");
  const [fileName, setFileName] = useState<string | null>(null);
  const [format, setFormat] = useState<string | null>(null);
  const [rows, setRows] = useState<unknown[]>([]);
  const [detalle, setDetalle] = useState<ResultRow[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File) {
    setError(null);
    setPhase("parsing");
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      let parsedRows: unknown[];
      if (registro === "produccion") {
        const res = await parseProduccionXlsx(buf);
        if (!res.ok) throw new Error(res.error ?? "No se pudo leer el archivo.");
        if (res.produccion.length === 0) throw new Error("El archivo no tiene filas de producción en la hoja «3. Producción».");
        parsedRows = res.produccion;
        setFormat("oficial");
      } else {
        const res = await parseWoodEntriesXlsx(buf);
        if (!res.ok) throw new Error(res.error ?? "No se pudo leer el archivo.");
        if (res.ingresos.length === 0) throw new Error("El archivo no tiene filas de ingreso en la hoja «1. Ingreso» / «Ingresos».");
        parsedRows = res.ingresos;
        setFormat(res.format);
      }
      setRows(parsedRows);
      const r = await fetch(IMPORT_URL, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ mode: "preview", registro, [registro]: parsedRows }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
      setDetalle(j.detalle ?? []);
      setResumen(j.resumen ?? null);
      setPhase("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    }
  }

  async function commit() {
    setPhase("committing");
    setError(null);
    try {
      const r = await fetch(IMPORT_URL, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ mode: "commit", registro, [registro]: rows }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
      setDetalle(j.detalle ?? []);
      setResumen(j.resumen ?? null);
      setPhase("done");
      onImported(registro);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("preview");
    }
  }

  const canCommit = phase === "preview" && (resumen?.crear ?? 0) > 0;
  const noun = registro === "produccion" ? "corridas" : "ingresos";

  return (
    <AdminModal open onClose={onClose} variant="info" title="Importar Libro de Operaciones" description="Excel oficial LO-CTP (SERFOR) — elegí el registro a importar" icon={Upload}>
      <div className="space-y-4 p-5">
        {error && (
          <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div>
          </div>
        )}

        {/* Selector de registro + dropzone */}
        {(phase === "idle" || phase === "parsing") && (
          <>
            <div>
              <p className="mb-1.5 text-sm font-bold text-[var(--text-primary)]">¿Qué registro importás?</p>
              <div className="inline-flex rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-1">
                {(["ingresos", "produccion"] as Registro[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRegistro(r)}
                    disabled={phase === "parsing"}
                    aria-pressed={registro === r}
                    className={`inline-flex h-9 items-center rounded-lg px-4 text-sm font-bold transition ${registro === r ? "bg-[var(--brand-ink)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                  >
                    {REGISTRO_LABEL[r]}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={phase === "parsing"}
              className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[var(--rule-strong)] bg-[var(--surface-canvas)] px-6 py-10 text-center transition-colors hover:border-[var(--brand-ink)] hover:bg-[var(--surface-sunken)] disabled:opacity-60"
            >
              {phase === "parsing" ? <Loader2 className="h-9 w-9 animate-spin text-[var(--brand-ink)]" /> : <FileSpreadsheet className="h-9 w-9 text-[var(--brand-ink)]" />}
              <div>
                <p className="text-base font-bold text-[var(--text-primary)]">{phase === "parsing" ? `Leyendo ${fileName}…` : "Elegí el Excel del libro (.xlsx)"}</p>
                <p className="mt-1 text-sm text-[var(--text-tertiary)]">
                  El mismo que exportás como «Formato oficial SERFOR».{" "}
                  {registro === "produccion"
                    ? "Se leen las corridas de «3. Producción» y su materia prima de «2. Consumos» — importá los Ingresos primero."
                    : "Se leen los ingresos de la hoja «1. Ingreso»."}
                </p>
              </div>
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
            <p className="text-xs text-[var(--text-tertiary)]">Nada se guarda hasta que confirmes. Las filas inválidas se marcan y no se importan; las que ya existen se saltan (ingresos por GTF, corridas por fecha+producto+especie+cantidad).</p>
          </>
        )}

        {/* Preview / done: resumen + tabla */}
        {(phase === "preview" || phase === "committing" || phase === "done") && resumen && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)]"><FileSpreadsheet className="h-3.5 w-3.5" /> {fileName} · formato {format}</span>
              <Chip tone="info" label={phase === "done" ? `${resumen.creados} creados` : `${resumen.crear} a crear`} />
              {resumen.saltados > 0 && <Chip tone="muted" label={`${resumen.saltados} ya existen`} />}
              {resumen.errores > 0 && <Chip tone="error" label={`${resumen.errores} con error`} />}
            </div>

            <div className="max-h-[46vh] overflow-y-auto rounded-2xl border-2 border-[var(--rule-base)]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[var(--surface-sunken)] text-left">
                  <tr>
                    <th className="px-3 py-2 font-bold text-[var(--text-primary)]">Fila</th>
                    <th className="px-3 py-2 font-bold text-[var(--text-primary)]">GTF</th>
                    <th className="px-3 py-2 font-bold text-[var(--text-primary)]">Estado</th>
                    <th className="px-3 py-2 font-bold text-[var(--text-primary)]">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.map((d, i) => (
                    <tr key={i} className="border-t border-[var(--rule-soft)]">
                      <td className="px-3 py-2 font-mono text-xs text-[var(--text-tertiary)]">{d.row ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs font-bold text-[var(--text-primary)]">{d.gtf ?? "—"}</td>
                      <td className="px-3 py-2"><ActionBadge action={d.action} /></td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{d.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              {phase === "done" ? (
                <>
                  <p className="inline-flex items-center gap-2 text-sm font-bold text-[var(--data-success-700)]"><CheckCircle2 className="h-5 w-5" /> Importad{registro === "produccion" ? "as" : "os"} {resumen.creados} {noun}{registro === "ingresos" ? " (quedan pendientes de validar)" : ""}.</p>
                  <button type="button" onClick={onClose} className="inline-flex h-11 items-center rounded-xl bg-[var(--brand-ink)] px-5 text-sm font-bold text-white hover:opacity-90">Cerrar</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => { setPhase("idle"); setDetalle([]); setResumen(null); }} disabled={phase === "committing"} className="inline-flex h-11 items-center rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60">Elegir otro archivo</button>
                  <button type="button" onClick={() => void commit()} disabled={!canCommit} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-5 text-sm font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
                    {phase === "committing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {phase === "committing" ? "Importando…" : `Importar ${resumen.crear} ${noun}`}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </AdminModal>
  );
}

function ActionBadge({ action }: { action: Action }) {
  const map: Record<Action, { label: string; cls: string }> = {
    crear: { label: "A crear", cls: "bg-[var(--data-info-100)] text-[var(--data-info-700)]" },
    creado: { label: "Creado", cls: "bg-[var(--data-success-100)] text-[var(--data-success-700)]" },
    existe: { label: "Ya existe", cls: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" },
    error: { label: "Error", cls: "bg-[var(--data-error-100)] text-[var(--data-error-700)]" },
  };
  const m = map[action];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${m.cls}`}>{m.label}</span>;
}

function Chip({ tone, label }: { tone: "info" | "muted" | "error"; label: string }) {
  const cls = tone === "info" ? "bg-[var(--data-info-100)] text-[var(--data-info-700)]" : tone === "error" ? "bg-[var(--data-error-100)] text-[var(--data-error-700)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]";
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${cls}`}>{label}</span>;
}
