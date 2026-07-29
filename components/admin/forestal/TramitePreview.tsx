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
 */

import { useMemo } from "react";
import { FileText } from "@buleje/design-system/icons";
import { buildTramiteHtml, TRAMITE_PREVIEW_CSS } from "@/lib/forestal/tramites-print";
import type { DatosTramite, FormatoTramite } from "@/lib/forestal/tramites-catalogo";
import type { CtpReportFicha } from "@/lib/forestal/ctp-print-shared";

export default function TramitePreview({
  formato,
  datos,
  ficha,
  className = "",
}: {
  formato: FormatoTramite;
  datos: DatosTramite;
  ficha: CtpReportFicha | null;
  className?: string;
}) {
  const srcDoc = useMemo(() => {
    const body = buildTramiteHtml({ formato, datos, ficha });
    // `zoom` en vez de `transform: scale`: no descuadra el alto del documento y
    // el texto sigue seleccionable a tamaño real al imprimir.
    return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<style>${TRAMITE_PREVIEW_CSS}
  html{background:#fff}
  body{zoom:.82;padding:26px 30px;max-width:none}
  .aviso{display:none}
</style></head><body>${body}</body></html>`;
  }, [formato, datos, ficha]);

  return (
    <div className={`overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] ${className}`}>
      <div className="flex items-center gap-2 border-b-2 border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-2.5">
        <FileText className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden="true" />
        <span className="text-sm font-bold text-[var(--text-primary)]">Así se va a presentar</span>
        <span className="ml-auto text-xs text-[var(--text-tertiary)]">se actualiza mientras escribís</span>
      </div>
      <iframe
        title={`Previsualización: ${formato.nombre}`}
        srcDoc={srcDoc}
        // Sin `allow-scripts`: es un documento de texto, no tiene por qué correr
        // nada. Con sandbox vacío hereda un origen opaco y no toca la app.
        sandbox=""
        className="h-[62vh] w-full bg-white"
      />
    </div>
  );
}
