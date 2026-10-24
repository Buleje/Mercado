"use client";

import { DataTable } from "@buleje/design-system";
import { Folder, FolderOpen, FileArchive, Share2, UserPlus } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import DocThumb from "../DocThumb";
import { getFileIcon, formatBytes } from "../archivo-visual";
import { ExpiryBadge } from "../archivo/piezas-sueltas";
import type { ModeloArchivo } from "../archivo/use-archivo";

export interface GrupoDeCarpeta {
  carpeta: DbDocumentFolder;
  /** Desde la carpeta vinculada hasta esta (sin la vinculada si es ella misma). */
  ruta: string[];
  docs: DbDocument[];
}

/**
 * Una carpeta del tercero con sus papeles: cabecera (abrir en el Archivo,
 * compartir, expediente, vínculos) y la tabla o las miniaturas. El clic en un
 * papel abre la vista previa del Archivo; el «⋯» y el clic derecho, su menú
 * de siempre (descargar, WhatsApp, renombrar, mover…).
 */
export default function PapelesDeCarpeta({ grupo, arch, miniaturas }: {
  grupo: GrupoDeCarpeta;
  arch: ModeloArchivo;
  miniaturas: boolean;
}) {
  const { carpeta, ruta, docs } = grupo;
  const { abrirCarpetaExp, setSharingFolder, setExpediente, setVinculando, setPreview, menuDe, abrirMenuEn } = arch;
  return (
    <section className="space-y-2" data-qa="tercero-carpeta">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => abrirCarpetaExp(carpeta.id)}
          title="Abrir en el Archivo"
          className="flex min-w-0 flex-[1_1_12rem] items-center gap-2 text-left hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
        >
          <Folder className="h-5 w-5 shrink-0 text-[var(--text-secondary)]" />
          <span className="min-w-0 truncate text-sm font-bold text-[var(--text-primary)]">
            {ruta.length > 0 && <span className="font-normal text-[var(--text-tertiary)]">{ruta.join(" › ")} › </span>}
            {carpeta.name}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-[var(--text-tertiary)]">{docs.length}</span>
        </button>
        <ActionMenu
          label={`Opciones de ${carpeta.name}`}
          soloIcono
          size="sm"
          actions={[
            { id: "abrir", label: "Abrir en el Archivo", icon: FolderOpen, onSelect: () => abrirCarpetaExp(carpeta.id) },
            { id: "compartir", label: "Compartir carpeta", icon: Share2, onSelect: () => setSharingFolder(carpeta) },
            { id: "expediente", label: "Armar expediente PDF", icon: FileArchive, onSelect: () => setExpediente({ tipo: "carpeta", folderId: carpeta.id, nombre: carpeta.name }) },
            { id: "vinculos", label: "Terceros vinculados…", icon: UserPlus, onSelect: () => setVinculando(carpeta) },
          ]}
        />
      </div>

      {docs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-3 py-4 text-sm text-[var(--text-tertiary)]">Esta carpeta está vacía.</p>
      ) : miniaturas ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {docs.map((doc) => {
            const { Icon, tint, bg } = getFileIcon(doc.mimeType, doc.name);
            return (
              <li key={doc.id} onContextMenu={(e) => abrirMenuEn(e, doc.id)} className="relative overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
                <button type="button" onClick={() => setPreview(doc)} className="block w-full text-left" aria-label={`Ver ${doc.name}`}>
                  <span className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-[var(--surface-sunken)]">
                    <DocThumb doc={doc} Icon={Icon} tint={tint} bg={bg} />
                  </span>
                  <span className="block space-y-0.5 p-2 pr-10">
                    <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{doc.name}</span>
                    <span className="block text-xs text-[var(--text-tertiary)]">{formatDate(doc.uploadedAt)}</span>
                  </span>
                </button>
                <span className="absolute bottom-1.5 right-1.5">{menuDe(doc)}</span>
                {doc.expiresAt && <ExpiryBadge expiresAt={doc.expiresAt} className="absolute left-2 top-2" />}
              </li>
            );
          })}
        </ul>
      ) : (
        <DataTable className="w-full" wrapperClassName="bg-[var(--surface-raised)]">
          <thead>
            <tr>
              <th className="text-left">Nombre</th>
              <th className="text-right">Subido</th>
              <th className="text-left">Vence</th>
              <th className="text-right">Tamaño</th>
              <th className="text-center">Acción</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((doc) => {
              const { Icon, tint, bg } = getFileIcon(doc.mimeType, doc.name);
              return (
                <tr
                  key={doc.id}
                  data-qa="tercero-papel"
                  onContextMenu={(e) => abrirMenuEn(e, doc.id)}
                  onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest("button, input, a")) setPreview(doc); }}
                >
                  <td>
                    <button type="button" onClick={() => setPreview(doc)} className="flex min-w-0 items-center gap-3 text-left hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]">
                      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", bg)}>
                        <Icon className={cn("h-4 w-4", tint)} />
                      </span>
                      <span className="max-w-[22rem] truncate font-bold text-[var(--text-primary)]">{doc.name}</span>
                    </button>
                  </td>
                  <td className="text-right tabular-nums text-[var(--text-secondary)]">{formatDate(doc.uploadedAt)}</td>
                  <td>{doc.expiresAt ? <ExpiryBadge expiresAt={doc.expiresAt} /> : <span className="text-[var(--text-tertiary)]">—</span>}</td>
                  <td className="text-right tabular-nums text-[var(--text-secondary)]">{formatBytes(doc.size)}</td>
                  <td className="text-center">{menuDe(doc)}</td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
    </section>
  );
}
