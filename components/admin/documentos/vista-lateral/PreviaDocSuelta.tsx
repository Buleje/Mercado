"use client";

/**
 * El panel de vista previa SIN el drive montado (Forestal: papeles de una GTF o del
 * plan): el papel dibujado, qué es según la IA, sus datos y abrir grande /
 * descargar / WhatsApp, con ‹ › entre los papeles. No ordena ni tiene el «⋯» del
 * drive: eso vive en Documentos.
 */

import { Download, Loader2, Maximize2, MessageCircle } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { formatBytes } from "../archivo-visual";
import { tipoDeArchivo } from "../explorador/orden-agrupar";
import { fechaLarga } from "../explorador/propiedades-explorador";
import { ACCION, CabeceraPrevia, Fila, QueEs, chipsDe, descripcionDe, type Meta, type NavPrevia } from "./PiezasPrevia";
import VistaRapidaDoc from "./VistaRapidaDoc";
import { useDocSuelto } from "./use-doc-suelto";

const ABRIR = button({ variant: "primary", className: "flex-1 gap-1.5 px-3" });

export default function PreviaDocSuelta({
  docId,
  nav,
  onAbrirGrande,
  onDescargar,
  onEnviar,
}: {
  docId: string;
  nav: NavPrevia;
  onAbrirGrande: () => void;
  onDescargar: (nombre: string) => void;
  onEnviar?: () => void;
}) {
  const { doc, falla } = useDocSuelto(docId);
  if (!doc) {
    return (
      <div className="space-y-3" data-qa="papel-al-costado">
        {nav.volver && <button type="button" onClick={nav.onCerrar} className={button({ variant: "ghost", className: "px-2" })}>‹ {nav.volver}</button>}
        {falla ? (
          <p role="alert" className="rounded-xl border border-[var(--data-error-500)] p-3 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            No se pudo abrir el papel. Pruébalo en grande.
          </p>
        ) : (
          <p className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Abriendo el papel…</p>
        )}
      </div>
    );
  }
  const meta = (doc.ocrMetadata ?? {}) as Meta;
  return (
    <div className="space-y-3" data-qa="papel-al-costado">
      <CabeceraPrevia doc={doc} nav={nav} />
      <div onDoubleClick={onAbrirGrande}>
        <VistaRapidaDoc doc={doc} onEnviar={onEnviar ?? onAbrirGrande} />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onAbrirGrande} className={ABRIR} title="Abrir en grande con todas sus pestañas">
          <Maximize2 className="h-4 w-4" /> Abrir
        </button>
        <button type="button" onClick={() => onDescargar(doc.name)} className={ACCION} title="Descargar">
          <Download className="h-4 w-4" /> <span className="hidden 2xl:inline">Descargar</span>
        </button>
        {onEnviar && (
          <button type="button" onClick={onEnviar} className={ACCION} title="Enviar por WhatsApp">
            <MessageCircle className="h-4 w-4" /> <span className="hidden 2xl:inline">WhatsApp</span>
          </button>
        )}
      </div>
      <QueEs cargando={false} descripcion={descripcionDe(meta)} chips={chipsDe(meta.entities)} />
      <dl className="divide-y divide-[var(--rule-soft)]">
        <Fila etiqueta="Tipo">{tipoDeArchivo(doc)} · {formatBytes(doc.size)}</Fila>
        <Fila etiqueta="Subido">{fechaLarga(doc.uploadedAt)}</Fila>
        {doc.expiresAt && <Fila etiqueta="Vence">{doc.expiresAt.slice(0, 10).split("-").reverse().join("/")}</Fila>}
      </dl>
    </div>
  );
}
