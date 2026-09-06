"use client";

/**
 * CtpImportModal — importar el Libro de Operaciones CTP desde el Excel oficial
 * LO-CTP (ADR-138). Cubre los 3 registros (Ingresos · Producción · Salida) y el
 * modo «Libro completo» que los importa de una en orden de dependencia.
 *
 * Flujo: subir .xlsx → parseo client-side (ctp-import) → PREVIEW en el server
 * (valida + idempotencia, sin escribir) → el operador confirma → COMMIT (crea las
 * nuevas, salta las que ya existen). Nunca escribe a ciegas.
 *
 * «Libro completo»: parsea las 3 hojas a la vez y ENCADENA 3 commits en orden
 * (Ingresos→Producción→Salida) — es el único orden que respeta las dependencias
 * (Producción resuelve la GTF del ingreso; Salida valida I3 contra lo producido).
 * El preview del libro completo es client-side (contar filas): un preview server
 * de Producción daría falsos «GTF no encontrado» porque los ingresos del MISMO
 * archivo aún no están en la DB. El commit es la validación autoritativa.
 */

import { useRef, useState } from "react";
import { DataTable } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { MODAL_BODY } from "./ctp-shared";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Columns3,
  Clock,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { descargarPlantillaLoCtp, filasAIngresos, parseProduccionXlsx, parseSalidaXlsx, parseWoodEntriesXlsx, type FilaCruda } from "@/lib/forestal/ctp-import";
import {
  CAMPOS_INGRESO,
  duplicadosEnArchivo,
  faltantesDelMapeo,
  type GrupoDuplicado,
  type MapeoIngreso,
} from "@/lib/forestal/ctp-import-mapeo";

type Registro = "ingresos" | "produccion" | "salida";
type ImportMode = Registro | "completo";
const REGISTRO_ORDER: Registro[] = ["ingresos", "produccion", "salida"];
const MODE_LABEL: Record<ImportMode, string> = { completo: "Libro completo", ingresos: "Ingresos", produccion: "Producción", salida: "Salida" };
const REGISTRO_NOUN: Record<Registro, string> = { ingresos: "ingresos", produccion: "corridas", salida: "despachos" };

type Action = "crear" | "creado" | "existe" | "difiere" | "error";
interface ResultRow { row?: number; gtf: string | null; action: Action; message: string; seccion?: string }
interface Resumen { total: number; crear: number; creados: number; saltados: number; difieren: number; errores: number }
interface Combined { ingresos: unknown[]; produccion: unknown[]; salida: unknown[] }
interface ImportLogRow { detail: string; user: string; createdAt: string; archivo: string | null }

const IMPORT_URL = "/api/admin/forestal/wood-entries/import";

/** 1 → A, 27 → AA. El operador ubica la columna por su letra en Excel, no por
 *  el índice: "la B" es una instrucción que puede seguir. */
function letraColumna(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s || "?";
}

export default function CtpImportModal({ onClose, onImported }: { onClose: () => void; onImported: (registro: Registro) => void }) {
  const [phase, setPhase] = useState<"idle" | "parsing" | "preview" | "committing" | "done">("idle");
  const [mode, setMode] = useState<ImportMode>("completo");
  const [fileName, setFileName] = useState<string | null>(null);
  const [format, setFormat] = useState<string | null>(null);
  const [rows, setRows] = useState<unknown[]>([]);
  const [combined, setCombined] = useState<Combined | null>(null);
  const [detalle, setDetalle] = useState<ResultRow[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [creadosPorReg, setCreadosPorReg] = useState<Partial<Record<Registro, number>>>({});
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ImportLogRow[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Ajuste de columnas (sólo Ingresos): cabeceras + filas crudas del archivo, el
  // mapeo vigente y si el panel está abierto. Con esto una planilla propia
  // ("Guía", "m3 recibidos") se importa sin reescribir el Excel.
  const [cabeceras, setCabeceras] = useState<string[]>([]);
  const [filasCrudas, setFilasCrudas] = useState<FilaCruda[]>([]);
  const [mapeo, setMapeo] = useState<MapeoIngreso | null>(null);
  const [verMapeo, setVerMapeo] = useState(false);
  /** GTF repetidas DENTRO del archivo (el server sólo ve las que ya están). */
  const [duplicados, setDuplicados] = useState<GrupoDuplicado[]>([]);

  const isCombined = mode === "completo";

  async function onFile(file: File) {
    setError(null);
    setPhase("parsing");
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();

      if (isCombined) {
        // Parsear las 3 hojas por su NOMBRE (strict): sin fallback por contenido,
        // que en un libro multi-hoja cruzaría columnas comunes entre registros.
        const [ing, prod, sal] = await Promise.all([
          parseWoodEntriesXlsx(buf, { strict: true }).catch(() => null),
          parseProduccionXlsx(buf, { strict: true }).catch(() => null),
          parseSalidaXlsx(buf, { strict: true }).catch(() => null),
        ]);
        const c: Combined = {
          ingresos: ing?.ok ? ing.ingresos : [],
          produccion: prod?.ok ? prod.produccion : [],
          salida: sal?.ok ? sal.salida : [],
        };
        if (c.ingresos.length + c.produccion.length + c.salida.length === 0) {
          throw new Error("El archivo no tiene filas en «1. Ingreso», «3. Producción» ni «4. Salida».");
        }
        setCombined(c);
        setFormat(ing?.ok ? ing.format : "oficial");
        setPhase("preview");
        return;
      }

      let parsedRows: unknown[];
      if (mode === "produccion") {
        const res = await parseProduccionXlsx(buf);
        if (!res.ok) throw new Error(res.error ?? "No se pudo leer el archivo.");
        if (res.produccion.length === 0) throw new Error("El archivo no tiene filas de producción en la hoja «3. Producción».");
        parsedRows = res.produccion;
        setFormat("oficial");
      } else if (mode === "salida") {
        const res = await parseSalidaXlsx(buf);
        if (!res.ok) throw new Error(res.error ?? "No se pudo leer el archivo.");
        if (res.salida.length === 0) throw new Error("El archivo no tiene filas de salida en la hoja «4. Salida».");
        parsedRows = res.salida;
        setFormat("oficial");
      } else {
        const res = await parseWoodEntriesXlsx(buf);
        if (!res.ok) throw new Error(res.error ?? "No se pudo leer el archivo.");
        if (res.ingresos.length === 0) throw new Error("El archivo no tiene filas de ingreso en la hoja «1. Ingreso» / «Ingresos».");
        parsedRows = res.ingresos;
        setFormat(res.format);
        // Guardar lo crudo: re-mapear no vuelve a leer el archivo.
        setCabeceras(res.cabeceras ?? []);
        setFilasCrudas(res.filas ?? []);
        setMapeo(res.mapeo ?? null);
        setDuplicados(duplicadosEnArchivo(res.ingresos));
      }
      setRows(parsedRows);
      const r = await fetch(IMPORT_URL, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ mode: "preview", registro: mode, [mode]: parsedRows }),
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

  /** Cambia la columna de un campo y re-genera la previsualización. El preview
   *  del server se vuelve a pedir: es el que sabe qué GTF ya está en el libro. */
  async function cambiarColumna(campo: keyof MapeoIngreso, col: number | null) {
    if (!mapeo) return;
    const nuevo: MapeoIngreso = { ...mapeo, [campo]: col };
    setMapeo(nuevo);
    const ingresos = filasAIngresos(filasCrudas, nuevo);
    setRows(ingresos);
    setDuplicados(duplicadosEnArchivo(ingresos));
    try {
      const r = await fetch(IMPORT_URL, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ mode: "preview", registro: "ingresos", ingresos }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
      setDetalle(j.detalle ?? []);
      setResumen(j.resumen ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
        // Se mandan TODAS las filas, duplicadas incluidas: el server las salta
        // (`seenInBatch`) y las REPORTA fila por fila. Filtrarlas acá haría
        // desaparecer del informe la fila que el operador quiere entender.
        body: JSON.stringify({ mode: "commit", registro: mode, fileName: fileName ?? undefined, [mode as Registro]: rows }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
      setDetalle(j.detalle ?? []);
      setResumen(j.resumen ?? null);
      setPhase("done");
      onImported(mode as Registro);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("preview");
    }
  }

  /** Libro completo: encadena los 3 commits en orden de dependencia y agrega. */
  async function commitCombined() {
    if (!combined) return;
    setPhase("committing");
    setError(null);
    const allDetalle: ResultRow[] = [];
    const agg: Resumen = { total: 0, crear: 0, creados: 0, saltados: 0, difieren: 0, errores: 0 };
    const porReg: Partial<Record<Registro, number>> = {};
    try {
      for (const reg of REGISTRO_ORDER) {
        const regRows = combined[reg];
        if (regRows.length === 0) continue;
        const r = await fetch(IMPORT_URL, {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({ mode: "commit", registro: reg, fileName: fileName ?? undefined, [reg]: regRows }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(`${MODE_LABEL[reg]}: ${j.message ?? j.error ?? `HTTP ${r.status}`}`);
        const res: Resumen = j.resumen ?? { total: 0, crear: 0, creados: 0, saltados: 0, difieren: 0, errores: 0 };
        agg.total += res.total; agg.creados += res.creados; agg.saltados += res.saltados; agg.difieren += res.difieren ?? 0; agg.errores += res.errores;
        porReg[reg] = res.creados;
        for (const d of (j.detalle ?? []) as ResultRow[]) allDetalle.push({ ...d, seccion: MODE_LABEL[reg] });
      }
      agg.crear = agg.creados;
      setDetalle(allDetalle);
      setResumen(agg);
      setCreadosPorReg(porReg);
      setPhase("done");
      onImported("ingresos"); // remonta las 3 vistas (key) y aterriza en el tope del libro
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("preview");
    }
  }

  function reset() {
    setPhase("idle"); setDetalle([]); setResumen(null); setCombined(null); setCreadosPorReg({});
    setCabeceras([]); setFilasCrudas([]); setMapeo(null); setVerMapeo(false); setDuplicados([]);
  }

  async function descargarPlantilla() {
    try {
      await descargarPlantillaLoCtp();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function toggleHistory() {
    const next = !showHistory;
    setShowHistory(next);
    if (next && history === null) {
      try {
        const r = await fetch(IMPORT_URL, { credentials: "include" });
        const j = await r.json().catch(() => ({}));
        setHistory(Array.isArray(j.imports) ? j.imports : []);
      } catch {
        setHistory([]); // sin historial visible ante fallo — no rompe el import
      }
    }
  }

  const counts = combined ? { ingresos: combined.ingresos.length, produccion: combined.produccion.length, salida: combined.salida.length } : null;
  const totalCombined = counts ? counts.ingresos + counts.produccion + counts.salida : 0;
  const singleNoun = isCombined ? "" : REGISTRO_NOUN[mode as Registro];

  return (
    <AdminModal open onClose={onClose} variant="info" title="Importar Libro de Operaciones" description="Excel oficial LO-CTP (SERFOR) — el libro completo de una, o un registro a la vez" icon={Upload}>
      <div className={`space-y-4 ${MODAL_BODY}`}>
        {error && (
          <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div>
          </div>
        )}

        {/* Selector de registro + dropzone */}
        {(phase === "idle" || phase === "parsing") && (
          <>
            <div>
              <p className="mb-1.5 text-sm font-bold text-[var(--text-primary)]">¿Qué importás?</p>
              <div className="inline-flex flex-wrap gap-1 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-1">
                {(["completo", "ingresos", "produccion", "salida"] as ImportMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    disabled={phase === "parsing"}
                    aria-pressed={mode === m}
                    className={`inline-flex h-9 items-center rounded-lg px-4 text-sm font-bold transition ${mode === m ? "bg-[var(--brand-ink)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                  >
                    {MODE_LABEL[m]}
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
              {phase === "parsing" ? <Loader2 className="h-9 w-9 animate-spin text-[var(--brand-ink)] dark:text-[var(--text-primary)]" /> : <FileSpreadsheet className="h-9 w-9 text-[var(--brand-ink)] dark:text-[var(--text-primary)]" />}
              <div>
                <p className="text-base font-bold text-[var(--text-primary)]">{phase === "parsing" ? `Leyendo ${fileName}…` : "Elegí el Excel del libro (.xlsx)"}</p>
                <p className="mt-1 text-sm text-[var(--text-tertiary)]">
                  El mismo que exportás como «Formato oficial SERFOR».{" "}
                  {mode === "completo"
                    ? "Se leen las 3 hojas (Ingreso, Producción, Salida) y se importan en orden — Producción resuelve la GTF del ingreso y Salida valida contra lo producido."
                    : mode === "produccion"
                      ? "Se leen las corridas de «3. Producción» y su materia prima de «2. Consumos» — importá los Ingresos primero."
                      : mode === "salida"
                        ? "Se leen los despachos de «4. Salida». Importá la Producción primero (se valida contra el stock producido)."
                        : "Se leen los ingresos de la hoja «1. Ingreso»."}
                </p>
              </div>
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3">
              <p className="text-sm text-[var(--text-secondary)]">¿No tenés el Excel? Bajá la plantilla oficial con las 4 hojas y una fila de ejemplo por hoja.</p>
              <button
                type="button"
                onClick={() => void descargarPlantilla()}
                disabled={phase === "parsing"}
                className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                Descargar plantilla
              </button>
            </div>
            <p className="text-xs text-[var(--text-tertiary)]">Nada se guarda hasta que confirmes. Las filas inválidas se marcan y no se importan; las que ya existen se saltan (ingresos por GTF, corridas por fecha+producto+especie+cantidad).</p>

            {/* Historial de importaciones (auditable — también en Auditoría) */}
            <div className="border-t-2 border-[var(--rule-soft)] pt-3">
              <button type="button" onClick={() => void toggleHistory()} aria-expanded={showHistory} className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                <Clock className="h-4 w-4" />
                Historial de importaciones
                <ChevronDown className={`h-4 w-4 transition-transform ${showHistory ? "rotate-180" : ""}`} />
              </button>
              {showHistory && (
                <div className="mt-3">
                  {history === null ? (
                    <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</p>
                  ) : history.length === 0 ? (
                    <p className="text-sm text-[var(--text-tertiary)]">Todavía no se importó nada en este libro.</p>
                  ) : (
                    <ul className="space-y-2">
                      {history.map((h, i) => (
                        <li key={i} className="flex items-start gap-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
                          <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                          <div className="min-w-0">
                            <p className="text-sm text-[var(--text-primary)]">{h.detail}</p>
                            <p className="text-xs text-[var(--text-tertiary)]">{fmtFecha(h.createdAt)} · {h.user}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Libro completo: preview client-side + confirmación */}
        {isCombined && (phase === "preview" || phase === "committing") && counts && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)]"><FileSpreadsheet className="h-3.5 w-3.5" /> {fileName} · formato {format}</span>
              {counts.ingresos > 0 && <Chip tone="info" label={`${counts.ingresos} ingresos`} />}
              {counts.produccion > 0 && <Chip tone="info" label={`${counts.produccion} corridas`} />}
              {counts.salida > 0 && <Chip tone="info" label={`${counts.salida} despachos`} />}
            </div>
            <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4">
              <p className="text-sm font-bold text-[var(--text-primary)]">Se importa el libro en orden de dependencia:</p>
              <ol className="mt-2 space-y-1.5 text-sm text-[var(--text-secondary)]">
                <li className="flex items-center gap-2"><StepDot n={1} on={counts.ingresos > 0} /> <span><strong className="text-[var(--text-primary)]">Ingresos</strong> — {counts.ingresos} fila{counts.ingresos === 1 ? "" : "s"}</span></li>
                <li className="flex items-center gap-2"><StepDot n={2} on={counts.produccion > 0} /> <span><strong className="text-[var(--text-primary)]">Producción</strong> — {counts.produccion} corrida{counts.produccion === 1 ? "" : "s"} (usa las GTF recién ingresadas)</span></li>
                <li className="flex items-center gap-2"><StepDot n={3} on={counts.salida > 0} /> <span><strong className="text-[var(--text-primary)]">Salida</strong> — {counts.salida} despacho{counts.salida === 1 ? "" : "s"} (valida contra lo producido)</span></li>
              </ol>
              <p className="mt-3 text-xs text-[var(--text-tertiary)]">Las filas que ya existan se saltan; las que fallen una validación (p. ej. despachar más de lo producido) se reportan sin cortar el resto.</p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={reset} disabled={phase === "committing"} className="inline-flex h-11 items-center rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60">Elegir otro archivo</button>
              <button type="button" onClick={() => void commitCombined()} disabled={phase === "committing" || totalCombined === 0} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-5 text-sm font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
                {phase === "committing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {phase === "committing" ? "Importando el libro…" : "Importar libro completo"}
              </button>
            </div>
          </>
        )}

        {/* Preview / done de un registro suelto + done del libro completo: resumen + tabla */}
        {resumen && ((isCombined && phase === "done") || (!isCombined && (phase === "preview" || phase === "committing" || phase === "done"))) && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)]"><FileSpreadsheet className="h-3.5 w-3.5" /> {fileName} · formato {format}</span>
              <Chip tone="info" label={phase === "done" ? `${resumen.creados} creados` : `${resumen.crear} a crear`} />
              {resumen.saltados > 0 && <Chip tone="muted" label={`${resumen.saltados} ya existen`} />}
              {resumen.difieren > 0 && <Chip tone="warning" label={`${resumen.difieren} difieren`} />}
              {resumen.errores > 0 && <Chip tone="error" label={`${resumen.errores} con error`} />}
            </div>

            {/* Ajuste de columnas — sólo Ingresos y sólo si hay mapeo (el archivo
                se leyó por columnas, no por hoja fija). Un aserradero con su
                propia planilla lo necesita antes de poder importar nada. */}
            {mode === "ingresos" && mapeo && phase !== "done" && (
              <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4">
                <button
                  type="button"
                  onClick={() => setVerMapeo((v) => !v)}
                  aria-expanded={verMapeo}
                  className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"
                >
                  <Columns3 className="h-4 w-4" />
                  Columnas del archivo
                  <ChevronDown className={`h-4 w-4 transition-transform ${verMapeo ? "rotate-180" : ""}`} />
                </button>
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                  {faltantesDelMapeo(mapeo).length > 0
                    ? `Falta asignar: ${faltantesDelMapeo(mapeo).map((f) => f.label).join(", ")}. Sin eso las filas entran incompletas.`
                    : "Detectadas automáticamente. Abrí si tu planilla usa otros nombres."}
                </p>
                {verMapeo && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {CAMPOS_INGRESO.map((def) => (
                      <label key={def.campo} className="flex flex-col gap-1.5">
                        <span className="flex items-center gap-1 text-xs font-bold text-[var(--text-primary)]">
                          {def.label}
                          {def.requerido && <span className="text-[var(--data-error-600)]">*</span>}
                        </span>
                        <select
                          value={mapeo[def.campo] ?? ""}
                          onChange={(e) => void cambiarColumna(def.campo, e.target.value ? Number(e.target.value) : null)}
                          className={`h-11 w-full rounded-xl border-2 bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none ${
                            def.requerido && mapeo[def.campo] == null
                              ? "border-[var(--data-error-500)]"
                              : "border-[var(--rule-base)]"
                          }`}
                        >
                          <option value="">— sin columna —</option>
                          {cabeceras.map((h, i) =>
                            i === 0 || !h ? null : (
                              <option key={i} value={i}>
                                {letraColumna(i)} · {h}
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* GTF repetidas en el MISMO archivo: el server sólo ve las que ya
                están en el libro, esto es el otro caso (copiar/pegar en Excel). */}
            {/* GTF repetidas en el MISMO archivo. El server ya importa una sola
                vez cada una (`seenInBatch`) — acá no hay opción que ofrecer,
                hay algo que AVISAR: el Excel viene con filas duplicadas y el
                operador tiene que saberlo antes de mandarlo a su ARFFS. */}
            {mode === "ingresos" && duplicados.length > 0 && phase !== "done" && (
              <p className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-3 text-xs text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong>
                    {duplicados.length} {duplicados.length === 1 ? "GTF viene repetida" : "GTF vienen repetidas"} en el archivo
                  </strong>{" "}
                  — {duplicados.slice(0, 3).map((d) => `${d.gtfNumber} (filas ${d.filas.join(", ")})`).join(" · ")}
                  {duplicados.length > 3 ? ` y ${duplicados.length - 3} más` : ""}. Cada una se importa{" "}
                  <strong>una sola vez</strong> (la primera); revisá el archivo si esperabas dos ingresos distintos.
                </span>
              </p>
            )}

            {resumen.difieren > 0 && (
              <p className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-3 text-xs text-[var(--data-warning-700)]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Hay filas que ya existen con datos distintos. El importador <strong>solo agrega, no sobrescribe</strong> (un acta del libro no se pisa desde un Excel): corregilas a mano en la línea correspondiente si el archivo trae la versión buena.</span>
              </p>
            )}

            <div className="max-h-[46vh] overflow-y-auto rounded-2xl border-2 border-[var(--rule-base)]">
              <DataTable className="w-full text-sm">
                <thead className="sticky top-0 bg-[var(--surface-sunken)] text-left">
                  <tr>
                    {isCombined && <th className="px-3 py-2 font-bold text-[var(--text-primary)]">Registro</th>}
                    <th className="px-3 py-2 font-bold text-[var(--text-primary)]">Fila</th>
                    <th className="px-3 py-2 font-bold text-[var(--text-primary)]">GTF</th>
                    <th className="px-3 py-2 font-bold text-[var(--text-primary)]">Estado</th>
                    <th className="px-3 py-2 font-bold text-[var(--text-primary)]">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.map((d, i) => (
                    <tr key={i} className="border-t border-[var(--rule-soft)]">
                      {isCombined && <td className="px-3 py-2 text-xs font-bold text-[var(--text-secondary)]">{d.seccion ?? "—"}</td>}
                      <td className="px-3 py-2 font-mono text-xs text-[var(--text-tertiary)]">{d.row ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs font-bold text-[var(--text-primary)]">{d.gtf ?? "—"}</td>
                      <td className="px-3 py-2"><ActionBadge action={d.action} /></td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{d.message}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              {phase === "done" ? (
                <>
                  <p className="inline-flex items-center gap-2 text-sm font-bold text-[var(--data-success-700)]">
                    <CheckCircle2 className="h-5 w-5" />
                    {isCombined
                      ? `Libro importado: ${describeCombined(creadosPorReg)}.`
                      : `Importad${mode === "produccion" ? "as" : "os"} ${resumen.creados} ${singleNoun}${mode === "ingresos" ? " (quedan pendientes de validar)" : mode === "salida" ? " (sin atribuir — completá la cadena luego)" : ""}.`}
                  </p>
                  <button type="button" onClick={onClose} className="inline-flex h-11 items-center rounded-xl bg-[var(--brand-ink)] px-5 text-sm font-bold text-white hover:opacity-90">Cerrar</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={reset} disabled={phase === "committing"} className="inline-flex h-11 items-center rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60">Elegir otro archivo</button>
                  <button type="button" onClick={() => void commit()} disabled={!((resumen?.crear ?? 0) > 0) || phase === "committing"} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-5 text-sm font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
                    {phase === "committing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {phase === "committing" ? "Importando…" : `Importar ${resumen.crear} ${singleNoun}`}
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

/** «3 ingresos · 2 corridas · 1 despacho» a partir de los creados por registro. */
function describeCombined(porReg: Partial<Record<Registro, number>>): string {
  const parts: string[] = [];
  if (porReg.ingresos) parts.push(`${porReg.ingresos} ingresos`);
  if (porReg.produccion) parts.push(`${porReg.produccion} corridas`);
  if (porReg.salida) parts.push(`${porReg.salida} despachos`);
  return parts.length ? parts.join(" · ") : "nada nuevo (todo ya existía)";
}

/** Timestamp del log (no es fecha-only: es hora real del evento) → hora local. */
function fmtFecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-PE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StepDot({ n, on }: { n: number; on: boolean }) {
  return (
    <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[length:var(--ts-2xs)] font-bold ${on ? "bg-[var(--brand-ink)] text-white" : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"}`}>{n}</span>
  );
}

function ActionBadge({ action }: { action: Action }) {
  const map: Record<Action, { label: string; cls: string }> = {
    crear: { label: "A crear", cls: "bg-[var(--data-info-100)] text-[var(--data-info-700)]" },
    creado: { label: "Creado", cls: "bg-[var(--data-success-100)] text-[var(--data-success-700)]" },
    existe: { label: "Ya existe", cls: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" },
    difiere: { label: "Difiere", cls: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]" },
    error: { label: "Error", cls: "bg-[var(--data-error-100)] text-[var(--data-error-700)]" },
  };
  const m = map[action];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${m.cls}`}>{m.label}</span>;
}

function Chip({ tone, label }: { tone: "info" | "muted" | "warning" | "error"; label: string }) {
  const cls = tone === "info" ? "bg-[var(--data-info-100)] text-[var(--data-info-700)]" : tone === "warning" ? "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]" : tone === "error" ? "bg-[var(--data-error-100)] text-[var(--data-error-700)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]";
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${cls}`}>{label}</span>;
}
