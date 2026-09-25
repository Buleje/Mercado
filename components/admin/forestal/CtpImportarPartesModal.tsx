"use client";

/**
 * Traer el Directorio desde una planilla.
 *
 * Quien ya lleva sus proveedores en un Excel no los va a recargar de a uno en
 * un formulario de veinte campos. Acá se lee el archivo, se muestra **qué va a
 * pasar con cada fila** y recién después se guarda: la lección del importador
 * de trozas fue que 51 filas descartadas en silencio parecen una importación
 * perfecta hasta que alguien cuenta el patio.
 *
 * Lo que se ve antes de confirmar: cuántas se crean, cuántas actualizan una
 * ficha que ya existe, cuáles no entran y por qué, y qué columnas del archivo
 * no se entendieron.
 */

import { useRef, useState } from "react";
import { AlertTriangle, Check, Download, FileSpreadsheet, Loader2, Upload } from "@buleje/design-system/icons";
import { DataTable } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { leerArchivoAFilas } from "@/lib/forestal/cubicacion-import-file";
import {
  interpretarFilasDePartes,
  plantillaDePartesCsv,
  type ResultadoLecturaPartes,
} from "@/lib/forestal/directorio-importar";
import type { Parte, ParteInput, RolParte } from "@/lib/forestal/directorio";
import { Btn, ModalFooter, ModalBody } from "./ctp-shared";

export default function CtpImportarPartesModal({
  existentes,
  rol,
  onImportar,
  onClose,
}: {
  existentes: readonly Parte[];
  /** Rol de la pestaña desde la que se abrió: el que se usa si el archivo no lo trae. */
  rol: RolParte;
  onImportar: (input: ParteInput) => Promise<unknown>;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datos, setDatos] = useState<ResultadoLecturaPartes | null>(null);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [hechas, setHechas] = useState(0);
  const [fallidas, setFallidas] = useState<string[]>([]);
  const [listo, setListo] = useState(false);

  async function elegir(file: File) {
    setLeyendo(true);
    setError(null);
    setListo(false);
    try {
      const filas = await leerArchivoAFilas(file);
      setDatos(interpretarFilasDePartes(filas, existentes, rol));
      setArchivo(file.name);
    } catch (e) {
      setError(`No se pudo leer el archivo: ${e instanceof Error ? e.message : String(e)}. Prueba con un .xlsx o .csv.`);
      setDatos(null);
    } finally {
      setLeyendo(false);
    }
  }

  function bajarPlantilla() {
    const blob = new Blob([plantillaDePartesCsv()], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "directorio-plantilla.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * De a una y en orden: cada alta puede fusionarse con una ficha existente por
   * documento, y mandarlas todas juntas haría que dos filas del mismo titular
   * compitan por la misma fila de la base.
   */
  async function importar() {
    if (!datos || guardando) return;
    setGuardando(true);
    setHechas(0);
    setFallidas([]);
    const malas: string[] = [];
    for (const f of datos.listas) {
      try {
        await onImportar(f.input);
        setHechas((n) => n + 1);
      } catch (e) {
        malas.push(`${f.input.nombre}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setFallidas(malas);
    setGuardando(false);
    setListo(true);
  }

  const aCrear = datos?.listas.filter((f) => f.accion === "crear").length ?? 0;
  const aActualizar = datos?.listas.filter((f) => f.accion === "actualizar").length ?? 0;

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Traer el Directorio de una planilla"
      description={archivo ?? "Un .xlsx o .csv con una fila por parte"}
      icon={FileSpreadsheet}
      variant="info"
      footer={
        <ModalFooter>
          <Btn variant="ghost" onClick={onClose}>
            {listo ? "Cerrar" : "Cancelar"}
          </Btn>
          {!listo && (
            <Btn variant="primary" disabled={!datos || datos.listas.length === 0 || guardando} onClick={() => void importar()}>
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {guardando ? `Guardando ${hechas} de ${datos?.listas.length ?? 0}…` : `Importar ${datos?.listas.length ?? 0}`}
            </Btn>
          )}
        </ModalFooter>
      }
    >
      <ModalBody>
        <div className="col-span-12 flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void elegir(f);
              e.target.value = "";
            }}
          />
          <Btn variant="secondary" onClick={() => fileRef.current?.click()} disabled={leyendo || guardando}>
            {leyendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Elegir archivo
          </Btn>
          <Btn variant="ghost" onClick={bajarPlantilla}>
            <Download className="h-4 w-4" />
            Bajar la plantilla
          </Btn>
          <span className="text-xs text-[var(--text-tertiary)]">
            El encabezado puede decir «RAZON SOCIAL» o «RUC/DNI»: se reconocen los nombres usuales.
          </span>
        </div>

        {error && (
          <p role="alert" className="col-span-12 rounded-xl border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-3 py-2 text-sm text-[var(--data-error-700)]">
            {error}
          </p>
        )}

        {datos && (
          <div className="col-span-12 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2">
            <span className="text-sm text-[var(--text-primary)]">
              <b className="font-mono tabular-nums">{aCrear}</b> se agregan
            </span>
            <span className="text-sm text-[var(--text-primary)]">
              <b className="font-mono tabular-nums">{aActualizar}</b> actualizan una ficha que ya existe
            </span>
            {datos.errores.length > 0 && (
              <span className="text-sm font-semibold text-[var(--data-error-700)]">
                <b className="font-mono tabular-nums">{datos.errores.length}</b> no entran
              </span>
            )}
            {datos.columnasIgnoradas.length > 0 && (
              <span className="w-full text-xs text-[var(--text-tertiary)]">
                Columnas que no se usaron: {datos.columnasIgnoradas.join(", ")}.
              </span>
            )}
          </div>
        )}

        {datos && datos.errores.length > 0 && (
          <div className="col-span-12 rounded-xl border border-[var(--data-error-100)] bg-[var(--data-error-50)] p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-[var(--data-error-700)]">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              Estas filas no se van a importar
            </p>
            <ul className="max-h-36 space-y-1 overflow-y-auto text-sm text-[var(--data-error-700)]">
              {datos.errores.map((e) => (
                <li key={`${e.linea}-${e.nombre}`}>
                  <span className="font-mono tabular-nums">Fila {e.linea}</span> · {e.nombre} — {e.motivo}
                </li>
              ))}
            </ul>
          </div>
        )}

        {datos && datos.listas.length > 0 && (
          <div className="col-span-12 max-h-72 overflow-y-auto rounded-xl border border-[var(--rule-soft)]">
            <DataTable className="w-full text-sm">
              <caption className="sr-only">Qué va a pasar con cada fila del archivo</caption>
              <thead className="sticky top-0 bg-[var(--surface-sunken)] text-left text-xs uppercase tracking-[var(--ls-wide)] text-[var(--text-tertiary)]">
                <tr>
                  <th scope="col" className="px-3 py-2 font-bold">Nombre</th>
                  <th scope="col" className="px-3 py-2 font-bold">Documento</th>
                  <th scope="col" className="px-3 py-2 font-bold">Papel</th>
                  <th scope="col" className="px-3 py-2 font-bold">Qué va a pasar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {datos.listas.map((f) => (
                  <tr key={f.linea}>
                    <td className="px-3 py-1.5 text-[var(--text-primary)]">
                      {f.input.nombre}
                      {f.aviso && <span className="block text-xs text-[var(--data-warning-700)]">{f.aviso}</span>}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                      {f.input.docNumero ? `${f.input.docTipo ?? ""} ${f.input.docNumero}` : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-[var(--text-secondary)]">{f.input.roles.join(", ")}</td>
                    <td className="px-3 py-1.5">
                      {f.accion === "actualizar" ? (
                        <span className="text-[var(--data-info-700)]">Actualiza «{f.coincide?.nombre}»</span>
                      ) : (
                        <span className="text-[var(--data-success-700)]">Se agrega</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        )}

        {listo && (
          <div className="col-span-12 rounded-xl border border-[var(--data-success-100)] bg-[var(--data-success-50)] px-3 py-2">
            <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--data-success-700)]">
              <Check className="h-4 w-4" aria-hidden="true" />
              {hechas} {hechas === 1 ? "ficha guardada" : "fichas guardadas"}
            </p>
            {fallidas.length > 0 && (
              <ul className="mt-1 max-h-28 space-y-0.5 overflow-y-auto text-sm text-[var(--data-error-700)]">
                {fallidas.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </ModalBody>
    </AdminModal>
  );
}
