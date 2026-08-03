"use client";

/**
 * ImportarCubicacionModal — trae un Excel/CSV de piezas y lo suma al lote.
 *
 * El operario elige su archivo (columnas Especie · Espesor · Ancho · Largo, en
 * cualquier orden), ve un PREVIEW de lo que se va a agregar —cuántas piezas,
 * el pie tablar total, y las filas que no se pudieron leer con su motivo— y
 * recién ahí confirma. Nada se agrega a ciegas.
 */
import { useCallback, useRef, useState } from "react";
import { AlertTriangle, Check, Download, FileSpreadsheet, Loader2, Upload } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { Btn, MODAL_BODY, ModalFooter } from "./ctp-shared";
import { parsearFilasImportadas, PLANTILLA_IMPORT, type PiezaImportada, type ResultadoImport } from "@/lib/forestal/cubicacion-import";
import { leerArchivoAFilas } from "@/lib/forestal/cubicacion-import-file";
import { descargarPlantillaImport } from "@/lib/forestal/cubicador-export";

const fmtPt = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ImportarCubicacionModal({
  onAgregar, onCerrar, filasActuales = 0,
}: {
  /** Suma las piezas leídas al lote del cubicador. */
  onAgregar: (piezas: PiezaImportada[]) => void;
  onCerrar: () => void;
  /** Filas que YA tiene el lote — se muestra que la importación se suma a ellas. */
  filasActuales?: number;
}) {
  const [resultado, setResultado] = useState<ResultadoImport | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const procesar = useCallback(async (file: File) => {
    setCargando(true);
    setErrorGeneral(null);
    setResultado(null);
    setNombreArchivo(file.name);
    try {
      const filas = await leerArchivoAFilas(file);
      setResultado(parsearFilasImportadas(filas));
    } catch (e) {
      setErrorGeneral(`No se pudo leer el archivo: ${e instanceof Error ? e.message : String(e)}. Probá con un .xlsx o .csv.`);
    } finally {
      setCargando(false);
    }
  }, []);

  const [bajando, setBajando] = useState(false);
  const descargarPlantilla = () => {
    // .xlsx real: cada columna en su celda (un CSV se abre en una sola celda con
    // el separador ";" del Excel es-PE). Sin datos: solo los encabezados.
    setBajando(true);
    descargarPlantillaImport(PLANTILLA_IMPORT.headers)
      .catch(() => setErrorGeneral("No se pudo generar la plantilla. Probá de nuevo."))
      .finally(() => setBajando(false));
  };

  const totalPt = resultado?.piezas.reduce((a, p) => a + p.pieTablar, 0) ?? 0;
  const totalPiezas = resultado?.piezas.reduce((a, p) => a + p.cantidad, 0) ?? 0;
  const raras = resultado?.piezas.filter((p) => p.sospechosa).length ?? 0;
  /** Lo que hay para agregar, ya leído: `null` mientras no haya nada. */
  const listas = resultado && !cargando && resultado.piezas.length > 0 ? resultado.piezas : null;

  return (
    // AdminModal (Radix): trae Escape, focus trap, scroll lock y bottom-sheet en
    // móvil — este modal no tenía ninguno de los cuatro.
    <AdminModal
      open
      onClose={onCerrar}
      variant="wide"
      title="Importar cubicación desde Excel"
      description="Especie · Cantidad · Espesor · Ancho · Largo"
      icon={FileSpreadsheet}
      // El pie vivía `sticky` DENTRO del scroll con un `-mx-5` calzado a mano al
      // padding del cuerpo: cualquier cambio de padding lo descuadraba. Con la
      // prop `footer` de AdminModal queda fuera del scroll y sin compensaciones.
      footer={
        <ModalFooter
          error={errorGeneral}
          nota={
            listas
              ? `${listas.length} fila(s) · ${totalPiezas} piezas · ${fmtPt(totalPt)} PT${raras > 0 ? ` · ${raras} con medidas raras` : ""}`
              : undefined
          }
        >
          <Btn variant="ghost" onClick={onCerrar}>Cancelar</Btn>
          {/* Sólo se ofrece agregar cuando hay algo que agregar; el pie existe
              igual para que "Cancelar" no dependa de que el archivo se leyera. */}
          {listas && (
            <Btn variant="dark" onClick={() => { onAgregar(listas); onCerrar(); }}>
              <Check className="h-4 w-4" /> Agregar {listas.length} al lote
              {filasActuales > 0 ? ` (quedará con ${filasActuales + listas.length})` : ""}
            </Btn>
          )}
        </ModalFooter>
      }
    >
      <div className={MODAL_BODY}>

        <p className="mb-3 text-sm text-[var(--text-secondary)]">
          El archivo tiene que tener las columnas <b>Especie · Cantidad · Espesor · Ancho · Largo</b> (Cantidad opcional; por defecto 1). El espesor y el ancho se toman en pulgadas y el largo en pies, salvo que agregues columnas de unidad.
        </p>

        {filasActuales > 0 && (
          <p className="mb-3 flex items-center gap-2 rounded-xl border border-[var(--accent)]/40 bg-primary/10 px-3 py-2 text-sm font-semibold text-[var(--accent)]">
            <Check className="h-4 w-4 shrink-0" />
            Ya tenés <b>{filasActuales}</b> {filasActuales === 1 ? "fila" : "filas"} en el lote. Lo que importes se <b>suma</b> — no se borra nada de lo anterior.
          </p>
        )}

        {/* Elegir archivo */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void procesar(f); e.target.value = ""; }}
            className="hidden"
          />
          <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white hover:brightness-95">
            <Upload className="h-4 w-4" /> Elegir archivo
          </button>
          <button type="button" onClick={descargarPlantilla} disabled={bajando} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50">
            {bajando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Descargar plantilla (Excel)
          </button>
          {nombreArchivo && <span className="truncate text-xs text-[var(--text-tertiary)]">{nombreArchivo}</span>}
        </div>

        {cargando && (
          <p className="mt-4 flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Leyendo el archivo…
          </p>
        )}
        {/* El error del archivo va en el pie (fijo): repetirlo acá lo dejaba
            fuera de vista justo cuando la vista previa empujaba el scroll. */}

        {/* Preview */}
        {resultado && !cargando && (
          <div className="mt-4 space-y-3">
            {resultado.errores.length > 0 && (
              <div className="rounded-xl border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-3 py-2 dark:bg-[var(--data-warning-500)]/12">
                <p className="mb-1 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                  {resultado.errores.length} {resultado.errores.length === 1 ? "fila no se pudo leer" : "filas no se pudieron leer"} (se saltean):
                </p>
                <ul className="max-h-24 space-y-0.5 overflow-y-auto text-xs text-[var(--text-secondary)]">
                  {resultado.errores.slice(0, 20).map((e) => (
                    <li key={e.fila}>Fila {e.fila}: {e.motivo}</li>
                  ))}
                </ul>
              </div>
            )}

            {resultado.piezas.length > 0 ? (
              <>
                <div className="max-h-56 overflow-auto rounded-xl border border-[var(--rule-base)]">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead className="sticky top-0 bg-[var(--surface-sunken)]">
                      <tr className="text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                        <th className="px-3 py-2">Cant.</th><th className="px-3 py-2">Medida</th><th className="px-3 py-2">Especie</th><th className="px-3 py-2 text-right">Pie tablar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.piezas.map((p) => (
                        <tr key={p.id} className={`border-t border-[var(--rule-soft)] ${p.sospechosa ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/12" : ""}`}>
                          <td className="px-3 py-1.5 font-mono tabular-nums text-[var(--text-secondary)]">{p.cantidad}</td>
                          <td className="px-3 py-1.5 font-mono font-bold tabular-nums text-[var(--text-primary)]">
                            {p.espesor}×{p.ancho}×{p.largo}
                            {p.sospechosa && <AlertTriangle className="ml-1 inline h-3 w-3 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" />}
                          </td>
                          <td className="px-3 py-1.5 text-[var(--text-secondary)]">{p.especie ?? "—"}</td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[var(--text-primary)]">{fmtPt(p.pieTablar)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : resultado.errores.length > 0 ? null : (
              <p className="py-4 text-center text-sm text-[var(--text-tertiary)]">El archivo no tiene piezas para importar.</p>
            )}
          </div>
        )}
      </div>
    </AdminModal>
  );
}
