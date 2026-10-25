import { esTagDeMaquinaPlan } from "@/lib/forestal/plan-documentos-tipos";
import { esTagDeMarca } from "@/lib/documentos/esenciales";
import { formatDateNumeric, formatNumber } from "@/lib/format";
import type { DbDocument } from "@/lib/types/documents";
import { FileSpreadsheet, type Folder, FolderArchive, LayoutDashboard, Sparkles, Star, Clock, AlarmClock, CalendarDays, History, Link2, Copy, Hash, Monitor, Trash2, Users } from "@buleje/design-system/icons";
import { diasHasta } from "@/lib/documentos/aviso-vencimiento";

/**
 * Las etiquetas que se muestran como chips. Las de máquina de «Documentos del
 * plan» (`plan:`, `plan-carpeta:`, `campo:`, ADR-467) no: son un id que nadie
 * lee, y quitarlas a mano saca el papel de su casillero. Siguen en el dato.
 * Tampoco la marca de Esenciales (`marca:esencial`): se pone y se quita con su opción del menú.
 */
export const tagsVisibles = (tags: readonly string[] | null | undefined): string[] =>
  (tags ?? []).filter((t) => !esTagDeMaquinaPlan(t) && !esTagDeMarca(t));

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/** Estado de cada archivo mientras se sube (panel de progreso). */
export type EstadoArchivo = "en-cola" | "comprimiendo" | "subiendo" | "listo" | "error";

/**
 * Tienda activa. Es lo que separa lo guardado en el navegador (sugerencias
 * descartadas, carpeta vinculada del PC) entre dos empresas del mismo dueño.
 */
export function slugActivo(): string {
  try { return localStorage.getItem("active-tenant-slug") ?? "main"; } catch { return "main"; }
}

/** Clave por tenant de las sugerencias IA que el usuario descartó. */
export function sugDescartadasKey(): string {
  return `doc-sug-descartadas-${slugActivo()}`;
}

export const fmtFechaCorta = (iso: string) =>
  formatDateNumeric(iso, { soloFecha: true });

/**
 * A qué documento saltar cuando el que estás mirando se borra.
 *
 * `undefined` = el abierto no estaba en la tanda, no hay que tocar nada.
 * `null` = se borró y no queda ninguno: recién ahí se cierra el visor.
 */
export function sucesorTrasBorrar(
  lista: DbDocument[],
  abiertoId: string,
  borradosIds: string[],
): DbDocument | null | undefined {
  const borrados = new Set(borradosIds);
  if (!borrados.has(abiertoId)) return undefined;
  const desde = lista.findIndex((d) => d.id === abiertoId);
  // Primero el siguiente que sobreviva; si no hay ninguno después, el último
  // que quede antes — que es donde uno espera caer al borrar el final.
  const siguiente = lista.slice(desde + 1).find((d) => !borrados.has(d.id));
  if (siguiente) return siguiente;
  const quedan = lista.filter((d) => !borrados.has(d.id));
  return quedan[quedan.length - 1] ?? null;
}

/** Datos estructurados extraídos por IA (factura/recibo) guardados en ocrMetadata. */
type StructuredData = { docType?: string | null; ruc?: string | null; razonSocial?: string | null; numero?: string | null; fecha?: string | null; moneda?: string | null; total?: number | string | null; igv?: number | string | null };
function structuredOf(doc: DbDocument): StructuredData | null {
  const s = doc.ocrMetadata?.structured as StructuredData | null | undefined;
  return s && typeof s === "object" ? s : null;
}
function fmtMoney(v: number | string | null | undefined, moneda?: string | null): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.-]/g, ""));
  if (!isFinite(n)) return null;
  const sym = moneda === "USD" ? "$" : "S/";
  return `${sym} ${formatNumber(n, 2)}`;
}
/** Chip compacto en la card: muestra el total (o el tipo) del comprobante detectado. */
export function StructuredChip({ doc }: { doc: DbDocument }) {
  const s = structuredOf(doc);
  if (!s) return null;
  const total = fmtMoney(s.total, s.moneda);
  const label = total ?? (s.docType ? s.docType : null);
  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-[var(--data-success-500)]/12 px-1.5 py-0.5 text-sm font-bold text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/20 dark:text-[var(--data-success-500)]" title={`${s.docType ?? "comprobante"}${s.numero ? " " + s.numero : ""}`}>
      <FileSpreadsheet className="h-2.5 w-2.5" />{label}
    </span>
  );
}

/**
 * El texto en castellano que viene adentro de un error HTTP del drive
 * (`HTTP 503: {"error":"…","message":"…"}`). Sin esto, la pantalla mostraría el
 * cuerpo crudo de la respuesta, que no le sirve a nadie.
 */
export function mensajeDeError(msg: string, porDefecto = "No se pudo completar."): string {
  const json = msg.slice(msg.indexOf("{"));
  try {
    const parsed = JSON.parse(json) as { message?: string; error?: string };
    return parsed.message || parsed.error || porDefecto;
  } catch {
    // El cuerpo llega RECORTADO (el cliente corta a 200 caracteres), así que
    // parsearlo como JSON falla justo cuando el mensaje es largo — que es
    // cuando más falta hace leerlo. Se rescata el texto a mano, respetando las
    // comillas escapadas de adentro.
    const crudo = /"message"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(msg)?.[1];
    return crudo ? crudo.replace(/\\"/g, '"').replace(/\\\\/g, "\\") : porDefecto;
  }
}

export interface BuiltinCategory {
  id: "all" | "terceros" | "dashboard" | "assistant" | "favorites" | "recent" | "expiring" | "codigo" | "calendar" | "activity" | "enlaces" | "duplicados" | "sync" | "trash";
  label: string;
  icon: typeof Folder;
  color: string;
}

export const BUILTIN_CATEGORIES: BuiltinCategory[] = [
  { id: "all", label: "Todos", icon: FolderArchive, color: "text-primary" },
  { id: "terceros", label: "Terceros", icon: Users, color: "text-primary" },
  { id: "dashboard", label: "Resumen", icon: LayoutDashboard, color: "text-primary" },
  { id: "assistant", label: "Asistente IA", icon: Sparkles, color: "text-[var(--accent)]" },
  { id: "favorites", label: "Favoritos", icon: Star, color: "text-amber-500" },
  { id: "recent", label: "Recientes", icon: Clock, color: "text-[var(--text-secondary)]" },
  { id: "expiring", label: "Vencimientos", icon: AlarmClock, color: "text-[var(--data-warning)]" },
  // ADR-516 — papeles con código que todavía no se anotó en el físico.
  { id: "codigo", label: "Por registrar", icon: Hash, color: "text-[var(--data-warning)]" },
  { id: "calendar", label: "Calendario", icon: CalendarDays, color: "text-primary" },
  { id: "activity", label: "Actividad", icon: History, color: "text-[var(--accent)]" },
  { id: "enlaces", label: "Enlaces", icon: Link2, color: "text-[var(--accent)]" },
  { id: "duplicados", label: "Repetidos", icon: Copy, color: "text-[var(--text-tertiary)]" },
  { id: "sync", label: "Mi PC", icon: Monitor, color: "text-primary" },
  { id: "trash", label: "Papelera", icon: Trash2, color: "text-[var(--text-tertiary)]" },
];

/**
 * Vistas que dibujan su propio contenido en vez de la lista de documentos: no
 * les corresponde la toolbar de búsqueda/orden ni el filtro por estado.
 */
export const VISTAS_CON_CONTENIDO_PROPIO = new Set(["terceros", "dashboard", "assistant", "activity", "calendar", "enlaces", "duplicados", "sync"]);

/** Vistas que listan documentos y por eso dicen cuántas fotos de las cámaras quedan escondidas. */
export const MODOS_CON_LINEA_DE_FOTOS = new Set(["all", "recent", "favorites", "dashboard", "duplicados"]);

// ADR-119 — almacenamiento orientativo por plan (bytes). Sin gate duro: solo
// para el anillo visual. El límite real lo aplica el bucket (50 MB/archivo).
export const STORAGE_QUOTA_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

/** Días hasta el vencimiento (negativo = ya venció). null si no vence. */
export function daysUntil(iso: string | null): number | null {
  return diasHasta(iso);
}

// Los helpers del árbol de carpetas viven en `@/lib/documentos/folder-tree`
// (compartidos con MoveToFolderModal).

// ─────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────

/** Los modos del drive, estables: el hook los usa como dependencia. */
export const DRIVE_MODOS = [
  "all", "terceros", "dashboard", "assistant", "favorites", "recent", "expiring", "codigo", "calendar",
  "folder", "activity", "enlaces", "duplicados", "sync", "trash", "smart",
] as const;

/**
 * La carpeta abierta viaja en `?carpeta=` — es lo que hace compartible un
 * «mirá acá». Va aparte de `?sub=folder` porque es un ID de entidad, no una
 * vista: el modo dice QUÉ se está mirando y la carpeta CUÁL.
 */
export function leerCarpetaDeUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("carpeta");
}

/** Escribe la carpeta sin tocar el historial: la entrada la crea el cambio de
 *  modo (`irAModo`), y duplicarla haría falta apretar «atrás» dos veces. */
export function escribirCarpetaEnUrl(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("carpeta", id);
    else url.searchParams.delete("carpeta");
    window.history.replaceState(null, "", url.toString());
  } catch {
    // history no disponible
  }
}

/**
 * Filtro por ETIQUETA del Archivo-hub (ADR-502): el deep-link «ver todo de esta
 * entidad». `etiqueta` es el tag (de máquina —`tercero:<id>`, `permiso:<titulo>`,
 * `colaborador:<id>`, `tramite:<id>`— o una semana) que trae TODOS los documentos
 * con ese tag cruzando carpetas; `et` es el rótulo humano para el cartel. Vive en
 * la URL igual que la carpeta para poder compartirse.
 */
export function leerEtiquetaDeUrl(): { tag: string; label: string } | null {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search);
  const tag = p.get("etiqueta");
  if (!tag) return null;
  return { tag, label: p.get("et") || tag };
}

export function escribirEtiquetaEnUrl(filtro: { tag: string; label: string } | null) {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (filtro) {
      url.searchParams.set("etiqueta", filtro.tag);
      if (filtro.label && filtro.label !== filtro.tag) url.searchParams.set("et", filtro.label);
      else url.searchParams.delete("et");
    } else {
      url.searchParams.delete("etiqueta");
      url.searchParams.delete("et");
    }
    window.history.replaceState(null, "", url.toString());
  } catch {
    // history no disponible
  }
}

/** Ancho de la barra lateral del drive, arrastrable — clamp para que nunca quede ilegible ni tape el contenido. */
export const SIDEBAR_MIN_W = 180;
export const SIDEBAR_MAX_W = 400;
export const SIDEBAR_DEFAULT_W = 240;
