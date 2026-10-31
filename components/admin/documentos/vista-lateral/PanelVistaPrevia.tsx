"use client";

/**
 * El panel de vista previa a la derecha del Archivo (Alt+P), como el de
 * Windows. Qué muestra lo decide `usePanelVistaPrevia`:
 *
 * - un archivo → `PreviaDoc` (el archivo, qué es y sus datos);
 * - una carpeta → lo que tiene adentro, con miniaturas, sin entrar;
 * - varios elegidos → cuántos, cuánto pesan y qué hacer con todos.
 *
 * Va pegado arriba al bajar por la lista (sticky) y con su propio scroll.
 */

import { CardTitle } from "@buleje/design-system";
import { Download, Eye, FolderOpen, MessageCircle, X } from "@buleje/design-system/icons";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import { urlMiniatura } from "@/lib/documents/miniatura-version";
import { formatBytes } from "../archivo-visual";
import type { ModeloArchivo } from "../archivo/use-archivo";
import IconoArchivo from "../explorador/IconoArchivo";
import IconoCarpeta from "../explorador/IconoCarpeta";
import { fechaLarga, plural } from "../explorador/propiedades-explorador";
import PreviaDoc from "./PreviaDoc";
import { useContenidoCarpeta } from "./use-datos-panel";

const BOTON = "inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-primary";
const CERRAR = "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-primary";
const MAX_MINIATURAS = 12;

/** Una grilla de miniaturas: clic abre ese archivo en grande. */
function Miniaturas({ docs, onAbrir }: { docs: DbDocument[]; onAbrir: (d: DbDocument) => void }) {
  if (docs.length === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {docs.slice(0, MAX_MINIATURAS).map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => onAbrir(d)}
          title={d.name}
          aria-label={`Ver ${d.name}`}
          className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)] transition-colors hover:border-primary"
        >
          <span className="absolute inset-0 flex items-center justify-center"><IconoArchivo doc={d} tam="chico" /></span>
          {/* eslint-disable-next-line @next/next/no-img-element -- miniatura del drive, ya optimizada */}
          <img src={urlMiniatura(d.id)} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} className="relative h-full w-full object-cover" />
        </button>
      ))}
    </div>
  );
}

function Cabecera({ titulo, sub, icono, onCerrar }: { titulo: string; sub: string; icono: React.ReactNode; onCerrar: () => void }) {
  return (
    <div className="flex items-start gap-2">
      {icono}
      <div className="min-w-0 flex-1">
        <CardTitle className="line-clamp-2 break-words text-sm font-bold">{titulo}</CardTitle>
        <p className="text-xs tabular-nums text-[var(--text-tertiary)]">{sub}</p>
      </div>
      <button type="button" onClick={onCerrar} className={CERRAR} aria-label="Cerrar la vista previa" title="Cerrar la vista previa (Alt+P)">
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

function PreviaCarpeta({ arch, carpeta }: { arch: ModeloArchivo; carpeta: DbDocumentFolder }) {
  const { panelPrevia: p, childrenMap, abrirCarpetaExp, setPreview } = arch;
  const { docs, error } = useContenidoCarpeta(carpeta.id);
  const subcarpetas = childrenMap.get(carpeta.id)?.length ?? 0;
  const bytes = docs?.reduce((s, d) => s + d.size, 0) ?? 0;
  const ultimo = docs?.reduce<string | null>((m, d) => (!m || d.uploadedAt > m ? d.uploadedAt : m), null) ?? null;
  const partes = [subcarpetas > 0 && plural(subcarpetas, "carpeta", "carpetas"), docs && plural(docs.length, "archivo", "archivos")].filter(Boolean);
  return (
    <div className="space-y-3">
      <Cabecera
        titulo={carpeta.name}
        sub={docs ? `${partes.join(" · ") || "Vacía"} · ${formatBytes(bytes)}` : error ? "No se pudo leer lo que tiene" : "Mirando qué tiene…"}
        icono={<IconoCarpeta carpeta={carpeta} tam="chico" />}
        onCerrar={p.alternar}
      />
      <button type="button" onClick={() => abrirCarpetaExp(carpeta.id)} className={`${BOTON} w-full border-primary/40 text-[var(--accent-ink)] dark:text-[var(--accent)]`}>
        <FolderOpen className="h-4 w-4" /> Abrir carpeta
      </button>
      {docs && <Miniaturas docs={docs} onAbrir={setPreview} />}
      {docs && docs.length > MAX_MINIATURAS && (
        <p className="text-center text-xs text-[var(--text-tertiary)]">y {docs.length - MAX_MINIATURAS} más</p>
      )}
      {ultimo && <p className="text-xs text-[var(--text-tertiary)]">Último archivo: {fechaLarga(ultimo)}</p>}
    </div>
  );
}

function PreviaVarios({ arch, docs, carpetas }: { arch: ModeloArchivo; docs: DbDocument[]; carpetas: DbDocumentFolder[] }) {
  const { panelPrevia: p, setWhatsappDoc, zipAndDownload, setPreview } = arch;
  const bytes = docs.reduce((s, d) => s + d.size, 0);
  const partes = [carpetas.length > 0 && plural(carpetas.length, "carpeta", "carpetas"), docs.length > 0 && plural(docs.length, "archivo", "archivos")].filter(Boolean);
  return (
    <div className="space-y-3">
      <Cabecera titulo={`${partes.join(" y ")} elegidos`} sub={docs.length > 0 ? `${formatBytes(bytes)} en total` : "Sólo carpetas"} icono={<Eye className="mt-1 h-5 w-5 shrink-0 text-primary" />} onCerrar={p.alternar} />
      {docs.length > 0 && (
        <div className="flex gap-2">
          <button type="button" onClick={() => void zipAndDownload(docs, `documentos-${docs.length}.zip`)} className={BOTON}>
            <Download className="h-4 w-4" /> Descargar ZIP
          </button>
          <button type="button" onClick={() => setWhatsappDoc(docs)} className={BOTON}>
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </button>
        </div>
      )}
      <Miniaturas docs={docs} onAbrir={setPreview} />
      {docs.length > MAX_MINIATURAS && <p className="text-center text-xs text-[var(--text-tertiary)]">y {docs.length - MAX_MINIATURAS} más</p>}
    </div>
  );
}

export default function PanelVistaPrevia({ arch }: { arch: ModeloArchivo }) {
  const { panelPrevia: p } = arch;
  if (!p.visible) return null;
  const o = p.objetivo;
  return (
    <aside
      aria-label="Vista previa"
      data-qa="panel-vista-previa"
      className="sticky top-[76px] max-h-[calc(100dvh-92px)] self-start overflow-y-auto rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3"
    >
      {o.tipo === "doc" ? (
        <PreviaDoc key={o.doc.id} arch={arch} doc={o.doc} />
      ) : o.tipo === "carpeta" ? (
        <PreviaCarpeta key={o.carpeta.id} arch={arch} carpeta={o.carpeta} />
      ) : o.tipo === "varios" ? (
        <PreviaVarios arch={arch} docs={o.docs} carpetas={o.carpetas} />
      ) : (
        <div className="flex items-start gap-2">
          <p className="flex-1 py-10 text-center text-sm text-[var(--text-tertiary)]">Haz clic en un archivo o carpeta para ver aquí qué tiene.</p>
          <button type="button" onClick={p.alternar} className={CERRAR} aria-label="Cerrar la vista previa" title="Cerrar la vista previa (Alt+P)">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </aside>
  );
}
