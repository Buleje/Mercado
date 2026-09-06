"use client";

/**
 * ImportarTrozasModal — trae trozas (rolliza) desde un Excel/CSV o desde una
 * FOTO de la planilla escrita a mano en patio, y las suma al patio. Los dos
 * caminos terminan en el MISMO preview: el operario ve qué se va a agregar
 * —y en el caso de la foto, la foto misma al lado para cotejar letra por
 * letra— y recién ahí confirma. Nada se agrega a ciegas (mucho menos algo
 * que leyó una IA de una letra manuscrita).
 */
import { useCallback, useRef, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { AlertTriangle, Camera, Check, Download, FileSpreadsheet, Loader2, Sparkles, Upload } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { csrfHeaders } from "@/lib/csrf-client";
import { Btn, MODAL_BODY, ModalFooter } from "./ctp-shared";
import { parsearFilasTrozas, interpretarOcrTrozas, type TrozaImportada, type ResultadoImportTrozas } from "@/lib/forestal/cubicacion-trozas-import";
import { leerArchivoAFilas } from "@/lib/forestal/cubicacion-import-file";
import { descargarPlantillaTrozas } from "@/lib/forestal/cubicacion-trozas-excel";

const fmtM3 = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

function leerComoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("No se pudo leer la imagen"));
    fr.readAsDataURL(file);
  });
}

export default function ImportarTrozasModal({
  onAgregar, onCerrar, filasActuales = 0, especiesActuales = [],
}: {
  /** Suma las trozas leídas al patio. */
  onAgregar: (trozas: TrozaImportada[]) => void;
  onCerrar: () => void;
  /** Trozas que YA tiene el patio — se muestra que la importación se suma a ellas. */
  filasActuales?: number;
  /** Especies ya cubicadas en el patio — se suman al catálogo de la plantilla. */
  especiesActuales?: string[];
}) {
  const [modo, setModo] = useState<"excel" | "foto">("excel");
  const [resultado, setResultado] = useState<ResultadoImportTrozas | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [advertenciaIA, setAdvertenciaIA] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const procesar = useCallback(async (file: File) => {
    setCargando(true);
    setErrorGeneral(null);
    setResultado(null);
    setNombreArchivo(file.name);
    try {
      const filas = await leerArchivoAFilas(file);
      setResultado(parsearFilasTrozas(filas));
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
      const r = await fetch("/api/admin/forestal/cubicacion-ocr/trozas", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ image: dataUrl }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
      setResultado(interpretarOcrTrozas(j.trozas ?? []));
      if (j.advertencia) setAdvertenciaIA(String(j.advertencia));
    } catch (e) {
      setErrorGeneral(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, []);

  const [bajando, setBajando] = useState(false);
  const descargarPlantilla = () => {
    setBajando(true);
    descargarPlantillaTrozas(especiesActuales)
      .catch(() => setErrorGeneral("No se pudo generar la plantilla. Probá de nuevo."))
      .finally(() => setBajando(false));
  };

  const totalM3 = resultado?.trozas.reduce((a, t) => a + t.m3, 0) ?? 0;
  const raras = resultado?.trozas.filter((t) => t.sospechosa).length ?? 0;
  /** Lo que hay para agregar, ya leído: `null` mientras no haya nada. */
  const listas = resultado && !cargando && resultado.trozas.length > 0 ? resultado.trozas : null;

  return (
    <AdminModal
      open
      onClose={onCerrar}
      variant="wide"
      title={modo === "excel" ? "Importar trozas desde Excel" : "Escanear planilla de trozas"}
      description={modo === "excel" ? "Especie · D1 · D2 · Largo" : "Foto de la planilla de patio, leída con IA"}
      icon={modo === "excel" ? FileSpreadsheet : Camera}
      footer={
        <ModalFooter
          error={errorGeneral}
          nota={listas ? `${listas.length} troza(s) · ${fmtM3(totalM3)} m³${raras > 0 ? ` · ${raras} con medidas raras` : ""}` : undefined}
        >
          <Btn variant="ghost" onClick={onCerrar}>Cancelar</Btn>
          {listas && (
            <Btn variant="dark" onClick={() => { onAgregar(listas); onCerrar(); }}>
              <Check className="h-4 w-4" /> Agregar {listas.length} al patio
              {filasActuales > 0 ? ` (quedará con ${filasActuales + listas.length})` : ""}
            </Btn>
          )}
        </ModalFooter>
      }
    >
      <div className={MODAL_BODY}>
        <SegmentedControl
          value={modo}
          onChange={(v) => { setModo(v); setResultado(null); setErrorGeneral(null); setAdvertenciaIA(null); setFotoUrl(null); setNombreArchivo(""); }}
          label="Origen de las trozas"
          className="mb-3"
          options={[
            { value: "excel", label: "Desde Excel", icon: <FileSpreadsheet className="h-4 w-4" /> },
            { value: "foto", label: "Desde foto", icon: <Camera className="h-4 w-4" /> },
          ]}
        />

        {modo === "excel" ? (
          <p className="mb-3 text-sm text-[var(--text-secondary)]">
            El archivo tiene que tener las columnas <b>Especie · D1 (cm) · D2 (cm) · Largo (m)</b> (Especie y D2 opcionales — sin D2 se asume troza pareja). D1/D2 en centímetros, largo en metros. La plantilla trae, al lado, un <b>resumen por especie en vivo</b> (trozas · m³) que se calcula solo mientras vas llenando.
          </p>
        ) : (
          <p className="mb-3 text-sm text-[var(--text-secondary)]">
            Sacale una foto (o subí una) a la planilla de trozas escrita a mano en patio — con diámetro menor, diámetro mayor y largo por fila. La IA lee la letra y arma la lista; <b>vos la revisás</b> contra la foto antes de sumarla al patio. Las filas donde la IA no estuvo segura salen resaltadas.
          </p>
        )}

        {filasActuales > 0 && (
          <p className="mb-3 flex items-center gap-2 rounded-xl border border-[var(--accent)]/40 bg-primary/10 px-3 py-2 text-sm font-semibold text-[var(--accent)]">
            <Check className="h-4 w-4 shrink-0" />
            Ya tenés <b>{filasActuales}</b> {filasActuales === 1 ? "troza" : "trozas"} en el patio. Lo que importes se <b>suma</b> — no se borra nada de lo anterior.
          </p>
        )}

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
        ) : (
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
        )}

        {cargando && (
          <p className="mt-4 flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" /> {modo === "excel" ? "Leyendo el archivo…" : "Leyendo la foto con IA…"}
          </p>
        )}

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

        {advertenciaIA && !cargando && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-3 py-2 text-xs font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {advertenciaIA}
          </p>
        )}

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

            {resultado.trozas.length > 0 ? (
              <div className="max-h-56 overflow-auto rounded-xl border border-[var(--rule-base)]">
                <DataTable className="w-full min-w-[420px] text-sm">
                  <thead className="sticky top-0 bg-[var(--surface-sunken)]">
                    <tr className="text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                      <th className="px-3 py-2">Ø menor/mayor</th><th className="px-3 py-2">Largo</th><th className="px-3 py-2">Especie</th><th className="px-3 py-2 text-right">m³</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.trozas.map((t) => (
                      <tr key={t.id} className={`border-t border-[var(--rule-soft)] ${t.sospechosa ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/12" : ""}`}>
                        <td className="px-3 py-1.5 font-mono font-bold tabular-nums text-[var(--text-primary)]">
                          {t.d1}/{t.d2} cm
                          {t.sospechosa && <AlertTriangle className="ml-1 inline h-3 w-3 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" />}
                        </td>
                        <td className="px-3 py-1.5 font-mono tabular-nums text-[var(--text-secondary)]">{t.largo} m</td>
                        <td className="px-3 py-1.5 text-[var(--text-secondary)]">{t.especie ?? "—"}</td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[var(--text-primary)]">{fmtM3(t.m3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </div>
            ) : resultado.errores.length > 0 ? null : (
              <p className="py-4 text-center text-sm text-[var(--text-tertiary)]">
                {modo === "excel" ? "El archivo no tiene trozas para importar." : "No se identificó ninguna troza en la foto."}
              </p>
            )}
          </div>
        )}
      </div>
    </AdminModal>
  );
}
