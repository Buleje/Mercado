"use client";

/**
 * TramitePreview — el documento, mientras se llena.
 *
 * Antes había que imprimir para ver cómo quedaba: se abría una ventana, se
 * miraba, se cerraba, se corregía un campo y otra vez. Acá el papel se ve al
 * lado del formulario y se actualiza a cada tecla.
 *
 * Va en un `<iframe srcDoc>` a propósito: el CSS del documento es global (`body`,
 * `h1`, `table`) porque tiene que valer igual en la ventana de impresión.
 * Inyectarlo en la página pisaría el estilo del admin; el iframe lo aísla y
 * además muestra el ancho real de la hoja.
 *
 * Ronda 7 (Brandon 2026-08-20: "que se pueda editar en el mismo documento,
 * ojo sólo los datos a rellenar"): si se pasa `onCampoChange`, el papel se
 * arma con `editable:true` (spans `contenteditable` en membrete, destinatario,
 * asunto/referencia y firma — nunca el cuerpo redactado) y `sandbox` gana
 * `allow-same-origin` para que `useTramiteDocumentoEditor` pueda leer/escribir
 * su `contentDocument` desde acá. Sin `onCampoChange` queda de sólo lectura,
 * igual que antes.
 */

import { useMemo, useRef } from "react";
import { FileText, PencilLine } from "@buleje/design-system/icons";
import { buildTramiteHtml, TRAMITE_PREVIEW_CSS } from "@/lib/forestal/tramites-print";
import type { DatosTramite, FormatoTramite } from "@/lib/forestal/tramites-catalogo";
import type { CtpReportFicha } from "@/lib/forestal/ctp-print-shared";
import type { LogoTramite } from "@/lib/forestal/tramites-logo";
import { useTramiteDocumentoEditor } from "@/hooks/use-tramite-documento-editor";

export default function TramitePreview({
  formato,
  datos,
  ficha,
  numeroDocumento,
  logo,
  className = "",
  acciones,
  onCampoChange,
}: {
  formato: FormatoTramite;
  datos: DatosTramite;
  ficha: CtpReportFicha | null;
  /** N° de documento correlativo, si el formato lo lleva (ADR-364 ronda 3). */
  numeroDocumento?: string | null;
  /** Logo del membrete (ADR-364 ronda 6) — por tenant, no por trámite. */
  logo?: LogoTramite | null;
  className?: string;
  /** Botones extra en la cabecera (ver en pestaña, ver en grande…). */
  acciones?: React.ReactNode;
  /** Si se pasa, la hoja se puede editar tocando directamente sus datos
   *  rellenables (ADR-364 ronda 7) — sin esto queda de sólo lectura. */
  onCampoChange?: (id: string, valor: string) => void;
}) {
  const editable = Boolean(onCampoChange);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const html = useMemo(() => {
    const body = buildTramiteHtml({ formato, datos, ficha, numeroDocumento: numeroDocumento ?? undefined, logo, editable });
    // `zoom` en vez de `transform: scale`: no descuadra el alto del documento y
    // el texto sigue seleccionable a tamaño real al imprimir.
    return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<style>${TRAMITE_PREVIEW_CSS}
  html{background:#fff}
  body{zoom:.82;padding:26px 30px;max-width:none}
  .aviso{display:none}
</style></head><body>${body}</body></html>`;
  }, [formato, datos, ficha, numeroDocumento, logo, editable]);

  const { srcDoc, onLoad } = useTramiteDocumentoEditor({ iframeRef, html, formato, onCampoChange });

  return (
    <div className={`overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] ${className}`}>
      <div className="flex items-center gap-2 border-b-2 border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-2.5">
        <FileText className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden="true" />
        <span className="text-sm font-bold text-[var(--text-primary)]">Así se va a presentar</span>
        {editable && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
            <PencilLine className="h-3 w-3" aria-hidden="true" /> tocá el papel para editarlo
          </span>
        )}
        <span className="ml-auto text-xs text-[var(--text-tertiary)]">se actualiza mientras escribís</span>
        {acciones && <div className="flex items-center gap-1">{acciones}</div>}
      </div>
      <iframe
        ref={iframeRef}
        title={`Previsualización: ${formato.nombre}`}
        srcDoc={srcDoc}
        onLoad={onLoad}
        // `allow-same-origin` (sin `allow-scripts`) es lo mínimo para que el
        // padre pueda leer/escribir `contentDocument` cuando es editable — el
        // HTML es 100% estático (todo pasa por `esc()`), no hay nada que
        // ejecutar. Sin edición, sandbox vacío como antes (opaco, no toca la app).
        sandbox={editable ? "allow-same-origin" : ""}
        className="h-[62vh] w-full bg-white"
      />
    </div>
  );
}
