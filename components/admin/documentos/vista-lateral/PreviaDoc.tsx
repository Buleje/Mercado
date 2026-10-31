"use client";

/**
 * Un archivo en el panel de vista previa: el archivo dibujado, QUÉ ES según la
 * IA (o lo que escribiste tú), sus datos clave y lo de todos los días a un
 * clic (abrir grande, descargar, WhatsApp y el «⋯» de siempre).
 */

import { CalendarClock, Download, Maximize2, MessageCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { button } from "@/components/ui-system/button-variants";
import type { DbDocument } from "@/lib/types/documents";
import { formatoCodigoDocumento } from "@/lib/documentos/codigo-documento";
import { formatBytes } from "../archivo-visual";
import { daysUntil } from "../archivo/compartido";
import type { ModeloArchivo } from "../archivo/use-archivo";
import { tipoDeArchivo } from "../explorador/orden-agrupar";
import { fechaLarga } from "../explorador/propiedades-explorador";
import MenuDocumento from "../MenuDocumento";
import { ESTADOS_DEL_MENU } from "../archivo/estado-doc";
import OrdenarEnPanel from "./OrdenarEnPanel";
import VistaRapidaDoc from "./VistaRapidaDoc";
import { useDetalleDoc } from "./use-datos-panel";
import { ACCION, CabeceraPrevia, Fila, QueEs, chipsDe, descripcionDe, type Meta, type NavPrevia } from "./PiezasPrevia";

export type { NavPrevia };

export default function PreviaDoc({ arch, doc, nav }: { arch: ModeloArchivo; doc: DbDocument; nav?: NavPrevia }) {
  const { panelPrevia: p, setPreview, handleDownload, setWhatsappDoc, accionesDe, ex, folderById, abrirCarpetaExp } = arch;
  const n: NavPrevia = nav ?? { anterior: p.anterior, siguiente: p.siguiente, posicion: p.posicion, onCerrar: p.alternar, cerrarTitulo: "Cerrar la vista previa (Alt+P)" };
  const { detalle, cargando } = useDetalleDoc(doc);
  const meta = (detalle?.ocrMetadata ?? {}) as Meta;
  const descripcion = descripcionDe(meta);
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
      <CabeceraPrevia doc={doc} nav={n} />

      {/* El archivo: doble clic lo abre en grande, igual que en la lista. */}
      <div onDoubleClick={() => setPreview(doc)}>
        <VistaRapidaDoc doc={doc} onEnviar={() => setWhatsappDoc([doc])} />
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => setPreview(doc)} className={button({ variant: "primary", className: "flex-1 gap-1.5 px-3" })} title="Abrir en grande con todas sus pestañas">
          <Maximize2 className="h-4 w-4" /> Abrir
        </button>
        <button type="button" onClick={() => void handleDownload(doc)} className={ACCION} title="Descargar">
          <Download className="h-4 w-4" /> <span className="hidden 2xl:inline">Descargar</span>
        </button>
        <button type="button" onClick={() => setWhatsappDoc([doc])} className={ACCION} title="Enviar por WhatsApp">
          <MessageCircle className="h-4 w-4" /> <span className="hidden 2xl:inline">WhatsApp</span>
        </button>
        {/* El «⋯» propio del panel, sin `abrirEn`: el clic derecho sobre este
            mismo archivo en la lista ya abre el suyo, y con el de acá saldrían dos. */}
        <div className="flex items-center">
          <MenuDocumento {...accionesDe(doc)} extras={ex.extrasDe(doc)} nombre={doc.name} estados={ESTADOS_DEL_MENU} />
        </div>
      </div>

      <QueEs cargando={cargando} descripcion={descripcion} chips={chips} />

      <OrdenarEnPanel arch={arch} doc={doc} detalle={detalle} />

      <dl className="divide-y divide-[var(--rule-soft)]">
        <Fila etiqueta="Tipo">{tipoDeArchivo(doc)} · {formatBytes(doc.size)}</Fila>
        <Fila etiqueta="Carpeta">
          {ruta.length === 0 ? (
            <span className="text-[var(--text-tertiary)]">Archivo (sin carpeta)</span>
          ) : (
            <button type="button" onClick={() => abrirCarpetaExp(ruta[ruta.length - 1].id)} className={button({ variant: "link", className: "h-auto justify-start p-0 text-left font-semibold whitespace-normal" })} title="Ir a la carpeta">
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
