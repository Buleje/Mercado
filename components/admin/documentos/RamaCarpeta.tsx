"use client";

/**
 * RamaCarpeta — una carpeta del árbol lateral y, debajo, las suyas.
 *
 * Vive en su propio archivo (y no adentro del panel) por una razón práctica: un
 * componente declarado dentro del render se re-crea en cada pintada y React lo
 * trata como otro componente, así que el input de renombrar perdía el foco al
 * tipear. Acá la identidad es estable.
 */

import {
  Folder as FolderIcon, FolderPlus, FolderInput, ChevronRight, ChevronDown, Check, Loader2, Pencil, X, Trash2,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DbDocumentFolder } from "@/lib/types/documents";

export interface AccionesCarpeta {
  onMover: (folderId: string | null) => Promise<void> | void;
  /**
   * Entrar a la carpeta para mirar lo que tiene. Es lo que hace el clic en el
   * nombre: antes ese clic MOVÍA el documento, que es una acción destructiva
   * disparada por el gesto más común de un explorador de archivos.
   */
  onNavegar?: (folderId: string | null) => void;
  /**
   * Soltar un archivo cualquiera en una carpeta, arrastrándolo. `onMover` sólo
   * sabe mover el documento abierto; acá el que se arrastra puede ser
   * cualquiera de los que están a la vista.
   */
  onMoverDoc?: (docId: string, folderId: string | null) => Promise<void> | void;
  onCrear: (nombre: string, parentId: string | null) => Promise<void> | void;
  onRenombrar: (id: string, nombre: string) => Promise<void> | void;
  /** Opcional: si no se pasa, el panel no ofrece borrar. */
  onBorrar?: (id: string) => Promise<void> | void;
}

/** Todo lo que la rama necesita del panel, en un solo objeto (evita 15 props). */
export interface EstadoArbol {
  hijosDe: Map<string | null, DbDocumentFolder[]>;
  /** Carpeta donde vive el documento abierto. */
  folderId: string | null;
  /** Carpeta que se está mirando ahora (puede no ser la del documento). */
  carpetaActiva?: string | null;
  /** Carpeta sobre la que se está soltando un archivo ahora mismo. */
  carpetaRecibiendo?: string | null;
  marcarRecibiendo: (id: string | null | undefined) => void;
  abiertas: Set<string>;
  alternar: (id: string) => void;
  acciones: AccionesCarpeta;
  ocupado: boolean;
  editando: string | null;
  nombreEdit: string;
  setNombreEdit: (v: string) => void;
  iniciarEdicion: (c: DbDocumentFolder) => void;
  cancelarEdicion: () => void;
  renombrar: (id: string) => void;
  creandoEn: string | null | undefined;
  iniciarCreacion: (parentId: string | null) => void;
  cancelarCreacion: () => void;
  nombreNuevo: string;
  setNombreNuevo: (v: string) => void;
  crear: () => void;
  borrar: (c: DbDocumentFolder) => void;
}

export default function RamaCarpeta({
  carpeta,
  nivel,
  arbol,
}: {
  carpeta: DbDocumentFolder;
  nivel: number;
  arbol: EstadoArbol;
}) {
  const hijos = arbol.hijosDe.get(carpeta.id) ?? [];
  const abierta = arbol.abiertas.has(carpeta.id);
  const esLaDelArchivo = carpeta.id === arbol.folderId;
  const esLaQueMiro = arbol.carpetaActiva !== undefined && carpeta.id === arbol.carpetaActiva;
  const recibiendo = arbol.carpetaRecibiendo === carpeta.id;
  const editando = arbol.editando === carpeta.id;

  return (
    <li>
      <div
        // Se puede soltar un archivo acá, como en el explorador de Windows.
        onDragOver={(e) => {
          if (!arbol.acciones.onMoverDoc) return;
          if (!e.dataTransfer.types.includes("application/x-doc-id")) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          arbol.marcarRecibiendo(carpeta.id);
        }}
        onDragLeave={() => arbol.marcarRecibiendo(undefined)}
        onDrop={(e) => {
          const id = e.dataTransfer.getData("application/x-doc-id");
          arbol.marcarRecibiendo(undefined);
          if (!id || !arbol.acciones.onMoverDoc) return;
          e.preventDefault();
          e.stopPropagation();
          arbol.acciones.onMoverDoc(id, carpeta.id);
        }}
        className={cn(
          "group/carpeta flex items-center gap-1 rounded-lg pr-1 transition-colors",
          // Mientras el archivo está encima, la carpeta lo dice: sin esto no se
          // sabe dónde va a caer y se suelta en la de al lado.
          recibiendo && "ring-2 ring-primary bg-primary/20",
          esLaQueMiro
            ? "bg-primary/15 ring-1 ring-primary/40"
            : esLaDelArchivo
              ? "bg-primary/10"
              : "hover:bg-[var(--surface-sunken)]",
        )}
        style={{ paddingLeft: `${nivel * 12}px` }}
      >
        <button
          onClick={() => arbol.alternar(carpeta.id)}
          className={cn(
            "shrink-0 rounded p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
            hijos.length === 0 && "invisible",
          )}
          aria-label={abierta ? "Contraer" : "Expandir"}
        >
          {abierta ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        {editando ? (
          <input
            autoFocus
            value={arbol.nombreEdit}
            onChange={(e) => arbol.setNombreEdit(e.target.value)}
            onBlur={() => arbol.renombrar(carpeta.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") arbol.renombrar(carpeta.id);
              if (e.key === "Escape") arbol.cancelarEdicion();
            }}
            className="min-w-0 flex-1 rounded border border-primary bg-[var(--surface-raised)] px-1 py-0.5 text-sm text-[var(--text-primary)] outline-none"
          />
        ) : (
          <button
            onClick={() =>
              arbol.acciones.onNavegar
                ? arbol.acciones.onNavegar(carpeta.id)
                : arbol.acciones.onMover(carpeta.id)
            }
            title={arbol.acciones.onNavegar ? `Ver lo que hay en ${carpeta.name}` : `Mover el documento a ${carpeta.name}`}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-sm"
          >
            <FolderIcon className={cn("h-3.5 w-3.5 shrink-0", esLaDelArchivo ? "text-primary" : "text-[var(--text-tertiary)]")} />
            <span className={cn("truncate", esLaDelArchivo ? "font-bold text-[var(--text-primary)]" : "text-[var(--text-secondary)]")}>
              {carpeta.name}
            </span>
            {/* Cuántos hay adentro: dice de un vistazo dónde está lo que
                buscás, sin entrar a cada carpeta. */}
            {!!carpeta.documentCount && (
              <span className="ml-auto shrink-0 rounded-full bg-[var(--surface-sunken)] px-1.5 text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-tertiary)]">
                {carpeta.documentCount}
              </span>
            )}
            {esLaDelArchivo && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
          </button>
        )}

        {!editando && (
          <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/carpeta:opacity-100">
            {arbol.acciones.onNavegar && !esLaDelArchivo && (
              <button
                onClick={() => arbol.acciones.onMover(carpeta.id)}
                title={`Mover el documento a ${carpeta.name}`}
                aria-label={`Mover el documento a ${carpeta.name}`}
                className="rounded p-1 text-[var(--text-tertiary)] hover:text-primary"
              >
                <FolderInput className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => arbol.iniciarCreacion(carpeta.id)}
              title="Crear una subcarpeta acá"
              aria-label={`Crear una subcarpeta dentro de ${carpeta.name}`}
              className="rounded p-1 text-[var(--text-tertiary)] hover:text-primary"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => arbol.iniciarEdicion(carpeta)}
              title="Cambiar el nombre"
              aria-label={`Cambiar el nombre de ${carpeta.name}`}
              className="rounded p-1 text-[var(--text-tertiary)] hover:text-primary"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {arbol.acciones.onBorrar && (
              <button
                onClick={() => arbol.borrar(carpeta)}
                title="Borrar la carpeta"
                aria-label={`Borrar la carpeta ${carpeta.name}`}
                className="rounded p-1 text-[var(--text-tertiary)] hover:text-[var(--data-error)]"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        )}
      </div>

      {/* Campo para la subcarpeta nueva, justo debajo de su madre. */}
      {arbol.creandoEn === carpeta.id && (
        <div className="flex items-center gap-1 py-1" style={{ paddingLeft: `${(nivel + 1) * 12 + 18}px` }}>
          <input
            autoFocus
            value={arbol.nombreNuevo}
            onChange={(e) => arbol.setNombreNuevo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") arbol.crear();
              if (e.key === "Escape") arbol.cancelarCreacion();
            }}
            placeholder="Nombre de la subcarpeta"
            className="min-w-0 flex-1 rounded border border-primary bg-[var(--surface-raised)] px-1.5 py-1 text-sm text-[var(--text-primary)] outline-none"
          />
          <button onClick={arbol.crear} disabled={arbol.ocupado} className="rounded p-1 text-primary disabled:opacity-40" aria-label="Crear la carpeta">
            {arbol.ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button onClick={arbol.cancelarCreacion} className="rounded p-1 text-[var(--text-tertiary)]" aria-label="Cancelar">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {abierta && hijos.length > 0 && (
        <ul>
          {hijos.map((h) => (
            <RamaCarpeta key={h.id} carpeta={h} nivel={nivel + 1} arbol={arbol} />
          ))}
        </ul>
      )}
    </li>
  );
}
