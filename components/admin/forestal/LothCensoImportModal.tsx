"use client";

/**
 * LothCensoImportModal — importa el censo desde la hoja del regente, mostrando
 * ANTES de tocar la base qué se leyó y qué está mal.
 *
 * Tres entradas: subir el Excel (.xlsx, se lee a celdas), subir un CSV (va al
 * cuadro de texto, para que se vea y se pueda corregir) o pegar la hoja. Cada
 * fila llega con su veredicto — errores (no se importa) y avisos (se importa,
 * pero conviene mirarlo) — y sólo se envían las filas sanas. «Descargar
 * plantilla» baja la hoja vacía con el encabezado de la hoja real.
 */

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Download, FileSpreadsheet, Loader2, Table, Upload, X } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { Celda } from "@/lib/forestal/cubicacion-import";
import { leerArchivoAFilas } from "@/lib/forestal/cubicacion-import-file";
import {
  filasImportables,
  parseCensoFilas,
  parseCensoTabla,
  type CensoImportContext,
  type CensoImportResult,
} from "@/lib/forestal/loth-censo-import";
import { descargarPlantillaCenso } from "@/lib/forestal/loth-censo-plantilla";
import LothCensoImportPreview from "./LothCensoImportPreview";

/** Dos filas reales de la hoja del regente (28-09), con su encabezado tal cual. */
const EJEMPLO = `N°\tCod\tN. Comun\tN. Cientifico\tNombre en idioma nativo\tDAP\taltura\tvol\tEste\tNorte\tcondicion\tobservaciones
1\t2\tCopaiba\tCopaifera reticulata Ducke\tCoubé\t1,15\t22\t14,853\t521922\t8918151\tAprovechable\t
5\t8\tMashonaste\tClarisia racemosa Ruiz & Pav.\tTsabiri\t0,9\t18\t7,443\t521937\t8918009\tAprovechable\tCaido natural`;

interface Props {
  open: boolean;
  ctx: CensoImportContext;
  importing: boolean;
  onClose: () => void;
  onImport: (filas: Record<string, unknown>[]) => void;
}

const BOTON = "inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50";

export default function LothCensoImportModal({ open, ctx, importing, onClose, onImport }: Props) {
  const [texto, setTexto] = useState("");
  /** El Excel subido, ya leído a celdas. Mientras está, manda sobre el texto. */
  const [archivo, setArchivo] = useState<{ nombre: string; celdas: Celda[][] } | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [bajando, setBajando] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const res: CensoImportResult = useMemo(
    () => (archivo ? parseCensoFilas(archivo.celdas, ctx) : parseCensoTabla(texto, ctx)),
    [archivo, texto, ctx],
  );
  const listas = useMemo(() => filasImportables(res), [res]);

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
        // CSV / TSV / texto: al cuadro, para que se vea lo que se leyó.
        setArchivo(null);
        setTexto(await file.text());
      }
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "No se pudo leer el archivo");
    } finally {
      setLeyendo(false);
    }
  };

  const bajarPlantilla = () => {
    setBajando(true);
    descargarPlantillaCenso()
      .catch((err) => {
        console.warn("[LothCensoImportModal] plantilla falló", err);
        setFileError("No se pudo generar la plantilla. Prueba de nuevo.");
      })
      .finally(() => setBajando(false));
  };

  return (
    // AdminModal: Escape, focus trap y scroll lock — no tenía ninguno.
    <AdminModal
      open
      onClose={onClose}
      variant="info"
      title="Importar censo forestal"
      description="Sube o pega la hoja del regente: los encabezados se detectan solos, en cualquier orden"
      icon={Table}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-12 items-center rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={listas.length === 0 || importing}
            onClick={() => onImport(listas)}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--brand-ink)] px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Importar {listas.length} árbol(es)
          </button>
        </div>
      }
    >
      <div className={`space-y-3 ${MODAL_BODY}`}>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }}
          />
          <button type="button" onClick={() => inputRef.current?.click()} disabled={leyendo} className={BOTON}>
            {leyendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Subir Excel o CSV
          </button>
          <button type="button" onClick={bajarPlantilla} disabled={bajando} className={BOTON}>
            {bajando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Descargar plantilla
          </button>
          <InfoTip
            icono="ayuda"
            title="La hoja del censo"
            what="Columnas de la hoja del regente: N° · Cod · N. Comun · N. Cientifico · Nombre en idioma nativo · DAP · altura · vol · Este · Norte · condicion · observaciones."
            affects="Si la hoja trae el volumen, se guarda ese (es el declarado); si no, se calcula con 0,7854 × DAP² × altura × 0,65. Los códigos que ya están en el censo no se vuelven a importar."
            example="DAP en metros (1,15) o en centímetros (115): se detecta solo."
          />
          {res.filas.length > 0 && (
            <span className="text-xs font-bold text-[var(--text-tertiary)]">
              {res.conEncabezado ? "Encabezados detectados" : "Sin encabezado: se lee por posición"} · columnas leídas:{" "}
              {Object.keys(res.mapeo).length}
            </span>
          )}
        </div>

        {archivo ? (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm">
            <FileSpreadsheet className="h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" />
            <span className="min-w-0 truncate font-semibold text-[var(--text-primary)]">{archivo.nombre}</span>
            <span className="shrink-0 text-xs text-[var(--text-tertiary)]">{res.filas.length} fila(s) leídas</span>
            <button type="button" onClick={() => setArchivo(null)} aria-label="Quitar el archivo y volver a pegar" title="Quitar el archivo" className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={5}
            spellCheck={false}
            aria-label="Pega aquí la hoja del censo"
            placeholder={EJEMPLO}
            className="block w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3 font-mono text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
          />
        )}

        {fileError && (
          <p className="flex items-center gap-1.5 text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            <AlertTriangle className="h-3.5 w-3.5" /> {fileError}
          </p>
        )}

        {res.filas.length > 0 && <LothCensoImportPreview res={res} />}
      </div>
    </AdminModal>
  );
}
