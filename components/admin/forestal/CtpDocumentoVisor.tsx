"use client";

/**
 * Ver, imprimir y descargar un documento del libro sin salir del panel.
 *
 * Antes el único camino era "Imprimir", que abría una ventana nueva y disparaba
 * el diálogo del sistema de una: para MIRAR si la guía salió bien había que
 * cancelar el diálogo, y para guardarla en el expediente había que pasar por
 * "Imprimir a PDF". Acá se ve primero y se decide después.
 *
 * ── Por qué se dibuja la HOJA y no el HTML estirado ──────────────────────────
 * El documento se estiraba al ancho del modal: se veía otra cosa que la impresa,
 * y el ancho de línea movía los cortes de página. Ahora se muestra a tamaño A4
 * real sobre una mesa de trabajo, con zoom propio y el conteo de hojas —como un
 * lector de PDF—. El truco es medir el alto del contenido dentro del iframe y
 * darle ESE alto: así el scroll lo hace el visor (una sola barra, la de afuera)
 * y el zoom es un `scale` sobre el marco, sin recargar el documento.
 *
 * Es un overlay propio y NO un `AdminModal`: la lista se abre desde el detalle
 * del ingreso, que ya es un modal, y dos AdminModal montados a la vez se pisan
 * —el segundo no llegaba a dibujarse—. Por eso también va sobre `z-[70]`: el
 * backdrop del modal padre vive en z-50 y le ganaría.
 *
 * El documento se renderiza en un `<iframe srcDoc>` y no inyectado en la página:
 * su CSS es de impresión —milímetros, Arial, tamaños en puntos— y sin el
 * aislamiento del iframe se mezclaría con los tokens del panel, que es
 * justamente lo que haría que lo impreso no se parezca a lo que se vio.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Code,
  Download,
  FileText,
  FolderPlus,
  Loader2,
  Maximize2,
  MessageCircle,
  Minus,
  Plus,
  Printer,
  X,
} from "@buleje/design-system/icons";
import { AIRE_HOJA_MM, ANCHO_HOJA_MM, marcarCortes, paginar } from "@/lib/forestal/ctp-documento-print";
import { SendWhatsAppModal } from "@/components/admin/documentos/SendWhatsAppModal";
import { useDocumentoAcciones, type MetaArchivado } from "@/hooks/use-documento-acciones";

export type { MetaArchivado } from "@/hooks/use-documento-acciones";

export interface DocumentoImprimible {
  /** Nombre del archivo al descargar y rótulo de la pestaña. */
  nombre: string;
  /** Línea chica bajo el nombre en la pestaña ("12 piezas · anexo del (35)"). */
  etiqueta?: string;
  /**
   * Nombre del ARCHIVO al descargar o archivar, si difiere del rótulo. La
   * pestaña dice "Lista de trozas" porque compite por ancho con la otra; el
   * archivo tiene que decir de qué guía es o en el Drive son todos iguales.
   */
  archivo?: string;
  /** Documento completo (`<!doctype html>…`), autocontenido. */
  html: string;
  /** Pie de cada página del PDF — el mismo que lleva el documento impreso. */
  pieCorrido?: string;
}

/** Ancho del lienzo del documento: la hoja más su aire lateral, en px de 96 dpi. */
const ANCHO_DOC = Math.round(((ANCHO_HOJA_MM + AIRE_HOJA_MM * 2) / 25.4) * 96);

const ZOOMS = [0.5, 0.65, 0.8, 1, 1.25, 1.5, 2] as const;
const cerca = (z: number) => ZOOMS.reduce((a, b) => (Math.abs(b - z) < Math.abs(a - z) ? b : a), ZOOMS[0]);

export default function CtpDocumentoVisor({
  documentos,
  activo,
  onActivo,
  onClose,
  onArchivar,
}: {
  /** Uno o varios: la GTF y su lista de trozas son dos hojas del mismo trámite. */
  documentos: DocumentoImprimible[];
  activo: number;
  onActivo: (i: number) => void;
  onClose: () => void;
  /**
   * Devuelve con qué etiquetas archivar ESTA hoja. Sin esto no aparece el botón:
   * quien abre el visor es el que sabe de qué guía y de qué proveedor es el
   * papel, y un documento sin esos datos entra al Drive como un archivo suelto.
   */
  onArchivar?: (doc: DocumentoImprimible) => MetaArchivado;
}) {
  const marco = useRef<HTMLIFrameElement>(null);
  const mesa = useRef<HTMLDivElement>(null);
  const doc = documentos[activo] ?? documentos[0];
  const srcDoc = useMemo(() => doc?.html ?? "", [doc]);

  // `null` = ajustar al ancho. Un número = zoom fijo elegido por el usuario.
  const [zoom, setZoom] = useState<number | null>(null);
  const [alto, setAlto] = useState(0);
  const [hojas, setHojas] = useState(1);
  const [anchoMesa, setAnchoMesa] = useState(0);

  const {
    pdf,
    drive,
    wasap,
    preparandoWasap,
    setWasap,
    descargarHtml,
    descargarPdf,
    archivar,
    enviarPorWhatsapp,
    limpiar,
  } = useDocumentoAcciones({ marco, doc, onArchivar });

  useEffect(() => {
    const el = mesa.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAnchoMesa(e.contentRect.width));
    ro.observe(el);
    setAnchoMesa(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  /**
   * El alto real del contenido, cuántas hojas A4 salen y dónde cae cada corte.
   * Se mide dentro del iframe (mismo origen) porque sólo ahí se sabe dónde
   * terminó el documento: calcularlo desde afuera sería adivinar.
   */
  const medir = useCallback(() => {
    const d = marco.current?.contentDocument;
    if (!d) return;
    const total = Math.ceil(d.documentElement.scrollHeight);
    if (total > 0) setAlto(total);
    const { hojas, cortes } = paginar(d);
    setHojas(hojas);
    marcarCortes(d, cortes);
  }, []);

  // Cambiar de pestaña reinicia la medida: el alto del anterior no vale para el
  // nuevo, y dejarlo puesto muestra media hoja hasta que carga.
  useEffect(() => {
    setAlto(0);
    setHojas(1);
    // El aviso es de la hoja anterior: dejarlo diría que ESTA ya se archivó.
    limpiar();
  }, [srcDoc, limpiar]);

  const escala = zoom ?? Math.min(1, Math.max(0.35, (anchoMesa - 8) / ANCHO_DOC));
  const desfase = Math.max(0, (anchoMesa - ANCHO_DOC * escala) / 2);

  const imprimir = useCallback(() => {
    // Se imprime el iframe, no la página: lo que se ve es exactamente lo que
    // sale, sin arrastrar el panel de alrededor.
    const w = marco.current?.contentWindow;
    if (!w) return;
    w.focus();
    w.print();
  }, []);


  // Escape cierra; Ctrl/Cmd+P imprime ESTE documento y no la página del panel.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        imprimir();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, imprimir]);

  const zoomear = (dir: 1 | -1) => {
    const actual = cerca(escala);
    const i = ZOOMS.indexOf(actual);
    setZoom(ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, i + dir))]);
  };

  const btn =
    "inline-flex h-11 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-base font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]";
  const icono =
    "grid h-11 w-11 shrink-0 place-items-center rounded-xl border-2 border-[var(--rule-base)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-2 sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={doc?.nombre ?? "Documento"}
    >
      <div className="flex h-[min(94vh,62rem)] w-full max-w-[72rem] flex-col overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]">
        <header className="flex items-center gap-3 border-b-2 border-[var(--rule-base)] px-4 py-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
            <FileText className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-[var(--text-primary)]">{doc?.nombre ?? "Documento"}</p>
            <p className="text-sm text-[var(--text-secondary)]">
              Vista previa en tamaño A4 · {hojas} hoja{hojas === 1 ? "" : "s"} · revisalo antes de imprimir
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className={icono}>
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--rule-soft)] px-4 py-3">
          {/* Con un solo documento no se dibujan pestañas: una pestaña sola es
              un adorno que hace pensar que falta algo. */}
          {documentos.length > 1 &&
            documentos.map((d, i) => (
              <button
                key={d.nombre}
                type="button"
                onClick={() => onActivo(i)}
                aria-pressed={i === activo}
                className={`inline-flex min-h-11 flex-col items-start justify-center rounded-2xl border-2 px-4 py-1 text-left transition-colors ${
                  i === activo
                    ? "border-[var(--accent)] bg-primary/10"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--rule-strong)]"
                }`}
              >
                <span
                  className={`text-base font-bold ${
                    i === activo
                      ? "text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      : "text-[var(--text-secondary)]"
                  }`}
                >
                  {d.nombre}
                </span>
                {d.etiqueta && <span className="text-xs text-[var(--text-tertiary)]">{d.etiqueta}</span>}
              </button>
            ))}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-2xl border-2 border-[var(--rule-base)] p-1">
              <button type="button" onClick={() => zoomear(-1)} aria-label="Alejar" className={`${icono} h-9 w-9 border-0`}>
                <Minus className="h-4 w-4" aria-hidden />
              </button>
              <span className="min-w-14 text-center text-sm font-bold tabular-nums text-[var(--text-secondary)]">
                {Math.round(escala * 100)}%
              </span>
              <button type="button" onClick={() => zoomear(1)} aria-label="Acercar" className={`${icono} h-9 w-9 border-0`}>
                <Plus className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setZoom(null)}
                aria-label="Ajustar al ancho"
                aria-pressed={zoom === null}
                className={`${icono} h-9 w-9 border-0 ${zoom === null ? "text-[var(--accent)]" : ""}`}
              >
                <Maximize2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <button
              type="button"
              onClick={() => void descargarPdf()}
              disabled={pdf === "armando"}
              className={`${btn} disabled:opacity-60`}
              title="Baja el documento como PDF A4, idéntico a esta vista"
            >
              {pdf === "armando" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Download className="h-4 w-4" aria-hidden />
              )}
              {pdf === "armando" ? "Armando PDF…" : "Descargar PDF"}
            </button>
            {onArchivar && (
              <button
                type="button"
                onClick={() => void archivar()}
                disabled={drive?.estado === "guardando"}
                className={`${btn} disabled:opacity-60`}
                title="Sube el PDF al Drive del negocio, en la carpeta de guías forestales"
              >
                {drive?.estado === "guardando" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : drive?.estado === "listo" ? (
                  <Check className="h-4 w-4 text-[var(--data-success-600)]" aria-hidden />
                ) : (
                  <FolderPlus className="h-4 w-4" aria-hidden />
                )}
                {drive?.estado === "listo" ? "En el expediente" : "Guardar en el expediente"}
              </button>
            )}
            {onArchivar && (
              <button
                type="button"
                onClick={() => void enviarPorWhatsapp()}
                disabled={preparandoWasap}
                aria-label="Enviar por WhatsApp"
                title="Manda el PDF por WhatsApp (lo guarda en el expediente si hace falta)"
                className={`${icono} disabled:opacity-60`}
              >
                {preparandoWasap ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <MessageCircle className="h-4 w-4" aria-hidden />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={descargarHtml}
              aria-label="Descargar el documento HTML"
              title="Descargar el HTML (se reimprime tal cual desde cualquier navegador)"
              className={icono}
            >
              <Code className="h-4 w-4" aria-hidden />
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

        {/* La mesa de trabajo. El iframe es transparente: el color lo pone acá el
            panel, así la vista previa sigue el tema claro/oscuro. */}
        <div ref={mesa} className="min-h-0 flex-1 overflow-auto bg-[var(--surface-sunken)]">
          <div className="relative" style={alto ? { height: alto * escala } : { height: "100%" }}>
            <iframe
              ref={marco}
              title={doc?.nombre ?? "Documento"}
              srcDoc={srcDoc}
              onLoad={() => {
                medir();
                // Segunda pasada: la primera mide antes de que asienten fuentes
                // y tablas, y el alto sale corto por unos milímetros.
                setTimeout(medir, 220);
              }}
              // `sandbox` sin `allow-scripts`: el documento es papel, no necesita JS,
              // y así un dato con HTML adentro no puede ejecutar nada.
              sandbox="allow-same-origin allow-modals"
              className="absolute left-0 top-0 border-0"
              style={
                alto
                  ? {
                      width: ANCHO_DOC,
                      height: alto,
                      transform: `translateX(${desfase}px) scale(${escala})`,
                      transformOrigin: "top left",
                    }
                  : { width: "100%", height: "100%" }
              }
            />
          </div>
        </div>

        <p className="border-t border-[var(--rule-soft)] px-4 py-2 text-sm text-[var(--text-tertiary)]">
          {drive?.estado === "listo" ? (
            <span className="font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
              Guardado en Documentos › {drive.detalle}
              {drive.aviso ? " — quedó sin etiquetas: se puede etiquetar desde el Drive." : "."}
            </span>
          ) : drive?.estado === "error" ? (
            <span className="font-bold text-[var(--data-error-600)]">{drive.detalle}</span>
          ) : pdf === "error" ? (
            <span className="font-bold text-[var(--data-error-600)]">
              No se pudo armar el PDF en este navegador. Usá «Imprimir / PDF» → «Guardar como PDF»: sale el mismo documento.
            </span>
          ) : (
            <>
              «Descargar PDF» baja el archivo tal cual se ve, con sus {hojas} hoja{hojas === 1 ? "" : "s"}.
              La línea tenue sobre la hoja marca dónde corta cada página A4.
            </>
          )}
        </p>
      </div>

      {/* El modal del Drive vive en z-[60] y el visor en z-[70]: sin este
          contenedor propio quedaría DEBAJO del papel y no se vería. */}
      {wasap && (
        <div className="relative z-[80]">
          <SendWhatsAppModal docs={[wasap]} onClose={() => setWasap(null)} />
        </div>
      )}
    </div>
  );
}
