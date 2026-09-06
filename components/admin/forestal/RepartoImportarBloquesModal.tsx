"use client";

/**
 * RepartoImportarBloquesModal — cargar la tabla de bloques desde la planilla
 * que el aserradero ya lleva, en vez de fila por fila.
 *
 * Dos caminos que terminan en el MISMO preview: **pegar** (lo que sale del
 * portapapeles de Excel es TSV, así que copiar el rango y pegar acá alcanza) o
 * **subir** un .xlsx/.csv. Nada entra a ciegas: primero se ve qué se va a
 * agregar y —sobre todo— **qué filas quedaron afuera y por qué**, que es la
 * mitad que suele faltar en un importador ([[ctp-import-inventarios-2026-08-05]]:
 * 51 de 60 trozas descartadas en silencio, y el gate estático en verde).
 *
 * El parseo vive en `lib/forestal/reparto-bloques-import.ts` (puro, con tests);
 * acá está el pegado, el archivo y el dibujo.
 */

import { useCallback, useRef, useState } from "react";
import { AlertTriangle, Check, Clipboard, FileSpreadsheet, Loader2, Upload } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { Btn, MODAL_BODY, ModalFooter } from "./ctp-shared";
import { fmtM3, fmtPiezas } from "@/lib/forestal/cubicacion-formato";
import { leerArchivoAFilas, leerTextoAFilas } from "@/lib/forestal/cubicacion-import-file";
import {
  PLANTILLA_BLOQUES, parsearBloquesImportados,
  type BloqueImportado, type ResultadoImportBloques,
} from "@/lib/forestal/reparto-bloques-import";

/** La plantilla, en el mismo CSV que Excel abre de un doble click. */
function descargarPlantilla() {
  const filas = [PLANTILLA_BLOQUES.headers, ...PLANTILLA_BLOQUES.ejemplo];
  const csv = "﻿" + filas.map((f) => f.map((c) => {
    const s = String(c ?? "");
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla-bloques-distribucion.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function RepartoImportarBloquesModal({
  bloquesActuales, onAgregar, onCerrar,
}: {
  /** Bloques que YA tiene la tabla: la importación se SUMA, no reemplaza. */
  bloquesActuales: number;
  onAgregar: (bloques: BloqueImportado[]) => void;
  onCerrar: () => void;
}) {
  const [modo, setModo] = useState<"pegar" | "archivo">("pegar");
  const [texto, setTexto] = useState("");
  const [resultado, setResultado] = useState<ResultadoImportBloques | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Se relee en cada tecla: pegar y ver el preview al toque es el punto. */
  const procesarTexto = useCallback((v: string) => {
    setTexto(v);
    setError(null);
    setResultado(v.trim() ? parsearBloquesImportados(leerTextoAFilas(v)) : null);
  }, []);

  const procesarArchivo = useCallback(async (file: File) => {
    setCargando(true);
    setError(null);
    setResultado(null);
    setNombreArchivo(file.name);
    try {
      setResultado(parsearBloquesImportados(await leerArchivoAFilas(file)));
    } catch (e) {
      setError(`No se pudo leer el archivo: ${e instanceof Error ? e.message : String(e)}. Probá con un .xlsx o un .csv.`);
    } finally {
      setCargando(false);
    }
  }, []);

  const bloques = resultado?.bloques ?? [];
  const totalRolliza = bloques.filter((b) => b.tipo !== "aserrada").reduce((a, b) => a + b.m3, 0);
  const totalAserrada = bloques.filter((b) => b.tipo === "aserrada").reduce((a, b) => a + b.m3, 0);
  const totalPiezas = bloques.reduce((a, b) => a + (b.piezasManual ?? 0), 0);

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title="Importar bloques"
      description="Pegá la planilla o subí el archivo: cada fila entra como un bloque de la distribución."
      icon={FileSpreadsheet}
      footer={
        <ModalFooter
          error={error}
          nota={
            resultado
              ? `${bloques.length} bloque${bloques.length === 1 ? "" : "s"} listo${bloques.length === 1 ? "" : "s"}${resultado.descartadas.length > 0 ? ` · ${resultado.descartadas.length} fila${resultado.descartadas.length === 1 ? "" : "s"} afuera` : ""}${bloquesActuales > 0 ? ` · se suman a los ${bloquesActuales} que ya tenés` : ""}`
              : "Copiá el rango en Excel y pegalo acá, o subí el .xlsx/.csv."
          }
        >
          <Btn variant="ghost" onClick={onCerrar}>Cancelar</Btn>
          <Btn
            variant="primary"
            disabled={bloques.length === 0}
            onClick={() => { onAgregar(bloques); onCerrar(); }}
          >
            <Check className="h-4 w-4" aria-hidden />
            {bloques.length === 0 ? "Nada que agregar" : `Agregar ${bloques.length} bloque${bloques.length === 1 ? "" : "s"}`}
          </Btn>
        </ModalFooter>
      }
    >
      <div className={MODAL_BODY}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <SegmentedControl
            value={modo}
            onChange={(v) => setModo(v)}
            label="Cómo cargar los bloques"
            options={[
              { value: "pegar", label: "Pegar", icon: <Clipboard className="h-4 w-4" aria-hidden /> },
              { value: "archivo", label: "Archivo", icon: <Upload className="h-4 w-4" aria-hidden /> },
            ]}
          />
          <Btn size="sm" onClick={descargarPlantilla}>
            <FileSpreadsheet className="h-4 w-4" aria-hidden /> Bajar plantilla
          </Btn>
        </div>

        {modo === "pegar" ? (
          <label className="block">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
              Pegá acá (Ctrl+V)
            </span>
            <textarea
              value={texto}
              onChange={(e) => procesarTexto(e.target.value)}
              rows={6}
              aria-label="Planilla de bloques pegada"
              placeholder={"Etiqueta\tCargado como\tEspecie\tN° de permiso\tm³\tPiezas\nGTF-0231\trolliza\tTornillo\t19-SEC/REG-…\t20\nCompra 12/08\taserrada\tTornillo\t\t1.5\t30"}
              className="mt-1 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </label>
        ) : (
          <div className="rounded-xl border-2 border-dashed border-[var(--rule-base)] px-4 py-6 text-center">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void procesarArchivo(f); }}
              className="hidden"
            />
            <Btn onClick={() => inputRef.current?.click()} disabled={cargando}>
              {cargando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
              {cargando ? "Leyendo…" : "Elegir archivo .xlsx o .csv"}
            </Btn>
            {nombreArchivo && <p className="mt-2 text-sm text-[var(--text-tertiary)]">{nombreArchivo}</p>}
          </div>
        )}

        {resultado && (
          <div className="mt-4 space-y-3">
            {/* Lo que se reconoció de la cabecera: si el archivo trae una
                columna que el importador no entiende, se dice — callarlo deja
                al operario creyendo que ese dato entró. */}
            {resultado.columnasIgnoradas.length > 0 && (
              <p className="flex flex-wrap items-start gap-1.5 rounded-lg border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] px-3 py-2 text-xs font-bold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Columnas que no se leyeron: {resultado.columnasIgnoradas.join(", ")}. Todo lo demás entró igual.
              </p>
            )}
            {!resultado.conCabecera && bloques.length > 0 && (
              <p className="text-xs text-[var(--text-tertiary)]">
                No se reconoció una fila de títulos, así que se leyó en el orden de la plantilla:
                etiqueta · cargado como · especie · permiso · m³ · piezas · % aprovechable · S/ por m³ · días · fecha.
              </p>
            )}

            {bloques.length > 0 && (
              <>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-[var(--surface-sunken)] px-3 py-2 font-mono text-sm font-bold tabular-nums text-[var(--text-secondary)]">
                  {/* Los dos volúmenes por separado, igual que en la tabla:
                      troza y tabla no se suman. */}
                  <span>{fmtM3(totalRolliza)} <span className="font-sans font-normal text-[var(--text-tertiary)]">m³ (R) de rolliza</span></span>
                  {totalAserrada > 0 && <span>{fmtM3(totalAserrada)} <span className="font-sans font-normal text-[var(--text-tertiary)]">m³ (A) ya aserrados</span></span>}
                  {totalPiezas > 0 && <span>{fmtPiezas(totalPiezas)} <span className="font-sans font-normal text-[var(--text-tertiary)]">piezas declaradas</span></span>}
                </div>
                <div className="max-h-56 overflow-auto rounded-lg border border-[var(--rule-base)]">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Bloques que se van a agregar</caption>
                    <thead className="sticky top-0 bg-[var(--surface-sunken)] text-left text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                      <tr>
                        <th scope="col" className="px-2 py-2">Etiqueta</th>
                        <th scope="col" className="px-2 py-2">Cargado como</th>
                        <th scope="col" className="px-2 py-2">Especie</th>
                        <th scope="col" className="px-2 py-2 text-right">m³</th>
                        <th scope="col" className="px-2 py-2 text-right">Piezas</th>
                        <th scope="col" className="px-2 py-2 text-right">% aprov.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bloques.map((b, i) => (
                        <tr key={`${b.etiqueta}-${i}`} className="border-t border-[var(--rule-soft)]">
                          <td className="px-2 py-1.5 text-[var(--text-primary)]">{b.etiqueta || <span className="text-[var(--text-tertiary)]">sin etiqueta</span>}</td>
                          <td className={`px-2 py-1.5 font-bold ${b.tipo === "aserrada" ? "text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-secondary)]"}`}>
                            {b.tipo === "aserrada" ? "Aserrada directa" : "Rolliza"}
                          </td>
                          <td className="px-2 py-1.5 text-[var(--text-secondary)]">{b.especie || <span className="text-[var(--text-tertiary)]">sin especie</span>}</td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--text-primary)]">{fmtM3(b.m3)}</td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">{b.piezasManual ?? "—"}</td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">{b.aprovechablePct ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Las descartadas van SIEMPRE visibles y con su número de fila:
                el importador que se come filas sin decirlo es el bug, no el
                importador que rechaza. */}
            {resultado.descartadas.length > 0 && (
              <div className="rounded-lg border-2 border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] px-3 py-2 dark:bg-[var(--data-error-500)]/12">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {resultado.descartadas.length} fila{resultado.descartadas.length === 1 ? "" : "s"} no entró{resultado.descartadas.length === 1 ? "" : "eron"}:
                </p>
                <ul className="max-h-32 space-y-0.5 overflow-auto text-xs text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                  {resultado.descartadas.map((d) => (
                    <li key={d.fila}>
                      <b>Fila {d.fila}</b> — {d.motivo}
                      {d.crudo && <span className="text-[var(--text-tertiary)]"> · {d.crudo}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {bloques.length === 0 && resultado.descartadas.length === 0 && (
              <p className="py-2 text-center text-sm text-[var(--text-tertiary)]">
                No se encontró ninguna fila con datos.
              </p>
            )}
          </div>
        )}
      </div>
    </AdminModal>
  );
}
