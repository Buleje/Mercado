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
  docs, folders, carpetaActiva, onNavegar, docActivoId, onAbrirDoc,
}: Props) {
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
  }, [carpetaActiva]);

  const archivos = traidos ?? yaCargados;

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
        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
          {cargando && traidos === null ? "…" : archivos.length} archivo{archivos.length === 1 ? "" : "s"}
          {subcarpetas.length > 0 ? ` · ${subcarpetas.length} carpeta${subcarpetas.length === 1 ? "" : "s"}` : ""}
        </p>
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
            <button
              key={d.id}
              onClick={() => onAbrirDoc(d)}
              // El navegador se saltea las tarjetas fuera de pantalla: una
              // carpeta con cientos de archivos no tiene por qué maquetarse
              // entera para mostrar diez.
              style={{ contentVisibility: "auto", containIntrinsicSize: "auto 68px" }}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border p-1.5 text-left transition-colors",
                activo
                  ? "border-primary bg-primary/10"
                  : "border-transparent hover:border-[var(--rule-base)] hover:bg-[var(--surface-sunken)]",
              )}
              aria-current={activo ? "true" : undefined}
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
          );
        })}
      </div>
    </aside>
  );
}
