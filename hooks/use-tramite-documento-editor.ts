"use client";

/**
 * use-tramite-documento-editor — cablea "editar en el mismo documento"
 * (ADR-364 ronda 7, Brandon 2026-08-20: "que se pueda editar en el mismo
 * documento, ojo sólo los datos a rellenar"). El HTML ya viene armado por
 * `buildTramiteHtml({ editable: true })`: cada dato rellenable es un
 * `<span data-campo="<id>" contenteditable>` — nunca el cuerpo redactado ni
 * la base legal, que siguen siendo texto fijo.
 *
 * Requiere `sandbox="allow-same-origin"` en el `<iframe srcDoc>` (SIN
 * `allow-scripts`: el documento no corre ningún `<script>` propio, todo pasa
 * por `esc()`). Con ese permiso el padre lee/escribe `contentDocument` como
 * si fuera DOM propio — el mismo patrón que ya usa `TramiteDocumentoModal`
 * para medir el alto natural del papel.
 *
 * El problema clásico de "controlled contenteditable": el preview normal
 * recarga el `srcDoc` en cada tecla (así refleja al vuelo los párrafos
 * redactados que dependen de otros campos). Pero recargar el iframe MIENTRAS
 * el usuario edita un `contenteditable` adentro le patea el cursor a la
 * primera letra. Por eso el reload se DIFIERE mientras hay foco dentro del
 * documento, y se aplica recién cuando el foco sale (blur).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormatoTramite } from "@/lib/forestal/tramites-catalogo";

export function useTramiteDocumentoEditor({
  iframeRef,
  html,
  formato,
  onCampoChange,
}: {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  /** El HTML completo para este render (con o sin `editable`). */
  html: string;
  formato: FormatoTramite;
  /** Si no se pasa, el documento queda de sólo lectura: no se atan listeners
   *  ni se difiere el reload (nada que proteger). */
  onCampoChange?: (id: string, valor: string) => void;
}) {
  const [srcDoc, setSrcDoc] = useState(html);
  const pendienteRef = useRef(html);
  pendienteRef.current = html;

  const focoDentro = useCallback((): boolean => {
    const doc = iframeRef.current?.contentDocument;
    return Boolean(doc?.activeElement && doc.activeElement !== doc.body);
  }, [iframeRef]);

  useEffect(() => {
    if (onCampoChange && focoDentro()) return; // no interrumpir mientras se tipea en el papel
    setSrcDoc(html);
    // `focoDentro` es estable (sólo depende del ref); repetirlo en deps no
    // aporta y dispara el efecto de más.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, onCampoChange]);

  const onLoad = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc || !onCampoChange) return;
    doc.querySelectorAll<HTMLElement>("[data-campo]").forEach((el) => {
      const id = el.dataset.campo;
      if (!id) return;
      const multilinea = formato.campos.find((c) => c.id === id)?.tipo === "textarea";
      el.addEventListener("input", () => onCampoChange(id, (el.innerText ?? "").replace(/\n+$/, "")));
      if (!multilinea) {
        el.addEventListener("keydown", (e) => {
          if (e.key === "Enter") e.preventDefault();
        });
      }
      // Al salir del campo (y del documento entero) puede haber quedado un
      // cambio sin aplicar — `setTimeout` deja que el foco termine de moverse
      // antes de decidir si ya salió del iframe (si no, un Tab entre dos
      // campos del MISMO papel dispararía un reload a mitad de camino).
      el.addEventListener("blur", () => {
        setTimeout(() => {
          if (!focoDentro()) setSrcDoc(pendienteRef.current);
        }, 0);
      });
    });
  }, [iframeRef, onCampoChange, formato, focoDentro]);

  return { srcDoc, onLoad };
}
