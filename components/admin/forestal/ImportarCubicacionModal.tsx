"use client";

/**
 * ImportarCubicacionModal — trae piezas desde un Excel/CSV o desde una FOTO
 * de la planilla escrita a mano, y las suma al lote. Los dos caminos
 * terminan en el MISMO preview: el operario ve qué se va a agregar —y en el
 * caso de la foto, la foto misma al lado para cotejar letra por letra— y
 * recién ahí confirma. Nada se agrega a ciegas.
 */
import { useCallback, useRef, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { AlertTriangle, Camera, Check, Download, FileSpreadsheet, Loader2, Mic, Sparkles, Upload } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { csrfHeaders } from "@/lib/csrf-client";
import { Btn, MODAL_BODY, ModalFooter } from "./ctp-shared";
import { parsearFilasImportadas, interpretarOcrPiezas, interpretarDictadoAudio, PLANTILLA_IMPORT, type PiezaImportada, type ResultadoImport } from "@/lib/forestal/cubicacion-import";
import { leerArchivoAFilas } from "@/lib/forestal/cubicacion-import-file";
import { descargarPlantillaImport } from "@/lib/forestal/cubicador-export";
import { loadConfig } from "@/lib/forestal/cubicador-config";

const fmtPt = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function leerComoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("No se pudo leer la imagen"));
    fr.readAsDataURL(file);
  });
}

export default function ImportarCubicacionModal({
  onAgregar, onCerrar, filasActuales = 0,
}: {
  /** Suma las piezas leídas al lote del cubicador. */
  onAgregar: (piezas: PiezaImportada[]) => void;
  onCerrar: () => void;
  /** Filas que YA tiene el lote — se muestra que la importación se suma a ellas. */
  filasActuales?: number;
}) {
  const [modo, setModo] = useState<"excel" | "foto" | "audio">("excel");
  const [resultado, setResultado] = useState<ResultadoImport | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [advertenciaIA, setAdvertenciaIA] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
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

  const procesarFoto = useCallback(async (file: File) => {
    setCargando(true);
    setErrorGeneral(null);
    setResultado(null);
    setAdvertenciaIA(null);
    setNombreArchivo(file.name);
    try {
      const dataUrl = await leerComoDataUrl(file);
      setFotoUrl(dataUrl);
      const r = await fetch("/api/admin/forestal/cubicacion-ocr/aserrada", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ image: dataUrl }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
      setResultado(interpretarOcrPiezas(j.piezas ?? []));
      if (j.advertencia) setAdvertenciaIA(String(j.advertencia));
    } catch (e) {
      setErrorGeneral(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, []);

  const procesarAudio = useCallback(async (file: File) => {
    setCargando(true);
    setErrorGeneral(null);
    setResultado(null);
    setTranscript(null);
    setNombreArchivo(file.name);
    try {
      const fd = new FormData();
      fd.append("audio", file);
      const r = await fetch("/api/admin/forestal/cubicacion-audio", {
        method: "POST",
        headers: csrfHeaders(),
        credentials: "include",
        body: fd,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
      setTranscript(String(j.transcript ?? ""));
      // El vocabulario de comandos ("fijo"/"especie"/"eliminá el último") es el
      // MISMO que el operario personalizó para el micrófono en vivo en Ajustes
      // — si no, el importador de audio sólo reconocería las frases DEFAULT.
      setResultado(interpretarDictadoAudio(String(j.transcript ?? ""), loadConfig().comandos));
    } catch (e) {
      setErrorGeneral(e instanceof Error ? e.message : String(e));
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

  const META = {
    excel: { title: "Importar cubicación desde Excel", description: "Especie · Cantidad · Espesor · Ancho · Largo", icon: FileSpreadsheet },
    foto: { title: "Escanear planilla de cubicación", description: "Foto de la planilla llenada a mano, leída con IA", icon: Camera },
    audio: { title: "Importar dictado de audio", description: "Un archivo de audio con las medidas dictadas seguidas, transcrito y clasificado", icon: Mic },
  } as const;

  return (
    // AdminModal (Radix): trae Escape, focus trap, scroll lock y bottom-sheet en
    // móvil — este modal no tenía ninguno de los cuatro.
    <AdminModal
      open
      onClose={onCerrar}
      variant="wide"
      title={META[modo].title}
      description={META[modo].description}
      icon={META[modo].icon}
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
        <SegmentedControl
          value={modo}
          onChange={(v) => { setModo(v); setResultado(null); setErrorGeneral(null); setAdvertenciaIA(null); setFotoUrl(null); setTranscript(null); setNombreArchivo(""); }}
          label="Origen de las piezas"
          className="mb-3"
          options={[
            { value: "excel", label: "Desde Excel", icon: <FileSpreadsheet className="h-4 w-4" /> },
            { value: "foto", label: "Desde foto", icon: <Camera className="h-4 w-4" /> },
            { value: "audio", label: "Desde audio", icon: <Mic className="h-4 w-4" /> },
          ]}
        />

        {modo === "excel" ? (
          <p className="mb-3 text-sm text-[var(--text-secondary)]">
            El archivo tiene que tener las columnas <b>Especie · Cantidad · Espesor · Ancho · Largo</b> (Cantidad opcional; por defecto 1). El espesor y el ancho se toman en pulgadas y el largo en pies, salvo que agregues columnas de unidad. La plantilla trae, al lado, un <b>resumen en vivo</b> (piezas · pie tablar · m³ · especies distintas) que se calcula solo mientras vas llenando — para ver qué se va a importar sin salir del Excel.
          </p>
        ) : modo === "foto" ? (
          <p className="mb-3 text-sm text-[var(--text-secondary)]">
            Sacale una foto (o subí una) a la planilla de cubicación escrita a mano — cantidad, espesor, ancho y largo por fila. La IA lee la letra y arma la lista; <b>vos la revisás</b> contra la foto antes de sumarla al lote. Las filas donde la IA no estuvo segura salen resaltadas.
          </p>
        ) : (
          <div className="mb-3 text-sm text-[var(--text-secondary)]">
            <p>
              Subí un audio donde dictaste las medidas tabla por tabla — espesor, ancho y largo (&ldquo;dos ocho once, dos ocho diez…&rdquo;). Se transcribe y se separa en piezas automáticamente; <b>vos revisás</b> el transcript y la lista antes de sumarla al lote.
            </p>
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-tertiary)]">
              <span>Igual que el micrófono en vivo, entiende:</span>
              <span><b className="text-[var(--text-secondary)]">&ldquo;cinco tablas de dos por ocho por diez&rdquo;</b> (cantidad)</span>
              <span><b className="text-[var(--text-secondary)]">&ldquo;especie cedro&rdquo;</b></span>
              <span><b className="text-[var(--text-secondary)]">&ldquo;pon fijo el largo a diez&rdquo;</b> / <b className="text-[var(--text-secondary)]">&ldquo;quitá el fijo&rdquo;</b></span>
              <span><b className="text-[var(--text-secondary)]">&ldquo;eliminá el último&rdquo;</b> si te corregiste al dictar</span>
            </p>
          </div>
        )}

        {filasActuales > 0 && (
          <p className="mb-3 flex items-center gap-2 rounded-xl border border-[var(--accent)]/40 bg-primary/10 px-3 py-2 text-sm font-semibold text-[var(--accent)]">
            <Check className="h-4 w-4 shrink-0" />
            Ya tenés <b>{filasActuales}</b> {filasActuales === 1 ? "fila" : "filas"} en el lote. Lo que importes se <b>suma</b> — no se borra nada de lo anterior.
          </p>
        )}

        {/* Elegir archivo */}
        {modo === "excel" ? (
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
        ) : modo === "foto" ? (
          <div className="flex flex-wrap items-center gap-3">
            <label className={`inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white hover:brightness-95 ${cargando ? "pointer-events-none opacity-70" : ""}`}>
              {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Tomar o elegir foto
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={cargando}
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void procesarFoto(f); e.target.value = ""; }}
              />
            </label>
            {nombreArchivo && <span className="truncate text-xs text-[var(--text-tertiary)]">{nombreArchivo}</span>}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <label className={`inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white hover:brightness-95 ${cargando ? "pointer-events-none opacity-70" : ""}`}>
              {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Subir archivo de audio
              <input
                type="file"
                accept="audio/*"
                disabled={cargando}
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void procesarAudio(f); e.target.value = ""; }}
              />
            </label>
            {nombreArchivo && <span className="truncate text-xs text-[var(--text-tertiary)]">{nombreArchivo}</span>}
          </div>
        )}

        {cargando && (
          <p className="mt-4 flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" /> {modo === "excel" ? "Leyendo el archivo…" : modo === "foto" ? "Leyendo la foto con IA…" : "Transcribiendo el audio…"}
          </p>
        )}
        {/* El error del archivo va en el pie (fijo): repetirlo acá lo dejaba
            fuera de vista justo cuando la vista previa empujaba el scroll. */}

        {modo === "foto" && fotoUrl && !cargando && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL local, no vale la pena Next/Image */}
            <img src={fotoUrl} alt="Foto de la planilla escaneada" className="h-28 w-28 shrink-0 rounded-lg border border-[var(--rule-base)] object-cover" />
            <p className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
              Cotejá cada fila de abajo contra esta foto antes de confirmar.
            </p>
          </div>
        )}

        {modo === "audio" && transcript && !cargando && (
          <div className="mt-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
              <Mic className="h-3.5 w-3.5 shrink-0" /> Lo que se escuchó
            </p>
            <p className="max-h-24 overflow-y-auto text-sm text-[var(--text-secondary)]">{transcript}</p>
          </div>
        )}

        {advertenciaIA && !cargando && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-3 py-2 text-xs font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {advertenciaIA}
          </p>
        )}

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
                  <DataTable className="w-full min-w-[420px] text-sm">
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
                  </DataTable>
                </div>
              </>
            ) : resultado.errores.length > 0 ? null : (
              <p className="py-4 text-center text-sm text-[var(--text-tertiary)]">
                {modo === "excel" ? "El archivo no tiene piezas para importar." : modo === "foto" ? "No se identificó ninguna pieza en la foto." : "No se identificó ninguna pieza en el audio."}
              </p>
            )}
          </div>
        )}
      </div>
    </AdminModal>
  );
}
