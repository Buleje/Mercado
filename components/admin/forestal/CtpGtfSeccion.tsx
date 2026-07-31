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
import { printGtfSalida, type GtfCadena, type GtfDespacho } from "@/lib/forestal/ctp-gtf-print";
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
      await printGtfSalida({ ...despacho, gtfNumber: gtf }, ficha, cadena, datos);
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
      <div className="mb-2 flex items-center gap-2">
        <FileText className="h-4 w-4 text-[var(--text-tertiary)]" />
        <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">GTF de salida</CardTitle>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">N° de guía</p>
          <p className="mt-0.5 font-mono text-base font-bold tabular-nums text-[var(--text-primary)]">{gtf || "— sin emitir —"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
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
