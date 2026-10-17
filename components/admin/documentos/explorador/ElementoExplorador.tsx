"use client";

/**
 * Un elemento del explorador del Archivo (carpeta o archivo) en íconos
 * grandes, medianos o lista. Como en Windows:
 *
 * - clic = lo marca (Ctrl/⌘+clic lo suma a la selección si es un archivo);
 * - doble clic = abre (entra a la carpeta o abre el archivo);
 * - en el celular un toque abre y mantener presionado muestra las opciones;
 * - clic derecho = opciones.
 *
 * El teclado (flechas, Enter, F2, Shift+F10) lo maneja `VistaExplorador`,
 * que es quien sabe cuál es el de al lado.
 */

import { useState, type DragEvent, type MouseEvent as ReactMouseEvent } from "react";
import { Star } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import { formatBytes, getFileIcon } from "../archivo-visual";
import DocThumb from "../DocThumb";
import { FolderGlyph, docDeIconoCarpeta } from "../folder-visuals";
import { urlMiniatura } from "@/lib/documents/miniatura-version";
import { usePulsacionLarga } from "./use-pulsacion-larga";
import type { PuntoDeMenu } from "./ubicar-menu";
import type { VistaIconos } from "./vista-archivo";

type Objeto = { tipo: "carpeta"; carpeta: DbDocumentFolder } | { tipo: "doc"; doc: DbDocument };

interface Props {
  vista: VistaIconos;
  objeto: Objeto;
  clave: string;
  /** El que recibe el Tab (uno solo en toda la grilla). */
  enfocable: boolean;
  /** Marcado con un clic (resaltado suave). */
  marcado: boolean;
  /** En la selección del lote (archivos). */
  seleccionado: boolean;
  onClic: (e: ReactMouseEvent) => void;
  onAbrir: () => void;
  onMenu: (punto: PuntoDeMenu) => void;
  onFoco: () => void;
  onSoltarDoc?: (docId: string) => void;
  onArrastrar?: (arrastrando: boolean) => void;
}

const TONO_CARPETA = "text-[var(--data-warning-500)]";

function Portada({ objeto, vista }: { objeto: Objeto; vista: VistaIconos }) {
  const [fallo, setFallo] = useState(false);
  if (objeto.tipo === "doc") {
    const { Icon, tint, bg } = getFileIcon(objeto.doc.mimeType, objeto.doc.name);
    if (vista === "lista") {
      return (
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", bg)}>
          <Icon className={cn("h-4 w-4", tint)} aria-hidden />
        </span>
      );
    }
    return <DocThumb doc={objeto.doc} Icon={Icon} tint={tint} bg={bg} iconClassName={vista === "grandes" ? "h-12 w-12" : "h-8 w-8"} />;
  }
  const f = objeto.carpeta;
  if (vista === "lista") return <FolderGlyph folder={f} tono={TONO_CARPETA} className="h-6 w-6 shrink-0" />;
  const imagen = docDeIconoCarpeta(f.icon);
  if (imagen && !fallo) {
    return (
      <span className="relative block h-full w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={urlMiniatura(imagen)} alt="" loading="lazy" onError={() => setFallo(true)} className="h-full w-full object-cover" />
        <span className="absolute bottom-1 left-1 flex h-6 w-6 items-center justify-center rounded-md bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]">
          <FolderGlyph folder={{ ...f, icon: null, emoji: null }} tono={TONO_CARPETA} className="h-4 w-4" />
        </span>
      </span>
    );
  }
  return (
    <FolderGlyph
      folder={imagen ? { ...f, icon: null } : f}
      tono={TONO_CARPETA}
      className={cn(vista === "grandes" ? "h-20 w-20 text-6xl" : "h-12 w-12 text-4xl", "stroke-[1.5]")}
    />
  );
}

export default function ElementoExplorador({
  vista, objeto, clave, enfocable, marcado, seleccionado, onClic, onAbrir, onMenu, onFoco, onSoltarDoc, onArrastrar,
}: Props) {
  const pulsacion = usePulsacionLarga(onMenu);
  const [sobre, setSobre] = useState(false);
  // Arrastrar para mover, sólo con mouse: en el celular mantener presionado
  // es el menú, y un `draggable` lo convertiría en arrastre.
  const [conMouse] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(hover: hover)").matches);
  const esCarpeta = objeto.tipo === "carpeta";
  const nombre = esCarpeta ? objeto.carpeta.name : objeto.doc.name;
  const n = esCarpeta ? objeto.carpeta.documentCount ?? 0 : 0;
  const meta = esCarpeta ? `${n} ${n === 1 ? "archivo" : "archivos"}` : formatBytes(objeto.doc.size);

  const arrastre = esCarpeta
    ? {
        onDragOver: (e: DragEvent) => {
          if (!e.dataTransfer.types.includes("application/x-doc-id")) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setSobre(true);
        },
        onDragLeave: () => setSobre(false),
        onDrop: (e: DragEvent) => {
          if (!e.dataTransfer.types.includes("application/x-doc-id")) return;
          e.preventDefault();
          e.stopPropagation();
          setSobre(false);
          onSoltarDoc?.(e.dataTransfer.getData("application/x-doc-id"));
        },
      }
    : !conMouse ? {} : {
        draggable: true,
        onDragStart: (e: DragEvent) => {
          e.dataTransfer.setData("application/x-doc-id", objeto.doc.id);
          e.dataTransfer.effectAllowed = "move";
          onArrastrar?.(true);
        },
        onDragEnd: () => onArrastrar?.(false),
      };

  return (
    <div
      role="option"
      aria-selected={seleccionado || marcado}
      aria-label={esCarpeta ? `Carpeta ${nombre}, ${meta}` : nombre}
      tabIndex={enfocable ? 0 : -1}
      data-clave={clave}
      data-qa={esCarpeta ? "explorador-carpeta" : "explorador-archivo"}
      title={nombre}
      {...pulsacion.handlers}
      {...arrastre}
      onFocus={onFoco}
      onClick={(e) => {
        if (pulsacion.yaDisparo()) return;
        if (pulsacion.esTactil() && !e.ctrlKey && !e.metaKey) { onAbrir(); return; }
        onClic(e);
      }}
      onDoubleClick={() => { if (!pulsacion.esTactil()) onAbrir(); }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (pulsacion.yaDisparo()) return;
        pulsacion.marcarDisparo();
        // El foco vuelve acá al cerrar el menú con Escape (el clic derecho no enfoca solo).
        e.currentTarget.focus({ preventScroll: true });
        onMenu({ x: e.clientX, y: e.clientY });
      }}
      className={cn(
        "group relative flex cursor-default select-none rounded-xl border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
        vista === "lista" ? "min-h-12 flex-row items-center gap-2.5 px-2" : "flex-col items-center gap-1.5 p-2 text-center",
        seleccionado
          ? "border-primary/50 bg-primary/10"
          : marcado
            ? "border-[var(--rule-base)] bg-[var(--surface-sunken)]"
            : "border-transparent hover:bg-[var(--surface-sunken)]",
        sobre && "border-primary bg-primary/10 ring-2 ring-primary",
      )}
    >
      {vista === "lista" ? (
        <Portada objeto={objeto} vista={vista} />
      ) : (
        <span
          className={cn(
            "relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg",
            vista === "grandes" ? "aspect-square w-full" : "h-20 w-20",
            !esCarpeta && "border border-[var(--rule-soft)] bg-[var(--surface-sunken)]",
          )}
        >
          <Portada objeto={objeto} vista={vista} />
          {!esCarpeta && objeto.doc.favorite && (
            <Star className="absolute right-1 top-1 h-4 w-4 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]" aria-label="Favorito" />
          )}
        </span>
      )}
      <span
        className={cn(
          "min-w-0 font-semibold text-[var(--text-primary)]",
          vista === "lista" ? "flex-1 truncate text-sm" : "line-clamp-2 w-full break-words",
          vista === "grandes" ? "text-sm" : vista === "medianos" ? "text-xs" : "",
        )}
      >
        {nombre}
      </span>
      {vista === "grandes" && <span className="text-xs tabular-nums text-[var(--text-tertiary)]">{meta}</span>}
    </div>
  );
}
