"use client";

/**
 * UbicacionDoc — en qué carpeta está el documento, y moverlo sin salir.
 *
 * Estaba sólo dentro de la pestaña "Detalles": para saber dónde vivía un
 * archivo había que cambiar de pestaña, y para moverlo, abrir otro modal. Es de
 * las primeras cosas que uno mira al abrir algo ("¿esta factura está en la
 * carpeta del proveedor?"), así que vive en el encabezado, siempre a la vista.
 *
 * Muestra la ruta completa —Contratos › 2026 › Alquiler—, no sólo la carpeta
 * final: en un drive con subcarpetas, "2026" solo no dice nada.
 */

import { useMemo, useState } from "react";
import { Folder as FolderIcon, Loader2, Check } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DbDocumentFolder } from "@/lib/types/documents";
import { buildChildrenMap, flattenAll, folderPath } from "@/lib/documentos/folder-tree";

export default function UbicacionDoc({ folderId, folders, onMover, compacto }: {
  folderId: string | null;
  folders: DbDocumentFolder[];
  onMover: (folderId: string | null) => Promise<void> | void;
  /** En el encabezado va en una línea; en Detalles, como tarjeta. */
  compacto?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [moviendo, setMoviendo] = useState(false);

  const porId = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const ruta = useMemo(
    () => (folderId ? folderPath(porId, folderId).map((f) => f.name) : []),
    [folderId, porId],
  );
  const arbol = useMemo(() => flattenAll(buildChildrenMap(folders)), [folders]);

  const mover = async (destino: string | null) => {
    if (destino === folderId) { setAbierto(false); return; }
    setMoviendo(true);
    try {
      await onMover(destino);
      setAbierto(false);
    } finally {
      setMoviendo(false);
    }
  };

  const etiqueta = ruta.length > 0 ? ruta.join(" › ") : "Sin carpeta";

  return (
    <div className={cn("relative", compacto ? "inline-flex" : "block")}>
      <button
        onClick={() => setAbierto((v) => !v)}
        disabled={moviendo}
        aria-expanded={abierto}
        title={ruta.length > 0 ? `Está en ${etiqueta} — tocá para moverlo` : "No está en ninguna carpeta — tocá para guardarlo en una"}
        className={cn(
          "inline-flex max-w-full items-center gap-1.5 rounded-lg border text-xs font-bold transition-colors",
          compacto ? "px-2 py-1" : "w-full px-3 py-2 text-sm",
          folderId
            ? "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:border-primary hover:text-primary"
            : "border-dashed border-[var(--rule-strong)] text-[var(--text-tertiary)] hover:border-primary hover:text-primary",
        )}
      >
        {moviendo ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <FolderIcon className="h-3.5 w-3.5 shrink-0" />}
        <span className="truncate">{etiqueta}</span>
      </button>

      {abierto && (
        <>
          <button className="fixed inset-0 z-30 cursor-default" aria-label="Cerrar el selector de carpeta" onClick={() => setAbierto(false)} />
          <div className="absolute left-0 top-full z-40 mt-1 max-h-80 w-72 overflow-y-auto rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] py-1 shadow-xl">
            <p className="px-3 py-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Guardar en
            </p>
            <button
              onClick={() => mover(null)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--surface-sunken)]",
                folderId === null ? "font-bold text-[var(--text-primary)]" : "text-[var(--text-secondary)]",
              )}
            >
              <span className="w-4 shrink-0">{folderId === null && <Check className="h-3.5 w-3.5 text-primary" />}</span>
              Sin carpeta (raíz)
            </button>
            {arbol.map(({ folder, depth }) => (
              <button
                key={folder.id}
                onClick={() => mover(folder.id)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--surface-sunken)]",
                  folder.id === folderId ? "font-bold text-[var(--text-primary)]" : "text-[var(--text-secondary)]",
                )}
                style={{ paddingLeft: `${12 + depth * 14}px` }}
              >
                <span className="w-4 shrink-0">{folder.id === folderId && <Check className="h-3.5 w-3.5 text-primary" />}</span>
                <FolderIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
                <span className="truncate">{folder.name}</span>
              </button>
            ))}
            {arbol.length === 0 && (
              <p className="px-3 py-3 text-xs text-[var(--text-tertiary)]">
                Todavía no creaste carpetas. Podés crearlas desde la barra de la izquierda del drive.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
