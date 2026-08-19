"use client";

/**
 * CtpGtfSeccion — emitir, completar e imprimir la Guía de Transporte Forestal de
 * salida de un despacho.
 *
 * Antes acá sólo vivía el número: se emitía serie-correlativo y se imprimía una
 * hoja con el producto. Un puesto de control no compara eso — compara la placa
 * contra la carga, el destinatario y el título con el que salió la madera. Esos
 * datos ahora se capturan (`CtpGtfDatosForm`) y viajan al PDF.
 *
 * Guardar admite huecos; IMPRIMIR el original no (`faltantesGtf`).
 */

import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { ChevronDown, FileText, Loader2, Printer } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { documentoGtfSalida, type GtfCadena, type GtfDespacho } from "@/lib/forestal/ctp-gtf-print";
import { documentoHtml } from "@/lib/forestal/ctp-documento-print";
import CtpDocumentoVisor, { type DocumentoImprimible } from "./CtpDocumentoVisor";
import CtpArchivadorAuto, { type GuiaParaArchivar } from "./CtpArchivadorAuto";
import { hayNovedades } from "@/lib/forestal/ctp-cola-archivado";
import { gtfCompleta, leerGtfDatos, type GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import type { FichaCtp } from "@/hooks/use-ficha-ctp";
import CtpGtfDatosForm from "./CtpGtfDatosForm";
import { Btn } from "./ctp-shared";

export default function CtpGtfSeccion({
  despacho,
  ficha,
  cadena,
  citesPermiso,
  gtfDatosGuardado,
}: {
  despacho: GtfDespacho;
  ficha: FichaCtp | null;
  cadena: GtfCadena | null;
  /** Permiso CITES del ingreso, si la especie lo requiere. */
  citesPermiso?: string | null;
  /** JSON crudo de la base: lo valida `leerGtfDatos` adentro del formulario. */
  gtfDatosGuardado: unknown;
}) {
  // El N° puede cambiar al emitir (texto libre → serie-correlativo), así que vive
  // en estado local sembrado con el del despacho.
  const [gtf, setGtf] = useState<string | null>(despacho.gtfNumber);
  const [busy, setBusy] = useState<null | "emitir" | "imprimir">(null);
  const [error, setError] = useState<string | null>(null);
  // Abierto de una si la guía ya tiene número: lo siguiente es completarla.
  const [abierto, setAbierto] = useState<boolean>(Boolean(despacho.gtfNumber));
  /** La guía armada, esperando que la miren antes de imprimirla o archivarla. */
  const [documento, setDocumento] = useState<DocumentoImprimible | null>(null);
  /** La guía de salida también va sola al expediente, igual que las de ingreso. */
  const [colaArchivo, setColaArchivo] = useState<GuiaParaArchivar[]>([]);
  const [archivada, setArchivada] = useState<string | null>(null);

  const completos = leerGtfDatos(gtfDatosGuardado);
  const yaTieneDatos = Boolean(completos.propietario.nombre || completos.destinatario.nombre);

  async function emitir() {
    setBusy("emitir");
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/ctp", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        credentials: "include",
        body: JSON.stringify({ id: despacho.id, action: "emitir_gtf" }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.message ?? `HTTP ${r.status}`);
      setGtf(body.gtf);
      setAbierto(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  /** Persiste el cuerpo de la guía. `true` = guardado (lo dice el formulario). */
  async function guardarDatos(datos: GtfDatos): Promise<boolean> {
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/ctp", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        credentials: "include",
        body: JSON.stringify({ id: despacho.id, action: "gtf_datos", datos }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.message ?? `HTTP ${r.status}`);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  /**
   * Imprime con lo que hay en el formulario (no con lo último guardado): si el
   * operador corrigió la placa y todavía no guardó, el papel tiene que salir con
   * la placa corregida. El guardado es aparte, a un clic de distancia.
   */
  async function imprimir(datos: GtfDatos) {
    if (!gtf) throw new Error("Emití la GTF antes de imprimirla.");
    if (!ficha) throw new Error("Todavía no se pudo leer la Ficha del CTP. Reintentá en un momento.");
    setBusy("imprimir");
    try {
      const d = await documentoGtfSalida({ ...despacho, gtfNumber: gtf }, ficha, cadena, datos);
      // No se dispara la impresión: se abre el visor. El original y sus dos
      // copias son tres hojas — conviene mirarlas antes de gastar el papel.
      const html = documentoHtml({
        titulo: d.titulo,
        css: d.css,
        cuerpo: d.cuerpos,
        pieCorrido: d.pieCorrido,
      });
      setDocumento({
        nombre: d.titulo,
        archivo: d.titulo,
        etiqueta: "Original + 2 copias (art. 5)",
        pieCorrido: d.pieCorrido,
        html,
      });
      // Al expediente sin que nadie apriete nada: la guía que se imprime es la
      // constancia de lo que salió del CTP, y si depende de que alguien la
      // guarde, el mes que viene falta justo la que se pide.
      setArchivada(null);
      setColaArchivo([
        {
          clave: `${despacho.id}:${d.titulo}`,
          nombre: d.titulo,
          html,
          pieCorrido: d.pieCorrido,
          etiquetas: ["forestal", "GTF", "salida", gtf ?? "", despacho.speciesCommon ?? ""].filter(
            (t): t is string => Boolean(t && t.trim()),
          ),
          descripcion:
            `${d.titulo} emitida por el CTP — despacho línea #${despacho.lineNo}` +
            `${despacho.destino ? `, destino ${despacho.destino}` : ""}.`,
        },
      ]);
    } finally {
      setBusy(null);
    }
  }

  /** Atajo de la vista plegada: usa lo guardado y si falta algo abre el formulario. */
  async function imprimirGuardado() {
    if (!gtfCompleta(completos)) {
      setAbierto(true);
      setError("La guía todavía no está completa: revisá los datos marcados abajo.");
      return;
    }
    try {
      await imprimir(completos);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4">
      {/* Título, número y acciones en UNA banda: eran tres filas para tres datos
          que se leen de un vistazo, arriba de un formulario largo. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <FileText className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
        <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">GTF de salida</CardTitle>
        <p className="font-mono text-base font-bold tabular-nums text-[var(--text-primary)]">
          {gtf || <span className="font-sans text-sm font-normal text-[var(--text-tertiary)]">sin emitir</span>}
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          <Btn
            variant="secondary"
            onClick={() => void emitir()}
            disabled={busy !== null}
            title="Asigna serie + correlativo desde la serie autorizada en la Ficha del CTP"
          >
            {busy === "emitir" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {gtf ? "Re-emitir" : "Emitir GTF"}
          </Btn>
          <Btn variant="secondary" onClick={() => setAbierto((v) => !v)} disabled={!gtf} aria-expanded={abierto}>
            <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`} />
            {abierto ? "Ocultar datos" : yaTieneDatos ? "Ver datos de la guía" : "Completar la guía"}
          </Btn>
        </div>
      </div>

      {archivada && (
        <p className="mt-2 text-sm font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
          {archivada}
        </p>
      )}

      {!gtf && (
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">
          Emití la guía para poder cargar propietario, destinatario, transportista y traslado.
        </p>
      )}
      {/* `-700` no llega a AA sobre el canvas dark: en dark se usa `-500`. */}
      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}

      {abierto && gtf && (
        <div className="mt-3 border-t-2 border-[var(--rule-soft)] pt-3">
          <CtpGtfDatosForm
            guardado={gtfDatosGuardado}
            auto={{
              ficha,
              destino: despacho.destino,
              citesPermiso,
              // `entryDate` es date-only en UTC: el slice evita el off-by-one Lima.
              fechaDespacho: despacho.entryDate.slice(0, 10),
            }}
            onGuardar={guardarDatos}
            onImprimir={imprimir}
            imprimiendo={busy === "imprimir"}
          />
        </div>
      )}

      {colaArchivo.length > 0 && (
        <CtpArchivadorAuto
          cola={colaArchivo}
          onFin={(r) => {
            setColaArchivo([]);
            if (!hayNovedades(r)) return;
            setArchivada(
              r.fallidas > 0
                ? "No se pudo guardar en el expediente — se puede hacer a mano desde el visor."
                : r.guardadas > 0
                  ? "Guardada en el expediente (Documentos › Guías forestales)."
                  : "Ya estaba en el expediente.",
            );
          }}
        />
      )}

      {documento && (
        <CtpDocumentoVisor
          documentos={[documento]}
          activo={0}
          onActivo={() => {}}
          onArchivar={(d) => ({
            etiquetas: ["forestal", "GTF", "salida", gtf ?? "", despacho.speciesCommon ?? ""].filter(
              (t): t is string => Boolean(t && t.trim()),
            ),
            descripcion:
              `${d.nombre} emitida por el CTP — despacho línea #${despacho.lineNo}` +
              `${despacho.destino ? `, destino ${despacho.destino}` : ""}.`,
          })}
          onClose={() => setDocumento(null)}
        />
      )}

      {/*
        Atajo con la guía plegada: imprime lo GUARDADO. Si está incompleta no tira
        un error suelto — abre el formulario, que es donde dice qué falta.
      */}
      {!abierto && gtf && (
        <div className="mt-3 flex justify-end border-t-2 border-[var(--rule-soft)] pt-3">
          <Btn variant="dark" onClick={() => void imprimirGuardado()} disabled={busy !== null}>
            {busy === "imprimir" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            Imprimir GTF
          </Btn>
        </div>
      )}
    </section>
  );
}
