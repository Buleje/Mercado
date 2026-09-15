"use client";

/**
 * Cómo se ve un archivo en el drive: su ícono y su peso.
 *
 * Vivían dentro de `DocumentosModule`, así que cualquier vista que quisiera
 * salir a su propio archivo (la papelera fue la primera) se quedaba sin ellos y
 * la tentación era clonarlos — dos tablas de íconos que se desincronizan.
 */

import {
  File as FileIcon,
  FileText,
  FileSpreadsheet,
  FileArchive,
  Image as ImageIcon,
  Film,
  Music,
  Presentation,
  MessageCircle,
  Scan,
} from "@buleje/design-system/icons";
import { familiaDe, type FamiliaArchivo } from "@/lib/documents/tipos-archivo";

export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Los colores de acá son DECORATIVOS a propósito y no usan los tokens
 * `--data-{success,warning,error}`: sirven para distinguir un PDF de una
 * planilla de un audio de un vistazo. Un PDF no es un "error" ni una planilla
 * un "éxito" — mapearlos a tokens de estado se vería igual y significaría mal.
 *
 * Ícono y tinte por FAMILIA (no por MIME crudo): el drive guarda casi cualquier
 * formato y el navegador manda la mitad como `octet-stream`, así que el tipo se
 * resuelve por extensión. Sin esto, un .ods o una foto HEIC salían con el ícono
 * genérico de "archivo".
 */
export const ICONO_POR_FAMILIA: Record<FamiliaArchivo, { Icon: typeof FileIcon; tint: string; bg: string }> = {
  imagen: { Icon: ImageIcon, tint: "text-[var(--accent)]", bg: "bg-pink-50 dark:bg-pink-500/15" },
  video: { Icon: Film, tint: "text-[var(--accent)]", bg: "bg-violet-50 dark:bg-violet-500/15" },
  audio: { Icon: Music, tint: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-500/15" },
  pdf: { Icon: FileText, tint: "text-red-500", bg: "bg-red-50 dark:bg-red-500/15" },
  planilla: { Icon: FileSpreadsheet, tint: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-500/15" },
  texto: { Icon: FileText, tint: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-500/15" },
  presentacion: { Icon: Presentation, tint: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-500/15" },
  comprimido: { Icon: FileArchive, tint: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-500/15" },
  correo: { Icon: MessageCircle, tint: "text-sky-500", bg: "bg-sky-50 dark:bg-sky-500/15" },
  plano: { Icon: Scan, tint: "text-teal-500", bg: "bg-teal-50 dark:bg-teal-500/15" },
  otro: { Icon: FileIcon, tint: "text-[var(--text-tertiary)]", bg: "bg-[var(--surface-sunken)]" },
};

export function getFileIcon(type: string, nombre = ""): { Icon: typeof FileIcon; tint: string; bg: string } {
  return ICONO_POR_FAMILIA[familiaDe(nombre, type)];
}
