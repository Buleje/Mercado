"use client";

/**
 * Un archivo en el panel de vista previa: el archivo dibujado, QUÉ ES según la
 * IA (o lo que escribiste tú), sus datos clave y lo de todos los días a un
 * clic (abrir grande, descargar, WhatsApp y el «⋯» de siempre).
 */

import type { ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { CalendarClock, ChevronLeft, ChevronRight, Download, Loader2, Maximize2, MessageCircle, Sparkles, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DbDocument } from "@/lib/types/documents";
import { formatoCodigoDocumento } from "@/lib/documentos/codigo-documento";
import { formatBytes } from "../archivo-visual";
import { daysUntil } from "../archivo/compartido";
import type { ModeloArchivo } from "../archivo/use-archivo";
import IconoArchivo from "../explorador/IconoArchivo";
import { tipoDeArchivo } from "../explorador/orden-agrupar";
import { fechaLarga } from "../explorador/propiedades-explorador";
import MenuDocumento from "../MenuDocumento";
import { ESTADOS_DEL_MENU } from "../archivo/estado-doc";
import VistaRapidaDoc from "./VistaRapidaDoc";
import { useDetalleDoc } from "./use-datos-panel";

type Entidades = { people?: string[]; orgs?: string[]; places?: string[]; dates?: string[]; amounts?: string[] };
type Meta = { description?: string; summary?: string; descripcionUsuario?: string; entities?: Entidades };

const BOTON = "inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-primary";
const FLECHA = "inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-primary disabled:opacity-30 disabled:hover:bg-transparent";

/** Los datos que la IA sacó del papel, en una sola fila de chips (hasta 8). */
function chipsDe(e: Entidades | undefined): string[] {
  if (!e) return [];
  const todos = [...(e.amounts ?? []), ...(e.dates ?? []), ...(e.people ?? []), ...(e.orgs ?? []), ...(e.places ?? [])];
  return [...new Set(todos.map((x) => x.trim()).filter(Boolean))].slice(0, 8);
}

function Fila({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-[var(--text-tertiary)]">{etiqueta}</dt>
      <dd className="min-w-0 break-words text-[var(--text-primary)]">{children}</dd>
    </div>
  );
}

export default function PreviaDoc({ arch, doc }: { arch: ModeloArchivo; doc: DbDocument }) {
  const { panelPrevia: p, setPreview, handleDownload, setWhatsappDoc, accionesDe, ex, folderById, abrirCarpetaExp } = arch;
  const { detalle, cargando } = useDetalleDoc(doc);
  const meta = (detalle?.ocrMetadata ?? {}) as Meta;
  const descripcion = (meta.descripcionUsuario || meta.description || meta.summary || "").trim();
  const chips = chipsDe(meta.entities);

  // «Archivo › Blas › 2026-10-08», de la raíz a la carpeta del archivo.
  const ruta: { id: string; name: string }[] = [];
  for (let id = doc.folderId; id; ) {
    const f = folderById.get(id);
    if (!f || ruta.length > 20) break;
    ruta.unshift({ id: f.id, name: f.name });
    id = f.parentId;
  }
  const dias = daysUntil(doc.expiresAt);
  const codigo = formatoCodigoDocumento(doc.codigo);

  return (
    <div className="space-y-3">
      {/* Cabecera: el nombre, ‹ 3 de 75 › y cerrar el panel. */}
      <div className="flex items-start gap-2">
        <IconoArchivo doc={doc} tam="chico" />
        <div className="min-w-0 flex-1">
          <CardTitle className="line-clamp-2 break-words text-base">{doc.name}</CardTitle>
          {p.posicion && <p className="text-xs tabular-nums text-[var(--text-tertiary)]">{p.posicion.actual} de {p.posicion.total}</p>}
        </div>
        <button type="button" onClick={p.anterior} disabled={!p.anterior} className={FLECHA} aria-label="Archivo anterior" title="Anterior">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button type="button" onClick={p.siguiente} disabled={!p.siguiente} className={FLECHA} aria-label="Archivo siguiente" title="Siguiente">
          <ChevronRight className="h-5 w-5" />
        </button>
        <button type="button" onClick={p.alternar} className={FLECHA} aria-label="Cerrar la vista previa" title="Cerrar la vista previa (Alt+P)">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* El archivo: doble clic lo abre en grande, igual que en la lista. */}
      <div onDoubleClick={() => setPreview(doc)}>
        <VistaRapidaDoc doc={doc} onEnviar={() => setWhatsappDoc([doc])} />
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => setPreview(doc)} className={cn(BOTON, "border-primary/40 text-[var(--accent-ink)] dark:text-[var(--accent)]")} title="Abrir en grande con todas sus pestañas">
          <Maximize2 className="h-4 w-4" /> Abrir
        </button>
        <button type="button" onClick={() => void handleDownload(doc)} className={BOTON} title="Descargar">
          <Download className="h-4 w-4" /> <span className="hidden 2xl:inline">Descargar</span>
        </button>
        <button type="button" onClick={() => setWhatsappDoc([doc])} className={BOTON} title="Enviar por WhatsApp">
          <MessageCircle className="h-4 w-4" /> <span className="hidden 2xl:inline">WhatsApp</span>
        </button>
        {/* El «⋯» propio del panel, sin `abrirEn`: el clic derecho sobre este
            mismo archivo en la lista ya abre el suyo, y con el de acá saldrían dos. */}
        <div className="flex items-center">
          <MenuDocumento {...accionesDe(doc)} extras={ex.extrasDe(doc)} nombre={doc.name} estados={ESTADOS_DEL_MENU} />
        </div>
      </div>

      {/* Qué es: lo que leyó la IA (o lo que escribiste tú, que pesa más). */}
      <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]">
          <Sparkles className="h-4 w-4 text-primary" /> Qué es
        </p>
        {cargando ? (
          <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Leyendo…</p>
        ) : descripcion ? (
          <p className="line-clamp-6 whitespace-pre-line text-sm text-[var(--text-primary)]">{descripcion}</p>
        ) : (
          <p className="text-sm text-[var(--text-tertiary)]">Todavía sin describir: ábrelo y usa «Analizar» para que la IA lo lea.</p>
        )}
        {chips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {chips.map((c) => (
              <span key={c} className="rounded-full bg-[var(--surface-raised)] px-2 py-0.5 text-xs font-semibold text-[var(--text-secondary)]">{c}</span>
            ))}
          </div>
        )}
      </div>

      <dl className="divide-y divide-[var(--rule-soft)]">
        <Fila etiqueta="Tipo">{tipoDeArchivo(doc)} · {formatBytes(doc.size)}</Fila>
        <Fila etiqueta="Carpeta">
          {ruta.length === 0 ? (
            <span className="text-[var(--text-tertiary)]">Archivo (sin carpeta)</span>
          ) : (
            <button type="button" onClick={() => abrirCarpetaExp(ruta[ruta.length - 1].id)} className="text-left font-semibold hover:text-primary" title="Ir a la carpeta">
              {ruta.map((r) => r.name).join(" › ")}
            </button>
          )}
        </Fila>
        <Fila etiqueta="Subido">{fechaLarga(doc.uploadedAt)}</Fila>
        {doc.expiresAt && (
          <Fila etiqueta="Vence">
            <span className={cn("inline-flex items-center gap-1 font-semibold", dias !== null && dias < 0 ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : dias !== null && dias <= 30 ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "")}>
              <CalendarClock className="h-4 w-4" />
              {doc.expiresAt.slice(0, 10).split("-").reverse().join("/")}
              {dias !== null && <span className="font-normal text-[var(--text-tertiary)]">({dias < 0 ? `venció hace ${-dias} d` : dias === 0 ? "vence hoy" : `en ${dias} d`})</span>}
            </span>
          </Fila>
        )}
        {codigo && <Fila etiqueta="Código"><span className="font-mono font-semibold">{codigo}</span></Fila>}
        {doc.tags.length > 0 && (
          <Fila etiqueta="Etiquetas">
            <span className="flex flex-wrap gap-1">
              {doc.tags.map((t) => (
                <span key={t} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)]">{t}</span>
              ))}
            </span>
          </Fila>
        )}
      </dl>
    </div>
  );
}
