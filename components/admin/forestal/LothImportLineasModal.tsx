"use client";

/**
 * LothImportLineasModal — cargar un cuadro entero al libro, viendo antes qué
 * va a entrar.
 *
 * Tres reglas, las tres aprendidas de un importador anterior que descartó 51 de
 * 60 filas sin decir nada:
 *  1. la vista previa muestra **todas** las filas, con su veredicto y su motivo;
 *  2. lo que no se puede asentar se marca, no se esconde;
 *  3. al terminar se dice cuántas entraron **de verdad**, no cuántas se mandaron.
 */

import { useMemo, useRef, useState } from "react";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import {
  ControlesDeVentana,
  TiradorDeVentana,
} from "@/components/admin/shared/modal-controles-ventana";
import { DataTable } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileUp,
  Loader2,
  Upload,
  X,
} from "@buleje/design-system/icons";
import { parseImportLineas, parseImportLineasCeldas, type CeldaLinea, type FilaImport } from "@/lib/forestal/loth-import-lineas";
import { descargarPlantillaLineas } from "@/lib/forestal/loth-lineas-plantilla";
import { leerArchivoAFilas } from "@/lib/forestal/cubicacion-import-file";
import { SECTION_META } from "./LothEntryForm";
import type { LothSection } from "@/lib/forestal/loth-constants";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

const EJEMPLO: Record<string, string> = {
  tala: "Cód. árbol,Especie,Fecha,Ø mayor,Ø menor,Longitud\n001-TOR,Tornillo,21/07/2026,0.65,0.65,18",
  trozado: "Cód. árbol,Cód. troza,Especie,Ø mayor,Ø menor,Longitud\n001-TOR,001-TOR-A,Tornillo,0.65,0.60,12",
  despacho_troza: "Cód. troza,N° GTF,Fecha\n001-TOR-A,001-0000125,22/07/2026",
  consumo_troza: "Cód. troza,Especie,Volumen\n001-TOR-A,Tornillo,2.85",
  producto_terminado: "Cód. troza,Producto,Cantidad,Unidad\n001-TOR-A,Madera aserrada,1.2,m3",
  despacho_producto: "N° GTF,Producto,Cantidad,Unidad,Piezas\n001-0000126,Madera aserrada,1.2,m3,30",
};

export default function LothImportLineasModal({
  open,
  section,
  especiesAutorizadas,
  onClose,
  onImportar,
}: {
  open: boolean;
  section: LothSection;
  /** Para avisar (sin bloquear) cuando la especie no está en el POA. */
  especiesAutorizadas?: Set<string>;
  onClose: () => void;
  /** Escribe las filas elegidas. Devuelve cuántas entraron y qué falló. */
  onImportar: (filas: FilaImport[]) => Promise<{ creadas: number; errores: string[] }>;
}) {
  /* Sin esto el foco se queda atrás del modal: Tab se va a la pantalla
     de abajo y Escape no cierra (hook medido en el módulo, 2026-09-09). */
  /* `activo: open` no es decorativo: el componente NO se desmonta al
     cerrarse —sólo su contenido— así que sin esto el efecto corre una vez
     con el ref vacío y no vuelve a mirar cuando el modal aparece. */
  const cajaRef = useRef<HTMLDivElement>(null);
  const [texto, setTexto] = useState("");
  /** El .xlsx subido, ya leído a celdas. Mientras está, manda sobre el texto. */
  const [archivo, setArchivo] = useState<{ nombre: string; celdas: CeldaLinea[][] } | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [bajando, setBajando] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [omitidas, setOmitidas] = useState<Set<number>>(new Set());
  const [importando, setImportando] = useState(false);
  useModalAccesible(cajaRef, { onCerrar: importando ? undefined : onClose, activo: open });
  /**
   * Ventana: se mueve, se achica y se fija (ADR-420).
   *
   * Acá la vista previa es una tabla larga de filas con su veredicto: estirarla
   * a lo ancho —o a toda la pantalla— es la diferencia entre revisar fila por
   * fila y aceptar a ciegas. Y al decidir si una fila rechazada es un duplicado
   * de verdad hay que mirar el libro de atrás, que este modal tapa entero.
   */
  const ventana = useVentanaDeModal(open, {
    ref: cajaRef,
    aplicarTranslate: true,
    claveMemoria: "loth-import-lineas",
  });
  const [resultado, setResultado] = useState<{ creadas: number; errores: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* El .xlsx manda mientras esté cargado — es exactamente el patrón del
     importador del censo (28-09): un archivo y un texto pegado no compiten,
     el archivo gana hasta que el usuario lo quita con la X. */
  const previa = useMemo(
    () =>
      archivo
        ? parseImportLineasCeldas(archivo.celdas, section, { especiesAutorizadas })
        : parseImportLineas(texto, section, { especiesAutorizadas }),
    [archivo, texto, section, especiesAutorizadas],
  );
  const aImportar = previa.filas.filter((f) => f.estado === "ok" && !omitidas.has(f.fila));

  if (!open) return null;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    const nombre = file.name.toLowerCase();
    if (nombre.endsWith(".xls")) {
      setFileError("Ese es el formato viejo de Excel (.xls): ábrelo y guárdalo como .xlsx.");
      return;
    }
    setLeyendo(true);
    try {
      if (nombre.endsWith(".xlsx")) {
        const celdas = await leerArchivoAFilas(file);
        if (celdas.length === 0) throw new Error("La primera hoja del archivo está vacía.");
        setArchivo({ nombre: file.name, celdas });
      } else {
        // CSV/TXT/texto: al cuadro, para que se vea lo que se leyó y se pueda corregir.
        setArchivo(null);
        setTexto(await file.text());
      }
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "No se pudo leer el archivo");
    } finally {
      setLeyendo(false);
    }
    setOmitidas(new Set());
    setResultado(null);
  };

  const bajarPlantilla = () => {
    setBajando(true);
    descargarPlantillaLineas(section)
      .catch((err) => {
        console.warn("[LothImportLineasModal] plantilla falló", err);
        setFileError("No se pudo generar la plantilla. Prueba de nuevo.");
      })
      .finally(() => setBajando(false));
  };

  const importar = async () => {
    setImportando(true);
    try {
      setResultado(await onImportar(aImportar));
    } finally {
      setImportando(false);
    }
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-modal-2 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      /* El velo es decorativo: el diálogo es la caja de adentro. Cerrar tocando
         afuera es un atajo —Escape y la X hacen lo mismo con teclado. */
      role="presentation"
      onClick={(e) => {
        /* Fijado quiere decir «lo dejo abierto mientras reviso»: el clic afuera
           deja de cerrar —y con una previa de 60 filas pegadas, cerrarla sin
           querer duele. La X y Escape siguen cerrando. */
        if (e.target === e.currentTarget && !ventana.fijado) onClose();
      }}
    >
      {/* El diálogo en sí: acá viven el foco, el arrastre y el tamaño —
          el velo de atrás no se mueve. */}
      <div
        ref={cajaRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Importar líneas de ${SECTION_META[section].label}`}
        /* `relative`: el tirador de redimensión se ancla a esta esquina. */
        className="relative flex max-h-[90vh] w-full max-w-[60rem] flex-col overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]"
      >
        {/* Cabecera — y asa para arrastrar la ventana. */}
        <header
          {...ventana.asaProps}
          className="flex items-start justify-between gap-3 border-b-2 border-[var(--rule-base)] px-5 py-3"
        >
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-black uppercase tracking-widest text-[var(--text-secondary)]">
              Importar · {SECTION_META[section].label}
            </p>
            <InfoTip
              title="Cómo importar"
              what="Pega el cuadro de Excel o sube un CSV."
              affects="Nada se escribe en el libro hasta que confirmes en «Asentar»."
              example="Vas a poder destildar filas de la vista previa antes de asentar."
            />
          </div>
          {/* `ml-auto`: la cabecera reparte con `justify-between`, así que sin
              esto los controles quedarían flotando en el medio. */}
          <span className="ml-auto flex items-center gap-1">
            <ControlesDeVentana ventana={ventana} />
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-auto px-5 py-4">
          {resultado ? (
            <div className="space-y-3">
              <div
                className={`rounded-xl border-2 p-4 ${
                  resultado.errores.length === 0
                    ? "border-[var(--data-success-500)] bg-[var(--data-success-500)]/10"
                    : "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10"
                }`}
              >
                <p className="flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">
                  {resultado.errores.length === 0 ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                  Entraron {resultado.creadas} de {aImportar.length} líneas
                </p>
                {resultado.errores.length > 0 && (
                  <ul className="mt-2 space-y-1 text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                    {resultado.errores.slice(0, 10).map((e, i) => (
                      <li key={i}>· {e}</li>
                    ))}
                    {resultado.errores.length > 10 && <li>· y {resultado.errores.length - 10} más</li>}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={leyendo}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"
                >
                  {leyendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} Subir Excel o CSV
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    void onFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={bajarPlantilla}
                  disabled={bajando}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"
                >
                  {bajando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Descargar plantilla
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setArchivo(null);
                    setTexto(EJEMPLO[section] ?? "");
                  }}
                  className="ml-auto text-sm font-bold text-[var(--accent)] hover:underline"
                >
                  Ver un ejemplo
                </button>
              </div>

              {fileError && (
                <p className="flex items-center gap-1.5 text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                  <AlertTriangle className="h-3.5 w-3.5" /> {fileError}
                </p>
              )}

              {archivo ? (
                <div className="flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm">
                  <FileSpreadsheet className="h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" />
                  <span className="min-w-0 truncate font-semibold text-[var(--text-primary)]">{archivo.nombre}</span>
                  <span className="shrink-0 text-xs text-[var(--text-tertiary)]">{previa.filas.length} fila(s) leídas</span>
                  <button
                    type="button"
                    onClick={() => setArchivo(null)}
                    aria-label="Quitar el archivo y volver a pegar"
                    title="Quitar el archivo"
                    className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <textarea
                  value={texto}
                  onChange={(e) => {
                    setTexto(e.target.value);
                    setOmitidas(new Set());
                  }}
                  rows={5}
                  spellCheck={false}
                  placeholder={`Pega acá el cuadro con su fila de encabezados.\n\n${EJEMPLO[section] ?? ""}`}
                  className="w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              )}

              {previa.filas.length > 0 && (
                <>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                      {aImportar.length} lista{aImportar.length === 1 ? "" : "s"} para asentar
                    </span>
                    {previa.conError > 0 && (
                      <span className="font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                        {previa.conError} con datos faltantes
                      </span>
                    )}
                    {previa.ignoradas.length > 0 && (
                      <span className="text-[var(--text-tertiary)]">
                        columnas ignoradas: {previa.ignoradas.join(", ")}
                      </span>
                    )}
                  </div>

                  <div className="max-h-[38vh] overflow-auto rounded-xl border border-[var(--rule-base)]">
                    <DataTable className="w-full text-xs">
                      <thead className="sticky top-0 bg-[var(--surface-sunken)]">
                        <tr className="text-left">
                          <th className="px-2 py-2 font-bold">Asentar</th>
                          <th className="px-2 py-2 font-bold">Fila</th>
                          <th className="px-2 py-2 font-bold">Árbol</th>
                          <th className="px-2 py-2 font-bold">Troza</th>
                          <th className="px-2 py-2 font-bold">Especie</th>
                          <th className="px-2 py-2 text-right font-bold">Volumen</th>
                          <th className="px-2 py-2 font-bold">Qué pasa con esta fila</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previa.filas.map((f) => (
                          <FilaPrevia
                            key={f.fila}
                            f={f}
                            omitida={omitidas.has(f.fila)}
                            onToggle={() =>
                              setOmitidas((prev) => {
                                const next = new Set(prev);
                                if (next.has(f.fila)) next.delete(f.fila);
                                else next.add(f.fila);
                                return next;
                              })
                            }
                          />
                        ))}
                      </tbody>
                    </DataTable>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t-2 border-[var(--rule-base)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)]"
          >
            {resultado ? "Cerrar" : "Cancelar"}
          </button>
          {!resultado && (
            <button
              type="button"
              onClick={importar}
              disabled={aImportar.length === 0 || importando}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {importando ? "Asentando…" : `Asentar ${aImportar.length} línea${aImportar.length === 1 ? "" : "s"}`}
            </button>
          )}
        </footer>

        <TiradorDeVentana ventana={ventana} />
      </div>
    </div>
  );
}

function FilaPrevia({ f, omitida, onToggle }: { f: FilaImport; omitida: boolean; onToggle: () => void }) {
  const error = f.estado === "error";
  return (
    <tr
      className={`border-t border-[var(--rule-soft)] ${
        error ? "bg-[var(--data-error-500)]/10" : omitida ? "opacity-50" : f.motivos.length > 0 ? "bg-[var(--data-warning-500)]/10" : ""
      }`}
    >
      <td className="px-2 py-1.5">
        <input
          type="checkbox"
          checked={!error && !omitida}
          disabled={error}
          onChange={onToggle}
          aria-label={`Asentar la fila ${f.fila}`}
          className="h-4 w-4 cursor-pointer accent-[var(--data-info-600)] disabled:cursor-not-allowed"
        />
      </td>
      <td className="px-2 py-1.5 font-mono tabular-nums text-[var(--text-tertiary)]">{f.fila}</td>
      <td className="px-2 py-1.5 font-mono text-[var(--text-primary)]">{f.treeCode ?? "—"}</td>
      <td className="px-2 py-1.5 font-mono text-[var(--text-primary)]">{f.trozaCode ?? "—"}</td>
      <td className="px-2 py-1.5 text-[var(--text-secondary)]">{f.speciesCommon ?? "—"}</td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">
        {f.volumeM3 != null ? fmtM3(f.volumeM3) : f.quantity != null ? `${f.quantity} ${f.unit ?? ""}` : "—"}
        {f.volumenCalculado && <span className="ml-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">(Smalian)</span>}
      </td>
      <td className="px-2 py-1.5">
        {f.motivos.length === 0 ? (
          <span className="text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">se asienta</span>
        ) : (
          <span className={error ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"}>
            {f.motivos.join(" · ")}
          </span>
        )}
      </td>
    </tr>
  );
}
