import {
  Folder, FileText, Scale, Receipt, Building2, Wrench, ShieldCheck, Landmark, Package, Camera,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

/**
 * Personalización visual de carpetas (color + ícono). El schema `DocumentFolder`
 * ya tenía los campos `color`/`icon`; acá viven la paleta, el set de íconos y el
 * glifo que los renderiza. Compartido por el árbol lateral, los breadcrumbs y el
 * modal de edición.
 */

// Paleta de datos (no es cromo del DS: es una elección del usuario, como el color
// de una categoría). Se aplica por `style` inline, así que no pasa por el gate de tokens.
export const FOLDER_COLORS: { key: string; label: string; value: string }[] = [
  { key: "teal", label: "Turquesa", value: "#0d9488" },
  { key: "blue", label: "Azul", value: "#2563eb" },
  { key: "violet", label: "Violeta", value: "#7c3aed" },
  { key: "amber", label: "Ámbar", value: "#d97706" },
  { key: "rose", label: "Rojo", value: "#e11d48" },
  { key: "emerald", label: "Verde", value: "#059669" },
  { key: "slate", label: "Gris", value: "#475569" },
];

// Íconos Lucide (no emojis — regla del DS). La clave se guarda en `folder.icon`.
export const FOLDER_ICON_OPTIONS: { key: string; label: string; Icon: typeof Folder }[] = [
  { key: "folder", label: "Carpeta", Icon: Folder },
  { key: "contract", label: "Contrato", Icon: FileText },
  { key: "legal", label: "Legal", Icon: Scale },
  { key: "receipt", label: "Recibos", Icon: Receipt },
  { key: "building", label: "Local", Icon: Building2 },
  { key: "tool", label: "Mantenimiento", Icon: Wrench },
  { key: "shield", label: "Licencias", Icon: ShieldCheck },
  { key: "bank", label: "Banco", Icon: Landmark },
  { key: "box", label: "Inventario", Icon: Package },
  { key: "photo", label: "Fotos", Icon: Camera },
];

const ICON_MAP: Record<string, typeof Folder> = Object.fromEntries(
  FOLDER_ICON_OPTIONS.map((o) => [o.key, o.Icon])
);

/**
 * Renderiza el ícono de una carpeta con su color/ícono custom (o el default).
 *
 * El EMOJI gana sobre el ícono: si el dueño se tomó el trabajo de ponerle uno,
 * es lo que quiere ver. Va como texto (no es iconografía del sistema, es
 * contenido del usuario) y hereda el tamaño de la clase para no descuadrar la fila.
 */
export function FolderGlyph({
  folder,
  active,
  className,
}: {
  folder: { icon: string | null; color: string | null; emoji?: string | null };
  active?: boolean;
  className?: string;
}) {
  if (folder.emoji?.trim()) {
    return (
      <span className={cn(className, "inline-flex items-center justify-center leading-none")} aria-hidden="true">
        {folder.emoji}
      </span>
    );
  }
  const Icon = (folder.icon && ICON_MAP[folder.icon]) || Folder;
  const style = folder.color ? { color: folder.color } : undefined;
  const cls = folder.color ? "" : active ? "text-primary" : "text-[var(--text-tertiary)]";
  return <Icon className={cn(className, cls)} style={style} />;
}
