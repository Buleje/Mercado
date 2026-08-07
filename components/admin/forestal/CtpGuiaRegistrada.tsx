"use client";

/**
 * Lo que pasa DESPUÉS de registrar la guía (ADR-362).
 *
 * Registrar y imprimir son el mismo acto para el que despacha: el camión no sale
 * sin el papel. Antes había que cerrar el alta, buscar la línea en la tabla,
 * abrir su ficha y recién ahí imprimir — con una guía de cinco productos, cinco
 * fichas para un solo viaje.
 *
 * Acá la hoja sale con el detalle (37) completo: los N productos de la lista,
 * su cadena de custodia agrupada por corrida y el total movilizado. Y se archiva
 * sola en el expediente, como la del ingreso.
 */

import { useState } from "react";
import { Check, FileText, Loader2, Printer } from "@buleje/design-system/icons";
import { documentoGtfSalida } from "@/lib/forestal/ctp-gtf-print";
import { documentoHtml } from "@/lib/forestal/ctp-documento-print";
import { cadenaDeGuia, despachoDeGuia, lineasDeGuia } from "@/lib/forestal/guia-desde-lista";
import { faltantesGtf, type GtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { volumenTotal, type FilaDespacho } from "@/lib/forestal/despacho-lista";
import { hayNovedades } from "@/lib/forestal/ctp-cola-archivado";
import type { FichaCtp } from "@/hooks/use-ficha-ctp";
import CtpDocumentoVisor, { type DocumentoImprimible } from "./CtpDocumentoVisor";
import CtpArchivadorAuto, { type GuiaParaArchivar } from "./CtpArchivadorAuto";
import { Btn } from "./ctp-shared";

export default function CtpGuiaRegistrada({
  lineas,
  filas,
  cabecera,
  gtfNumber,
  emision,
  datos,
  ficha,
}: {
  /** Cuántas líneas del libro quedaron registradas. */
  lineas: number;
  /** La lista tal como se registró — es lo que va al detalle (37) del papel. */
  filas: FilaDespacho[];
  /** Primera línea creada: ancla el QR de verificación pública. */
  cabecera: { id: string; lineNo: number } | null;
  gtfNumber: string;
  emision: string;
  datos: GtfDatos;
  ficha: FichaCtp | null;
}) {
  /** La hoja armada queda: cerrar el visor no obliga a volver a generarla. */
  const [hoja, setHoja] = useState<DocumentoImprimible | null>(null);
  const [verVisor, setVerVisor] = useState(false);
  const [cola, setCola] = useState<GuiaParaArchivar[]>([]);
  const [archivada, setArchivada] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const faltan = faltantesGtf(datos);
  const total = volumenTotal(filas);

  async function imprimir() {
    if (!cabecera) { setError("No se pudo identificar la línea registrada para verificar la guía."); return; }
    setGenerando(true);
    setError(null);
    try {
      const d = await documentoGtfSalida(
        despachoDeGuia(filas, { ...cabecera, entryDate: emision, gtfNumber, destino: datos.destinatario.nombre || null }),
        ficha ?? {},
        cadenaDeGuia(filas),
        datos,
        lineasDeGuia(filas),
      );
      const html = documentoHtml({ titulo: d.titulo, css: d.css, cuerpo: d.cuerpos, pieCorrido: d.pieCorrido });
      /* No se dispara la impresión: se abre el visor. Original + 2 copias son
         tres hojas — conviene mirarlas antes de gastar el papel. */
      setHoja({ nombre: d.titulo, archivo: d.titulo, etiqueta: "Original + 2 copias (art. 5)", pieCorrido: d.pieCorrido, html });
      setVerVisor(true);
      setArchivada(null);
      setCola([{
        clave: `${cabecera.id}:${d.titulo}`,
        nombre: d.titulo,
        html,
        pieCorrido: d.pieCorrido,
        etiquetas: ["forestal", "GTF", "salida", gtfNumber].filter((t) => Boolean(t.trim())),
        descripcion: `${d.titulo} emitida por el CTP — ${lineas} ${lineas === 1 ? "producto" : "productos"}, ${total.toFixed(4)} m³${datos.destinatario.nombre ? `, destino ${datos.destinatario.nombre}` : ""}.`,
      }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border-2 border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] p-5 dark:bg-[var(--data-success-500)]/10">
        <p className="flex items-center gap-2 text-base font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
          <Check className="h-5 w-5 shrink-0" />
          Guía {gtfNumber} registrada — {lineas} {lineas === 1 ? "línea" : "líneas"} en el libro
        </p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {total.toFixed(4)} m³ con su cadena de custodia declarada. Ya se puede emitir el anexo 04 y el
          certificado desde la ficha de cada despacho.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Btn variant="dark" disabled={generando || faltan.length > 0} onClick={() => void imprimir()}>
            {generando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            {hoja ? "Volver a armar la guía" : "Imprimir la guía (3 copias)"}
          </Btn>
          {hoja && !verVisor && (
            <Btn variant="secondary" onClick={() => setVerVisor(true)}>
              <FileText className="h-4 w-4" /> Ver la hoja otra vez
            </Btn>
          )}
        </div>

        {/* Guardar admite huecos; el papel que se muestra en un control, no. */}
        {faltan.length > 0 && (
          <p className="mt-2 text-sm font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            Para imprimir el original falta{faltan.length === 1 ? "" : "n"}: {faltan.map((f) => f.campo).join(", ")}.
            Se completa en la pestaña de datos o después, desde la ficha del despacho.
          </p>
        )}
        {archivada && <p className="mt-2 text-sm font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">{archivada}</p>}
        {error && (
          <p role="alert" className="mt-2 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>
        )}
      </div>

      {hoja && verVisor && (
        <CtpDocumentoVisor
          documentos={[hoja]}
          activo={0}
          onActivo={() => {}}
          onClose={() => setVerVisor(false)}
        />
      )}

      {cola.length > 0 && (
        <CtpArchivadorAuto
          cola={cola}
          onFin={(r) => {
            setCola([]);
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
    </div>
  );
}
