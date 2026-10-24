"use client";

/**
 * La cabecera del visor de documentos, en UNA fila: nombre a la izquierda,
 * pestañas en el medio y, a la derecha, las flechas con la posición, la acción
 * principal y lo demás (Brandon 23-10: «los botones y demás ponle en una sola
 * fila más compacto para que ocupe menos espacio»). Antes eran dos filas que
 * sumaban 144 px de alto: el encabezado (90) y la barra de pestañas (54).
 *
 * Las pestañas llevan su nombre cuando entran todas; si no, quedan como íconos
 * con tooltip y sólo la elegida muestra el texto. Eso se decide midiendo una
 * copia invisible con los nombres contra el lugar que de verdad queda, no con
 * un ancho de pantalla fijo: cada documento trae pestañas distintas (Firmar
 * sólo en PDF, Buscar sólo si hay texto leído) y el nombre de cada archivo
 * ocupa lo suyo.
 *
 * En una ventana angosta (el celular) son dos filas: nombre, acciones y la X
 * arriba; pestañas y flechas abajo.
 */
import { useLayoutEffect, useRef, useState } from "react";
import {
  X, Download, History, Shield, Share2, FileText, Eye, Table, MessageCircle,
  Pencil as PencilLine, Link2, ExternalLink, ChevronLeft, ChevronRight, Search,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { button } from "@/components/ui-system/button-variants";
import { BOTON_VENTANA, ControlesDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import type { VentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { esHojaEditable } from "@/lib/documentos/hoja-calculo";
import { esTextoEditable } from "@/lib/documentos/texto-docx";
import { formatDate } from "@/lib/format";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import UbicacionDoc from "../UbicacionDoc";

export type PestanaVisor = "preview" | "texto" | "details" | "versions" | "audit" | "share" | "sign" | "comentarios";

interface Pestana {
  id: PestanaVisor;
  icono: typeof Eye;
  etiqueta: string;
  /** Versiones o enlaces: el número se sigue viendo con la pestaña compacta. */
  cuenta?: number;
  /** Detalles con vencimiento, cliente o proveedor cargado. */
  marca?: boolean;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function textoDe(p: Pestana): string {
  return `${p.etiqueta}${p.marca ? " •" : ""}${p.cuenta ? ` (${p.cuenta})` : ""}`;
}

/** El riel de las pestañas. La copia que se mide usa la misma base. */
const RIEL = "flex items-center gap-0.5 rounded-2xl bg-[var(--surface-sunken)] p-1";
const PESTANA =
  "relative inline-flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm font-bold transition-colors";

/**
 * ¿Entran las pestañas con su nombre en el lugar que les queda? Se compara una
 * copia invisible (siempre con nombres) contra la celda real. No oscila: con
 * nombres la celda mide lo que sobra; compacta mide lo mismo o el ancho de los
 * íconos, que siempre es menor que el de los nombres.
 */
function useCabenLosNombres() {
  const celdaRef = useRef<HTMLDivElement>(null);
  const medidaRef = useRef<HTMLDivElement>(null);
  const [caben, setCaben] = useState(false);
  useLayoutEffect(() => {
    const celda = celdaRef.current;
    const medida = medidaRef.current;
    if (!celda || !medida || typeof ResizeObserver === "undefined") return;
    const ver = () => setCaben(medida.offsetWidth <= celda.clientWidth + 1);
    ver();
    const ro = new ResizeObserver(ver);
    ro.observe(celda);
    ro.observe(medida);
    return () => ro.disconnect();
  }, []);
  return { celdaRef, medidaRef, caben };
}

interface Props {
  doc: DbDocument;
  titleId: string;
  folders: DbDocumentFolder[];
  onMover: (destino: string | null) => Promise<void>;
  tab: PestanaVisor;
  onTab: (t: PestanaVisor) => void;
  onPrev?: () => void;
  onNext?: () => void;
  position?: { current: number; total: number };
  rawUrl: string;
  isPdf: boolean;
  /** PDF, imagen o video: el navegador los abre solo en otra pestaña. */
  abrible: boolean;
  ventana: VentanaDeModal;
  onEnviar: () => void;
  onClose: () => void;
}

export default function CabeceraVistaPrevia({
  doc, titleId, folders, onMover, tab, onTab, onPrev, onNext, position,
  rawUrl, isPdf, abrible, ventana, onEnviar, onClose,
}: Props) {
  const { celdaRef, medidaRef, caben } = useCabenLosNombres();
  const hayFlechas = !!(onPrev || onNext);
  const esHoja = esHojaEditable(doc.mimeType, doc.name);
  const editable = esHoja || esTextoEditable(doc.mimeType, doc.name);
  const textoEditar = esHoja ? "Editar planilla" : "Editar documento";
  const IconoEditar = esHoja ? Table : PencilLine;

  const pestanas: Pestana[] = [
    { id: "preview", icono: Eye, etiqueta: "Vista previa" },
    // Buscar ADENTRO del documento (Ctrl+F). Sólo si hay texto leído: ofrecer
    // una búsqueda que no puede encontrar nada es peor que no ofrecerla.
    ...(doc.ocrText ? [{ id: "texto" as const, icono: Search, etiqueta: "Buscar y preguntar" }] : []),
    { id: "details", icono: Link2, etiqueta: "Detalles", marca: !!(doc.expiresAt || doc.customerId || doc.supplierId) },
    { id: "versions", icono: History, etiqueta: "Versiones", cuenta: doc.versionCount ? doc.versionCount + 1 : undefined },
    { id: "share", icono: Share2, etiqueta: "Compartir", cuenta: doc.shareCount || undefined },
    ...(isPdf ? [{ id: "sign" as const, icono: PencilLine, etiqueta: "Firmar" }] : []),
    { id: "comentarios", icono: MessageCircle, etiqueta: "Observaciones" },
    { id: "audit", icono: Shield, etiqueta: "Auditoría" },
  ];

  return (
    <header className="relative shrink-0 border-b border-[var(--rule-base)] px-3 py-1.5 sm:px-4">
      <div
        className={cn(
          // Angosto: flex en dos líneas (nombre + acciones, pestañas + flechas).
          // Una grilla acá hacía que acciones y flechas compartieran columna y
          // las pestañas quedaban en 140 px a 400 (medido 23-10).
          "flex flex-wrap items-center gap-x-2 gap-y-1 @min-[70rem]:grid",
          // Una fila desde que el panel mide 70rem. Con las pestañas compactas
          // la celda del medio no baja de lo que miden sus íconos: se achica el
          // nombre antes que cortar una pestaña.
          caben
            ? "@min-[70rem]:grid-cols-[minmax(6rem,max-content)_minmax(0,1fr)_auto_auto]"
            : "@min-[70rem]:grid-cols-[minmax(6rem,max-content)_minmax(max-content,1fr)_auto_auto]",
          "@min-[70rem]:gap-x-3",
        )}
      >
        {/* Nombre, carpeta y tamaño: truncan antes que empujar los botones. */}
        <div className="order-1 flex min-w-0 flex-1 items-center gap-2.5 @min-[70rem]:col-start-1 @min-[70rem]:row-start-1 @min-[70rem]:max-w-[18rem]">
          <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-sunken)] @min-[70rem]:flex">
            <FileText className="h-5 w-5 text-[var(--text-secondary)]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p id={titleId} title={doc.name} className="truncate font-display text-base font-semibold leading-5 tracking-tight text-[var(--text-primary)]">
              {doc.name}
            </p>
            <div className="mt-0.5 flex min-w-0 items-center gap-2">
              {/* Dónde vive el archivo: se ve sin cambiar de pestaña y se mueve
                  desde acá. La grilla deja que el botón trunque su ruta. */}
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)]">
                <UbicacionDoc compacto folderId={doc.folderId} folders={folders} onMover={onMover} />
              </div>
              <p className="min-w-0 truncate text-xs tabular-nums text-[var(--text-tertiary)]">
                {formatBytes(doc.size)} · {formatDate(doc.uploadedAt)}
                {doc.versionCount ? ` · v${doc.versionCount + 1}` : ""}
              </p>
            </div>
          </div>
        </div>

        {/* Salto de línea del celular: pestañas y flechas van abajo. */}
        <span aria-hidden className="order-3 h-0 basis-full @min-[70rem]:hidden" />

        {/* Pestañas */}
        <div
          ref={celdaRef}
          className="order-4 flex min-w-0 flex-1 justify-start @min-[70rem]:col-start-2 @min-[70rem]:row-start-1 @min-[70rem]:justify-center"
        >
          <nav aria-label="Secciones del documento" className={cn(RIEL, "max-w-full overflow-x-auto [scrollbar-width:thin]")}>
            {pestanas.map((p) => {
              const activa = tab === p.id;
              const conTexto = caben || activa;
              const Icono = p.icono;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onTab(p.id)}
                  aria-current={activa ? "true" : undefined}
                  aria-label={conTexto ? undefined : textoDe(p)}
                  title={conTexto ? undefined : textoDe(p)}
                  className={cn(
                    PESTANA,
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    activa
                      ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]",
                  )}
                >
                  <Icono className={cn("h-4 w-4 shrink-0", activa && "text-[var(--accent-dark)] dark:text-[var(--accent)]")} aria-hidden />
                  {conTexto ? (
                    textoDe(p)
                  ) : (
                    <>
                      {p.cuenta ? <span className="text-xs tabular-nums" aria-hidden>{p.cuenta}</span> : null}
                      {p.marca && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />}
                    </>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Anterior / siguiente, con la posición en la lista (← → también). */}
        {hayFlechas && (
          <div className="order-5 flex shrink-0 items-center justify-end @min-[70rem]:col-start-3 @min-[70rem]:row-start-1">
            <button type="button" onClick={onPrev} disabled={!onPrev} className={BOTON_VENTANA} title="Documento anterior (←)" aria-label="Documento anterior">
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            {position && (
              <span className="min-w-[3.25rem] text-center text-sm font-semibold tabular-nums text-[var(--text-secondary)]">
                {position.current} / {position.total}
              </span>
            )}
            <button type="button" onClick={onNext} disabled={!onNext} className={BOTON_VENTANA} title="Documento siguiente (→)" aria-label="Documento siguiente">
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
          </div>
        )}

        {/* La acción principal y lo demás. Enviar y Descargar también están en
            la barra de la derecha; acá van sólo con ícono. */}
        <div className="order-2 flex shrink-0 items-center justify-end gap-1 @min-[70rem]:col-start-4 @min-[70rem]:row-start-1">
          {abrible && (
            <a href={rawUrl} target="_blank" rel="noopener noreferrer" className={BOTON_VENTANA} title="Abrir en una pestaña nueva" aria-label="Abrir en una pestaña nueva">
              <ExternalLink className="h-5 w-5" aria-hidden />
            </a>
          )}
          {/* Editar en el panel en vez de bajar → abrir Office → volver a subir.
              Guarda como versión nueva del mismo documento. */}
          {editable && (
            <a
              href={`/admin/documentos/${doc.id}/editar`}
              target="_blank"
              rel="noopener noreferrer"
              title={`${textoEditar} en una pestaña nueva y guardarlo acá mismo`}
              aria-label={textoEditar}
              className={button({
                variant: "accent",
                className:
                  "shrink-0 rounded-xl border-[var(--accent-dark)] bg-[var(--accent-dark)] px-3.5 hover:bg-[var(--accent-dark)]/90 @min-[80rem]:px-5",
              })}
            >
              <IconoEditar className="h-5 w-5" aria-hidden />
              <span className="hidden @min-[80rem]:inline">{textoEditar}</span>
            </a>
          )}
          {/* Mirarlo y mandarlo es el mismo gesto: llega el archivo, no un enlace. */}
          <button type="button" onClick={onEnviar} className={BOTON_VENTANA} title="Mandar este archivo por WhatsApp" aria-label="Mandar este archivo por WhatsApp">
            <MessageCircle className="h-5 w-5" aria-hidden />
          </button>
          {/* Por nuestro proxy (?download=1): con sesión y sin la URL firmada que vence. */}
          <a href={`${rawUrl}?download=1`} download={doc.name} className={BOTON_VENTANA} title="Descargar" aria-label="Descargar">
            <Download className="h-5 w-5" aria-hidden />
          </a>
          {ventana.activa && <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-[var(--rule-base)]" />}
          <ControlesDeVentana ventana={ventana} />
          <button type="button" onClick={onClose} className={BOTON_VENTANA} title="Cerrar (Esc)" aria-label="Cerrar">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>

      {/* La copia que se mide: siempre con nombres, fuera de la vista. */}
      <div aria-hidden className="pointer-events-none invisible absolute left-0 top-0 h-0 w-0 overflow-hidden">
        <div ref={medidaRef} className={cn(RIEL, "w-max")}>
          {pestanas.map((p) => {
            const Icono = p.icono;
            return (
              <span key={p.id} className={PESTANA}>
                <Icono className="h-4 w-4 shrink-0" />
                {textoDe(p)}
              </span>
            );
          })}
        </div>
      </div>
    </header>
  );
}
