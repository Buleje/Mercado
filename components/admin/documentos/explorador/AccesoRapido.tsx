"use client";

/**
 * «Acceso rápido» de la barra lateral del Archivo: lo fijado con clic derecho
 * › «Fijar en Acceso rápido», en el orden que quieras. Se reordena
 * arrastrando, o con «Subir»/«Bajar» del menú (clic derecho o mantener
 * presionado), que es también donde se quita.
 */

import { useState } from "react";
import { Pin } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { getFileIcon } from "../archivo-visual";
import { FolderGlyph } from "../folder-visuals";
import type { Fijado } from "./use-acceso-rapido";
import { usePulsacionLarga } from "./use-pulsacion-larga";
import type { PuntoDeMenu } from "./ubicar-menu";

interface Props {
  fijados: readonly Fijado[];
  carpetaPorId: ReadonlyMap<string, DbDocumentFolder>;
  docPorId: ReadonlyMap<string, DbDocument>;
  /** La carpeta abierta ahora (se pinta activa). */
  activaId: string | null;
  onAbrir: (f: Fijado) => void;
  onMenu: (f: Fijado, punto: PuntoDeMenu) => void;
  onReordenar: (id: string, destinoId: string) => void;
}

const TIPO_ARRASTRE = "application/x-fijado-id";

function FilaFijado({
  fijado, carpeta, doc, activa, sobre, onAbrir, onMenu, onArrastre,
}: {
  fijado: Fijado;
  carpeta?: DbDocumentFolder;
  doc?: DbDocument;
  activa: boolean;
  sobre: boolean;
  onAbrir: () => void;
  onMenu: (p: PuntoDeMenu) => void;
  onArrastre: Pick<React.HTMLAttributes<HTMLButtonElement>, "onDragStart" | "onDragOver" | "onDragLeave" | "onDrop" | "onDragEnd">;
}) {
  const pulsacion = usePulsacionLarga(onMenu);
  const nombre = carpeta?.name ?? doc?.name ?? fijado.nombre;
  const { Icon, tint } = getFileIcon(doc?.mimeType ?? "", nombre);
  return (
    <button
      type="button"
      draggable
      data-qa="acceso-rapido-item"
      {...pulsacion.handlers}
      {...onArrastre}
      onClick={() => { if (!pulsacion.yaDisparo()) onAbrir(); }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (pulsacion.yaDisparo()) return;
        pulsacion.marcarDisparo();
        e.currentTarget.focus({ preventScroll: true });
        onMenu({ x: e.clientX, y: e.clientY });
      }}
      onKeyDown={(e) => {
        if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          onMenu({ x: r.left + 8, y: r.bottom, arriba: r.top });
        }
      }}
      title={nombre}
      className={cn(
        "flex min-h-10 w-full min-w-0 items-center gap-2 rounded-xl px-3 text-left text-sm font-bold transition-colors",
        activa ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
        sobre && "ring-2 ring-primary",
      )}
    >
      {carpeta ? (
        <FolderGlyph folder={carpeta} active={activa} className="h-4 w-4 shrink-0" />
      ) : (
        <Icon className={cn("h-4 w-4 shrink-0", tint)} aria-hidden />
      )}
      <span className="flex-1 truncate">{nombre}</span>
    </button>
  );
}

export default function AccesoRapido({ fijados, carpetaPorId, docPorId, activaId, onAbrir, onMenu, onReordenar }: Props) {
  const [sobre, setSobre] = useState<string | null>(null);
  return (
    <section aria-label="Acceso rápido" className="mb-1" data-qa="acceso-rapido">
      <div className="flex items-center gap-1 px-3 py-2">
        <Pin className="h-3.5 w-3.5 text-[var(--text-tertiary)]" aria-hidden />
        <p className="flex-1 text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Acceso rápido</p>
        <InfoTip
          title="Acceso rápido"
          what="Lo que fijas con clic derecho › «Fijar en Acceso rápido» (carpetas o archivos)."
          affects="Arrástralos para cambiar el orden; con clic derecho los subes, bajas o quitas. Se guarda en este navegador."
          example="Fija «Facturas 2026» y llegas en un clic desde cualquier vista."
        />
      </div>
      {fijados.length === 0 ? (
        <p className="px-3 pb-2 text-xs text-[var(--text-tertiary)]">Nada fijado todavía.</p>
      ) : (
        <ul className="space-y-0.5">
          {fijados.map((f) => (
            <li key={f.id}>
              <FilaFijado
                fijado={f}
                carpeta={f.tipo === "carpeta" ? carpetaPorId.get(f.id) : undefined}
                doc={f.tipo === "archivo" ? docPorId.get(f.id) : undefined}
                activa={f.tipo === "carpeta" && activaId === f.id}
                sobre={sobre === f.id}
                onAbrir={() => onAbrir(f)}
                onMenu={(p) => onMenu(f, p)}
                onArrastre={{
                  onDragStart: (e) => {
                    e.dataTransfer.setData(TIPO_ARRASTRE, f.id);
                    e.dataTransfer.effectAllowed = "move";
                  },
                  onDragOver: (e) => {
                    if (!e.dataTransfer.types.includes(TIPO_ARRASTRE)) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setSobre(f.id);
                  },
                  onDragLeave: () => setSobre((s) => (s === f.id ? null : s)),
                  onDrop: (e) => {
                    if (!e.dataTransfer.types.includes(TIPO_ARRASTRE)) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setSobre(null);
                    onReordenar(e.dataTransfer.getData(TIPO_ARRASTRE), f.id);
                  },
                  onDragEnd: () => setSobre(null),
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
