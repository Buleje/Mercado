"use client";

/**
 * TramiteDocumentoModal — el documento en grande, sin salir de la página
 * (ADR-364 ronda 2). La preview de al lado del formulario es chica a propósito
 * (deja lugar a los campos); esto es la misma hoja, más grande, para leerla
 * completa antes de imprimir o archivar.
 *
 * Rediseño 2026-08-20 (Brandon: "quiero que se vea como una hoja de PDF bien
 * hecha y cuadrada"): antes la hoja no se distinguía del fondo gris — ahora
 * flota sobre el canvas con sombra + borde propios y esquinas RECTAS (una
 * hoja de papel no tiene `border-radius`; el redondeo es del chrome del
 * modal, no del documento). El papel sigue fuera del DS a propósito (blanco
 * fijo, no tokens) porque el original que se presenta ante SERFOR es blanco
 * siempre, esté la app en claro o en oscuro.
 *
 * Ronda 5 (Brandon: "quiero editar en la misma página" + "que se vea completo
 * sin scroll, tipo PDF"): pantalla completa con DOS paneles — el editor
 * (`TramiteCamposPanel`, el mismo de la columna del formulario) a la
 * izquierda y el papel a la derecha.
 *
 * Ronda 6 (Brandon, mismo día: "está muy pequeño que no se ve"): el "fit to
 * PAGE" (achicaba por ancho Y alto) dejaba el papel diminuto en una pantalla
 * ancha con poco alto — todo el panel vacío alrededor de una hoja chiquita.
 * Ahora es "fit to WIDTH" (como Adobe/el visor de Chrome): usa TODO el ancho,
 * nunca agranda, y si el documento es más alto que el panel, ESE scrollea —
 * legible siempre gana sobre "nunca scrollear".
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { FileCheck, FileText, PencilLine } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { buildTramiteHtml, TRAMITE_PREVIEW_CSS } from "@/lib/forestal/tramites-print";
import type { DatosTramite, FormatoTramite } from "@/lib/forestal/tramites-catalogo";
import type { CtpReportFicha } from "@/lib/forestal/ctp-print-shared";
import type { LogoTramite } from "@/lib/forestal/tramites-logo";
import { useTramiteDocumentoEditor } from "@/hooks/use-tramite-documento-editor";

/** Ancho "de papel" con el que se mide y se renderiza el documento — el `body`
 *  del CSS impreso ya limita el contenido a 900px, así que un contenedor de
 *  1000px lo deja respirar igual que en la ventana de impresión real. */
const ANCHO_PAPEL = 1000;
/** Piso de escala: por debajo de esto el texto deja de ser legible — un
 *  panel MUY angosto (mobile chico) sigue con scroll horizontal adentro
 *  antes que forzar letra ilegible. */
const ESCALA_MIN = 0.42;

export default function TramiteDocumentoModal({
  open,
  onClose,
  formato,
  datos,
  ficha,
  numeroDocumento,
  codigoInterno,
  logo,
  editor,
  footer,
  onCampoChange,
}: {
  open: boolean;
  onClose: () => void;
  formato: FormatoTramite;
  datos: DatosTramite;
  ficha: CtpReportFicha | null;
  /** N° de documento correlativo, si el formato lo lleva (ADR-364 ronda 3). */
  numeroDocumento?: string | null;
  /** Código interno para identificar y buscar el trámite (Brandon 2026-08-25/26). */
  codigoInterno?: string | null;
  /** Logo del membrete (ADR-364 ronda 6) — por tenant, no por trámite. */
  logo?: LogoTramite | null;
  /** El panel de campos editable (`TramiteCamposPanel`) — `null` mientras el
   *  modal está cerrado, para no montarlo dos veces a la vez (ver `TramiteFormulario`). */
  editor?: React.ReactNode;
  /** Barra de acciones (guardar/drive/imprimir) — la misma de la página. */
  footer?: React.ReactNode;
  /** Si se pasa, el papel también se edita tocándolo directamente (ADR-364
   *  ronda 7) — el mismo mecanismo que `TramitePreview`. */
  onCampoChange?: (id: string, valor: string) => void;
}) {
  /** Móvil/tablet: el papel y el editor no entran juntos — alternan con un tab. */
  const [vista, setVista] = useState<"ver" | "editar">("ver");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const [altoNatural, setAltoNatural] = useState<number | null>(null);
  const [escala, setEscala] = useState(1);
  const editable = Boolean(onCampoChange);

  const html = open
    ? (() => {
        const body = buildTramiteHtml({ formato, datos, ficha, numeroDocumento: numeroDocumento ?? undefined, codigoInterno: codigoInterno ?? undefined, logo, editable });
        return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<style>${TRAMITE_PREVIEW_CSS}
  html{background:#fff}
  body{background:#fff;margin:0;padding:40px 46px;border-radius:0}
  .aviso{display:none}
</style></head><body>${body}</body></html>`;
      })()
    : "";

  const { srcDoc, onLoad: onLoadEditor } = useTramiteDocumentoEditor({ iframeRef, html, formato, onCampoChange });

  // Al terminar de cargar el documento, mide el alto NATURAL (sin escalar) y
  // cablea la edición inline. `allow-same-origin` (sin `allow-scripts`) es lo
  // mínimo que permite leer/escribir `contentDocument` — el HTML es 100%
  // estático (todo pasa por `esc()`, no hay `<script>`), así que no hay nada
  // que ejecutar de todos modos.
  const onLoad = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    const h = doc?.documentElement?.scrollHeight;
    if (h) setAltoNatural(h);
    onLoadEditor();
  }, [onLoadEditor]);

  // Ajusta la escala a "fit-to-WIDTH" — como cualquier visor de PDF real
  // (Adobe, el de Chrome): usa TODO el ancho disponible, nunca agranda (máx
  // 1×). El alto que sobre scrollea adentro del panel — eso es lo normal en
  // un documento largo, ni Acrobat encoge la letra para que quepa la hoja
  // entera. Ronda anterior escalaba también por ALTO ("sin scroll") y en una
  // pantalla ancha con poco alto disponible eso dejaba el papel diminuto con
  // medio panel vacío al costado (Brandon 2026-08-20: "está muy pequeño").
  useEffect(() => {
    const calcular = () => {
      const pane = paneRef.current;
      if (!pane) return;
      const s = Math.min(pane.clientWidth / ANCHO_PAPEL, 1);
      setEscala(Math.max(s, ESCALA_MIN));
    };
    calcular();
    window.addEventListener("resize", calcular);
    return () => window.removeEventListener("resize", calcular);
  }, [altoNatural]);

  useEffect(() => {
    if (!open) {
      setAltoNatural(null);
      setEscala(1);
      setVista("ver");
    }
  }, [open]);

  return (
    <AdminModal open={open} onClose={onClose} title={formato.nombre} icon={FileText} variant="fullscreen" footer={footer}>
      <div className="flex h-full min-h-0 flex-col">
        {/* Franja de estado: sólo en formatos con correlativo — de un vistazo,
            si esto YA tiene número (listo para archivar) o todavía no. */}
        {formato.correlativo && (
          <div className="flex shrink-0 items-center gap-2 border-b-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-2.5 text-sm">
            <FileCheck className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
            {numeroDocumento ? (
              <span className="font-bold text-[var(--text-primary)]">Documento N° {numeroDocumento}</span>
            ) : (
              <span className="text-[var(--text-tertiary)]">Sin N° asignado — se numera solo al guardar en estado &ldquo;Presentado&rdquo;</span>
            )}
          </div>
        )}

        {/* Aviso de edición inline (ADR-364 ronda 7) — el papel es tocable,
            no sólo el panel de la izquierda. */}
        {editable && (
          <div className="flex shrink-0 items-center gap-2 border-b-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-2 text-xs">
            <PencilLine className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
            <span className="font-bold text-[var(--text-secondary)]">Podés tocar el papel y editar sus datos directamente</span>
          </div>
        )}

        {/* Tab Ver/Editar: sólo hace falta cuando los dos paneles no entran
            uno al lado del otro (por debajo de `xl`). */}
        <div className="flex shrink-0 gap-2 border-b-2 border-[var(--rule-soft)] p-2 xl:hidden">
          {([
            { key: "ver" as const, label: "Ver el documento", icon: FileText },
            { key: "editar" as const, label: "Editar datos", icon: PencilLine },
          ]).map((t) => {
            const Icono = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setVista(t.key)}
                aria-pressed={vista === t.key}
                className={`inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border-2 text-sm font-bold transition ${
                  vista === t.key
                    ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]"
                }`}
              >
                <Icono className="h-4 w-4" /> {t.label}
              </button>
            );
          })}
        </div>

        <div className="grid min-h-0 flex-1 xl:grid-cols-[26rem_1fr]">
          {/* Editor: los mismos campos que la columna del formulario — "las
              opciones de editar en la misma página" (Brandon 2026-08-20). */}
          <div className={`min-h-0 overflow-y-auto border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4 xl:border-r-2 ${vista === "editar" ? "" : "hidden xl:block"}`}>
            {editor}
          </div>

          {/* Papel: fit-to-width, CENTRADO cuando el panel es más ancho que la
              hoja (una pantalla grande no debería dejarlo pegado a la
              izquierda) — se recalcula solo al cargar y al redimensionar. */}
          <div
            ref={paneRef}
            className={`min-h-0 overflow-auto bg-[var(--surface-sunken)] p-3 sm:p-5 ${vista === "ver" ? "" : "hidden xl:block"}`}
          >
            <div
              className="mx-auto border border-[#d3d9d5] shadow-[var(--shadow-lg)]"
              style={{ width: ANCHO_PAPEL * escala, height: altoNatural ? altoNatural * escala : undefined }}
            >
              <div style={{ width: ANCHO_PAPEL, transform: `scale(${escala})`, transformOrigin: "top left" }}>
                <iframe
                  ref={iframeRef}
                  title={`Documento completo: ${formato.nombre}`}
                  srcDoc={srcDoc}
                  sandbox="allow-same-origin"
                  onLoad={onLoad}
                  style={{ width: ANCHO_PAPEL, height: altoNatural ?? 1400, border: 0, display: "block", background: "#fff" }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminModal>
  );
}
