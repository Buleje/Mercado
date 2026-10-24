"use client";

import type { ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { Download, Eye, FolderInput, Lock, MessageCircle, X } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import type { DbDocument } from "@/lib/types/documents";
import type { UsoDoc } from "@/lib/documentos/esenciales";
import DocThumb from "../DocThumb";
import { formatBytes, getFileIcon } from "../archivo-visual";
import { tagsVisibles } from "../archivo/compartido";
import { ExpiryBadge } from "../archivo/piezas-sueltas";
import type { ModeloArchivo } from "../archivo/use-archivo";
import { tipoDeArchivo } from "../explorador/orden-agrupar";
import { fechaLarga } from "../explorador/propiedades-explorador";
import { haceCuanto, quienLaVe, veces } from "./compartido";
import LoQueDicePapel from "./LoQueDicePapel";

/** Los que suben sin ser una persona del panel (el `uploadedById` es su nombre). */
const QUIEN_SUBE: Record<string, string> = { "sync-escritorio": "La carpeta de tu PC (sincronizada)" };
const ICONO = "h-5 w-5";

/**
 * El papel elegido en el panel ancho de Esenciales (Brandon 24-10: «ver los
 * documentos más ampliamente, sus detalles»): su miniatura grande (la misma del
 * Archivo, sin bajar el archivo), los datos de «Propiedades», cuánto se abre,
 * el texto leído y las acciones de siempre. Clic en la miniatura = abrirlo.
 */
export default function DetallePapelEsencial({ doc, donde, uso, ahora, arch, onAbrir, onCerrar }: {
  doc: DbDocument;
  /** El nombre de la carpeta donde vive. */
  donde: string | null;
  uso: Record<string, UsoDoc>;
  ahora: number;
  arch: ModeloArchivo;
  onAbrir: () => void;
  /** Volver a los detalles de la carpeta. */
  onCerrar: () => void;
}) {
  const { handleDownload, setWhatsappDoc, setMovingDoc, menuDe } = arch;
  const { Icon, tint, bg } = getFileIcon(doc.mimeType, doc.name);
  const aperturas = uso[doc.id];
  const ultima = haceCuanto(aperturas?.ultima ?? null, ahora);
  const acceso = quienLaVe(doc.allowedRoles);
  const etiquetas = tagsVisibles(doc.tags);
  const nota = doc.ocrMetadata?.descripcionUsuario;
  const datos: [string, ReactNode][] = [
    ["Tipo", tipoDeArchivo(doc)],
    ["Tamaño", formatBytes(doc.size)],
    ["Subido", fechaLarga(doc.uploadedAt)],
    ["Modificado", fechaLarga(doc.updatedAt)],
    ["Vence", doc.expiresAt
      ? <span key="vence" className="flex flex-wrap items-center gap-2">{fechaLarga(doc.expiresAt).replace(/ · .*$/, "")}<ExpiryBadge expiresAt={doc.expiresAt} /></span>
      : "No vence"],
    ...(typeof nota === "string" && nota.trim() ? [["Tu nota", nota.trim()] satisfies [string, ReactNode]] : []),
    ["Lo subió", QUIEN_SUBE[doc.uploadedById] ?? doc.uploadedById],
    ["Aperturas (90 días)", aperturas?.vistas ? `${veces(aperturas.vistas)}${ultima ? ` · la última ${ultima}` : ""}` : "Ninguna"],
    ["Quién lo ve", <span key="quien" className="flex items-center gap-1">{acceso.cerrada && <Lock className="h-4 w-4 shrink-0" aria-label="Con candado" />}{acceso.texto}</span>],
    ...(donde ? [["Dónde vive", donde] satisfies [string, ReactNode]] : []),
    ...((doc.versionCount ?? 0) > 1 ? [["Versiones", String(doc.versionCount)] satisfies [string, ReactNode]] : []),
  ];

  return (
    <section className="space-y-3" aria-label={`Detalles de ${doc.name}`} data-qa="esencial-detalle-papel">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <CardTitle className="line-clamp-2 break-words">{doc.name}</CardTitle>
          {doc.originalName && doc.originalName !== doc.name && (
            <p className="truncate text-xs text-[var(--text-tertiary)]" title={doc.originalName}>Se subió como «{doc.originalName}»</p>
          )}
        </div>
        <button type="button" onClick={onCerrar} title="Volver a la carpeta" aria-label="Volver a los detalles de la carpeta" className={button({ variant: "ghost", size: "icon" })} data-qa="esencial-detalle-cerrar">
          <X className={ICONO} />
        </button>
      </div>

      <button
        type="button"
        onClick={onAbrir}
        title="Abrir"
        aria-label={`Abrir ${doc.name}`}
        className="block aspect-[4/3] w-full overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        data-qa="esencial-detalle-vista"
      >
        <DocThumb key={doc.id} doc={doc} Icon={Icon} tint={tint} bg={bg} iconClassName="h-16 w-16" />
      </button>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onAbrir} className={cn(button({ variant: "primary" }), "flex-1 gap-2")} data-qa="esencial-detalle-abrir">
          <Eye className="h-4 w-4" /> Abrir
        </button>
        <button type="button" onClick={() => void handleDownload(doc)} title="Descargar" aria-label="Descargar" className={button({ variant: "secondary", size: "icon" })}>
          <Download className={ICONO} />
        </button>
        <button type="button" onClick={() => setWhatsappDoc([doc])} title="Enviar por WhatsApp" aria-label="Enviar por WhatsApp" className={button({ variant: "secondary", size: "icon" })}>
          <MessageCircle className={ICONO} />
        </button>
        <button type="button" onClick={() => setMovingDoc(doc)} title="Mover a otra carpeta" aria-label="Mover a otra carpeta" className={button({ variant: "secondary", size: "icon" })}>
          <FolderInput className={ICONO} />
        </button>
        {menuDe(doc)}
      </div>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-xl bg-[var(--surface-sunken)] p-3 text-sm">
        {datos.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-xs leading-5 text-[var(--text-tertiary)]">{k}</dt>
            <dd className="min-w-0 break-words font-bold text-[var(--text-primary)]">{v}</dd>
          </div>
        ))}
      </dl>

      {etiquetas.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Etiquetas">
          {etiquetas.map((t) => (
            <li key={t} className="rounded-lg bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-bold text-[var(--text-secondary)]">#{t}</li>
          ))}
        </ul>
      )}

      <LoQueDicePapel key={doc.id} id={doc.id} editado={doc.updatedAt} />
    </section>
  );
}
