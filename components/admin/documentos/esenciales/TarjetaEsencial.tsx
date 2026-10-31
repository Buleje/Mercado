"use client";

import { useState } from "react";
import {
  AlarmClock, AlertTriangle, ArrowLeft, ArrowRight, Eye, FileArchive, FolderOpen, GripHorizontal, Lock, Palette, ScanLine, Share2, StarOff, Upload, Link2,
} from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { cn } from "@/lib/utils";
import type { DbDocumentFolder } from "@/lib/types/documents";
import type { CarpetaEsencial } from "@/lib/documentos/esenciales";
import { FolderGlyph } from "../folder-visuals";
import MarcasCarpeta from "../explorador/MarcasCarpeta";
import { formatBytes } from "../archivo-visual";
import { haceCuanto, papeles, quienLaVe, subcarpetas, veces } from "./compartido";

export interface AccionesTarjeta {
  ver: (f: DbDocumentFolder) => void;
  abrirEnArchivo: (f: DbDocumentFolder) => void;
  compartir: (f: DbDocumentFolder) => void;
  expediente: (f: DbDocumentFolder) => void;
  terceros: (f: DbDocumentFolder) => void;
  quitar: (f: DbDocumentFolder) => void;
  /** Archivos soltados encima: se suben a esta carpeta. */
  soltarArchivos: (f: DbDocumentFolder, e: React.DragEvent) => void;
  /** «Mi orden»: pone la carpeta `id` justo antes de `antesDe`. */
  moverAntesDe: (id: string, antesDe: string) => void;
  /** «Mi orden» desde el menú (también en el celular, donde no se arrastra). */
  mover: (f: DbDocumentFolder, hacia: -1 | 1) => void;
  /** «Escanear aquí»: el escáner del Archivo, guardando en esta carpeta. */
  escanear: (f: DbDocumentFolder) => void;
  /** «Cambiar ícono»: emoji, ícono o color de la carpeta. */
  cambiarIcono: (f: DbDocumentFolder) => void;
}

/** Lo que viaja al arrastrar una tarjeta para reordenar (distinto de archivos del disco). */
export const TIPO_ARRASTRE = "application/x-buleje-esencial";

function queTrae(ev: React.DragEvent): "archivos" | "orden" | null {
  const tipos = [...ev.dataTransfer.types];
  return tipos.includes("Files") ? "archivos" : tipos.includes(TIPO_ARRASTRE) ? "orden" : null;
}

/**
 * Una carpeta de Esenciales como carpeta grande: su ícono (emoji, imagen o
 * color que le pusiste en el Archivo), dónde vive, cuánto tiene, cuánto se
 * usa y lo que vence. El clic la elige y su contenido se abre al costado.
 */
export default function TarjetaEsencial({ e, elegida, ahora, puesto, acciones }: {
  e: CarpetaEsencial<DbDocumentFolder>;
  elegida: boolean;
  ahora: number;
  /** Para apagar «Mover antes/después» en las puntas. */
  puesto: { primera: boolean; ultima: boolean };
  acciones: AccionesTarjeta;
}) {
  const f = e.carpeta;
  const acceso = quienLaVe(f.allowedRoles);
  const ultima = haceCuanto(e.ultima, ahora);
  const [encima, setEncima] = useState<null | "archivos" | "orden">(null);
  const [arrastrando, setArrastrando] = useState(false);
  return (
    <li
      className={cn(
        "group relative flex min-w-0 flex-col rounded-2xl border bg-[var(--surface-raised)] transition-shadow hover:shadow-[var(--shadow-md)]",
        elegida ? "border-[var(--accent)] ring-2 ring-[var(--accent-muted)]" : "border-[var(--rule-base)]",
        encima === "archivos" && "border-dashed border-[var(--accent)] bg-[var(--accent-muted)]",
        encima === "orden" && "shadow-[inset_4px_0_0_var(--accent)]",
        arrastrando && "opacity-50",
      )}
      data-qa="esencial-tarjeta"
      data-elegida={elegida ? "1" : undefined}
      draggable
      onDragStart={(ev) => {
        ev.dataTransfer.setData(TIPO_ARRASTRE, f.id);
        ev.dataTransfer.effectAllowed = "move";
        setArrastrando(true);
      }}
      onDragEnd={() => setArrastrando(false)}
      onDragOver={(ev) => {
        const tipo = queTrae(ev);
        if (!tipo || arrastrando) return;
        ev.preventDefault();
        ev.stopPropagation();
        ev.dataTransfer.dropEffect = tipo === "archivos" ? "copy" : "move";
        if (encima !== tipo) setEncima(tipo);
      }}
      onDragLeave={(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setEncima(null); }}
      onDrop={(ev) => {
        // Se lee de lo soltado y no del estado: el último «dragover» puede no haberse dibujado todavía.
        const tipo = queTrae(ev);
        setEncima(null);
        if (!tipo || arrastrando) return;
        ev.preventDefault();
        ev.stopPropagation();
        if (tipo === "archivos") { acciones.soltarArchivos(f, ev); return; }
        const id = ev.dataTransfer.getData(TIPO_ARRASTRE);
        if (id && id !== f.id) acciones.moverAntesDe(id, f.id);
      }}
    >
      {encima === "archivos" && (
        <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-2xl text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
          <Upload className="h-5 w-5" /> Suelta para subir aquí
        </span>
      )}
      <GripHorizontal
        aria-hidden="true"
        className="absolute left-1/2 top-0.5 h-5 w-5 -translate-x-1/2 cursor-grab text-[var(--text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100"
      />
      <button
        type="button"
        onClick={() => acciones.ver(f)}
        onDoubleClick={() => acciones.abrirEnArchivo(f)}
        aria-pressed={elegida}
        aria-label={`Ver lo que tiene ${f.name}`}
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-3 rounded-2xl p-4 pr-12 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
          encima === "archivos" && "opacity-30",
        )}
      >
        <span className="flex items-center gap-3">
          <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] text-3xl">
            <FolderGlyph folder={f} active={elegida} className="h-8 w-8" />
            <MarcasCarpeta carpeta={f} sinEsencial className="absolute -bottom-1 -right-1 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-1 py-0.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-base font-extrabold leading-snug text-[var(--text-primary)]">{f.name}</span>
            <span className="block truncate text-xs text-[var(--text-tertiary)]">
              {e.ruta.length > 0 ? `en ${e.ruta.join(" › ")}` : "en la raíz del Archivo"}
            </span>
          </span>
        </span>

        <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--text-secondary)]">
          <span className="font-bold tabular-nums text-[var(--text-primary)]">{papeles(e.docs)}</span>
          {e.subcarpetas > 0 && <span className="tabular-nums">{subcarpetas(e.subcarpetas)}</span>}
          {e.bytes > 0 && <span className="tabular-nums">{formatBytes(e.bytes)}</span>}
        </span>

        <span className="mt-auto flex flex-wrap items-center gap-1.5 text-xs">
          <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--surface-sunken)] px-2 py-1 text-[var(--text-secondary)]" title="Aperturas de sus papeles en los últimos 90 días">
            <Eye className="h-4 w-4" />
            {e.vistas > 0 ? `Abierta ${veces(e.vistas)}` : "Sin abrir"}
          </span>
          {ultima && <span className="px-1 text-[var(--text-tertiary)]">{ultima}</span>}
          {e.vencidos > 0 && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--data-error-50)] px-2 py-1 font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]">
              <AlertTriangle className="h-4 w-4" /> {e.vencidos} vencido{e.vencidos === 1 ? "" : "s"}
            </span>
          )}
          {e.porVencer > 0 && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--data-warning-50)] px-2 py-1 font-bold text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/15">
              <AlarmClock className="h-4 w-4" /> {e.porVencer} por vencer
            </span>
          )}
          {acceso.cerrada && (
            <span className="inline-flex items-center gap-1 px-1 text-[var(--text-tertiary)]" title={`La ven: ${acceso.texto}`}>
              <Lock className="h-4 w-4" />
            </span>
          )}
        </span>
      </button>

      <span className="absolute right-2 top-2">
        <ActionMenu
          label={`Opciones de ${f.name}`}
          soloIcono
          size="sm"
          actions={[
            { id: "ver", label: "Ver lo que tiene", icon: Eye, onSelect: () => acciones.ver(f) },
            { id: "abrir", label: "Abrir en el Archivo", icon: FolderOpen, onSelect: () => acciones.abrirEnArchivo(f) },
            { id: "escanear", label: "Escanear aquí", hint: "Con la cámara; el papel queda en esta carpeta", icon: ScanLine, onSelect: () => acciones.escanear(f) },
            { id: "icono", label: "Cambiar ícono", icon: Palette, onSelect: () => acciones.cambiarIcono(f) },
            { id: "compartir", label: "Compartir carpeta", icon: Share2, onSelect: () => acciones.compartir(f) },
            { id: "expediente", label: "Armar expediente PDF", icon: FileArchive, disabled: e.docs === 0, onSelect: () => acciones.expediente(f) },
            {
              id: "terceros",
              label: "Vínculos con el sistema…",
              icon: Link2,
              onSelect: () => acciones.terceros(f),
            },
            { id: "antes", label: "Mover antes", icon: ArrowLeft, disabled: puesto.primera, onSelect: () => acciones.mover(f, -1), seccion: "Mi orden" },
            { id: "despues", label: "Mover después", icon: ArrowRight, disabled: puesto.ultima, onSelect: () => acciones.mover(f, 1), seccion: "Mi orden" },
            { id: "quitar", label: "Quitar de Esenciales", icon: StarOff, onSelect: () => acciones.quitar(f) },
          ]}
        />
      </span>
    </li>
  );
}
