"use client";

/**
 * Una carpeta como fila de la vista Detalles (la tabla del Archivo), arriba de
 * los archivos, como en Windows. Clic en el nombre o doble clic en la fila =
 * entrar; clic derecho, mantener presionado o «⋯» = opciones; se le pueden
 * soltar archivos encima para moverlos adentro.
 */

import { useRef, useState } from "react";
import { MoreHorizontal } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DbDocumentFolder } from "@/lib/types/documents";
import { formatDateShort } from "@/lib/format";
import { FolderGlyph } from "../folder-visuals";
import { usePulsacionLarga } from "./use-pulsacion-larga";
import { puntoDeElemento, type PuntoDeMenu } from "./ubicar-menu";

export interface ColumnasDetalles {
  categoria: boolean;
  tamano: boolean;
  subido: boolean;
  etiquetas: boolean;
  vencimiento: boolean;
}

interface Props {
  carpeta: DbDocumentFolder;
  cols: ColumnasDetalles;
  onAbrir: () => void;
  onMenu: (punto: PuntoDeMenu) => void;
  onSoltarDoc: (docId: string) => void;
}

const VACIO = <span className="text-xs text-[var(--text-tertiary)]">—</span>;

export default function FilaCarpetaDetalles({ carpeta: f, cols, onAbrir, onMenu, onSoltarDoc }: Props) {
  const [sobre, setSobre] = useState(false);
  const botonRef = useRef<HTMLButtonElement>(null);
  const pulsacion = usePulsacionLarga(onMenu);
  const n = f.documentCount ?? 0;

  return (
    <tr
      data-qa="detalles-carpeta"
      {...pulsacion.handlers}
      onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest("button, input, a")) onAbrir(); }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (pulsacion.yaDisparo()) return;
        pulsacion.marcarDisparo();
        onMenu({ x: e.clientX, y: e.clientY });
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("application/x-doc-id")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setSobre(true);
      }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("application/x-doc-id")) return;
        e.preventDefault();
        e.stopPropagation();
        setSobre(false);
        onSoltarDoc(e.dataTransfer.getData("application/x-doc-id"));
      }}
      className={cn(sobre && "bg-primary/10 outline outline-2 outline-primary")}
    >
      <td />
      <td>
        <button
          type="button"
          onClick={() => { if (!pulsacion.yaDisparo()) onAbrir(); }}
          className="flex min-h-11 min-w-0 items-center gap-3 text-left transition-colors hover:text-primary"
          title="Abrir carpeta"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center">
            <FolderGlyph folder={f} tono="text-[var(--data-warning-500)]" className="h-6 w-6" />
          </span>
          <span className="max-w-[280px] truncate font-bold text-[var(--text-primary)]">{f.name}</span>
        </button>
      </td>
      {cols.categoria && <td className="hidden sm:table-cell"><span className="text-xs text-[var(--text-secondary)]">Carpeta</span></td>}
      {cols.etiquetas && <td className="hidden lg:table-cell">{VACIO}</td>}
      {cols.vencimiento && <td className="hidden lg:table-cell">{VACIO}</td>}
      {cols.tamano && (
        <td className="hidden text-right tabular-nums text-[var(--text-secondary)] md:table-cell">
          {n} {n === 1 ? "archivo" : "archivos"}
        </td>
      )}
      {cols.subido && (
        <td className="hidden text-right tabular-nums text-[var(--text-tertiary)] md:table-cell">{formatDateShort(f.createdAt)}</td>
      )}
      <td className="text-center">
        <button
          ref={botonRef}
          type="button"
          onClick={(e) => { e.stopPropagation(); if (botonRef.current) onMenu(puntoDeElemento(botonRef.current, true)); }}
          aria-haspopup="menu"
          aria-label={`Opciones de la carpeta ${f.name}`}
          title="Más opciones (también con clic derecho)"
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden />
        </button>
      </td>
    </tr>
  );
}
