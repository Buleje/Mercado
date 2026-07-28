"use client";

/**
 * PanelCarpetasDoc — el árbol de carpetas al costado del documento abierto.
 *
 * Antes, para acomodar un archivo había que cerrar el visor, buscar la carpeta
 * en el drive, arrastrarlo, y volver a abrirlo. Acá el árbol está a la vista
 * mientras se mira el documento: se ve dónde está guardado, se lo mueve con un
 * clic, y si la carpeta que hace falta no existe se crea sin salir —incluida
 * una subcarpeta dentro de otra.
 *
 * El archivo abierto marca su carpeta, así que la pregunta "¿dónde estaba
 * esto?" se contesta mirando, no navegando.
 */

import { useMemo, useState } from "react";
import {
  Folder as FolderIcon, FolderPlus, ChevronRight, ChevronDown, Check, Loader2, Pencil, X,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DbDocumentFolder } from "@/lib/types/documents";
import { buildChildrenMap, folderPath } from "@/lib/documentos/folder-tree";

export interface AccionesCarpeta {
  onMover: (folderId: string | null) => Promise<void> | void;
  onCrear: (nombre: string, parentId: string | null) => Promise<void> | void;
  onRenombrar: (id: string, nombre: string) => Promise<void> | void;
}

interface Props {
  folders: DbDocumentFolder[];
  /** Carpeta donde vive el documento abierto. */
  folderId: string | null;
  acciones: AccionesCarpeta;
}

export default function PanelCarpetasDoc({ folders, folderId, acciones }: Props) {
  const hijosDe = useMemo(() => buildChildrenMap(folders), [folders]);
  const porId = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  /** Se abren solas las carpetas del camino hasta el archivo. */
  const [abiertas, setAbiertas] = useState<Set<string>>(() => {
    const ruta = folderId ? folderPath(porId, folderId) : [];
    return new Set(ruta.map((f) => f.id));
  });
  const [creandoEn, setCreandoEn] = useState<string | null | undefined>(undefined);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [nombreEdit, setNombreEdit] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const alternar = (id: string) =>
    setAbiertas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const crear = async () => {
    const nombre = nombreNuevo.trim();
    if (!nombre || ocupado) return;
    setOcupado(true);
    try {
      await acciones.onCrear(nombre, creandoEn ?? null);
      // Si se creó dentro de una carpeta, dejarla abierta para verla aparecer.
      if (creandoEn) setAbiertas((s) => new Set(s).add(creandoEn));
      setCreandoEn(undefined);
      setNombreNuevo("");
    } finally {
      setOcupado(false);
    }
  };

  const renombrar = async (id: string) => {
    const nombre = nombreEdit.trim();
    if (!nombre || ocupado) { setEditando(null); return; }
    setOcupado(true);
    try {
      await acciones.onRenombrar(id, nombre);
      setEditando(null);
    } finally {
      setOcupado(false);
    }
  };

  /** Una carpeta y, debajo, las suyas. */
  function Rama({ carpeta, nivel }: { carpeta: DbDocumentFolder; nivel: number }) {
    const hijos = hijosDe.get(carpeta.id) ?? [];
    const abierta = abiertas.has(carpeta.id);
    const esLaDelArchivo = carpeta.id === folderId;

    return (
      <li>
        <div
          className={cn(
            "group/carpeta flex items-center gap-1 rounded-lg pr-1 transition-colors",
            esLaDelArchivo ? "bg-primary/10" : "hover:bg-[var(--surface-sunken)]",
          )}
          style={{ paddingLeft: `${nivel * 12}px` }}
        >
          <button
            onClick={() => alternar(carpeta.id)}
            className={cn("shrink-0 rounded p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]", hijos.length === 0 && "invisible")}
            aria-label={abierta ? "Contraer" : "Expandir"}
          >
            {abierta ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>

          {editando === carpeta.id ? (
            <input
              autoFocus
              value={nombreEdit}
              onChange={(e) => setNombreEdit(e.target.value)}
              onBlur={() => renombrar(carpeta.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") renombrar(carpeta.id);
                if (e.key === "Escape") setEditando(null);
              }}
              className="min-w-0 flex-1 rounded border border-primary bg-[var(--surface-raised)] px-1 py-0.5 text-sm text-[var(--text-primary)] outline-none"
            />
          ) : (
            <button
              onClick={() => acciones.onMover(carpeta.id)}
              disabled={esLaDelArchivo}
              title={esLaDelArchivo ? "El documento ya está acá" : `Mover el documento a ${carpeta.name}`}
              className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-sm disabled:cursor-default"
            >
              <FolderIcon className={cn("h-3.5 w-3.5 shrink-0", esLaDelArchivo ? "text-primary" : "text-[var(--text-tertiary)]")} />
              <span className={cn("truncate", esLaDelArchivo ? "font-bold text-[var(--text-primary)]" : "text-[var(--text-secondary)]")}>
                {carpeta.name}
              </span>
              {esLaDelArchivo && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
            </button>
          )}

          {editando !== carpeta.id && (
            <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/carpeta:opacity-100">
              <button
                onClick={() => { setCreandoEn(carpeta.id); setNombreNuevo(""); }}
                title="Crear una subcarpeta acá"
                aria-label={`Crear una subcarpeta dentro de ${carpeta.name}`}
                className="rounded p-1 text-[var(--text-tertiary)] hover:text-primary"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => { setEditando(carpeta.id); setNombreEdit(carpeta.name); }}
                title="Cambiar el nombre"
                aria-label={`Cambiar el nombre de ${carpeta.name}`}
                className="rounded p-1 text-[var(--text-tertiary)] hover:text-primary"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
        </div>

        {/* Campo para la subcarpeta nueva, justo debajo de su madre. */}
        {creandoEn === carpeta.id && (
          <div className="flex items-center gap-1 py-1" style={{ paddingLeft: `${(nivel + 1) * 12 + 18}px` }}>
            <input
              autoFocus
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") crear();
                if (e.key === "Escape") setCreandoEn(undefined);
              }}
              placeholder="Nombre de la subcarpeta"
              className="min-w-0 flex-1 rounded border border-primary bg-[var(--surface-raised)] px-1.5 py-1 text-sm text-[var(--text-primary)] outline-none"
            />
            <button onClick={crear} disabled={ocupado} className="rounded p-1 text-primary disabled:opacity-40" aria-label="Crear la carpeta">
              {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </button>
            <button onClick={() => setCreandoEn(undefined)} className="rounded p-1 text-[var(--text-tertiary)]" aria-label="Cancelar">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {abierta && hijos.length > 0 && (
          <ul>
            {hijos.map((h) => <Rama key={h.id} carpeta={h} nivel={nivel + 1} />)}
          </ul>
        )}
      </li>
    );
  }

  const raiz = hijosDe.get(null) ?? [];

  return (
    <aside
      className="hidden w-56 shrink-0 flex-col overflow-y-auto border-r border-[var(--rule-base)] bg-[var(--surface-raised)] xl:flex"
      aria-label="Carpetas del drive"
    >
      <div className="flex items-center justify-between gap-1 border-b border-[var(--rule-soft)] px-3 py-2">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Carpetas</p>
        <button
          onClick={() => { setCreandoEn(null); setNombreNuevo(""); }}
          title="Crear una carpeta"
          aria-label="Crear una carpeta"
          className="rounded p-1 text-[var(--text-tertiary)] hover:text-primary"
        >
          <FolderPlus className="h-4 w-4" />
        </button>
      </div>

      <ul className="flex-1 px-1.5 py-1.5">
        {/* La raíz también es un destino: sacar el archivo de toda carpeta. */}
        <li>
          <button
            onClick={() => acciones.onMover(null)}
            disabled={folderId === null}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors disabled:cursor-default",
              folderId === null ? "bg-primary/10 font-bold text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
            )}
          >
            <FolderIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
            Sin carpeta
            {folderId === null && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
          </button>
        </li>

        {creandoEn === null && (
          <li className="flex items-center gap-1 py-1 pl-2">
            <input
              autoFocus
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") crear();
                if (e.key === "Escape") setCreandoEn(undefined);
              }}
              placeholder="Nombre de la carpeta"
              className="min-w-0 flex-1 rounded border border-primary bg-[var(--surface-raised)] px-1.5 py-1 text-sm text-[var(--text-primary)] outline-none"
            />
            <button onClick={crear} disabled={ocupado} className="rounded p-1 text-primary disabled:opacity-40" aria-label="Crear la carpeta">
              {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </button>
            <button onClick={() => setCreandoEn(undefined)} className="rounded p-1 text-[var(--text-tertiary)]" aria-label="Cancelar">
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        )}

        {raiz.map((f) => <Rama key={f.id} carpeta={f} nivel={0} />)}

        {folders.length === 0 && creandoEn === undefined && (
          <li className="px-2 py-3 text-xs text-[var(--text-tertiary)]">
            Todavía no hay carpetas. Creá una con el botón de arriba para ordenar tus documentos.
          </li>
        )}
      </ul>
    </aside>
  );
}
