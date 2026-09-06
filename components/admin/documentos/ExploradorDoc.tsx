"use client";

/**
 * ExploradorDoc — la columna del medio del visor: qué hay en esta carpeta.
 *
 * Antes, para pasar del documento abierto a otro de la misma carpeta había que
 * cerrar el visor, buscar el otro archivo en la grilla y volver a abrirlo. Con
 * esto el visor se comporta como un explorador: a la izquierda el árbol de
 * carpetas, acá el contenido de la que estás mirando, y a la derecha el
 * documento. Se salta de uno a otro con un clic, y se entra y se sale de las
 * carpetas sin perder de vista lo que estabas leyendo.
 *
 * La carpeta que se mira no es necesariamente la del documento abierto: podés
 * estar leyendo un contrato y curiosear la carpeta de facturas al lado.
 */

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  Folder as FolderIcon, ChevronRight, Home, ArrowUp, FileText,
  MessageCircle, Download, Star, Trash2, Check, Loader2,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { urlMiniatura } from "@/lib/documents/miniatura-version";
import { buildChildrenMap, folderPath } from "@/lib/documentos/folder-tree";
import { esImagenRenderizable } from "@/lib/documents/tipos-archivo";
import { familiaDe } from "@/lib/documents/tipos-archivo";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";

interface Props {
  docs: DbDocument[];
  folders: DbDocumentFolder[];
  /** null = la raíz del drive. */
  carpetaActiva: string | null;
  onNavegar: (folderId: string | null) => void;
  docActivoId: string;
  onAbrirDoc: (doc: DbDocument) => void;
  /**
   * Sube cuando algo se movió de carpeta: la lista tiene que volver a pedirse
   * porque el archivo que se arrastró ya no está donde estaba.
   */
  revision?: number;
  /**
   * Qué se puede hacer con varios archivos a la vez. Son las mismas acciones
   * de la barra del drive: si acá no estuvieran, habría que cerrar el visor
   * para borrar dos boletas o mandarle tres facturas al contador.
   */
  lote?: AccionesEnLote;
}

export interface AccionesEnLote {
  onWhatsApp: (docs: DbDocument[]) => void;
  onDescargarZip: (docs: DbDocument[]) => Promise<void> | void;
  onFavorito: (ids: string[]) => Promise<void> | void;
  onEliminar: (ids: string[]) => Promise<void> | void;
}

/** ¿Este archivo tiene carita dibujable, o va con ícono? */
function tieneMiniatura(doc: DbDocument): boolean {
  if (doc.mimeType === "application/pdf") return true;
  if (esImagenRenderizable(doc.name, doc.mimeType)) return true;
  const familia = familiaDe(doc.name, doc.mimeType);
  return familia === "planilla" || familia === "texto";
}

function pesoCorto(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export default function ExploradorDoc({
  docs, folders, carpetaActiva, onNavegar, docActivoId, onAbrirDoc, revision = 0, lote,
}: Props) {
  /** Los tildados. Se vacía al cambiar de carpeta: lo de allá ya no está a la vista. */
  const [elegidos, setElegidos] = useState<Set<string>>(() => new Set());
  const [ocupado, setOcupado] = useState(false);
  const hijosDe = useMemo(() => buildChildrenMap(folders), [folders]);
  const porId = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  const ruta = useMemo(
    () => (carpetaActiva ? folderPath(porId, carpetaActiva) : []),
    [porId, carpetaActiva],
  );
  const subcarpetas = hijosDe.get(carpetaActiva) ?? [];

  /**
   * Lo que hay en la carpeta que se está mirando.
   *
   * Los documentos que ya tiene el drive cargados se muestran al instante, pero
   * NO alcanzan: si el drive estaba filtrado por una carpeta, sólo tiene esa, y
   * entrar a cualquier otra mostraría un vacío que no es cierto. Así que además
   * se piden los de la carpeta destino. Sólo lo que está DIRECTAMENTE acá: las
   * subcarpetas se navegan, no se vuelcan todas juntas.
   */
  const yaCargados = useMemo(
    () => docs.filter((d) => (d.folderId ?? null) === carpetaActiva),
    [docs, carpetaActiva],
  );
  const [traidos, setTraidos] = useState<DbDocument[] | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    let vigente = true;
    setTraidos(null);
    setCargando(true);
    const qs = carpetaActiva === null ? "folderId=null" : `folderId=${encodeURIComponent(carpetaActiva)}`;
    fetch(`/api/admin/documents?${qs}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (vigente && j?.documents) setTraidos(j.documents as DbDocument[]); })
      .catch((err) => console.warn("[drive] no se pudo leer la carpeta", err))
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [carpetaActiva, revision]);

  const archivos = traidos ?? yaCargados;

  // Cambiar de carpeta limpia la selección: seguir con archivos tildados que
  // ya no se ven es la forma más fácil de borrar algo sin querer.
  useEffect(() => { setElegidos(new Set()); }, [carpetaActiva]);

  const alternar = (id: string) =>
    setElegidos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });

  const elegidosDocs = archivos.filter((d) => elegidos.has(d.id));

  /** Corre la acción y limpia, con el botón bloqueado mientras tanto. */
  const conLote = async (fn: () => Promise<void> | void, limpiar = true) => {
    setOcupado(true);
    try {
      await fn();
      if (limpiar) setElegidos(new Set());
    } catch (err) {
      console.warn("[drive] no se pudo completar la acción en lote", err);
    } finally {
      setOcupado(false);
    }
  };

  const madre = ruta.length > 1 ? ruta[ruta.length - 2].id : null;
  const nombreActual = ruta.length > 0 ? ruta[ruta.length - 1].name : "Todos los documentos";

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--rule-base)] bg-[var(--surface-raised)] dark:border-white/10">
      {/* Dónde estoy parado */}
      <div className="border-b border-[var(--rule-base)] px-2.5 py-2 dark:border-white/10">
        <nav className="flex flex-wrap items-center gap-0.5 text-[length:var(--ts-2xs)]">
          <button
            onClick={() => onNavegar(null)}
            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[var(--text-tertiary)] hover:text-primary"
          >
            <Home className="h-3 w-3" /> Todos
          </button>
          {ruta.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-0.5">
              <ChevronRight className="h-3 w-3 text-[var(--text-tertiary)]" />
              <button
                onClick={() => onNavegar(c.id)}
                className="max-w-[7rem] truncate rounded px-1 py-0.5 text-[var(--text-secondary)] hover:text-primary"
              >
                {c.name}
              </button>
            </span>
          ))}
        </nav>
        <p className="mt-1 truncate text-sm font-bold text-[var(--text-primary)]">{nombreActual}</p>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            {cargando && traidos === null ? "…" : archivos.length} archivo{archivos.length === 1 ? "" : "s"}
            {subcarpetas.length > 0 ? ` · ${subcarpetas.length} carpeta${subcarpetas.length === 1 ? "" : "s"}` : ""}
          </p>
          {lote && archivos.length > 0 && (
            <button
              onClick={() =>
                setElegidos(elegidos.size === archivos.length ? new Set() : new Set(archivos.map((d) => d.id)))
              }
              title={`Elige los ${archivos.length} de esta carpeta`}
              className="shrink-0 text-[length:var(--ts-2xs)] font-bold text-primary hover:underline"
            >
              {elegidos.size === archivos.length ? "Ninguno" : `Elegir los ${archivos.length}`}
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-1.5">
        {/* Subir un nivel: el gesto que uno busca sin pensarlo. */}
        {carpetaActiva !== null && (
          <button
            onClick={() => onNavegar(madre)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
          >
            <ArrowUp className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
            Subir un nivel
          </button>
        )}

        {subcarpetas.map((c) => (
          <button
            key={c.id}
            onClick={() => onNavegar(c.id)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--surface-sunken)]"
          >
            <FolderIcon className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--text-secondary)]">
              {c.name}
            </span>
            {!!c.documentCount && (
              <span className="shrink-0 rounded-full bg-[var(--surface-sunken)] px-1.5 text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-tertiary)]">
                {c.documentCount}
              </span>
            )}
          </button>
        ))}

        {archivos.length === 0 && subcarpetas.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-[var(--text-tertiary)]">
            {cargando ? "Abriendo la carpeta…" : "Esta carpeta está vacía."}
          </p>
        )}

        {archivos.map((d) => {
          const activo = d.id === docActivoId;
          return (
            <div
              key={d.id}
              // Sirve para apuntarle a una tarjeta concreta desde afuera (las
              // verificaciones automáticas la buscaban por su forma y agarraban
              // cualquier cosa del drive que quedó detrás del visor).
              data-doc-id={d.id}
              // Agarrar y soltar en una carpeta del árbol, como en el
              // explorador de Windows. El tipo `x-doc-id` es el mismo que usa
              // el drive, así que las zonas de destino ya saben leerlo; si el
              // archivo que arrastrás está tildado, se llevan TODOS los
              // tildados, como espera cualquiera que haya usado una PC.
              draggable
              onDragStart={(e) => {
                const enLote = elegidos.has(d.id) ? [...elegidos] : [];
                e.dataTransfer.setData("application/x-doc-id", d.id);
                if (enLote.length > 1) {
                  e.dataTransfer.setData("application/x-doc-ids", JSON.stringify(enLote));
                }
                e.dataTransfer.effectAllowed = "move";
              }}
              // El navegador se saltea las tarjetas fuera de pantalla: una
              // carpeta con cientos de archivos no tiene por qué maquetarse
              // entera para mostrar diez.
              style={{ contentVisibility: "auto", containIntrinsicSize: "auto 68px" }}
              className={cn(
                "group/fila flex w-full items-center gap-1.5 rounded-lg border p-1.5 text-left transition-colors",
                "cursor-grab active:cursor-grabbing",
                elegidos.has(d.id) && "ring-1 ring-primary",
                activo
                  ? "border-primary bg-primary/10"
                  : "border-transparent hover:border-[var(--rule-base)] hover:bg-[var(--surface-sunken)]",
              )}
            >
              {lote && (
                <button
                  onClick={(e) => { e.stopPropagation(); alternar(d.id); }}
                  title={elegidos.has(d.id) ? "Sacar de la selección" : "Elegir este archivo"}
                  aria-label={elegidos.has(d.id) ? `Sacar ${d.name} de la selección` : `Elegir ${d.name}`}
                  aria-pressed={elegidos.has(d.id)}
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                    elegidos.has(d.id)
                      ? "border-primary bg-primary text-white"
                      : "border-[var(--rule-mid)] bg-[var(--surface-raised)] opacity-0 group-hover/fila:opacity-100",
                    elegidos.size > 0 && "opacity-100",
                  )}
                >
                  {elegidos.has(d.id) && <Check className="h-3 w-3" />}
                </button>
              )}
              <button
                onClick={() => onAbrirDoc(d)}
                aria-current={activo ? "true" : undefined}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
              <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-[var(--surface-sunken)]">
                {tieneMiniatura(d) ? (
                  <Image
                    src={urlMiniatura(d.id)}
                    alt=""
                    fill
                    sizes="44px"
                    unoptimized
                    className="object-cover object-top"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center">
                    <FileText className="h-4 w-4 text-[var(--text-tertiary)]" />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-xs",
                    activo ? "font-bold text-[var(--text-primary)]" : "font-semibold text-[var(--text-secondary)]",
                  )}
                >
                  {d.name}
                </span>
                <span className="block text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                  {pesoCorto(d.size)}
                </span>
              </span>
              </button>
            </div>
          );
        })}
      </div>

      {lote && elegidos.size > 0 && (
        <div
          aria-label="Acciones para los archivos elegidos"
          className="border-t border-[var(--rule-base)] bg-primary p-2 text-white dark:border-white/10"
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-xs font-bold tabular-nums">
              {elegidos.size} elegido{elegidos.size === 1 ? "" : "s"}
            </span>
            <span className="flex items-center gap-2">
              {elegidos.size < archivos.length && (
                <button
                  onClick={() => setElegidos(new Set(archivos.map((x) => x.id)))}
                  className="text-[length:var(--ts-2xs)] font-bold underline opacity-90 hover:opacity-100"
                  title="Extender la selección a todo lo que hay en esta carpeta"
                >
                  Elegir los {archivos.length}
                </button>
              )}
              <button
                onClick={() => setElegidos(new Set())}
                className="text-[length:var(--ts-2xs)] font-bold underline opacity-90 hover:opacity-100"
              >
                Soltar
              </button>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => conLote(() => lote.onWhatsApp(elegidosDocs), false)}
              disabled={ocupado}
              className="inline-flex items-center justify-center gap-1 rounded-md bg-white/20 px-2 py-1.5 text-[length:var(--ts-2xs)] font-bold hover:bg-white/30 disabled:opacity-60"
            >
              <MessageCircle className="h-3 w-3" /> WhatsApp
            </button>
            <button
              onClick={() => conLote(() => lote.onDescargarZip(elegidosDocs), false)}
              disabled={ocupado}
              className="inline-flex items-center justify-center gap-1 rounded-md bg-white/20 px-2 py-1.5 text-[length:var(--ts-2xs)] font-bold hover:bg-white/30 disabled:opacity-60"
            >
              {ocupado ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} Descargar
            </button>
            <button
              onClick={() => conLote(() => lote.onFavorito([...elegidos]))}
              disabled={ocupado}
              className="inline-flex items-center justify-center gap-1 rounded-md bg-white/20 px-2 py-1.5 text-[length:var(--ts-2xs)] font-bold hover:bg-white/30 disabled:opacity-60"
            >
              <Star className="h-3 w-3" /> Favorito
            </button>
            <button
              onClick={() => {
                // Borrar varios de una es justo lo que no se puede deshacer de
                // memoria: se dice cuántos y cuáles antes de tocar nada.
                const nombres = elegidosDocs.slice(0, 4).map((d) => d.name).join(", ");
                const resto = elegidosDocs.length > 4 ? ` y ${elegidosDocs.length - 4} más` : "";
                if (!confirm(`¿Eliminar ${elegidos.size} archivo(s)?\n\n${nombres}${resto}`)) return;
                conLote(() => lote.onEliminar([...elegidos]));
              }}
              disabled={ocupado}
              className="inline-flex items-center justify-center gap-1 rounded-md bg-white/20 px-2 py-1.5 text-[length:var(--ts-2xs)] font-bold hover:bg-white/30 disabled:opacity-60"
            >
              <Trash2 className="h-3 w-3" /> Eliminar
            </button>
          </div>
          <p className="mt-1.5 text-center text-[length:var(--ts-2xs)] opacity-80">
            O arrastralos a una carpeta para moverlos todos.
          </p>
        </div>
      )}
    </aside>
  );
}
