"use client";

import { useMemo, useState } from "react";
import { Search } from "@buleje/design-system/icons";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import { conSubcarpetas, ordenarDocsTercero, type OrdenDocsTercero } from "@/lib/documentos/terceros-vinculo";
import { contenidoDe } from "@/lib/documentos/esenciales";
import { idsAMover, textoMovidos } from "@/lib/documentos/arbol-esencial";
import { logger } from "@/lib/logger";
import { getFileIcon, formatBytes } from "../archivo-visual";
import { ExpiryBadge } from "../archivo/piezas-sueltas";
import type { ModeloArchivo } from "../archivo/use-archivo";
import { CAMPO_BUSCAR, SELECT } from "./compartido";
import ArbolEsencial, { TIPO_ARRASTRE_PAPEL } from "./ArbolEsencial";
import { archivosSoltados, subirACarpeta } from "./subir-a-carpeta";

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Nombre, nombre original, etiquetas y texto leído (OCR), como en Terceros. */
function coincide(doc: DbDocument, aguja: string): boolean {
  if (!aguja) return true;
  return sinTildes([doc.name, doc.originalName, (doc.tags ?? []).join(" "), (doc.aiTags ?? []).join(" "), doc.ocrText].filter(Boolean).join(" ")).includes(aguja);
}

const ORDENES: { id: OrdenDocsTercero; label: string }[] = [
  { id: "fecha", label: "Recientes" },
  { id: "nombre", label: "Por nombre" },
  { id: "vencimiento", label: "Vence antes" },
];

/**
 * Lo que tiene la carpeta, adentro del panel: el árbol ENTERO de la carpeta
 * esencial (Brandon 23-10: «árbol completo en el panel»; antes un nivel por vez,
 * 3 clics para llegar al 4.º) y los papeles de la que eliges en él. Los papeles
 * se arrastran a otra carpeta del árbol; los archivos del disco, también. Con
 * búsqueda, busca en toda la carpeta esencial, no sólo en la que estás.
 */
export default function ContenidoEsencial({ raiz, dentroDe, setDentroDe, orden, setOrden, abrir, arch }: {
  raiz: DbDocumentFolder;
  dentroDe: string;
  setDentroDe: (id: string) => void;
  /** Vive en la vista: el visor recorre los papeles en este mismo orden. */
  orden: OrdenDocsTercero;
  setOrden: (o: OrdenDocsTercero) => void;
  /** Abre la vista previa con las flechas por ESTA lista. */
  abrir: (doc: DbDocument, lista: readonly DbDocument[]) => void;
  arch: ModeloArchivo;
}) {
  const { folders, documents, folderById, menuDe, abrirMenuEn, bulk, upload } = arch;
  const [q, setQ] = useState("");
  const aguja = sinTildes(q.trim());
  const vivos = useMemo(() => documents.filter((d) => !d.deletedAt), [documents]);

  const docs = useMemo(() => {
    if (aguja) {
      const ids = conSubcarpetas([raiz.id], folders);
      return vivos.filter((d) => !!d.folderId && ids.has(d.folderId) && coincide(d, aguja));
    }
    return contenidoDe(dentroDe, folders, vivos).docs;
  }, [aguja, raiz.id, dentroDe, folders, vivos]);

  const mover = async (ids: string[], folderId: string) => {
    const destino = folderById.get(folderId);
    if (!destino) return;
    const reales = idsAMover(ids, vivos, folderId);
    if (reales.length === 0) { toast.info(`Ya está en «${destino.name}».`); return; }
    try {
      await bulk("move", reales, { folderId });
      toast.success(textoMovidos(reales.length, destino.name));
    } catch (err) {
      logger.warn("[documentos.esenciales] mover falló", { error: String(err) });
      toast.error("No se pudo mover. Prueba de nuevo.");
    }
  };

  const ordenados = ordenarDocsTercero(docs, orden);

  return (
    <section className="space-y-3" aria-label="Lo que tiene" data-qa="esencial-contenido">
      <ArbolEsencial
        compacto
        raiz={raiz}
        carpetas={folders}
        docs={vivos}
        elegida={dentroDe}
        onElegir={setDentroDe}
        onMoverDocs={(ids, folderId) => void mover(ids, folderId)}
        onSoltarArchivos={(folderId, e) => {
          const destino = folderById.get(folderId);
          if (!destino) return;
          const { archivos, carpetas } = archivosSoltados(e);
          void subirACarpeta(upload, archivos, destino, carpetas);
        }}
      />

      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={`Buscar en ${raiz.name}`}
            placeholder="Buscar adentro…"
            className={CAMPO_BUSCAR}
          />
        </div>
        <select value={orden} onChange={(e) => setOrden(e.target.value as OrdenDocsTercero)} aria-label="Ordenar papeles" className={cn(SELECT, "w-[8.5rem] shrink-0")}>
          {ORDENES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>

      {ordenados.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-3 py-6 text-center text-sm text-[var(--text-tertiary)]">
          {aguja ? `No hay papeles con «${q.trim()}».` : "No hay papeles sueltos en esta carpeta."}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--rule-soft)] overflow-hidden rounded-xl border border-[var(--rule-base)]">
          {ordenados.map((doc) => {
            const { Icon, tint, bg } = getFileIcon(doc.mimeType, doc.name);
            const donde = aguja && doc.folderId && doc.folderId !== raiz.id ? folderById.get(doc.folderId)?.name : null;
            return (
              <li
                key={doc.id}
                className="flex items-center gap-2 pr-2"
                onContextMenu={(e) => abrirMenuEn(e, doc.id)}
                data-qa="esencial-papel"
                // Se arrastra a otra carpeta del árbol de arriba.
                draggable
                onDragStart={(e) => { e.dataTransfer.setData(TIPO_ARRASTRE_PAPEL, JSON.stringify([doc.id])); e.dataTransfer.effectAllowed = "move"; }}
              >
                <button type="button" onClick={() => abrir(doc, ordenados)} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--surface-sunken)]">
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", bg)}>
                    <Icon className={cn("h-5 w-5", tint)} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{doc.name}</span>
                    <span className="block truncate text-xs text-[var(--text-tertiary)]">
                      {formatDate(doc.uploadedAt)} · {formatBytes(doc.size)}{donde ? ` · en ${donde}` : ""}
                    </span>
                  </span>
                  {doc.expiresAt && <ExpiryBadge expiresAt={doc.expiresAt} className="shrink-0" />}
                </button>
                {menuDe(doc)}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
