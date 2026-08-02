"use client";

/**
 * Ver, imprimir y descargar un documento del libro sin salir del panel.
 *
 * Antes el único camino era "Imprimir", que abría una ventana nueva y disparaba
 * el diálogo del sistema de una: para MIRAR si la guía salió bien había que
 * cancelar el diálogo, y para guardarla en el expediente había que pasar por
 * "Imprimir a PDF". Acá se ve primero y se decide después.
 *
 * Es un overlay propio y NO un `AdminModal`: la lista se abre desde el detalle
 * del ingreso, que ya es un modal, y dos AdminModal montados a la vez se pisan
 * —el segundo no llegaba a dibujarse—. Por eso también va sobre `z-[70]`: el
 * backdrop del modal padre vive en z-50 y le ganaría.
 *
 * El documento se renderiza en un `<iframe srcDoc>` y no inyectado en la página:
 * su CSS es de impresión —bordes de 1px, Arial, tamaños en puntos— y sin el
 * aislamiento del iframe se mezclaría con los tokens del panel, que es
 * justamente lo que haría que lo impreso no se parezca a lo que se vio.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Download, Printer, X } from "@buleje/design-system/icons";

export interface DocumentoImprimible {
  /** Nombre del archivo al descargar, sin extensión. */
  nombre: string;
  /** Documento completo (`<!doctype html>…`), autocontenido. */
  html: string;
}

export default function CtpDocumentoVisor({
  documentos,
  activo,
  onActivo,
  onClose,
}: {
  /** Uno o varios: la GTF y su lista de trozas son dos hojas del mismo trámite. */
  documentos: DocumentoImprimible[];
  activo: number;
  onActivo: (i: number) => void;
  onClose: () => void;
}) {
  const marco = useRef<HTMLIFrameElement>(null);
  const doc = documentos[activo] ?? documentos[0];

  const imprimir = useCallback(() => {
    // Se imprime el iframe, no la página: lo que se ve es exactamente lo que
    // sale, sin arrastrar el panel de alrededor.
    const w = marco.current?.contentWindow;
    if (!w) return;
    w.focus();
    w.print();
  }, []);

  const descargar = useCallback(() => {
    if (!doc) return;
    const blob = new Blob([doc.html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.nombre}.html`;
    a.click();
    // Se libera tarde a propósito: revocarlo en el mismo tick cancela la
    // descarga en algunos navegadores antes de que arranque.
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, [doc]);

  const srcDoc = useMemo(() => doc?.html ?? "", [doc]);

  // Escape cierra, como cualquier capa del panel.
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-3 sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={doc?.nombre ?? "Documento"}
    >
      <div className="flex h-[min(92vh,58rem)] w-full max-w-[64rem] flex-col overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <header className="flex items-center gap-3 border-b-2 border-[var(--rule-base)] px-4 py-3">
          <Printer className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-[var(--text-primary)]">{doc?.nombre ?? "Documento"}</p>
            <p className="text-sm text-[var(--text-secondary)]">Revisalo antes de imprimir o guardarlo en el expediente</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border-2 border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* Con un solo documento no se dibujan pestañas: una pestaña sola es
              un adorno que hace pensar que falta algo. */}
          {documentos.length > 1 &&
            documentos.map((d, i) => (
              <button
                key={d.nombre}
                type="button"
                onClick={() => onActivo(i)}
                aria-pressed={i === activo}
                className={`inline-flex h-11 items-center rounded-2xl border-2 px-4 text-base font-bold transition-colors ${
                  i === activo
                    ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
                }`}
              >
                {d.nombre}
              </button>
            ))}

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={descargar}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-base font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]"
            >
              <Download className="h-4 w-4" aria-hidden /> Descargar
            </button>
            <button
              type="button"
              onClick={imprimir}
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark)] px-5 text-base font-bold text-white transition hover:brightness-110"
            >
              <Printer className="h-4 w-4" aria-hidden /> Imprimir / PDF
            </button>
          </div>
        </div>

        <iframe
          ref={marco}
          title={doc?.nombre ?? "Documento"}
          srcDoc={srcDoc}
          // `sandbox` sin `allow-scripts`: el documento es papel, no necesita JS,
          // y así un dato con HTML adentro no puede ejecutar nada.
          sandbox="allow-same-origin allow-modals"
          className="min-h-0 flex-1 rounded-xl border-2 border-[var(--rule-base)] bg-white"
        />

        <p className="text-sm text-[var(--text-tertiary)]">
          «Imprimir / PDF» abre el diálogo del sistema: desde ahí se elige la impresora o
          «Guardar como PDF». «Descargar» baja el documento tal cual para archivarlo.
        </p>
      </div>
      </div>
    </div>
  );
}
