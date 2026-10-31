"use client";

import type { DbDocument } from "@/lib/types/documents";
import { getFileIcon, formatBytes } from "../archivo-visual";
import { pinta, StatusControl } from "./estado-doc";
import { precargarVisor } from "../precargar-visores";
import { familiaDe, etiquetaTipo } from "@/lib/documents/tipos-archivo";
import { cn } from "@/lib/utils";
import DocThumb from "../DocThumb";
import { Star, Sparkles } from "@buleje/design-system/icons";
import { descripcionDe } from "@/lib/documentos/relevancia";
import PorQueAparecio from "../PorQueAparecio";
import { FolderChip, ExpiryBadge } from "./piezas-sueltas";
import { StructuredChip, tagsVisibles } from "./compartido";
import { CodigoChip } from "../CodigoDocumento";

export function DocCard({
  doc, selected, isRenaming, renameValue, terminos, folderNombre,
  onSelect, onPreview, onSetStatus, menu, onMenuContextual,
  onStartRename, onCommitRename, onCancelRename, onRenameChange,
  onDragStart, onDragEnd, dragging, tagsActivos, onPromoteAiTag,
}: {
  doc: DbDocument;
  selected: boolean;
  isRenaming: boolean;
  renameValue: string;
  /** Términos buscados: deciden si se muestra la descripción o el fragmento. */
  terminos: string[];
  /** Nombre de la carpeta, null = sin carpeta, undefined = no mostrar el chip. */
  folderNombre?: string | null;
  onSelect: () => void;
  onPreview: () => void;
  onSetStatus: (s: string) => void;
  /** El «⋯» del documento (MenuDocumento): favorito, WhatsApp, descargar, eliminar y el resto. */
  menu: React.ReactNode;
  /** Clic derecho sobre la tarjeta: abre ese mismo menú donde está el mouse. */
  onMenuContextual: (e: React.MouseEvent) => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onRenameChange: (v: string) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  dragging: boolean;
  /** Etiquetas puestas en el filtro ahora mismo — para resaltarlas si el doc las tiene. */
  tagsActivos: string[];
  /** Aceptar una etiqueta sugerida por la IA como etiqueta real del documento. */
  onPromoteAiTag: (tag: string) => void;
}) {
  const { Icon, tint, bg } = getFileIcon(doc.mimeType, doc.name);
  // `none` no pinta nada: si todo tuviera color, el color no diría nada.
  const marca = doc.status && doc.status !== "none" ? pinta(doc.status) : null;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onContextMenu={onMenuContextual}
      // Pasar el mouse ya trae el visor: cuando hace clic, el chunk pesado
      // (exceljs / jszip) suele estar listo y la vista previa abre de una.
      onMouseEnter={() => precargarVisor(familiaDe(doc.name, doc.mimeType))}
      // El navegador se saltea el cálculo y el dibujo de las tarjetas que no
      // están en pantalla. En una carpeta con 292 documentos eso es casi todo:
      // antes se maquetaban las 292 aunque se vieran diez. El alto declarado
      // evita que la barra de scroll salte al entrar y salir cada tarjeta.
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 320px" }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border-2 bg-[var(--surface-raised)] transition-all cursor-grab active:cursor-grabbing",
        // El estado manda sobre el borde: es lo que permite barrer la carpeta
        // con la vista y ver cuáles hay que corregir sin leer un solo nombre.
        // La selección gana, porque es lo que estás haciendo en ese momento.
        selected ? "border-primary shadow-md"
          : marca ? cn(marca.borde, "hover:shadow-md")
          : "border-[var(--rule-base)] hover:border-primary/40 hover:shadow-md",
        dragging && "opacity-40"
      )}>
      {/* Franja del estado: el color se ve incluso con la tarjeta llena de texto. */}
      {marca && !selected && (
        <span aria-hidden className={cn("absolute inset-x-0 top-0 z-10 h-1.5", marca.franja)} />
      )}

      {/* Checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={(e) => { e.stopPropagation(); onSelect(); }}
        className={cn(
          "absolute top-2 left-2 z-10 h-5 w-5 rounded border-2 border-white/80 bg-white/85 accent-[var(--color-primary)] cursor-pointer",
          // Siempre visible (antes sólo con hover, invisible en touch/mobile
          // donde no hay hover): un poco tenue en reposo, sólido al elegir o
          // pasar el mouse — no compite con la miniatura pero se puede tocar.
          selected ? "opacity-100" : "opacity-60 group-hover:opacity-100"
        )}
        aria-label={`Seleccionar ${doc.name}`}
      />

      {/* Thumbnail — imagen real para imágenes, 1ª página para PDFs, ícono para el resto. */}
      <button onClick={onPreview} className="block w-full aspect-[4/3] bg-[var(--surface-sunken)] overflow-hidden" aria-label={`Ver ${doc.name}`}>
        <DocThumb doc={doc} Icon={Icon} tint={tint} bg={bg} />
      </button>

      {/* El «⋯» de la tarjeta: los cuatro íconos de 28 px que aparecían al
          pasar el mouse (favorito, WhatsApp, descargar, eliminar) viven ahora
          en el menú — en el celular, sin hover, ni se veían (11-10). Siempre a
          la vista, con 48 px de toque y el círculo chico para no tapar la foto. */}
      <div className="absolute right-0 top-0 z-10">{menu}</div>

      {/* Info */}
      <div className="p-3">
        <div className="flex items-center gap-1">
        {doc.favorite && <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400" aria-label="Favorito" />}
        {isRenaming ? (
          <input
            type="text"
            aria-label={`Renombrar ${doc.name}`}
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onCommitRename(); if (e.key === "Escape") onCancelRename(); }}
            onBlur={onCommitRename}
            ref={(el) => el?.focus()}
            className="min-w-0 flex-1 px-2 py-1 rounded-xl border-2 border-primary text-sm font-bold outline-none"
          />
        ) : (
          // El nombre es un dato, no un botón más: la miniatura ya abre la vista
          // previa con teclado; acá el doble clic renombra.
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events
          <p
            onClick={onPreview}
            onDoubleClick={(e) => { e.preventDefault(); onStartRename(); }}
            className="min-w-0 flex-1 cursor-pointer truncate text-left text-sm font-bold text-[var(--text-primary)] transition-colors hover:text-primary"
            title={`${doc.name}${descripcionDe(doc) ? `\n${descripcionDe(doc)!.texto}` : ""}\n(doble clic para renombrar)`}
          >
            {doc.name}
          </p>
        )}
        </div>
        <div className="flex items-center justify-between gap-2 text-sm">
          {/* Qué ES el archivo, no su MIME: "Hoja de cálculo · ODS" se entiende,
              "application/vnd.oasis.opendocument.spreadsheet" no. */}
          <span className="min-w-0 truncate text-[var(--text-tertiary)]" title={doc.category}>
            {etiquetaTipo(doc.name, doc.mimeType)}
          </span>
          <span className="shrink-0 tabular-nums text-[var(--text-tertiary)]">{formatBytes(doc.size)}</span>
        </div>
        {/* De qué se trata (o por qué apareció en la búsqueda). */}
        <PorQueAparecio doc={doc} terminos={terminos} />
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {/* ADR-516 — el código del papel; en coral mientras falta anotarlo en el físico. */}
          <CodigoChip doc={doc} />
          {folderNombre !== undefined && <FolderChip nombre={folderNombre} />}
          {/* Sin estado no se dibuja nada: ponerlo es «⋯ › Estado». */}
          {marca && <StatusControl status={doc.status} onChange={onSetStatus} />}
          <ExpiryBadge expiresAt={doc.expiresAt} />
          <StructuredChip doc={doc} />
        </div>
        {(tagsVisibles(doc.tags).length > 0 || doc.aiTags.length > 0) && (() => {
          // Una sola etiqueta a la vista (la tuya; si no hay, la sugerida por la
          // IA) y el resto en el «+N» al pasar el mouse. Las de máquina del
          // plan (`plan:`, `campo:`) no se cuentan: nadie las lee.
          const tags = tagsVisibles(doc.tags);
          const sugeridas = doc.aiTags.filter((t) => !doc.tags.includes(t));
          const primera = tags[0];
          const resto = [...tags.slice(primera ? 1 : 0), ...sugeridas.slice(primera ? 0 : 1)];
          const ia = !primera ? sugeridas[0] : undefined;
          return (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {primera && (
                <span
                  title={`#${primera} — para filtrar por esta etiqueta usa «Filtros»`}
                  className={cn(
                    "max-w-full truncate text-sm px-1.5 py-0.5 rounded font-bold",
                    tagsActivos.includes(primera)
                      ? "bg-primary text-white"
                      : "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
                  )}
                >
                  #{primera}
                </span>
              )}
              {ia && (
                <button
                  onClick={(e) => { e.stopPropagation(); onPromoteAiTag(ia); }}
                  title="Sugerencia de la IA — clic para aceptarla como etiqueta"
                  className="inline-flex max-w-full items-center gap-0.5 truncate rounded bg-violet-100 px-1.5 py-0.5 text-sm font-bold text-[var(--accent)] hover:bg-violet-200"
                >
                  <Sparkles className="h-2.5 w-2.5" />{ia}
                </button>
              )}
              {resto.length > 0 && (
                <span className="cursor-help text-sm font-bold tabular-nums text-[var(--text-tertiary)]" title={resto.map((t) => `#${t}`).join("  ")}>
                  +{resto.length}
                </span>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
