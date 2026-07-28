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
 *
 * El ancho lo decide el usuario: se agarra el borde y se estira como en el
 * explorador de Windows (`use-ancho-panel`), y también se puede plegar del todo
 * cuando el documento pide toda la pantalla. La medida queda guardada.
 */

import { useCallback, useMemo, useState } from "react";
import {
  Folder as FolderIcon, FolderPlus, ChevronRight, Check, Loader2, X, Search, PanelLeftClose,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DbDocumentFolder } from "@/lib/types/documents";
import { buildChildrenMap, descendantIds, folderPath } from "@/lib/documentos/folder-tree";
import { useAnchoPanel } from "@/hooks/use-ancho-panel";
import RamaCarpeta, { type AccionesCarpeta, type EstadoArbol } from "./RamaCarpeta";

export type { AccionesCarpeta };

const CLAVE_ANCHO = "bsm-drive-panel-carpetas";
const ANCHO_INICIAL = 224; // = w-56, el de siempre
const ANCHO_MIN = 168;
const ANCHO_MAX = 520;

interface Props {
  folders: DbDocumentFolder[];
  /** Carpeta donde vive el documento abierto. */
  folderId: string | null;
  /** Carpeta que se está mirando en el explorador (puede ser otra). */
  carpetaActiva?: string | null;
  acciones: AccionesCarpeta;
}

export default function PanelCarpetasDoc({ folders, folderId, carpetaActiva, acciones }: Props) {
  const hijosDe = useMemo(() => buildChildrenMap(folders), [folders]);
  const porId = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const { ancho, arrastrando, colapsado, alternarColapso, propsDivisor } = useAnchoPanel({
    clave: CLAVE_ANCHO,
    inicial: ANCHO_INICIAL,
    min: ANCHO_MIN,
    max: ANCHO_MAX,
  });

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
  const [filtro, setFiltro] = useState("");

  /**
   * Qué pasa AL BORRAR, comprobado contra la base y no contra el schema: el
   * schema declara borrado en cascada, pero la base no lo aplica — las
   * subcarpetas y los documentos NO se pierden, quedan sueltos en la raíz.
   * El aviso dice eso, que es lo que va a ver el usuario después.
   */
  const borrar = useCallback(async (carpeta: DbDocumentFolder) => {
    if (!acciones.onBorrar || ocupado) return;
    const dentro = descendantIds(hijosDe, carpeta.id);
    const docsSueltos = [carpeta.id, ...dentro]
      .reduce((t, id) => t + (porId.get(id)?.documentCount ?? 0), 0);

    const partes = [`¿Borrar la carpeta "${carpeta.name}"?`, ""];
    if (dentro.size > 0) {
      partes.push(`Sus ${dentro.size} subcarpeta${dentro.size === 1 ? "" : "s"} NO se borran: quedan sueltas, fuera de toda carpeta.`);
      partes.push([...dentro].map((id) => `  · ${porId.get(id)?.name ?? id}`).join("\n"));
      partes.push("");
    }
    partes.push(
      docsSueltos > 0
        ? `Los ${docsSueltos} documento${docsSueltos === 1 ? "" : "s"} que hay adentro tampoco se borran: quedan sin carpeta.`
        : "No hay documentos adentro.",
    );
    partes.push("", "Se borra sólo la carpeta, y eso no se puede deshacer.");

    if (!confirm(partes.join("\n"))) return;
    setOcupado(true);
    try {
      await acciones.onBorrar(carpeta.id);
    } finally {
      setOcupado(false);
    }
  }, [acciones, hijosDe, ocupado, porId]);

  const alternar = useCallback((id: string) =>
    setAbiertas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    }), []);

  const crear = useCallback(async () => {
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
  }, [acciones, creandoEn, nombreNuevo, ocupado]);

  const renombrar = useCallback(async (id: string) => {
    const nombre = nombreEdit.trim();
    if (!nombre || ocupado) { setEditando(null); return; }
    setOcupado(true);
    try {
      await acciones.onRenombrar(id, nombre);
      setEditando(null);
    } finally {
      setOcupado(false);
    }
  }, [acciones, nombreEdit, ocupado]);

  const arbol: EstadoArbol = {
    hijosDe, folderId, carpetaActiva, abiertas, alternar, acciones, ocupado,
    editando, nombreEdit, setNombreEdit,
    iniciarEdicion: (c) => { setEditando(c.id); setNombreEdit(c.name); },
    cancelarEdicion: () => setEditando(null),
    renombrar,
    creandoEn,
    iniciarCreacion: (parentId) => { setCreandoEn(parentId); setNombreNuevo(""); },
    cancelarCreacion: () => setCreandoEn(undefined),
    nombreNuevo, setNombreNuevo, crear, borrar,
  };

  const raiz = hijosDe.get(null) ?? [];
  /** Con el buscador escrito se listan planas: el árbol sólo estorba. */
  const coincidencias = useMemo(() => {
    const aguja = filtro.trim().toLowerCase();
    if (!aguja) return [];
    return folders.filter((f) => f.name.toLowerCase().includes(aguja));
  }, [filtro, folders]);

  // Plegado: queda un riel angosto con el botón para traerlo de vuelta. No se
  // desmonta el panel entero para que el estado del árbol siga ahí al volver.
  if (colapsado) {
    return (
      <div className="hidden shrink-0 flex-col items-center gap-2 border-r border-[var(--rule-base)] bg-[var(--surface-raised)] px-1.5 py-2 xl:flex">
        <button
          onClick={alternarColapso}
          title="Mostrar las carpetas"
          aria-label="Mostrar el panel de carpetas"
          className="rounded-lg p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-primary"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <FolderIcon className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
      </div>
    );
  }

  return (
    <>
      <aside
        className="hidden shrink-0 flex-col overflow-y-auto border-r border-[var(--rule-base)] bg-[var(--surface-raised)] xl:flex"
        style={{ width: `${ancho}px` }}
        aria-label="Carpetas del drive"
      >
        <div className="flex items-center justify-between gap-1 border-b border-[var(--rule-soft)] px-3 py-2">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Carpetas</p>
          <span className="flex items-center">
            <button
              onClick={() => { setCreandoEn(null); setNombreNuevo(""); }}
              title="Crear una carpeta"
              aria-label="Crear una carpeta"
              className="rounded p-1 text-[var(--text-tertiary)] hover:text-primary"
            >
              <FolderPlus className="h-4 w-4" />
            </button>
            <button
              onClick={alternarColapso}
              title="Plegar el panel (deja toda la pantalla para el documento)"
              aria-label="Plegar el panel de carpetas"
              className="rounded p-1 text-[var(--text-tertiary)] hover:text-primary"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </span>
        </div>

        {folders.length > 6 && (
          <div className="flex items-center gap-1.5 border-b border-[var(--rule-soft)] px-2 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
            <input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Buscar carpeta"
              aria-label="Buscar carpeta"
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
            />
            {filtro && (
              <button onClick={() => setFiltro("")} className="rounded p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]" aria-label="Limpiar la búsqueda">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

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

          {(filtro.trim() ? coincidencias : raiz).map((f) => (
            <RamaCarpeta key={f.id} carpeta={f} nivel={0} arbol={arbol} />
          ))}

          {filtro.trim() && coincidencias.length === 0 && (
            <li className="px-2 py-3 text-xs text-[var(--text-tertiary)]">
              Ninguna carpeta se llama así.
            </li>
          )}

          {folders.length === 0 && creandoEn === undefined && (
            <li className="px-2 py-3 text-xs text-[var(--text-tertiary)]">
              Todavía no hay carpetas. Creá una con el botón de arriba para ordenar tus documentos.
            </li>
          )}
        </ul>
      </aside>

      {/* El borde que se agarra. Angosto a la vista, ancho al mouse: la línea
          mide 1px pero la zona de agarre 5, que es lo que hace que no haya que
          apuntar con precisión de cirujano. */}
      <div
        {...propsDivisor}
        className={cn(
          "group/divisor hidden w-[5px] shrink-0 cursor-col-resize touch-none select-none bg-transparent transition-colors xl:block",
          "hover:bg-primary/40 focus-visible:bg-primary focus-visible:outline-none",
          arrastrando && "bg-primary",
        )}
        title="Arrastrá para cambiar el ancho · doble clic para volver al normal"
      />
    </>
  );
}
