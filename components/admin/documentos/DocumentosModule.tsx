"use client";

/**
 * DocumentosModule v2 — Drive interno enterprise (sprint 2026-05-10).
 *
 * Reemplaza el módulo client-only con localStorage. Persistencia real
 * vía Supabase Storage + Prisma. Multi-tenant. Features:
 *   • Drag & drop multi-archivo con progress
 *   • Carpetas custom anidadas (sidebar)
 *   • Bulk actions (select + delete/move/tag/favorite)
 *   • Renombrar inline (doble-click)
 *   • Compartir con link público (token + opcional password)
 *   • Versionado (subir v2, ver historial)
 *   • Audit log por documento
 *   • Firma digital visual (canvas → sello en PDF)
 *   • Generador de plantillas (contrato, recibo, cotización, acuerdo)
 *   • Auto-categorización IA (Claude/OpenAI vision)
 *   • Búsqueda con OCR (ocrText ILIKE)
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import {
  Upload, Search, Grid3x3, List, FolderArchive,
  FileSpreadsheet, File as FileIcon, Download, Trash2, Eye,
  Plus, Folder, Star, Clock, HardDrive, X, Sparkles, Check, CheckSquare, Monitor,
  Camera, AlarmClock, Wand2, Tag, MoreVertical, MoreHorizontal, FileArchive, Loader2,
  ChevronRight, ChevronDown, ChevronUp, Pencil, FolderInput, MessageCircle, Palette, History, BellRing, PenLine, Share2, FolderTree,
  CalendarDays, Stamp, Combine, LayoutDashboard, RotateCw, Scissors, Scan, FileStack, Link2, Copy, Columns3, ArrowUpDown,
} from "@buleje/design-system/icons";
import { DataTable } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { ModuleActionMenu } from "@/components/admin/shared/ModuleActionMenu";
import { useDocuments, getSignedDownloadUrl, analyzeDoc, mergeDocs, rotateDoc, splitDoc, fetchTags, fetchSharedLinks } from "@/hooks/use-documents";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import { buildChildrenMap, flattenVisible, flattenAll, folderPath, descendantIds } from "@/lib/documentos/folder-tree";
import FolderBulkBar from "./FolderBulkBar";
import { ConfirmarBorrarCarpetas, type BorradoCarpetas } from "./ConfirmarBorrarCarpetas";
import SyncEscritorioView from "./SyncEscritorioView";
import EstadoCarpetaLocalBadge from "./EstadoCarpetaLocalBadge";
import { isAnalyzableMime } from "@/lib/documents/analyzable-mime";
import { ordenarPorRelevancia, tieneDescripcion } from "@/lib/documentos/relevancia";
import FiltrosDoc from "@/components/admin/documentos/FiltrosDoc";
import {
  FILTROS_VACIOS, cumpleFiltros, familiasPresentes, tagsPresentes, cuantosFiltrosActivos,
  type FiltrosDoc as FiltrosDocumento,
} from "@/lib/documentos/filtros-doc";
import { palabrasUtiles } from "@/lib/documentos/terminos-busqueda";
import { urlMiniatura } from "@/lib/documents/miniatura-version";
import PorQueAparecio, { TerminosIA } from "./PorQueAparecio";
import { precargarVisor } from "./precargar-visores";
import {
  META_ESTADO, ORDEN_ESTADOS, estadoDe as estadoDeDoc, type EstadoDoc, type TonoEstado,
} from "@/lib/documents/estados-doc";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { TemplateGenerator } from "./TemplateGenerator";
import { SendWhatsAppModal } from "./SendWhatsAppModal";
import ImportarCarpetaModal from "./ImportarCarpetaModal";
import { archivosDesdeDrop } from "@/lib/documentos/importar-arbol";
import { useImportCarpeta } from "@/contexts/import-carpeta-context";
import { familiaDe, etiquetaTipo, esImagenRenderizable, esImagenConvertible } from "@/lib/documents/tipos-archivo";
import { MoveToFolderModal } from "./MoveToFolderModal";
import { FolderEditModal } from "./FolderEditModal";
import { FolderShareModal } from "./FolderShareModal";
import { FolderGlyph } from "./folder-visuals";
import { ActivityView } from "./ActivityView";
import { EnlacesView } from "./EnlacesView";
import DuplicadosView from "./DuplicadosView";
import { CalendarView } from "./CalendarView";
import { StampModal } from "./StampModal";
import { DashboardView } from "./DashboardView";
import { SmartFolderModal } from "./SmartFolderModal";
import { CameraScanModal } from "./CameraScanModal";
import { PageEditorModal } from "./PageEditorModal";
import { loadSmartFolders, saveSmartFolders, matchesSmartFolder, describeRules, type SmartFolder } from "@/lib/documentos/smart-folders";
import { AssistantView } from "./AssistantView";
import { TagTaxonomyModal } from "./TagTaxonomyModal";
import { TagEditModal } from "./TagEditModal";
import { BulkTagModal } from "./BulkTagModal";
import { PapeleraView } from "./PapeleraView";
import { formatBytes, getFileIcon } from "./archivo-visual";

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/** Estado de cada archivo mientras se sube (panel de progreso). */
type EstadoArchivo = "en-cola" | "comprimiendo" | "subiendo" | "listo" | "error";

/**
 * Tienda activa. Es lo que separa lo guardado en el navegador (sugerencias
 * descartadas, carpeta vinculada del PC) entre dos empresas del mismo dueño.
 */
function slugActivo(): string {
  try { return localStorage.getItem("active-tenant-slug") ?? "main"; } catch { return "main"; }
}

/** Clave por tenant de las sugerencias IA que el usuario descartó. */
function sugDescartadasKey(): string {
  return `doc-sug-descartadas-${slugActivo()}`;
}

const fmtFechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

/**
 * Miniatura de la card de la grilla: imagen real para archivos de imagen y
 * render de la 1ª página para PDFs (endpoint `/thumbnail`). Si el render falla
 * (PDF corrupto, storage caído), cae al ícono del tipo. Estado por-card para no
 * reintentar en loop.
 */
/**
 * A qué documento saltar cuando el que estás mirando se borra.
 *
 * `undefined` = el abierto no estaba en la tanda, no hay que tocar nada.
 * `null` = se borró y no queda ninguno: recién ahí se cierra el visor.
 */
function sucesorTrasBorrar(
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

function DocThumb({ doc, Icon, tint, bg }: { doc: DbDocument; Icon: typeof FileIcon; tint: string; bg: string }) {
  // HEIC, TIFF o PSD son imágenes que el navegador NO dibuja: pedirlas en un
  // <img> daba un roto y recién ahí caía al ícono. Se filtra antes.
  const isImage = esImagenRenderizable(doc.name, doc.mimeType);
  // HEIC, TIFF y SVG los convierte el servidor a PNG: antes eran un ícono gris
  // y había que bajar el archivo para saber qué foto era.
  const convertible = !isImage && esImagenConvertible(doc.name, doc.mimeType);
  const isPdf = doc.mimeType === "application/pdf";
  // Excel y Word también tienen carita: el servidor dibuja las primeras filas
  // de la planilla o las primeras líneas del documento. Antes eran todos el
  // mismo ícono y había que abrirlos de a uno para saber cuál era cuál.
  const familia = familiaDe(doc.name, doc.mimeType);
  const dibujable = familia === "planilla" || familia === "texto";
  const [failed, setFailed] = useState(false);

  if ((isImage || convertible || isPdf || dibujable) && !failed) {
    // Las fotos también van por la miniatura: pedir `/raw` bajaba el archivo
    // ORIGINAL (un logo de 657 KB) para dibujar un cuadradito de 200 px.
    const src = isImage
      ? urlMiniatura(doc.id)
      : convertible
        ? `/api/admin/documents/${doc.id}/preview-image?max=420`
        : urlMiniatura(doc.id);
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={doc.name}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn("w-full h-full object-cover", (isPdf || dibujable) && "object-top bg-white")}
      />
    );
  }
  return (
    <div className={cn("w-full h-full flex items-center justify-center", bg)}>
      <Icon className={cn("h-12 w-12", tint)} />
    </div>
  );
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
  return `${sym} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
/** Chip compacto en la card: muestra el total (o el tipo) del comprobante detectado. */
function StructuredChip({ doc }: { doc: DbDocument }) {
  const s = structuredOf(doc);
  if (!s) return null;
  const total = fmtMoney(s.total, s.moneda);
  const label = total ?? (s.docType ? s.docType : null);
  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-[var(--data-success-500)]/12 px-1.5 py-0.5 text-[length:var(--ts-2xs,11px)] font-bold text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/20 dark:text-[var(--data-success-500)]" title={`${s.docType ?? "comprobante"}${s.numero ? " " + s.numero : ""}`}>
      <FileSpreadsheet className="h-2.5 w-2.5" />{label}
    </span>
  );
}

/**
 * El texto en castellano que viene adentro de un error HTTP del drive
 * (`HTTP 503: {"error":"…","message":"…"}`). Sin esto, la pantalla mostraría el
 * cuerpo crudo de la respuesta, que no le sirve a nadie.
 */
function mensajeDeError(msg: string, porDefecto = "No se pudo completar."): string {
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

interface BuiltinCategory {
  id: "all" | "dashboard" | "assistant" | "favorites" | "recent" | "expiring" | "calendar" | "activity" | "enlaces" | "duplicados" | "sync" | "trash";
  label: string;
  icon: typeof Folder;
  color: string;
}

const BUILTIN_CATEGORIES: BuiltinCategory[] = [
  { id: "all", label: "Todos", icon: FolderArchive, color: "text-primary" },
  { id: "dashboard", label: "Resumen", icon: LayoutDashboard, color: "text-primary" },
  { id: "assistant", label: "Asistente IA", icon: Sparkles, color: "text-[var(--accent)]" },
  { id: "favorites", label: "Favoritos", icon: Star, color: "text-amber-500" },
  { id: "recent", label: "Recientes", icon: Clock, color: "text-slate-500" },
  { id: "expiring", label: "Por vencer", icon: AlarmClock, color: "text-[var(--data-warning)]" },
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
const VISTAS_CON_CONTENIDO_PROPIO = new Set(["dashboard", "assistant", "activity", "calendar", "enlaces", "duplicados", "sync"]);

// ADR-119 — almacenamiento orientativo por plan (bytes). Sin gate duro: solo
// para el anillo visual. El límite real lo aplica el bucket (50 MB/archivo).
const STORAGE_QUOTA_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

/** Días hasta el vencimiento (negativo = ya venció). null si no vence. */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

// Los helpers del árbol de carpetas viven en `@/lib/documentos/folder-tree`
// (compartidos con MoveToFolderModal).

// ─────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────


/** Los modos del drive, estables: el hook los usa como dependencia. */
const DRIVE_MODOS = [
  "all", "dashboard", "assistant", "favorites", "recent", "expiring", "calendar",
  "folder", "activity", "enlaces", "duplicados", "sync", "trash", "smart",
] as const;

/**
 * La carpeta abierta viaja en `?carpeta=` — es lo que hace compartible un
 * «mirá acá». Va aparte de `?sub=folder` porque es un ID de entidad, no una
 * vista: el modo dice QUÉ se está mirando y la carpeta CUÁL.
 */
function leerCarpetaDeUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("carpeta");
}

/** Escribe la carpeta sin tocar el historial: la entrada la crea el cambio de
 *  modo (`irAModo`), y duplicarla haría falta apretar «atrás» dos veces. */
function escribirCarpetaEnUrl(id: string | null) {
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

/** Ancho de la barra lateral del drive, arrastrable — clamp para que nunca quede ilegible ni tape el contenido. */
const SIDEBAR_MIN_W = 180;
const SIDEBAR_MAX_W = 400;
const SIDEBAR_DEFAULT_W = 240;

export default function DocumentosModule() {
  // Vista (grilla/lista), ancho de sidebar y KPIs: preferencias por-dispositivo,
  // no por-tenant — cada persona que abre el drive en su compu puede querer
  // algo distinto. Los KPIs arrancan OCULTOS (Brandon 2026-08-30): el resumen
  // ocupaba una fila entera antes de llegar a los documentos, que es lo que
  // se busca el 100% de las veces que se abre esta pantalla.
  const [view, setView] = useState<"grid" | "list">(() => {
    try { return (localStorage.getItem("doc-view-mode") as "grid" | "list") || "grid"; } catch { return "grid"; }
  });
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const raw = Number(localStorage.getItem("doc-sidebar-width"));
      return raw >= SIDEBAR_MIN_W && raw <= SIDEBAR_MAX_W ? raw : SIDEBAR_DEFAULT_W;
    } catch { return SIDEBAR_DEFAULT_W; }
  });
  const [kpisVisible, setKpisVisible] = useState(() => {
    try { return localStorage.getItem("doc-kpis-visible") === "1"; } catch { return false; }
  });
  // Todo lo que no es "Todos" (Resumen, Asistente IA, Favoritos… hasta
  // Papelera) vive colapsado bajo "Más vistas" por defecto — la lista plana
  // de hasta 12 ítems era la mitad del sidebar antes de llegar a "Carpetas".
  const [otrosAbierto, setOtrosAbierto] = useState(() => {
    try { return localStorage.getItem("doc-sidebar-otros-abierto") === "1"; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem("doc-view-mode", view); } catch { /* quota */ } }, [view]);
  useEffect(() => { try { localStorage.setItem("doc-kpis-visible", kpisVisible ? "1" : "0"); } catch { /* quota */ } }, [kpisVisible]);
  useEffect(() => { try { localStorage.setItem("doc-sidebar-otros-abierto", otrosAbierto ? "1" : "0"); } catch { /* quota */ } }, [otrosAbierto]);
  // Columnas opcionales de la vista lista (Nombre y Acción son fijas).
  // Etiquetas/Vencimiento arrancan ocultas: son nuevas, no cambiar lo que
  // Brandon ya venía viendo por defecto.
  const [colsVisibles, setColsVisibles] = useState<{
    categoria: boolean; tamano: boolean; subido: boolean; etiquetas: boolean; vencimiento: boolean;
  }>(() => {
    const defaults = { categoria: true, tamano: true, subido: true, etiquetas: false, vencimiento: false };
    try {
      const raw = localStorage.getItem("doc-cols-visibles");
      return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<typeof defaults>) } : defaults;
    } catch { return defaults; }
  });
  useEffect(() => { try { localStorage.setItem("doc-cols-visibles", JSON.stringify(colsVisibles)); } catch { /* quota */ } }, [colsVisibles]);
  const [colsMenuOpen, setColsMenuOpen] = useState(false);
  useEffect(() => {
    if (!colsMenuOpen) return;
    const close = () => setColsMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [colsMenuOpen]);
  const [sortBy, setSortBy] = useState<"recent" | "name" | "size" | "expiry" | "relevancia">("recent");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  /** Ver sólo lo que todavía no tiene descripción (lo que no se puede buscar). */
  const [soloSinDescribir, setSoloSinDescribir] = useState(false);
  /** Tipo de archivo, peso, cuándo entró y cuándo vence. */
  const [filtros, setFiltros] = useState<FiltrosDocumento>(FILTROS_VACIOS);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  /** Progreso de "describir todo lo que falta" (una llamada IA por documento). */
  const [progresoDesc, setProgresoDesc] = useState<{ hechos: number; total: number } | null>(null);
  /** Por qué la IA no pudo describir (sin cupo, sin clave, sin modelo de visión). */
  const [avisoIA, setAvisoIA] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [semantic, setSemantic] = useState(false);
  /**
   * El modo y la carpeta viven en la URL (`?sub=` y `?carpeta=`).
   *
   * El drive es la pantalla donde MÁS se pasan links —«mirá la carpeta de
   * contratos 2026»— y hasta ahora eso era imposible: se mandaba el link del
   * módulo y se explicaba de palabra dónde hacer click. Va en `?sub=` y no en
   * `?vista=` porque el drive se renderiza dentro de Documentos, que ya es
   * dueño de ese parámetro.
   *
   * SIN memoria a propósito (`recordar: false`): reabrir el drive en «Papelera»
   * porque ahí quedaste la vez pasada sería una sorpresa. Empieza en «todos».
   */
  const { vista: filterMode, irA: irAModo } = useSubvistaModulo(
    "documentos-drive",
    DRIVE_MODOS,
    "all",
    undefined,
    { recordar: false },
  );
  const [activeFolderId, setActiveFolderIdRaw] = useState<string | null>(
    () => leerCarpetaDeUrl(),
  );

  /** Abrir/cerrar carpeta: estado + URL, siempre juntos. Se llama en una docena
   *  de lugares, así que envuelve al setter en vez de repetir el par. */
  const setActiveFolderId = useCallback((id: string | null) => {
    setActiveFolderIdRaw(id);
    escribirCarpetaEnUrl(id);
  }, []);

  /** Atrás/adelante: la carpeta la dicta la URL, igual que el modo. */
  useEffect(() => {
    const onPop = () => setActiveFolderIdRaw(leerCarpetaDeUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /**
   * Cambiar de modo, soltando la carpeta si el modo nuevo no la usa.
   *
   * Va DESPUÉS del estado de la carpeta a propósito: si sólo limpiara la URL
   * —como estaba— el estado quedaría con una carpeta abierta que el link ya no
   * menciona, y recargar mostraría otra cosa que la pantalla actual.
   */
  const setFilterMode = useCallback(
    (modo: (typeof DRIVE_MODOS)[number]) => {
      if (modo !== "folder") setActiveFolderId(null);
      irAModo(modo);
    },
    [irAModo, setActiveFolderId],
  );
  const [scanResult, setScanResult] = useState<{ name: string; expiresAt: string | null } | null>(null);
  // Resultado del análisis IA de contenido (resumen + datos clave).
  const [analyzeResult, setAnalyzeResult] = useState<{ name: string; summary: string; keyFacts: string[] } | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  /** Import masivo de una carpeta con su árbol. */
  const [importandoCarpeta, setImportandoCarpeta] = useState(false);
  // El import corre en segundo plano (puede terminar con el drive cerrado):
  // cuando avisa que terminó, se recarga la lista.
  const { terminados: importsTerminados } = useImportCarpeta();
  /** Lo que se soltó en el drive cuando era una carpeta: entra derecho al importador. */
  const [soltado, setSoltado] = useState<{ file: File; ruta: string }[] | null>(null);
  const [preview, setPreview] = useState<DbDocument | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  /** Estado por archivo de la subida en curso (panel abajo a la derecha). */
  /** Estado por archivo de la subida en curso, con el motivo si falló. */
  const [estadoSubida, setEstadoSubida] = useState<Map<string, { estado: EstadoArchivo; motivo?: string }> | null>(null);
  /** Sugerencias IA descartadas por el usuario (persisten por tenant). */
  const [sugDescartadas, setSugDescartadas] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  // Subcarpetas: `undefined` = no creando, `null` = crear en raíz, string = crear dentro de esa carpeta.
  const [newFolderParent, setNewFolderParent] = useState<string | null | undefined>(undefined);
  const [newFolderName, setNewFolderName] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  /**
   * Selección múltiple de CARPETAS. Es un modo explícito y no un checkbox
   * siempre visible: la fila ya tiene cuatro acciones al hover y un quinto
   * control permanente la vuelve ilegible.
   */
  const [selectingFolders, setSelectingFolders] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  /** Modal de etiquetado en lote (elegir de la taxonomía o crear nueva) para la selección activa. */
  const [bulkTagModalOpen, setBulkTagModalOpen] = useState(false);
  /** Id del documento cuyo editor de etiquetas está abierto (chips + autocompletar). */
  const [tagDocId, setTagDocId] = useState<string | null>(null);
  /** Taxonomía completa del tenant, para sugerir al escribir y evitar duplicados por typo. */
  const [allTags, setAllTags] = useState<string[]>([]);
  const reloadAllTags = useCallback(() => {
    fetchTags().then((r) => setAllTags(r.map((t) => t.tag))).catch((err) => console.warn("[documentos] no pude cargar la taxonomía de etiquetas", err));
  }, []);
  useEffect(() => { reloadAllTags(); }, [reloadAllTags]);
  /** Menú "Más" de la barra de selección — agrupa las acciones menos frecuentes
   *  (mover, ZIP, WhatsApp, combinar) para que la fila no crezca sin límite. */
  const [bulkMoreOpen, setBulkMoreOpen] = useState(false);
  const [bulkMorePos, setBulkMorePos] = useState<{ top: number; right: number } | null>(null);
  const bulkMoreBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!bulkMoreOpen) return;
    const close = () => setBulkMoreOpen(false);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [bulkMoreOpen]);
  const [expiryBannerDismissed, setExpiryBannerDismissed] = useState(false);
  const [zipping, setZipping] = useState(false);
  // Drag & drop de documentos hacia carpetas de la barra lateral.
  const [draggingDocId, setDraggingDocId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  // Reparentar carpetas (arrastrar una carpeta sobre otra o a la raíz).
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);
  const [rootDropActive, setRootDropActive] = useState(false);
  // Modales por-documento (mover a carpeta / enviar por WhatsApp).
  const [movingDoc, setMovingDoc] = useState<DbDocument | null>(null);
  /** Documentos a mandar por WhatsApp: uno desde la ficha, varios desde la selección. */
  const [whatsappDoc, setWhatsappDoc] = useState<DbDocument[] | null>(null);
  const [signDoc, setSignDoc] = useState<DbDocument | null>(null);
  const [stampTarget, setStampTarget] = useState<DbDocument | null>(null);
  const [merging, setMerging] = useState(false);
  // Personalizar carpeta (nombre + color + ícono).
  const [editingFolder, setEditingFolder] = useState<DbDocumentFolder | null>(null);
  // Compartir carpeta completa por link.
  const [sharingFolder, setSharingFolder] = useState<DbDocumentFolder | null>(null);
  // Editor de taxonomía de etiquetas.
  const [showTags, setShowTags] = useState(false);
  // Carpetas inteligentes (filtros guardados, por dispositivo).
  const [smartFolders, setSmartFolders] = useState<SmartFolder[]>([]);
  const [activeSmartId, setActiveSmartId] = useState<string | null>(null);
  const [smartModal, setSmartModal] = useState<SmartFolder | "new" | null>(null);
  const [showCameraScan, setShowCameraScan] = useState(false);
  const [pageEditorDoc, setPageEditorDoc] = useState<DbDocument | null>(null);
  useEffect(() => { setSmartFolders(loadSmartFolders()); }, []);
  const persistSmart = useCallback((next: SmartFolder[]) => { setSmartFolders(next); saveSmartFolders(next); }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const filters = useMemo(
    () => ({
      folderId: filterMode === "folder" ? activeFolderId : undefined,
      q: searchDebounced.trim() || undefined,
      favorite: filterMode === "favorites" ? true : undefined,
      expiring: filterMode === "expiring" ? 30 : undefined,
      semantic: semantic && !!searchDebounced.trim(),
      deletedOnly: filterMode === "trash" ? true : undefined,
    }),
    [filterMode, activeFolderId, searchDebounced, semantic]
  );

  const {
    documents, semanticTerms, folders, loading, error, refresh,
    upload, scan, patch, bulk, restore, purge, restoreMany, purgeMany, createFolder, createFolderTree, existingNames, moveFolder, updateFolder, bulkFolders, deleteFolder,
  } = useDocuments(filters);

  /**
   * Con qué se compara cada documento para decir POR QUÉ apareció: la frase
   * entera, sus palabras sueltas y —en modo IA— los sinónimos con los que el
   * servidor amplió la búsqueda. Sin eso, un documento traído por el sinónimo
   * "arriendo" se mostraría sin explicación de por qué está ahí.
   */
  const terminosBusqueda = useMemo(() => {
    const q = searchDebounced.trim();
    if (!q) return [];
    // Las mismas palabras que usó el servidor para filtrar (sin "de", "del"…):
    // si acá se colaran, la lista resaltaría en amarillo un "de" que no fue el
    // que trajo el documento.
    return Array.from(new Set([q.toLowerCase(), ...palabrasUtiles(q), ...semanticTerms]))
      .filter((t) => t.length >= 2);
  }, [searchDebounced, semanticTerms]);

  // Un import terminado (aunque haya sido desde otra pestaña) trae documentos
  // nuevos: recargar. El 0 inicial se saltea para no duplicar el fetch de montaje.
  useEffect(() => {
    if (importsTerminados === 0) return;
    void refresh();
  }, [importsTerminados, refresh]);

  // ── Escaneo desde cámara (móvil) ──
  const handleScan = useCallback(
    async (files: FileList | File[]) => {
      const file = Array.from(files)[0];
      if (!file) return;
      setUploadProgress({ done: 0, total: 1 });
      try {
        const r = await scan(file, { folderId: activeFolderId });
        if (r.scan?.ok) {
          setScanResult({ name: r.document.name, expiresAt: r.scan.expiresAt ?? null });
          setTimeout(() => setScanResult(null), 8000);
        }
      } catch (e) {
        console.error("scan_fail", e);
      } finally {
        setUploadProgress(null);
      }
    },
    [scan, activeFolderId]
  );

  /**
   * Buscando, lo natural es que arriba esté lo más parecido a lo que pediste,
   * no lo último que subiste; al limpiar la búsqueda vuelve a lo de siempre.
   * Sólo se toca el orden "por defecto": si el usuario eligió tamaño o nombre,
   * manda el suyo.
   */
  const hayBusqueda = terminosBusqueda.length > 0;
  useEffect(() => {
    setSortBy((prev) => {
      if (hayBusqueda) return prev === "recent" ? "relevancia" : prev;
      return prev === "relevancia" ? "recent" : prev;
    });
  }, [hayBusqueda]);

  // ── Filtrado (recent) + orden client-side ──
  const displayDocs = useMemo(() => {
    let list = documents;
    if (filterMode === "recent") {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      list = list.filter((d) => new Date(d.uploadedAt).getTime() > cutoff);
    }
    if (filterMode === "smart" && activeSmartId) {
      const sf = smartFolders.find((f) => f.id === activeSmartId);
      if (sf) list = list.filter((d) => matchesSmartFolder(d, sf.rules));
    }
    if (statusFilter) list = list.filter((d) => d.status === statusFilter);
    if (soloSinDescribir) list = list.filter((d) => !tieneDescripcion(d));
    if (cuantosFiltrosActivos(filtros) > 0) list = list.filter((d) => cumpleFiltros(d, filtros));
    if (sortBy === "relevancia") return ordenarPorRelevancia(list, terminosBusqueda);
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
        case "size":
          return b.size - a.size;
        case "expiry": {
          // Los que vencen primero arriba; los que no vencen, al final.
          const av = a.expiresAt ? new Date(a.expiresAt).getTime() : Infinity;
          const bv = b.expiresAt ? new Date(b.expiresAt).getTime() : Infinity;
          return av - bv;
        }
        case "recent":
        default:
          return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
      }
    });
    return sorted;
  }, [documents, filterMode, sortBy, statusFilter, activeSmartId, smartFolders, soloSinDescribir, terminosBusqueda, filtros]);

  const statusCounts = useMemo(() => {
    const m: Record<string, number> = { draft: 0, review: 0, approved: 0, archived: 0 };
    for (const d of documents) if (d.status && d.status in m) m[d.status] += 1;
    return m;
  }, [documents]);

  // Lo que la IA puede leer (PDF/texto/Word/Excel/fotos — single-source en
  // analyzable-mime) y todavía NO tiene descripción. Es la medida honesta de
  // "cuánto de mi drive no se puede buscar por su contenido": un documento
  // analizado cuya descripción quedó vacía sigue sin servir para buscar.
  const indexableDocs = useMemo(
    () => documents.filter((d) => isAnalyzableMime(d.mimeType) && !tieneDescripcion(d)),
    [documents]
  );
  // Todos los documentos analizables, estén o no ya indexados. Sirve para
  // RE-indexar (que los viejos ganen la descripción rica nueva).
  const reindexableDocs = useMemo(
    () => documents.filter((d) => isAnalyzableMime(d.mimeType)),
    [documents]
  );
  const runIndex = useCallback(
    async (list: DbDocument[], onProgress: (done: number, total: number) => void) => {
      onProgress(0, list.length);
      let done = 0;
      // Si no hay modelo de visión configurado, la 1ª foto lo revela: seguir
      // pidiendo por las otras 200 sería quemar tiempo para el mismo error.
      let sinVision = false;
      for (const d of list) {
        const esFoto = d.mimeType.startsWith("image/");
        if (!(sinVision && esFoto)) {
          const r = await analyzeDoc(d.id).catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            if (esFoto && /vision_unavailable/.test(msg)) {
              sinVision = true;
              setAvisoIA(mensajeDeError(msg));
            }
            console.warn("[documentos] analyze fail", d.id, msg);
            return null;
          });
          // El servidor guardó el texto pero la IA no describió (sin cupo, sin
          // clave): seguir con los otros 200 da el mismo resultado. Se corta y
          // se dice por qué, en vez de terminar con el contador igual.
          if (r?.aviso) {
            setAvisoIA(r.aviso);
            break;
          }
        }
        done += 1;
        onProgress(done, list.length);
      }
      await refresh();
    },
    [refresh]
  );
  const handleIndexAll = useCallback(
    (onProgress: (done: number, total: number) => void) => runIndex(indexableDocs, onProgress),
    [indexableDocs, runIndex]
  );
  /** Describir de una vez todo lo que falta, sin irse al asistente. */
  const describirFaltantes = useCallback(async () => {
    if (progresoDesc || indexableDocs.length === 0) return;
    setProgresoDesc({ hechos: 0, total: indexableDocs.length });
    try {
      await runIndex(indexableDocs, (hechos, total) => setProgresoDesc({ hechos, total }));
    } finally {
      setTimeout(() => setProgresoDesc(null), 1200);
    }
  }, [indexableDocs, progresoDesc, runIndex]);
  const handleReindexAll = useCallback(
    (onProgress: (done: number, total: number) => void) => runIndex(reindexableDocs, onProgress),
    [reindexableDocs, runIndex]
  );

  const totalSize = useMemo(() => documents.reduce((s, d) => s + d.size, 0), [documents]);
  const favCount = useMemo(() => documents.filter((d) => d.favorite).length, [documents]);
  const expiringSoonCount = useMemo(
    () => documents.filter((d) => { const n = daysUntil(d.expiresAt); return n !== null && n <= 30; }).length,
    [documents]
  );
  // Documentos por vencer (≤30d, vencidos primero) — alimenta el aviso proactivo.
  const expiringDocs = useMemo(
    () =>
      documents
        .map((d) => ({ d, n: daysUntil(d.expiresAt) }))
        .filter((x): x is { d: typeof x.d; n: number } => x.n !== null && x.n <= 30)
        .sort((a, b) => a.n - b.n),
    [documents]
  );
  // Evita el parpadeo a "0" del contador al cambiar de carpeta: mientras carga,
  // retiene el último conteo estable en vez de mostrar 0.
  const lastDocCount = useRef(0);
  useEffect(() => { if (!loading) lastDocCount.current = documents.length; }, [loading, documents.length]);

  // ── Vista del sidebar: ocultar las que no tienen nada adentro (Brandon
  // 2026-08-30) — "Resumen"/"Asistente IA"/"Recientes"/"Actividad" no aportan
  // nada con cero documentos; "Calendario" sin vencimientos cargados tampoco.
  const anyExpiryCount = useMemo(() => documents.filter((d) => d.expiresAt).length, [documents]);
  /** Mismo criterio que `DocumentsDB.gruposDuplicados` (backend): agrupar por
   * tamaño + nombre-base evita pedir `/documents/duplicates` sólo para saber
   * si hay que mostrar "Repetidos" — los documentos ya están en memoria. */
  const hayDuplicados = useMemo(() => {
    const nombreBase = (n: string) =>
      n.toLowerCase()
        .replace(/\.[^.]+$/, "")
        .replace(/[ _-]*\(\d+\)$/, "")
        .replace(/[ _-]*(copia|copy)\s*\d*$/, "")
        .trim();
    const porClave = new Map<string, number>();
    for (const d of documents) {
      if (d.size < 1024) continue;
      const clave = `${d.size}:${nombreBase(d.name)}`;
      porClave.set(clave, (porClave.get(clave) ?? 0) + 1);
    }
    return Array.from(porClave.values()).some((n) => n > 1);
  }, [documents]);
  // Enlaces compartidos SÍ necesita una request propia: a diferencia de
  // duplicados, no se puede derivar de `documents` (una carpeta compartida no
  // deja rastro en ningún documento individual). `null` = todavía no se sabe
  // → no ocultar (más vale mostrar de más que esconder algo que sí tiene datos).
  const [enlacesCount, setEnlacesCount] = useState<number | null>(null);
  useEffect(() => {
    fetchSharedLinks().then((links) => setEnlacesCount(links.length)).catch(() => setEnlacesCount(null));
  }, []);
  const vistaConDatos = useMemo(() => ({
    all: true,
    dashboard: documents.length > 0,
    assistant: documents.length > 0,
    favorites: favCount > 0,
    recent: documents.length > 0,
    expiring: expiringSoonCount > 0,
    calendar: anyExpiryCount > 0,
    activity: documents.length > 0,
    enlaces: enlacesCount === null || enlacesCount > 0,
    duplicados: hayDuplicados,
    sync: true,
    trash: true,
  }) as Record<BuiltinCategory["id"], boolean>, [documents.length, favCount, expiringSoonCount, anyExpiryCount, enlacesCount, hayDuplicados]);
  const shownDocCount = loading && documents.length === 0 ? lastDocCount.current : documents.length;

  // ── Árbol de carpetas (subcarpetas anidadas) ──
  const childrenMap = useMemo(() => buildChildrenMap(folders), [folders]);
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  // ── Sugerencias IA de organización (carpeta/vencimiento del auto-análisis) ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(sugDescartadasKey());
      if (raw) setSugDescartadas(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore */ }
  }, []);
  const descartarSugerencia = useCallback((docId: string) => {
    setSugDescartadas((prev) => {
      const s = new Set(prev);
      s.add(docId);
      try { localStorage.setItem(sugDescartadasKey(), JSON.stringify([...s])); } catch { /* quota */ }
      return s;
    });
  }, []);
  /** Sugerencias vigentes: la carpeta debe existir y el doc seguir suelto/sin vencimiento. */
  const sugerenciasIA = useMemo(
    () =>
      documents
        .flatMap((d) => {
          const s = (d.ocrMetadata as Record<string, unknown> | null)?.sugerencias as
            | { folderId?: string; folderName?: string; expiresAt?: string }
            | null
            | undefined;
          if (!s || sugDescartadas.has(d.id)) return [];
          const carpeta = s.folderId && !d.folderId && folderById.has(s.folderId)
            ? { folderId: s.folderId, folderName: folderById.get(s.folderId)!.name }
            : null;
          const vence = s.expiresAt && !d.expiresAt ? s.expiresAt : null;
          if (!carpeta && !vence) return [];
          return [{ doc: d, carpeta, vence }];
        })
        .slice(0, 3),
    [documents, sugDescartadas, folderById]
  );
  const aplicarSugerencia = useCallback(
    async (docId: string, cambios: { folderId?: string; expiresAt?: string }) => {
      await patch(docId, cambios);
    },
    [patch]
  );
  /**
   * Aceptar TODAS de una. Cada vencimiento que queda sin aplicar es un aviso
   * que nunca va a llegar: el cron mira `expiresAt`, no la sugerencia.
   */
  const [aplicandoTodas, setAplicandoTodas] = useState(false);
  const aplicarTodasLasSugerencias = useCallback(async () => {
    if (aplicandoTodas) return;
    setAplicandoTodas(true);
    try {
      for (const { doc, carpeta, vence } of sugerenciasIA) {
        await aplicarSugerencia(doc.id, {
          ...(carpeta ? { folderId: carpeta.folderId } : {}),
          ...(vence ? { expiresAt: vence } : {}),
        }).catch((err) => console.warn("[documentos] sugerencia fail", doc.id, err));
      }
      await refresh();
    } finally {
      setAplicandoTodas(false);
    }
  }, [aplicandoTodas, sugerenciasIA, aplicarSugerencia, refresh]);
  const visibleFolderRows = useMemo(() => flattenVisible(childrenMap, expandedFolders), [childrenMap, expandedFolders]);

  // ── Selección múltiple de carpetas ──────────────────────────────────────────
  const toggleFolderSelected = useCallback((id: string) => {
    setSelectedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const salirSeleccion = useCallback(() => {
    setSelectingFolders(false);
    setSelectedFolderIds(new Set());
  }, []);

  /** Etiquetas ya usadas en carpetas: para reusar en vez de inventar sinónimos. */
  const folderTagSuggestions = useMemo(
    () => [...new Set(folders.flatMap((f) => f.tags ?? []))].sort(),
    [folders],
  );

  /** Subcarpetas de lo marcado: NO se borran solas (la FK es SET NULL), así que
   *  la barra pregunta si incluirlas y las manda explícitamente. */
  const descendientesMarcados = useMemo(() => {
    const marcadas = new Set(selectedFolderIds);
    const caen = new Set<string>();
    for (const id of marcadas) {
      for (const d of descendantIds(childrenMap, id)) if (!marcadas.has(d)) caen.add(d);
    }
    return [...caen];
  }, [selectedFolderIds, childrenMap]);
  /** Cuántos documentos hay en juego al borrar lo marcado (el modal los dice). */
  const documentosMarcados = useMemo(() => {
    const cuantos = (ids: Iterable<string>) => {
      let n = 0;
      for (const id of ids) n += folderById.get(id)?.documentCount ?? 0;
      return n;
    };
    return {
      directos: cuantos(selectedFolderIds),
      enSubcarpetas: cuantos(descendientesMarcados),
    };
  }, [selectedFolderIds, descendientesMarcados, folderById]);
  const allFolderRows = useMemo(() => flattenAll(childrenMap), [childrenMap]);
  const activePath = useMemo(
    () => (filterMode === "folder" && activeFolderId ? folderPath(folderById, activeFolderId) : []),
    [filterMode, activeFolderId, folderById]
  );
  const activeChildren = useMemo(
    () => (filterMode === "folder" && activeFolderId ? childrenMap.get(activeFolderId) ?? [] : []),
    [filterMode, activeFolderId, childrenMap]
  );
  /** Dónde cae lo que se importa: la carpeta abierta, o la raíz si no hay ninguna. */
  const destinoImport = filterMode === "folder" ? activeFolderId : null;
  const toggleExpand = (id: string) =>
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ── Selection ──
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  /**
   * Elegir de una todo lo que está a la vista — que con filtros o búsqueda
   * puestos NO es todo el drive, sino justo lo que acabás de acotar. Ese es el
   * atajo que importa: filtrás "Excel, vencidos", tocás uno, y de ahí a
   * borrarlos todos hay un clic.
   */
  const selectAll = () => setSelectedIds(new Set(displayDocs.map((d) => d.id)));
  const todosElegidos = displayDocs.length > 0 && selectedIds.size === displayDocs.length;
  /** ¿Hay algo acotando la lista? Cambia el texto del atajo, para no prometer
   *  "todos" cuando en realidad son los que sobrevivieron al filtro. */
  const hayFiltroPuesto =
    cuantosFiltrosActivos(filtros) > 0
    || terminosBusqueda.length > 0
    || statusFilter !== "all"
    || soloSinDescribir
    || filterMode === "folder";

  // ── Upload handlers ──
  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (arr.length === 0) return;
      // Duplicados: mismo nombre base que algo ya subido → avisar ANTES.
      const base = (n: string) => n.replace(/\.[^.]+$/, "").trim().toLowerCase();
      const existentes = new Set(documents.map((d) => base(d.name)));
      const aSubir = arr.filter((f) => {
        if (!existentes.has(base(f.name))) return true;
        return window.confirm(`"${f.name}" ya existe en el drive. ¿Subirlo igual? Quedará duplicado.`);
      });
      if (aSubir.length === 0) return;
      setUploadProgress({ done: 0, total: aSubir.length });
      setEstadoSubida(new Map(aSubir.map((f) => [f.name, { estado: "en-cola" as EstadoArchivo }])));
      try {
        await upload(aSubir, {
          folderId: activeFolderId,
          onProgress: (done, total) => setUploadProgress({ done, total }),
          onEstado: (file, estado, motivo) =>
            setEstadoSubida((prev) => {
              const m = new Map(prev ?? []);
              m.set(file.name, { estado, ...(motivo ? { motivo } : {}) });
              return m;
            }),
        });
      } finally {
        setUploadProgress(null);
        // Si todo salió bien, el panel se va solo tras un vistazo. Si algo
        // falló, se QUEDA: un archivo que no subió y desaparece de la pantalla
        // es un archivo perdido sin que nadie se entere.
        setTimeout(() => {
          setEstadoSubida((prev) => {
            if (prev && [...prev.values()].some((v) => v.estado === "error")) return prev;
            return null;
          });
        }, 2500);
      }
    },
    [upload, activeFolderId, documents]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      // Si lo que soltaron es una CARPETA, `files` trae el directorio como si
      // fuera un archivo (0 bytes, sin tipo) y la subida normal lo tiraba a la
      // basura. Se detecta con la API de entries y se abre el importador con
      // el árbol ya cargado — arrastrar la carpeta y listo.
      //
      // OJO: `dataTransfer.items` se VACÍA al salir del handler, así que hay
      // que empezar a leer el árbol acá mismo (archivosDesdeDrop toma las
      // entries de forma síncrona antes de su primer await); guardar la lista
      // para leerla después devuelve una lista vacía.
      const hayCarpeta = Array.from(e.dataTransfer.items).some((i) => i.webkitGetAsEntry?.()?.isDirectory);
      if (hayCarpeta) {
        setImportandoCarpeta(true);
        archivosDesdeDrop(e.dataTransfer.items)
          .then((conRuta) => setSoltado(conRuta))
          .catch((err) => console.warn("[drive] no pude leer la carpeta soltada", err));
        return;
      }
      if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    // Drag interno (mover documento o reparentar carpeta) → no es una subida.
    const t = e.dataTransfer.types;
    if (t.includes("application/x-doc-id") || t.includes("application/x-folder-id")) return;
    e.preventDefault();
    setDragOver(true);
  }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget === e.target) setDragOver(false);
  }, []);

  // ── Bulk actions ──
  /**
   * Corre una acción en lote y limpia la selección SOLO si salió bien.
   *
   * Si falla, la marca queda puesta para reintentar y el motivo lo muestra el
   * banner rojo del hook. El `catch` no es decorativo: sin él la promesa
   * quedaba sin manejar y en dev el error saltaba como pantalla roja de Next
   * encima del panel (así se vio el "HTTP 400: Too big...").
   */
  const correrLote = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      clearSelection();
    } catch (err) {
      console.warn("[drive] acción en lote falló", err);
    }
  };
  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`¿Eliminar ${selectedIds.size} documento(s)?`)) return;
    await correrLote(() => bulk("delete", Array.from(selectedIds)));
  };
  const bulkFavorite = async (fav: boolean) => {
    if (selectedIds.size === 0) return;
    await correrLote(() => bulk("favorite", Array.from(selectedIds), { favorite: fav }));
  };
  const bulkMove = async (folderId: string | null) => {
    if (selectedIds.size === 0) return;
    await correrLote(() => bulk("move", Array.from(selectedIds), { folderId }));
  };
  /** Marcar todo lo seleccionado con el mismo estado (revisar una pila de una). */
  const bulkStatus = async (status: EstadoDoc) => {
    if (selectedIds.size === 0) return;
    await correrLote(() => bulk("status", Array.from(selectedIds), { status }));
  };
  const bulkTag = async (tag: string) => {
    const t = tag.trim();
    if (selectedIds.size === 0 || !t) return;
    await correrLote(async () => {
      await bulk("tag", Array.from(selectedIds), { tag: t });
      reloadAllTags();
    });
  };
  // Empaqueta una lista de documentos en un ZIP (client-side con jszip): baja cada
  // archivo del proxy /raw y evita nombres duplicados con un sufijo (n). Compartido
  // por la descarga en lote (selección) y la descarga de una carpeta entera.
  const zipAndDownload = async (docs: DbDocument[], filename: string) => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const seen = new Map<string, number>();
    for (const doc of docs) {
      const res = await fetch(`/api/admin/documents/${doc.id}/raw`, { credentials: "include" });
      if (!res.ok) continue;
      const blob = await res.blob();
      let name = doc.name || `documento-${doc.id}`;
      const dup = seen.get(name) ?? 0;
      seen.set(name, dup + 1);
      if (dup > 0) {
        const dot = name.lastIndexOf(".");
        name = dot > 0 ? `${name.slice(0, dot)} (${dup})${name.slice(dot)}` : `${name} (${dup})`;
      }
      zip.file(name, blob);
    }
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  const bulkDownloadZip = async () => {
    if (selectedIds.size === 0 || zipping) return;
    setZipping(true);
    try {
      const docs = Array.from(selectedIds)
        .map((id) => documents.find((d) => d.id === id))
        .filter((d): d is DbDocument => !!d);
      await zipAndDownload(docs, `documentos-${selectedIds.size}.zip`);
      clearSelection();
    } finally {
      setZipping(false);
    }
  };
  // Descargar TODA la carpeta activa como ZIP.
  const downloadFolderZip = async () => {
    if (zipping || displayDocs.length === 0) return;
    setZipping(true);
    try {
      const folderName = activePath.length ? activePath[activePath.length - 1].name : "carpeta";
      await zipAndDownload(displayDocs, `${folderName.replace(/[^\w.-]+/g, "_") || "carpeta"}.zip`);
    } finally {
      setZipping(false);
    }
  };

  // Combinar los documentos seleccionados (PDFs + imágenes) en un PDF nuevo.
  const handleMerge = async () => {
    if (selectedIds.size < 2 || merging) return;
    setMerging(true);
    try {
      const ids = Array.from(selectedIds).filter((id) => {
        const d = documents.find((x) => x.id === id);
        return d && (d.mimeType === "application/pdf" || d.mimeType.startsWith("image/"));
      });
      if (ids.length < 2) {
        alert("Elegí al menos 2 PDFs o imágenes para combinar.");
        return;
      }
      const res = await mergeDocs(ids);
      clearSelection();
      await refresh();
      if (res.skipped.length) alert(`Combinado en ${res.pageCount} páginas. Se saltaron ${res.skipped.length} archivo(s) no compatibles.`);
    } catch (err) {
      alert("No se pudo combinar: " + (err instanceof Error ? err.message.slice(0, 120) : "error"));
    } finally {
      setMerging(false);
    }
  };

  // Rotar un PDF 90° (todas las páginas) → nueva versión.
  const handleRotate = async (doc: DbDocument) => {
    try {
      await rotateDoc(doc.id, 90);
      await refresh();
    } catch (err) {
      alert("No se pudo rotar: " + (err instanceof Error ? err.message.slice(0, 120) : "error"));
    }
  };

  // Dividir un PDF en un documento por página.
  const handleSplit = async (doc: DbDocument) => {
    if (!confirm(`¿Dividir "${doc.name}" en un documento por página?`)) return;
    try {
      const res = await splitDoc(doc.id);
      await refresh();
      alert(`Listo: se crearon ${res.count} documento(s), uno por página.`);
    } catch (err) {
      alert("No se pudo dividir: " + (err instanceof Error ? err.message.slice(0, 120) : "error"));
    }
  };

  // Mover UN documento a una carpeta al soltarlo (drag & drop).
  const dropDocOnFolder = async (docId: string, folderId: string | null) => {
    setDragOverFolderId(null);
    setDraggingDocId(null);
    if (!docId) return;
    await bulk("move", [docId], { folderId });
  };

  // Reparentar una carpeta al soltarla sobre otra (o "raíz").
  // Guard: no soltar sobre sí misma ni sobre un descendiente (crearía un ciclo).
  const dropFolderOnFolder = async (folderId: string, targetId: string | null) => {
    setDragOverFolderId(null);
    setRootDropActive(false);
    setDraggingFolderId(null);
    if (!folderId || folderId === targetId) return;
    if (targetId && descendantIds(childrenMap, folderId).has(targetId)) return;
    const dragged = folderById.get(folderId);
    if (dragged && (dragged.parentId ?? null) === (targetId ?? null)) return;
    await moveFolder(folderId, targetId);
    if (targetId) setExpandedFolders((prev) => new Set(prev).add(targetId));
  };

  // ── Folder actions ──
  const openCreateChild = (parentId: string | null) => {
    setNewFolderName("");
    setNewFolderParent(parentId);
    if (parentId) setExpandedFolders((prev) => new Set(prev).add(parentId));
  };
  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    const parentId = newFolderParent ?? null;
    await createFolder({ name, parentId });
    setNewFolderName("");
    setNewFolderParent(undefined);
    if (parentId) setExpandedFolders((prev) => new Set(prev).add(parentId));
  };
  /**
   * Borrar UNA carpeta abre el mismo modal que el borrado en lote: las
   * subcarpetas no caen solas (la FK es SET NULL) y los documentos de adentro
   * pueden irse a la papelera o quedar sueltos. Antes era un `confirm()` que
   * sólo avisaba que los documentos iban a la raíz — y quien borraba la carpeta
   * los veía reaparecer.
   */
  const [borrandoCarpeta, setBorrandoCarpeta] = useState<DbDocumentFolder | null>(null);
  const handleDeleteFolder = (f: DbDocumentFolder) => setBorrandoCarpeta(f);
  const confirmarBorrarCarpeta = async (f: DbDocumentFolder, opciones: BorradoCarpetas) => {
    const descs = descendantIds(childrenMap, f.id);
    if (opciones.incluirSubcarpetas && descs.size > 0) {
      await bulkFolders([f.id, ...descs], { action: "delete", conDocumentos: opciones.conDocumentos });
    } else {
      await deleteFolder(f.id, { conDocumentos: opciones.conDocumentos });
    }
    setBorrandoCarpeta(null);
    if (activeFolderId === f.id || (activeFolderId && descs.has(activeFolderId))) {
      setActiveFolderId(null);
      setFilterMode("all");
    }
  };

  // ── Rename ──
  const startRename = (d: DbDocument) => setRenaming({ id: d.id, value: d.name });
  const commitRename = async () => {
    if (!renaming) return;
    const { id, value } = renaming;
    const trimmed = value.trim();
    if (trimmed && trimmed.length > 0) {
      await patch(id, { name: trimmed });
    }
    setRenaming(null);
  };

  // ── Download single ──
  const handleDownload = async (d: DbDocument) => {
    try {
      const { url, filename } = await getSignedDownloadUrl(d.id);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error(e);
      alert("No se pudo generar el link de descarga.");
    }
  };

  // ── Analizar contenido con IA (para que el asistente pueda leerlo) ──
  const handleAnalyze = useCallback(async (doc: DbDocument) => {
    if (analyzingId) return;
    setAnalyzingId(doc.id);
    try {
      const r = await analyzeDoc(doc.id);
      setAnalyzeResult({
        name: doc.name,
        summary: r.summary || "Guardé el texto del documento. El asistente ya puede usar su contenido.",
        keyFacts: r.keyFacts ?? [],
      });
      setTimeout(() => setAnalyzeResult(null), 15000);
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAnalyzeResult({
        name: doc.name,
        summary: /no_text|422/.test(msg)
          ? "No pude extraer texto (¿es una imagen o un escaneo? usá el botón Escanear)."
          : "No pude analizar el documento. Reintentá.",
        keyFacts: [],
      });
      setTimeout(() => setAnalyzeResult(null), 8000);
    } finally {
      setAnalyzingId(null);
    }
  }, [analyzingId, refresh]);

  return (
    <div
      className="space-y-6 relative"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      {/* Drag overlay */}
      {dragOver && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center bg-primary/20 backdrop-blur-sm">
          <div className="bg-white border-4 border-dashed border-primary rounded-3xl p-8 shadow-[var(--shadow-xl)]">
            <Upload className="h-12 w-12 mx-auto text-primary mb-3" />
            <p className="text-xl font-extrabold text-[var(--text-primary)]">Soltá los archivos para subir</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">PDF, imágenes, docs, planillas</p>
          </div>
        </div>
      )}

      <AdminModuleHeader
        title="Documentación"
        description="Drive del negocio: contratos, licencias, facturas. Te avisa antes de que venzan."
        icon={FolderArchive}
      >
        {/* Si está conectado con el escritorio o no, a la vista sin entrar a
            "Mi PC" (Brandon 2026-08-28). No se ve nada si el navegador no
            soporta la File System Access API — no tiene sentido avisar de
            algo que ahí no se puede usar. */}
        <EstadoCarpetaLocalBadge tenantId={slugActivo()} onAbrir={() => setFilterMode("sync")} />

        {/* Cinco acciones en el header no entraban en pantallas medianas: se
            partían en dos-tres filas y competían con el primario. Queda UNA
            acción principal (Subir archivos) y el resto en el menú del DS —
            "Importar carpeta" vivía como botón suelto y era lo que más
            forzaba el salto de línea (Brandon 2026-08-30). */}
        <ModuleActionMenu
          items={[
            {
              label: "Escanear un documento",
              description: "La IA lo nombra, clasifica y detecta su vencimiento",
              icon: Camera,
              onClick: () => scanInputRef.current?.click(),
            },
            {
              label: "Escanear a PDF",
              description: "Varias páginas en un solo archivo",
              icon: Scan,
              onClick: () => setShowCameraScan(true),
            },
            {
              label: "Generar plantilla",
              description: "Contratos y actas listos para completar",
              icon: Sparkles,
              onClick: () => setShowTemplates(true),
            },
            {
              label: "Importar carpeta",
              description: "Subís una carpeta completa respetando sus subcarpetas",
              icon: FolderTree,
              onClick: () => setImportandoCarpeta(true),
              dividerBefore: true,
            },
          ]}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors shadow-sm"
        >
          {uploadProgress ? (
            <>
              <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {uploadProgress.total === 1 ? "Procesando…" : `Subiendo ${uploadProgress.done}/${uploadProgress.total}…`}
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" /> Subir archivos
            </>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <input
          ref={scanInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => e.target.files && handleScan(e.target.files)}
        />
      </AdminModuleHeader>

      {/* Aviso proactivo: documentos por vencer (la promesa del módulo) */}
      {expiringDocs.length > 0 && !expiryBannerDismissed && (
        <div className="flex items-start gap-3 rounded-2xl border-2 border-[var(--data-error-500)]/50 bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15 px-4 py-3">
          <AlarmClock className="mt-0.5 h-5 w-5 shrink-0 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              {expiringDocs.length} documento{expiringDocs.length === 1 ? "" : "s"} por vencer en los próximos 30 días
            </p>
            <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
              {expiringDocs.slice(0, 3).map(({ d, n }) => `${d.name} (${n < 0 ? "vencido" : n === 0 ? "vence hoy" : `${n}d`})`).join(" · ")}
              {expiringDocs.length > 3 ? ` y ${expiringDocs.length - 3} más` : ""}
            </p>
            <p className="mt-1 inline-flex items-center gap-1 text-[length:var(--ts-2xs,11px)] font-medium text-[var(--text-tertiary)]">
              <BellRing className="h-3 w-3 shrink-0" /> Te avisamos automáticamente por WhatsApp y en el panel ~7 días antes de cada vencimiento.
            </p>
          </div>
          <button
            onClick={() => { setFilterMode("expiring"); setActiveFolderId(null); }}
            className="shrink-0 rounded-lg bg-[var(--data-error-700)] dark:bg-[var(--data-error-500)] px-3 py-1.5 text-xs font-bold text-white hover:opacity-90"
          >
            Ver
          </button>
          <button onClick={() => setExpiryBannerDismissed(true)} className="shrink-0 rounded-md p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]" aria-label="Descartar aviso"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Sugerencias IA de organización: carpeta + vencimiento detectados */}
      {sugerenciasIA.length > 0 && (
        <div className="rounded-2xl border-2 border-[var(--accent)]/40 bg-primary/10 px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--accent)]">
              <Sparkles className="h-4 w-4" /> La IA sugiere organizar
            </p>
            {sugerenciasIA.length > 1 && (
              <button
                type="button"
                onClick={() => void aplicarTodasLasSugerencias()}
                disabled={aplicandoTodas}
                title="Guardar las carpetas y los vencimientos sugeridos de todos"
                className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--accent)] px-2.5 py-1 text-xs font-bold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/10 disabled:opacity-60"
              >
                {aplicandoTodas
                  ? <><span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" /> Aplicando…</>
                  : <>Aplicar las {sugerenciasIA.length}</>}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {sugerenciasIA.map(({ doc, carpeta, vence }) => (
              <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--surface-raised)] px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[var(--text-primary)]">{doc.name}</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {carpeta && <>mover a <b className="text-[var(--accent)]">{carpeta.folderName}</b></>}
                    {carpeta && vence && " · "}
                    {vence && <>vence el <b className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{fmtFechaCorta(vence)}</b> — lo agendo y te aviso antes</>}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => void aplicarSugerencia(doc.id, {
                      ...(carpeta ? { folderId: carpeta.folderId } : {}),
                      ...(vence ? { expiresAt: vence } : {}),
                    })}
                    className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white hover:brightness-95"
                  >
                    Aplicar
                  </button>
                  <button
                    type="button"
                    onClick={() => descartarSugerencia(doc.id)}
                    aria-label={`Descartar sugerencia para ${doc.name}`}
                    className="rounded-lg border border-[var(--rule-base)] px-2 py-1.5 text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resultado del escaneo IA */}
      {scanResult && (
        <div className="flex items-start gap-3 p-3.5 rounded-2xl border-2 border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
          <Wand2 className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="min-w-0 text-sm">
            <p className="font-extrabold">Escaneado: {scanResult.name}</p>
            {scanResult.expiresAt ? (
              <p className="mt-0.5">
                📅 Detecté vencimiento el{" "}
                <strong>{new Date(scanResult.expiresAt).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })}</strong>
                {" "}— te avisaré por WhatsApp antes.
              </p>
            ) : (
              <p className="mt-0.5">La IA lo nombró y clasificó. Si vence, agregá la fecha desde el documento.</p>
            )}
          </div>
          <button onClick={() => setScanResult(null)} className="ml-auto p-1 rounded-md hover:bg-emerald-100" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Indicador de análisis IA en curso */}
      {analyzingId && !analyzeResult && (
        <div className="flex items-center gap-2 rounded-2xl border-2 border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-2.5 text-sm font-bold text-[var(--accent)]">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" /> Analizando el contenido con IA…
        </div>
      )}

      {/* Resultado del análisis IA de contenido */}
      {analyzeResult && (
        <div className="flex items-start gap-3 rounded-2xl border-2 border-[var(--accent)]/40 bg-[var(--accent)]/10 p-3.5">
          <Wand2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-extrabold text-[var(--text-primary)]">Analizado: {analyzeResult.name}</p>
            <p className="mt-0.5 text-[var(--text-secondary)]">{analyzeResult.summary}</p>
            {analyzeResult.keyFacts.length > 0 && (
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {analyzeResult.keyFacts.slice(0, 6).map((f, i) => (
                  <li key={i} className="rounded-md bg-[var(--surface-raised)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">{f}</li>
                ))}
              </ul>
            )}
            <p className="mt-1.5 text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">El asistente IA ya puede responder con el contenido de este documento.</p>
          </div>
          <button onClick={() => setAnalyzeResult(null)} className="shrink-0 rounded-md p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          <X className="h-4 w-4 shrink-0" /> {error}
          <button onClick={refresh} className="ml-auto text-xs underline">Reintentar</button>
        </div>
      )}

      {/* Hero stats — en la papelera se ocultan: el listado que hay en memoria es
          el de los BORRADOS, así que "Total archivos" y "Espacio usado" contaban
          la papelera como si fuera el drive (4 archivos, 976 KB, con 41 vivos).
          Ocultos por defecto (Brandon 2026-08-30): la fila de resumen empujaba
          los documentos, que es lo que se busca casi siempre al abrir el drive. */}
      {filterMode !== "trash" && (
      <div>
        <button
          onClick={() => setKpisVisible((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-tertiary)] hover:text-primary transition-colors"
        >
          {kpisVisible ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {kpisVisible ? "Ocultar resumen" : "Mostrar resumen"}
        </button>
        {kpisVisible && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mt-2">
          <StatBlock label="Total archivos" value={shownDocCount.toString()} icon={FileIcon} tint="text-primary" />
          <StorageRing usedBytes={totalSize} quotaBytes={STORAGE_QUOTA_BYTES} />
          <button
            onClick={() => { setFilterMode("expiring"); setActiveFolderId(null); }}
            className={cn(
              "text-left bg-white border rounded-2xl p-4 transition-all hover:shadow-md",
              expiringSoonCount > 0 ? "border-[var(--data-error-500)]/40 hover:border-[var(--data-error-500)]" : "border-[var(--rule-base)] hover:border-primary/40"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Por vencer (30d)</p>
                <p className={cn("text-2xl font-extrabold tabular-nums mt-0.5", expiringSoonCount > 0 ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--text-tertiary)]")}>{expiringSoonCount}</p>
              </div>
              <AlarmClock className={cn("h-5 w-5 shrink-0 mt-0.5", expiringSoonCount > 0 ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--text-tertiary)]")} />
            </div>
          </button>
          <StatBlock label="Favoritos" value={favCount.toString()} icon={Star} tint="text-amber-500" />
        </div>
        )}
      </div>
      )}

      <div
        className="grid grid-cols-1 lg:grid-cols-[var(--docs-sidebar-w)_12px_1fr] gap-5 lg:gap-x-0"
        style={{ "--docs-sidebar-w": `${sidebarWidth}px` } as React.CSSProperties}
      >
        {/* ─── Sidebar ─── */}
        <aside className="bg-white border border-[var(--rule-base)] rounded-2xl p-3 h-fit">
          <p className="text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] px-3 py-2">
            Vista
          </p>
          {(() => {
            const visibles = BUILTIN_CATEGORIES.filter((cat) => vistaConDatos[cat.id] || filterMode === cat.id);
            const todos = visibles.find((c) => c.id === "all");
            const resto = visibles.filter((c) => c.id !== "all");
            // Auto-abierto si la vista activa vive adentro del grupo — si no,
            // "Papelera" (por ej.) parecería que nada está seleccionado.
            const grupoAbierto = otrosAbierto || resto.some((c) => c.id === filterMode);
            const item = (cat: BuiltinCategory) => {
              const Icon = cat.icon;
              const active = filterMode === cat.id;
              return (
                <li key={cat.id}>
                  <button
                    onClick={() => {
                      setFilterMode(cat.id as typeof filterMode);
                      setActiveFolderId(null);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-bold transition-colors",
                      active ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : cat.color)} />
                    <span className="flex-1 text-left">{cat.label}</span>
                  </button>
                </li>
              );
            };
            return (
              <ul className="space-y-1 mb-4">
                {todos && item(todos)}
                {resto.length > 0 && (
                  <li>
                    <button
                      onClick={() => setOtrosAbierto((v) => !v)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
                      aria-expanded={grupoAbierto}
                    >
                      <MoreHorizontal className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                      <span className="flex-1 text-left">Más vistas</span>
                      <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)] transition-transform", grupoAbierto && "rotate-180")} />
                    </button>
                    {grupoAbierto && (
                      <ul className="mt-1 ml-3 space-y-1 border-l-2 border-[var(--rule-soft)] pl-2">
                        {resto.map(item)}
                      </ul>
                    )}
                  </li>
                )}
              </ul>
            );
          })()}

          <div
            className={cn("flex items-center justify-between px-3 py-2 rounded-lg transition-all", rootDropActive && "bg-primary/10 ring-2 ring-primary")}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes("application/x-folder-id")) return;
              if (draggingFolderId && (folderById.get(draggingFolderId)?.parentId ?? null) === null) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setRootDropActive(true);
            }}
            onDragLeave={() => setRootDropActive(false)}
            onDrop={(e) => {
              if (!e.dataTransfer.types.includes("application/x-folder-id")) return;
              e.preventDefault();
              e.stopPropagation();
              dropFolderOnFolder(e.dataTransfer.getData("application/x-folder-id"), null);
            }}
          >
            <p className="text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              {draggingFolderId ? "Soltá acá → raíz" : "Carpetas"}
            </p>
            <div className="flex items-center gap-0.5">
              {folders.length > 1 && (
                <button
                  onClick={() => (selectingFolders ? salirSeleccion() : setSelectingFolders(true))}
                  aria-pressed={selectingFolders}
                  className={cn(
                    "h-6 w-6 inline-flex items-center justify-center rounded-md transition-colors",
                    selectingFolders
                      ? "bg-primary text-white"
                      : "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-primary",
                  )}
                  aria-label={selectingFolders ? "Salir de la selección" : "Seleccionar varias carpetas"}
                  title={selectingFolders ? "Salir de la selección" : "Seleccionar varias carpetas"}
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => openCreateChild(null)}
                className="h-6 w-6 inline-flex items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-primary transition-colors"
                aria-label="Nueva carpeta"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Barra de acciones en lote: aparece con la primera carpeta marcada. */}
          {selectingFolders && selectedFolderIds.size > 0 && (
            <FolderBulkBar
              ids={[...selectedFolderIds]}
              nombres={[...selectedFolderIds].map((id) => folderById.get(id)?.name ?? id)}
              descendientesIds={descendientesMarcados}
              documentosDirectos={documentosMarcados.directos}
              documentosEnSubcarpetas={documentosMarcados.enSubcarpetas}
              sugerencias={folderTagSuggestions}
              totalCarpetas={folders.length}
              onSeleccionarTodas={() => setSelectedFolderIds(new Set(folders.map((f) => f.id)))}
              onAccion={(accion, ids) => bulkFolders(ids ?? [...selectedFolderIds], accion)}
              onSalir={salirSeleccion}
            />
          )}
          {selectingFolders && selectedFolderIds.size === 0 && (
            <p className="mx-1 mb-2 rounded-lg border-2 border-dashed border-[var(--rule-base)] px-3 py-2 text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">
              Marcá las carpetas que querés cambiar de una: emoji, etiquetas, color o eliminar.
            </p>
          )}

          {newFolderParent === null && (
            <div className="flex items-stretch gap-1 px-2 mb-2">
              <input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); if (e.key === "Escape") { setNewFolderParent(undefined); setNewFolderName(""); } }}
                autoFocus
                placeholder="Nombre de la carpeta…"
                className="flex-1 px-2 py-1.5 rounded-md border-2 border-[var(--rule-base)] text-xs outline-none focus:border-primary"
              />
              <button onClick={handleCreateFolder} className="px-2 rounded-md bg-primary text-white text-xs font-bold hover:bg-primary-dark"><Check className="h-3 w-3" /></button>
            </div>
          )}

          <ul className="space-y-0.5">
            {folders.length === 0 && (
              <li className="px-3 py-2 text-xs text-[var(--text-tertiary)] italic">Sin carpetas. Creá la primera.</li>
            )}
            {visibleFolderRows.map(({ folder: f, depth, hasChildren }) => {
              const active = filterMode === "folder" && activeFolderId === f.id;
              const dropTarget = dragOverFolderId === f.id;
              const isOpen = expandedFolders.has(f.id);
              return (
                <li key={f.id}>
                  <div
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/x-folder-id", f.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDraggingFolderId(f.id);
                    }}
                    onDragEnd={() => { setDraggingFolderId(null); setDragOverFolderId(null); setRootDropActive(false); }}
                    className={cn(
                      "group relative rounded-lg transition-all",
                      dropTarget && "bg-primary/10 ring-2 ring-primary",
                      draggingFolderId === f.id && "opacity-40"
                    )}
                    onDragOver={(e) => {
                      const t = e.dataTransfer.types;
                      const isDoc = t.includes("application/x-doc-id");
                      const isFolder = t.includes("application/x-folder-id");
                      if (!isDoc && !isFolder) return;
                      // Reparent inválido: sobre sí misma o sobre un descendiente.
                      if (isFolder && draggingFolderId && (draggingFolderId === f.id || descendantIds(childrenMap, draggingFolderId).has(f.id))) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragOverFolderId !== f.id) setDragOverFolderId(f.id);
                    }}
                    onDragLeave={() => setDragOverFolderId((cur) => (cur === f.id ? null : cur))}
                    onDrop={(e) => {
                      const t = e.dataTransfer.types;
                      if (t.includes("application/x-folder-id")) {
                        e.preventDefault();
                        e.stopPropagation();
                        dropFolderOnFolder(e.dataTransfer.getData("application/x-folder-id"), f.id);
                      } else if (t.includes("application/x-doc-id")) {
                        e.preventDefault();
                        e.stopPropagation();
                        dropDocOnFolder(e.dataTransfer.getData("application/x-doc-id"), f.id);
                      }
                    }}
                  >
                    <div className="flex items-stretch" style={{ paddingLeft: depth * 14 }}>
                      {selectingFolders && (
                        <label
                          className="flex shrink-0 cursor-pointer items-center pl-1 pr-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selectedFolderIds.has(f.id)}
                            onChange={() => toggleFolderSelected(f.id)}
                            className="h-3.5 w-3.5 accent-[var(--accent)]"
                            aria-label={`Seleccionar la carpeta ${f.name}`}
                          />
                        </label>
                      )}
                      {hasChildren ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleExpand(f.id); }}
                          className="shrink-0 w-5 inline-flex items-center justify-center text-[var(--text-tertiary)] hover:text-primary"
                          aria-label={isOpen ? `Colapsar ${f.name}` : `Expandir ${f.name}`}
                          aria-expanded={isOpen}
                        >
                          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-90")} />
                        </button>
                      ) : (
                        <span className="shrink-0 w-5" />
                      )}
                      <button
                        onClick={() => { setFilterMode("folder"); setActiveFolderId(f.id); }}
                        className={cn(
                          "relative group/folderrow flex-1 min-w-0 flex items-center gap-2 py-2 pr-14 rounded-lg text-sm font-bold transition-colors",
                          active ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                        )}
                      >
                        <FolderGlyph folder={f} active={active} className="h-4 w-4 shrink-0" />
                        <span className="flex-1 text-left truncate">{f.name}</span>
                        {/* Nombre completo al hover — el sidebar es redimensionable
                            (puede llegar a 180px) y el `truncate` de arriba no
                            avisaba en absoluto qué decía el nombre cortado. */}
                        <span className="pointer-events-none absolute left-6 top-full z-50 mt-1 hidden whitespace-nowrap rounded-lg bg-[var(--text-primary)] px-2.5 py-1.5 text-xs font-bold text-white shadow-[var(--shadow-lg)] group-hover/folderrow:block dark:bg-[var(--surface-raised)] dark:border dark:border-[var(--rule-base)]">
                          {f.name}
                        </span>
                        {/* Con el checkbox puesto, el ancho del sidebar no alcanza
                            para nombre + etiquetas: en modo selección hay que poder
                            LEER qué se marca, así que los chips se guardan. */}
                        {(f.tags?.length ?? 0) > 0 && !selectingFolders && (
                          <span className="hidden shrink-0 items-center gap-0.5 xl:flex" title={`Etiquetas: ${(f.tags ?? []).join(", ")}`}>
                            {(f.tags ?? []).slice(0, 2).map((t) => (
                              <span
                                key={t}
                                className="rounded-full bg-[var(--surface-sunken)] px-1.5 text-[length:var(--ts-2xs,11px)] font-medium text-[var(--text-tertiary)]"
                              >
                                {t}
                              </span>
                            ))}
                            {(f.tags ?? []).length > 2 && (
                              <span className="text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">+{(f.tags ?? []).length - 2}</span>
                            )}
                          </span>
                        )}
                        {f.documentCount !== undefined && f.documentCount > 0 && (
                          <span className={cn(
                            "text-[length:var(--ts-2xs,11px)] tabular-nums px-1.5 py-0.5 rounded-md font-bold",
                            active ? "bg-primary text-white" : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
                          )}>
                            {f.documentCount}
                          </span>
                        )}
                      </button>
                    </div>
                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openCreateChild(f.id); }}
                        className="p-1 rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-primary transition-all"
                        aria-label={`Nueva subcarpeta en ${f.name}`}
                        title="Nueva subcarpeta"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setEditingFolder(f); }}
                        className="p-1 rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-primary transition-all"
                        aria-label={`Personalizar carpeta ${f.name}`}
                        title="Color e ícono"
                      >
                        <Palette className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSharingFolder(f); }}
                        className="p-1 rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-primary transition-all"
                        aria-label={`Compartir carpeta ${f.name}`}
                        title="Compartir carpeta por link"
                      >
                        <Share2 className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDeleteFolder(f); }}
                        className="p-1 rounded-md text-[var(--text-tertiary)] hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/15 hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)] transition-all"
                        aria-label={`Eliminar carpeta ${f.name}`}
                        title="Eliminar carpeta"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  {newFolderParent === f.id && (
                    <div className="flex items-stretch gap-1 py-1 pr-2" style={{ paddingLeft: (depth + 1) * 14 + 20 }}>
                      <input
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); if (e.key === "Escape") { setNewFolderParent(undefined); setNewFolderName(""); } }}
                        autoFocus
                        placeholder="Subcarpeta…"
                        className="flex-1 min-w-0 px-2 py-1.5 rounded-md border-2 border-[var(--rule-base)] text-xs outline-none focus:border-primary"
                      />
                      <button onClick={handleCreateFolder} className="px-2 rounded-md bg-primary text-white text-xs font-bold hover:bg-primary-dark shrink-0"><Check className="h-3 w-3" /></button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Carpetas inteligentes (filtros guardados) */}
          <div className="mt-3 flex items-center justify-between px-3">
            <span className="text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Inteligentes</span>
            <button onClick={() => setSmartModal("new")} className="text-[var(--text-tertiary)] hover:text-primary" aria-label="Nueva carpeta inteligente" title="Nueva carpeta inteligente">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <ul className="mt-1 space-y-0.5">
            {smartFolders.map((sf) => {
              const active = filterMode === "smart" && activeSmartId === sf.id;
              return (
                <li key={sf.id} className="group/sf flex items-center">
                  <button
                    onClick={() => { setFilterMode("smart"); setActiveSmartId(sf.id); }}
                    className={cn("flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold transition-colors", active ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]")}
                  >
                    <Sparkles className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                    <span className="min-w-0 flex-1 truncate">
                      {sf.name}
                      <span className="block truncate text-[length:var(--ts-2xs,11px)] font-normal text-[var(--text-tertiary)]">{describeRules(sf.rules)}</span>
                    </span>
                  </button>
                  <button onClick={() => setSmartModal(sf)} className="px-1 text-[var(--text-tertiary)] opacity-0 group-hover/sf:opacity-100 hover:text-primary" aria-label="Editar" title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => { if (confirm(`¿Borrar la carpeta inteligente "${sf.name}"?`)) { persistSmart(smartFolders.filter((x) => x.id !== sf.id)); if (activeSmartId === sf.id) { setActiveSmartId(null); setFilterMode("all"); } } }} className="px-1 text-[var(--text-tertiary)] opacity-0 group-hover/sf:opacity-100 hover:text-[var(--data-error-700)]" aria-label="Borrar" title="Borrar"><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              );
            })}
            {smartFolders.length === 0 && (
              <li className="px-3 py-1 text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">Ej: “Facturas ≥ S/1000”, “Vence este mes”.</li>
            )}
          </ul>

          <button
            onClick={() => setShowTags(true)}
            className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
          >
            <Tag className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" /> Etiquetas
          </button>
        </aside>

        <SidebarResizeHandle
          width={sidebarWidth}
          min={SIDEBAR_MIN_W}
          max={SIDEBAR_MAX_W}
          onChange={setSidebarWidth}
          onCommit={(w) => { try { localStorage.setItem("doc-sidebar-width", String(w)); } catch { /* quota */ } }}
        />

        {/* ─── Main list ─── */}
        <div className="space-y-4">
          {/* Toolbar — solo en vistas tipo lista (no en resumen/asistente/actividad/calendario/enlaces) */}
          {!VISTAS_CON_CONTENIDO_PROPIO.has(filterMode) && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex-1 min-w-[220px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
              <input
                type="text"
                placeholder={semantic ? "Describí lo que buscás… ej: el contrato del local" : "Buscar por nombre, tag o contenido OCR…"}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn(
                  "w-full pl-9 pr-3 py-2.5 rounded-xl border-2 bg-white text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all",
                  semantic ? "border-[var(--accent)]" : "border-[var(--rule-base)]"
                )}
              />
            </div>
            <button
              onClick={() => setSemantic((s) => !s)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border-2 text-sm font-bold transition-colors",
                semantic ? "bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--accent)]" : "bg-white border-[var(--rule-base)] text-[var(--text-tertiary)] hover:border-[var(--accent)]/40"
              )}
              title="Búsqueda inteligente: entiende lo que querés decir, no solo palabras exactas"
            >
              <Sparkles className="h-4 w-4" /> <span className="hidden sm:inline">IA</span>
            </button>
            {/* Los tipos que se ofrecen salen de lo que hay en la vista actual,
                no de una lista fija: cada opción que no filtra nada es una que
                hay que descartar a mano. */}
            <FiltrosDoc
              filtros={filtros}
              onCambiar={setFiltros}
              presentes={familiasPresentes(documents)}
              tagsPresentes={tagsPresentes(documents)}
              abierto={filtrosAbiertos}
              onAlternar={() => setFiltrosAbiertos((v) => !v)}
              resultados={displayDocs.length}
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="h-[42px] rounded-xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-secondary)] outline-none focus:border-primary"
              aria-label="Ordenar documentos"
              title="Ordenar documentos"
            >
              {/* Buscando, el orden por defecto pasa a ser el parecido con lo
                  que pediste; sin búsqueda no tiene sentido ofrecerlo. */}
              {terminosBusqueda.length > 0 && <option value="relevancia">Más parecidos</option>}
              <option value="recent">Más recientes</option>
              <option value="name">Nombre A–Z</option>
              <option value="size">Tamaño</option>
              <option value="expiry">Vence primero</option>
            </select>
            <div className="inline-flex rounded-xl border-2 border-[var(--rule-base)] bg-white overflow-hidden">
              <button
                onClick={() => setView("grid")}
                className={cn("px-3 py-2 transition-colors", view === "grid" ? "bg-primary text-white" : "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]")}
                aria-label="Vista grilla"
              >
                <Grid3x3 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setView("list")}
                className={cn("px-3 py-2 transition-colors border-l-2 border-[var(--rule-base)]", view === "list" ? "bg-primary text-white" : "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]")}
                aria-label="Vista lista"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
            {/* Columnas opcionales — sólo tiene sentido en la tabla, la grilla
                no tiene columnas que ocultar. */}
            {view === "list" && (
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setColsMenuOpen((v) => !v); }}
                  className={cn(
                    "inline-flex h-[42px] items-center gap-1.5 px-3 rounded-xl border-2 text-sm font-bold transition-colors",
                    colsMenuOpen ? "border-primary text-primary bg-primary/5" : "border-[var(--rule-base)] bg-white text-[var(--text-secondary)] hover:border-primary hover:text-primary"
                  )}
                  title="Elegir columnas visibles"
                  aria-label="Elegir columnas visibles"
                  aria-expanded={colsMenuOpen}
                >
                  <Columns3 className="h-4 w-4" />
                </button>
                {colsMenuOpen && (
                  <div
                    className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 shadow-xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="px-2 py-1 text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Columnas</p>
                    {(
                      [
                        ["categoria", "Categoría"],
                        ["etiquetas", "Etiquetas"],
                        ["vencimiento", "Vencimiento"],
                        ["tamano", "Tamaño"],
                        ["subido", "Subido"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={colsVisibles[key]}
                          onChange={(e) => setColsVisibles((c) => ({ ...c, [key]: e.target.checked }))}
                          className="h-4 w-4 rounded border-2 border-[var(--rule-base)] accent-[var(--color-primary)]"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          )}

          {/* Indicador del modo de búsqueda IA (semántica) */}
          {semantic && (
            <div className="flex items-center gap-2 rounded-lg bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--accent)]">
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              Modo IA activo: describí el documento (ej. &ldquo;el contrato del local&rdquo;), no solo palabras exactas.
            </div>
          )}

          {/* Breadcrumbs de la carpeta activa (subcarpetas anidadas) */}
          {filterMode === "folder" && activePath.length > 0 && (
            <nav className="flex items-center gap-1 flex-wrap text-sm" aria-label="Ruta de carpetas">
              <button
                onClick={() => { setFilterMode("all"); setActiveFolderId(null); }}
                className="inline-flex items-center gap-1.5 font-bold text-[var(--text-tertiary)] hover:text-primary transition-colors"
              >
                <FolderArchive className="h-4 w-4" /> Todos
              </button>
              {activePath.map((f, i) => {
                const last = i === activePath.length - 1;
                return (
                  <span key={f.id} className="inline-flex items-center gap-1">
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
                    <button
                      onClick={() => { setFilterMode("folder"); setActiveFolderId(f.id); }}
                      disabled={last}
                      className={cn(
                        "font-bold rounded-md px-1 transition-colors",
                        last ? "text-primary" : "text-[var(--text-secondary)] hover:text-primary"
                      )}
                    >
                      {f.name}
                    </button>
                  </span>
                );
              })}
              {displayDocs.length > 0 && (
                <button
                  onClick={downloadFolderZip}
                  disabled={zipping}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-white px-2.5 py-1.5 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
                  title="Descargar todos los documentos de esta carpeta en un ZIP"
                >
                  <FileArchive className="h-3.5 w-3.5" /> {zipping ? "Comprimiendo…" : "Descargar carpeta (ZIP)"}
                </button>
              )}
            </nav>
          )}

          {/* Subcarpetas de la carpeta activa — atajo para bajar un nivel */}
          {filterMode === "folder" && activeChildren.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Subcarpetas</span>
              {activeChildren.map((f) => {
                const dropTarget = dragOverFolderId === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => { setFilterMode("folder"); setActiveFolderId(f.id); setExpandedFolders((prev) => new Set(prev).add(f.id)); }}
                    onDragOver={(e) => {
                      if (!e.dataTransfer.types.includes("application/x-doc-id")) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragOverFolderId !== f.id) setDragOverFolderId(f.id);
                    }}
                    onDragLeave={() => setDragOverFolderId((cur) => (cur === f.id ? null : cur))}
                    onDrop={(e) => {
                      if (!e.dataTransfer.types.includes("application/x-doc-id")) return;
                      e.preventDefault();
                      e.stopPropagation();
                      dropDocOnFolder(e.dataTransfer.getData("application/x-doc-id"), f.id);
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 bg-white text-sm font-bold text-[var(--text-secondary)] hover:border-primary hover:text-primary transition-colors",
                      dropTarget ? "border-primary ring-2 ring-primary" : "border-[var(--rule-base)]"
                    )}
                  >
                    <FolderGlyph folder={f} className="h-4 w-4" /> {f.name}
                    {f.documentCount !== undefined && f.documentCount > 0 && (
                      <span className="tabular-nums text-[var(--text-tertiary)]">{f.documentCount}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Bulk bar — `flex-wrap` porque con las acciones de estado ya no
              entra en una línea y los textos se montaban unos sobre otros
              ("EliminarCancelar"). Que baje de renglón es preferible. */}
          {selectedIds.size > 0 && (
            <div className="sticky top-2 z-30 flex flex-wrap items-center gap-x-2 gap-y-1.5 px-4 py-2.5 rounded-2xl bg-primary text-white shadow-lg">
              <span className="text-sm font-bold tabular-nums">{selectedIds.size} seleccionado(s)</span>
              <button
                onClick={() => (todosElegidos ? setSelectedIds(new Set()) : selectAll())}
                className="text-xs px-2.5 py-1 rounded-md bg-white/20 hover:bg-white/30 font-bold"
                title={
                  hayFiltroPuesto
                    ? "Elige todo lo que quedó tras filtrar, no todo el drive"
                    : "Elige todos los que están a la vista"
                }
              >
                {todosElegidos
                  ? "Ninguno"
                  : hayFiltroPuesto
                    ? `Elegir los ${displayDocs.length} filtrados`
                    : `Elegir los ${displayDocs.length}`}
              </button>
              <button onClick={() => bulkFavorite(true)} className="text-xs px-2.5 py-1 rounded-md bg-white/20 hover:bg-white/30 font-bold inline-flex items-center gap-1">
                <Star className="h-3 w-3" /> Favorito
              </button>

              {/* Los dos veredictos de todos los días, a un clic. El resto de
                  estados vive en el menú de al lado. */}
              <span className="ml-1 h-5 w-px bg-white/30" aria-hidden />
              <button
                onClick={() => bulkStatus("approved")}
                className="text-xs px-2.5 py-1 rounded-md bg-white/20 hover:bg-white/30 font-bold inline-flex items-center gap-1.5"
                title="Marcar como aprobado: está bien, se puede usar"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--data-success-500)] ring-1 ring-white/70" aria-hidden />
                Está bien
              </button>
              <button
                onClick={() => bulkStatus("observado")}
                className="text-xs px-2.5 py-1 rounded-md bg-white/20 hover:bg-white/30 font-bold inline-flex items-center gap-1.5"
                title="Marcar para corregir: tiene algo mal"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--data-error-500)] ring-1 ring-white/70" aria-hidden />
                Hay que corregir
              </button>
              <select
                onChange={(e) => { const v = e.target.value; if (v) bulkStatus(v as EstadoDoc); e.currentTarget.selectedIndex = 0; }}
                defaultValue=""
                className="text-xs px-2 py-1 rounded-md bg-white/20 hover:bg-white/30 text-white font-bold outline-none cursor-pointer [&>option]:text-[var(--text-primary)]"
                title="Marcar con otro estado"
                aria-label="Marcar con otro estado"
              >
                <option value="" disabled>Otro estado…</option>
                {ORDEN_ESTADOS.map((e) => (
                  <option key={e} value={e}>{META_ESTADO[e].label}</option>
                ))}
                <option value="none">Quitar el estado</option>
              </select>
              {/* Acciones menos frecuentes (mover, ZIP, WhatsApp, combinar) agrupadas
                  acá — la fila crecía sin límite cada vez que se sumaba una acción
                  bulk nueva y terminaba ilegible en pantallas angostas. */}
              <button
                ref={bulkMoreBtnRef}
                onClick={(e) => {
                  e.stopPropagation();
                  if (bulkMoreOpen) { setBulkMoreOpen(false); return; }
                  const r = bulkMoreBtnRef.current?.getBoundingClientRect();
                  if (r) setBulkMorePos({ top: r.bottom + 4, right: window.innerWidth - r.right });
                  setBulkMoreOpen(true);
                }}
                className="text-xs px-2.5 py-1 rounded-md bg-white/20 hover:bg-white/30 font-bold inline-flex items-center gap-1"
                aria-label="Más acciones para la selección"
              >
                <MoreHorizontal className="h-3 w-3" /> Más
              </button>
              {bulkMoreOpen && bulkMorePos && (
                <div
                  className="fixed z-50 min-w-[200px] overflow-hidden rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] py-1 shadow-xl"
                  style={{ top: bulkMorePos.top, right: bulkMorePos.right }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <select
                    onChange={(e) => { const v = e.target.value; if (v) { bulkMove(v === "__none__" ? null : v); } setBulkMoreOpen(false); }}
                    defaultValue=""
                    className="w-full px-3 py-2 text-sm font-medium text-[var(--text-secondary)] bg-transparent outline-none cursor-pointer hover:bg-[var(--surface-sunken)]"
                    aria-label="Mover a carpeta"
                  >
                  <option value="" disabled>Mover a…</option>
                  {allFolderRows.map(({ folder: f, depth }) => (
                    <option key={f.id} value={f.id}>{`${"   ".repeat(depth)}${depth > 0 ? "└ " : ""}${f.name}`}</option>
                  ))}
                  <option value="__none__">Sin carpeta</option>
                  </select>
                  <button
                    onClick={() => { setBulkMoreOpen(false); bulkDownloadZip(); }}
                    disabled={zipping}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-60"
                  >
                    <FileArchive className="h-4 w-4 shrink-0" /> {zipping ? "Comprimiendo…" : "Descargar ZIP"}
                  </button>
                  {/* Mandar la selección entera por WhatsApp: un enlace por
                      documento en un solo mensaje. Antes había que abrir la ficha
                      de cada uno y repetir el envío. */}
                  <button
                    onClick={() => {
                      setBulkMoreOpen(false);
                      // Tope de 10: el endpoint de compartir corre con preset STRICT
                      // (10 cada 15 min). Mandar 20 dejaría al usuario sin poder
                      // compartir nada por un cuarto de hora.
                      const elegidos = documents.filter((d) => selectedIds.has(d.id)).slice(0, 10);
                      if (elegidos.length > 0) setWhatsappDoc(elegidos);
                    }}
                    title={selectedIds.size > 10 ? "Se enviarán los primeros 10 (límite del servidor: 10 enlaces cada 15 min)" : undefined}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
                  >
                    <MessageCircle className="h-4 w-4 shrink-0" /> Enviar por WhatsApp
                  </button>
                  {selectedIds.size >= 2 && (
                    <button
                      onClick={() => { setBulkMoreOpen(false); handleMerge(); }}
                      disabled={merging}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-60"
                    >
                      <Combine className="h-4 w-4 shrink-0" /> {merging ? "Combinando…" : "Combinar en un PDF"}
                    </button>
                  )}
                </div>
              )}
              <button
                onClick={() => setBulkTagModalOpen(true)}
                className="text-xs px-2.5 py-1 rounded-md bg-white/20 hover:bg-white/30 font-bold inline-flex items-center gap-1"
              >
                <Tag className="h-3 w-3" /> Etiquetar…
              </button>
              <button onClick={bulkDelete} className="text-xs px-2.5 py-1 rounded-md bg-[var(--data-error-500)] hover:brightness-110 font-bold inline-flex items-center gap-1">
                <Trash2 className="h-3 w-3" /> Eliminar
              </button>
              <button onClick={clearSelection} className="ml-auto text-xs px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 font-bold">Cancelar</button>
            </div>
          )}

          {/* Filtro por estado (workflow) */}
          {!VISTAS_CON_CONTENIDO_PROPIO.has(filterMode) && filterMode !== "trash" && (statusFilter !== null || STATUS_ORDER.some((k) => statusCounts[k] > 0)) && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Estado</span>
              <button
                onClick={() => setStatusFilter(null)}
                className={cn("rounded-lg px-2.5 py-1 text-xs font-bold transition-colors", statusFilter === null ? "bg-primary text-white" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-primary")}
              >
                Todos
              </button>
              {STATUS_ORDER.map((k) => {
                const m = STATUS_META[k];
                const n = statusCounts[k] ?? 0;
                const active = statusFilter === k;
                return (
                  <button
                    key={k}
                    onClick={() => setStatusFilter(active ? null : k)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-colors",
                      active ? cn(m.bg, m.text, "ring-2 ring-primary") : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-primary"
                    )}
                  >
                    <span className={cn("h-2 w-2 rounded-full", m.dot)} /> {m.label}{n > 0 && <span className="tabular-nums opacity-70">{n}</span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Lo que todavía no se puede buscar por lo que dice. Es la deuda
              real del drive: un archivo sin descripción sólo aparece si te
              acordás de su nombre. */}
          {!VISTAS_CON_CONTENIDO_PROPIO.has(filterMode) && filterMode !== "trash" && (indexableDocs.length > 0 || soloSinDescribir) && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-dashed border-[var(--accent)]/35 bg-[var(--accent)]/5 px-3 py-2">
              <Sparkles className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
              <p className="min-w-0 flex-1 text-xs font-semibold text-[var(--text-secondary)]">
                {indexableDocs.length > 0 ? (
                  <>
                    <span className="tabular-nums font-bold text-[var(--text-primary)]">{indexableDocs.length}</span>{" "}
                    {indexableDocs.length === 1 ? "documento no tiene descripción" : "documentos no tienen descripción"}: no
                    aparecen cuando buscás por lo que dicen adentro.{" "}
                    <span className="font-normal text-[var(--text-tertiary)]">
                      Se van leyendo solos cada noche; con el botón se apura la fila.
                    </span>
                  </>
                ) : (
                  "Ya está todo descrito."
                )}
              </p>
              <button
                onClick={() => setSoloSinDescribir((v) => !v)}
                className={cn(
                  "shrink-0 rounded-lg border-2 px-2.5 py-1 text-xs font-bold transition-colors",
                  soloSinDescribir
                    ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]"
                    : "border-[var(--rule-base)] bg-white text-[var(--text-secondary)] hover:border-[var(--accent)]/50 dark:bg-[var(--surface-raised)]",
                )}
              >
                {soloSinDescribir ? "Ver todos" : "Ver cuáles"}
              </button>
              {indexableDocs.length > 0 && (
                <button
                  onClick={describirFaltantes}
                  disabled={!!progresoDesc}
                  title="La IA lee cada uno y escribe de qué se trata (tarda unos segundos por documento)"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-2.5 py-1 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {progresoDesc ? (
                    <>
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span className="tabular-nums">{progresoDesc.hechos}/{progresoDesc.total}</span>
                    </>
                  ) : (
                    <><Sparkles className="h-3 w-3" /> Describirlos con IA</>
                  )}
                </button>
              )}
              {/* Cuando la IA no puede (sin cupo por hoy, sin credencial, o
                  sin modelo que MIRE las fotos) se dice acá, con lo que hay que
                  hacer, en vez de dejar el contador clavado sin explicación. */}
              {avisoIA && (
                <p className="w-full text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                  {avisoIA}
                </p>
              )}
            </div>
          )}

          {/* En modo IA: con qué sinónimos se amplió la búsqueda. */}
          {semantic && semanticTerms.length > 0 && !VISTAS_CON_CONTENIDO_PROPIO.has(filterMode) && (
            <TerminosIA terminos={semanticTerms} />
          )}

          {filterMode === "assistant" ? (
            <AssistantView
              onOpenDoc={(id) => { const d = documents.find((x) => x.id === id); if (d) setPreview(d); }}
              onSign={(id) => { const d = documents.find((x) => x.id === id); if (d) setSignDoc(d); }}
              onShare={(id) => { const d = documents.find((x) => x.id === id); if (d) setWhatsappDoc([d]); }}
              onApprove={(id) => { patch(id, { status: "approved" }); }}
              indexableCount={indexableDocs.length}
              onIndexAll={handleIndexAll}
              reindexableCount={reindexableDocs.length}
              onReindexAll={handleReindexAll}
            />
          ) : filterMode === "dashboard" ? (
            <DashboardView docs={documents} />
          ) : filterMode === "calendar" ? (
            <CalendarView docs={documents} onOpenDoc={setPreview} />
          ) : filterMode === "activity" ? (
            <ActivityView />
          ) : filterMode === "enlaces" ? (
            <EnlacesView onOpenDoc={(id) => { const d = documents.find((x) => x.id === id); if (d) setPreview(d); }} />
          ) : filterMode === "sync" ? (
            <SyncEscritorioView
              tenantId={slugActivo()}
              documentos={documents}
              carpetas={folders}
              onCambios={refresh}
            />
          ) : filterMode === "duplicados" ? (
            <DuplicadosView
              onOpenDoc={(d) => setPreview(d)}
              onEliminar={async (ids) => { await bulk("delete", ids); }}
            />
          ) : loading && documents.length === 0 ? (
            <div className="bg-white border border-[var(--rule-base)] rounded-2xl p-10 text-center text-sm text-[var(--text-tertiary)]">
              Cargando…
            </div>
          ) : filterMode === "trash" ? (
            <PapeleraView
              docs={displayDocs}
              onRestore={restore}
              onPurge={purge}
              onRestoreMany={restoreMany}
              onPurgeMany={purgeMany}
            />
          ) : displayDocs.length === 0 ? (
            <EmptyState onUpload={() => fileInputRef.current?.click()} />
          ) : view === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {displayDocs.map((doc) => (
                <DocCard
                  key={doc.id}
                  doc={doc}
                  selected={selectedIds.has(doc.id)}
                  isRenaming={renaming?.id === doc.id}
                  renameValue={renaming?.id === doc.id ? renaming.value : doc.name}
                  terminos={terminosBusqueda}
                  folderNombre={filterMode === "folder" ? undefined : (doc.folderId ? folderById.get(doc.folderId)?.name ?? null : null)}
                  onOpenFolder={() => { if (doc.folderId) { setFilterMode("folder"); setActiveFolderId(doc.folderId); } }}
                  onSelect={() => toggleSelect(doc.id)}
                  onPreview={() => setPreview(doc)}
                  onTagClick={(t) => setFiltros((f) => ({
                    ...f,
                    tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t],
                  }))}
                  tagsActivos={filtros.tags}
                  onPromoteAiTag={(t) => {
                    if (doc.tags.includes(t)) return;
                    patch(doc.id, { tags: [...doc.tags, t] });
                    reloadAllTags();
                  }}
                  onToggleFav={() => patch(doc.id, { favorite: !doc.favorite })}
                  onWhatsApp={() => setWhatsappDoc([doc])}
                  onSetStatus={(s) => patch(doc.id, { status: s })}
                  onRemove={async () => {
                    if (!confirm(`¿Eliminar "${doc.name}"?`)) return;
                    // Acá había un `patch(doc.id, {})` "para calentar el
                    // camino": un PATCH sin campos que el servidor rechaza, y
                    // que reventaba el borrado con un error en pantalla antes
                    // de llegar a borrar nada.
                    await bulk("delete", [doc.id]);
                  }}
                  onStartRename={() => startRename(doc)}
                  onCommitRename={commitRename}
                  onCancelRename={() => setRenaming(null)}
                  onRenameChange={(v) => setRenaming(renaming ? { ...renaming, value: v } : null)}
                  onDownload={() => handleDownload(doc)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/x-doc-id", doc.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDraggingDocId(doc.id);
                  }}
                  onDragEnd={() => { setDraggingDocId(null); setDragOverFolderId(null); }}
                  dragging={draggingDocId === doc.id}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white border border-[var(--rule-base)] rounded-2xl overflow-hidden">
              <DataTable className="w-full text-sm">
                <thead className="bg-[var(--surface-sunken)] border-b border-[var(--rule-base)]">
                  <tr>
                    <th className="text-left px-3 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.size > 0 && selectedIds.size === displayDocs.length}
                        onChange={(e) => (e.target.checked ? selectAll() : clearSelection())}
                        className="h-4 w-4 rounded border-2 border-[var(--rule-base)] accent-[var(--color-primary)]"
                      />
                    </th>
                    {(() => {
                      // Clickear el header ordena por esa columna — antes sólo se
                      // podía cambiar el orden desde el <select> de la toolbar,
                      // sin ninguna pista visual de cuál estaba activo en la tabla.
                      const sortTh = (
                        label: string,
                        value: "name" | "size" | "expiry" | "recent",
                        opts: { align?: "left" | "right"; extraClass?: string } = {},
                      ) => {
                        const { align = "left", extraClass } = opts;
                        const active = sortBy === value;
                        return (
                          <th className={cn("px-4 py-3", align === "right" ? "text-right" : "text-left", extraClass)}>
                            <button
                              type="button"
                              onClick={() => setSortBy(value)}
                              title={`Ordenar por ${label.toLowerCase()}`}
                              className={cn(
                                "inline-flex items-center gap-1 text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider transition-colors",
                                align === "right" && "flex-row-reverse",
                                active ? "text-primary" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                              )}
                            >
                              {label}
                              <ArrowUpDown className={cn("h-3 w-3 shrink-0", active ? "opacity-100" : "opacity-40")} />
                            </button>
                          </th>
                        );
                      };
                      return (
                        <>
                          {sortTh("Nombre", "name")}
                          {colsVisibles.categoria && <th className="text-left px-4 py-3 text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] hidden sm:table-cell">Categoría</th>}
                          {colsVisibles.etiquetas && <th className="text-left px-4 py-3 text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] hidden lg:table-cell">Etiquetas</th>}
                          {colsVisibles.vencimiento && sortTh("Vencimiento", "expiry", { extraClass: "hidden lg:table-cell" })}
                          {colsVisibles.tamano && sortTh("Tamaño", "size", { align: "right", extraClass: "hidden md:table-cell" })}
                          {colsVisibles.subido && sortTh("Subido", "recent", { align: "right", extraClass: "hidden md:table-cell" })}
                        </>
                      );
                    })()}
                    <th className="text-center px-4 py-3 text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--rule-soft,#f1f5f9)]">
                  {displayDocs.map((doc) => {
                    const { Icon, tint, bg } = getFileIcon(doc.mimeType, doc.name);
                    return (
                      <tr key={doc.id} className={cn("hover:bg-[var(--surface-sunken)] transition-colors", selectedIds.has(doc.id) && "bg-primary/5")}>
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(doc.id)}
                            onChange={() => toggleSelect(doc.id)}
                            className="h-4 w-4 rounded border-2 border-[var(--rule-base)] accent-[var(--color-primary)]"
                          />
                        </td>
                        <td className="px-4 py-3">
                          {renaming?.id === doc.id ? (
                            <input
                              type="text"
                              value={renaming.value}
                              onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                              onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(null); }}
                              onBlur={commitRename}
                              autoFocus
                              aria-label={`Renombrar ${doc.name}`}
                              className="w-full max-w-[320px] px-2 py-1 rounded-md border-2 border-primary text-sm font-bold outline-none bg-[var(--surface-raised)] text-[var(--text-primary)]"
                            />
                          ) : (
                            <button onClick={() => setPreview(doc)} onDoubleClick={(e) => { e.preventDefault(); startRename(doc); }} className="flex items-center gap-3 text-left min-w-0 hover:text-primary transition-colors" title="Doble-click para renombrar">
                              <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg shrink-0", bg)}>
                                <Icon className={cn("h-4 w-4", tint)} />
                              </span>
                              <span className="font-bold text-[var(--text-primary)] truncate max-w-[280px]">{doc.name}</span>
                              {doc.favorite && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" />}
                              {doc.versionCount && doc.versionCount > 0 && (
                                <span className="text-[length:var(--ts-2xs)] px-1.5 py-0.5 rounded bg-[var(--data-info-500)]/15 text-[var(--data-info-700)] dark:text-[var(--data-info-500)] font-bold">v{doc.versionCount + 1}</span>
                              )}
                              <ExpiryBadge expiresAt={doc.expiresAt} />
                            </button>
                          )}
                          {/* Fuera del botón a propósito: un <p> adentro de un
                              <button> es HTML inválido y rompe el clic. */}
                          {renaming?.id !== doc.id && (
                            <PorQueAparecio doc={doc} terminos={terminosBusqueda} variante="list" />
                          )}
                        </td>
                        {colsVisibles.categoria && (
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <div className="flex flex-col items-start gap-1">
                            <span className="text-xs text-[var(--text-secondary)] capitalize">{doc.category}</span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <StatusControl status={doc.status} onChange={(s) => patch(doc.id, { status: s })} />
                              {filterMode !== "folder" && (
                                <FolderChip
                                  nombre={doc.folderId ? folderById.get(doc.folderId)?.name ?? null : null}
                                  onClick={() => { if (doc.folderId) { setFilterMode("folder"); setActiveFolderId(doc.folderId); } }}
                                />
                              )}
                            </div>
                          </div>
                        </td>
                        )}
                        {colsVisibles.etiquetas && (
                          <td className="px-4 py-3 hidden lg:table-cell">
                            {(doc.tags?.length ?? 0) > 0 ? (
                              <div className="flex flex-wrap items-center gap-1">
                                {(doc.tags ?? []).slice(0, 3).map((t) => (
                                  <span key={t} className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[length:var(--ts-2xs,11px)] font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">#{t}</span>
                                ))}
                                {(doc.tags ?? []).length > 3 && (
                                  <span className="text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">+{(doc.tags ?? []).length - 3}</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-[var(--text-tertiary)]">—</span>
                            )}
                          </td>
                        )}
                        {colsVisibles.vencimiento && (
                          <td className="px-4 py-3 hidden lg:table-cell">
                            {doc.expiresAt ? <ExpiryBadge expiresAt={doc.expiresAt} /> : <span className="text-xs text-[var(--text-tertiary)]">—</span>}
                          </td>
                        )}
                        {colsVisibles.tamano && (
                          <td className="px-4 py-3 text-right hidden md:table-cell tabular-nums text-xs text-[var(--text-secondary)]">{formatBytes(doc.size)}</td>
                        )}
                        {colsVisibles.subido && (
                          <td className="px-4 py-3 text-right hidden md:table-cell tabular-nums text-xs text-[var(--text-tertiary)]">
                            {new Date(doc.uploadedAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}
                          </td>
                        )}
                        <td className="px-4 py-3 text-center">
                          <RowActions
                            favorite={!!doc.favorite}
                            onPreview={() => setPreview(doc)}
                            onAnalyze={() => handleAnalyze(doc)}
                            onRename={() => startRename(doc)}
                            onMove={() => setMovingDoc(doc)}
                            onTag={() => setTagDocId(doc.id)}
                            onWhatsApp={() => setWhatsappDoc([doc])}
                            onSign={() => setSignDoc(doc)}
                            onStamp={() => setStampTarget(doc)}
                            onRotate={() => handleRotate(doc)}
                            onSplit={() => handleSplit(doc)}
                            onEditPages={() => setPageEditorDoc(doc)}
                            isPdf={doc.mimeType === "application/pdf"}
                            onDownload={() => handleDownload(doc)}
                            onToggleFav={() => patch(doc.id, { favorite: !doc.favorite })}
                            onDelete={() => { if (confirm(`¿Eliminar "${doc.name}"?`)) bulk("delete", [doc.id]); }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {preview && (() => {
        const idx = displayDocs.findIndex((d) => d.id === preview.id);
        return (
          <DocumentPreviewModal
            docId={preview.id}
            allDocs={documents}
            folders={folders}
            onClose={() => setPreview(null)}
            onRefresh={refresh}
            // Saltar a un "parecido" sin cerrar: es el gesto natural cuando
            // buscabas la factura y lo que querías era su comprobante de pago.
            onAbrirOtro={(d) => setPreview(d)}
            onPrev={idx > 0 ? () => setPreview(displayDocs[idx - 1]) : undefined}
            onNext={idx >= 0 && idx < displayDocs.length - 1 ? () => setPreview(displayDocs[idx + 1]) : undefined}
            // Vecinos: el visor los precarga para que pasar con las flechas no
            // arranque de cero cada vez.
            vecinos={[displayDocs[idx - 1], displayDocs[idx + 1]].filter(Boolean)}
            position={idx >= 0 ? { current: idx + 1, total: displayDocs.length } : undefined}
            // Carpetas: crear, renombrar y mover el documento sin salir del
            // visor. Todo pasa por el mismo hook que usa el drive, así la
            // barra de la izquierda se entera del cambio al instante.
            // Las mismas acciones en lote de la barra del drive, para los
            // archivos elegidos en la columna del medio del visor.
            lote={{
              onWhatsApp: (docs) => setWhatsappDoc(docs),
              onDescargarZip: async (docs) => {
                await zipAndDownload(docs, `documentos-${docs.length}.zip`);
              },
              onFavorito: async (ids) => { await bulk("favorite", ids, { favorite: true }); },
              onEliminar: async (ids) => {
                // Si el que estabas mirando se va con la tanda, el visor pasa
                // al SIGUIENTE que quede en pie en vez de cerrarse: cerrarlo te
                // sacaba de la carpeta y había que volver a entrar para seguir
                // borrando. El sucesor se resuelve ANTES de borrar, mientras la
                // lista todavía los tiene a todos.
                const sucesor = sucesorTrasBorrar(displayDocs, preview.id, ids);
                await bulk("delete", ids);
                if (sucesor !== undefined) setPreview(sucesor);
              },
            }}
            carpetas={{
              onMover: async (folderId) => { await patch(preview.id, { folderId }); },
              // Arrastrar CUALQUIER archivo de la columna del medio a una
              // carpeta del árbol, no sólo el que está abierto.
              onMoverDoc: async (docId, folderId) => { await patch(docId, { folderId }); },
              onCrear: async (nombre, parentId) => { await createFolder({ name: nombre, parentId }); },
              onRenombrar: async (id, nombre) => { await updateFolder(id, { name: nombre }); },
              onBorrar: async (id, opciones) => { await deleteFolder(id, opciones); },
            }}
            // Las mismas herramientas del menú de la lista, para no tener que
            // cerrar el documento y buscarlo de nuevo para sellarlo o rotarlo.
            herramientas={{
              onAnalyze: () => handleAnalyze(preview),
              onStamp: () => setStampTarget(preview),
              onRotate: () => handleRotate(preview),
              onSplit: () => handleSplit(preview),
              onEditPages: () => setPageEditorDoc(preview),
              onMove: () => setMovingDoc(preview),
              onSign: () => setSignDoc(preview),
              onSetStatus: (s: string) => patch(preview.id, { status: s }),
              onToggleFav: () => patch(preview.id, { favorite: !preview.favorite }),
              onPrint: () => window.open(`/api/admin/documents/${preview.id}/raw`, "_blank", "noopener"),
              onRename: () => {
                const nuevo = prompt("Nuevo nombre del archivo:", preview.name);
                if (nuevo && nuevo.trim() && nuevo.trim() !== preview.name) {
                  patch(preview.id, { name: nuevo.trim() });
                }
              },
              onTag: () => setTagDocId(preview.id),
              onDelete: () => {
                if (!confirm(`¿Eliminar "${preview.name}"?\n\nVa a la papelera: se puede restaurar.`)) return;
                // Igual que al borrar varios: se pasa al siguiente en vez de
                // cerrar. Cerrar te sacaba de la carpeta y había que volver a
                // entrar para seguir limpiando.
                const sucesor = sucesorTrasBorrar(displayDocs, preview.id, [preview.id]);
                bulk("delete", [preview.id]).then(() => {
                  if (sucesor !== undefined) setPreview(sucesor);
                });
              },
            }}
          />
        );
      })()}

      {/* Panel de progreso por archivo (subida en curso) */}
      {estadoSubida && estadoSubida.size > 0 && (
        <div className="fixed bottom-24 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 shadow-xl">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            Subiendo {[...estadoSubida.values()].filter((v) => v.estado === "listo").length}/{estadoSubida.size}
            {[...estadoSubida.values()].some((v) => v.estado === "error") && (
              <span className="ml-2 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                · {[...estadoSubida.values()].filter((v) => v.estado === "error").length} sin subir
              </span>
            )}
          </p>
          <ul className="max-h-48 space-y-1.5 overflow-y-auto">
            {[...estadoSubida].map(([nombre, { estado, motivo }]) => (
              <li key={nombre} className="flex flex-wrap items-center gap-x-2 text-sm">
                {estado === "listo" ? (
                  <Check className="h-4 w-4 shrink-0 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" />
                ) : estado === "error" ? (
                  <X className="h-4 w-4 shrink-0 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" />
                ) : estado === "en-cola" ? (
                  <Clock className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                ) : (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--accent)]" />
                )}
                <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">{nombre}</span>
                <span className={`shrink-0 text-[length:var(--ts-2xs,11px)] font-bold ${estado === "error" ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--text-tertiary)]"}`}>
                  {estado === "comprimiendo" ? "comprimiendo" : estado === "subiendo" ? "subiendo" : estado === "listo" ? "listo" : estado === "error" ? "falló" : "en cola"}
                </span>
                {motivo && (
                  // El motivo es lo unico accionable: "pesa 62 MB" se arregla, "fallo" no.
                  <span className="w-full pl-6 text-[length:var(--ts-2xs,11px)] text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                    {motivo}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showTemplates && (
        <TemplateGenerator
          onClose={() => setShowTemplates(false)}
          // Antes cerraba el modal apenas terminaba: el documento se generaba
          // PARA mandarlo, así que ahora queda abierto en el paso de envío y
          // sólo se refresca la lista de atrás.
          onGenerated={() => { refresh(); }}
        />
      )}

      {movingDoc && (
        <MoveToFolderModal
          doc={movingDoc}
          folders={folders}
          onMove={async (folderId) => { await bulk("move", [movingDoc.id], { folderId }); }}
          onClose={() => setMovingDoc(null)}
        />
      )}

      {importandoCarpeta && (
        <ImportarCarpetaModal
          // Sólo cuando estás PARADO en una carpeta cuelga de ahí; en cualquier
          // otra vista (recientes, favoritos, papelera) el destino es la raíz.
          destino={destinoImport}
          destinoNombre={destinoImport ? folderById.get(destinoImport)?.name : undefined}
          // Reimportar la misma carpeta fusiona con la que ya está, no duplica.
          existentes={folders}
          crearArbol={createFolderTree}
          yaSubidos={existingNames}
          soltado={soltado}
          subir={upload}
          onClose={() => { setImportandoCarpeta(false); setSoltado(null); }}
        />
      )}

      {whatsappDoc && (
        <SendWhatsAppModal docs={whatsappDoc} onClose={() => setWhatsappDoc(null)} />
      )}

      {signDoc && (
        <SendWhatsAppModal docs={[signDoc]} mode="sign" onClose={() => setSignDoc(null)} />
      )}

      {stampTarget && (
        <StampModal doc={stampTarget} onClose={() => setStampTarget(null)} onDone={refresh} />
      )}

      {showCameraScan && (
        <CameraScanModal
          folderId={filterMode === "folder" ? activeFolderId : null}
          onClose={() => setShowCameraScan(false)}
          onDone={refresh}
        />
      )}

      {pageEditorDoc && (
        <PageEditorModal doc={pageEditorDoc} onClose={() => setPageEditorDoc(null)} onDone={refresh} />
      )}

      {smartModal && (
        <SmartFolderModal
          initial={smartModal === "new" ? undefined : smartModal}
          onSave={(sf) => {
            const exists = smartFolders.some((x) => x.id === sf.id);
            persistSmart(exists ? smartFolders.map((x) => (x.id === sf.id ? sf : x)) : [...smartFolders, sf]);
            setFilterMode("smart");
            setActiveSmartId(sf.id);
          }}
          onClose={() => setSmartModal(null)}
        />
      )}

      {editingFolder && (
        <FolderEditModal
          folder={editingFolder}
          onSave={(patch) => updateFolder(editingFolder.id, patch)}
          onClose={() => setEditingFolder(null)}
        />
      )}

      {sharingFolder && (
        <FolderShareModal folder={sharingFolder} onClose={() => setSharingFolder(null)} />
      )}

      {borrandoCarpeta && (
        <ConfirmarBorrarCarpetas
          nombres={[borrandoCarpeta.name]}
          subcarpetas={descendantIds(childrenMap, borrandoCarpeta.id).size}
          documentosDirectos={borrandoCarpeta.documentCount ?? 0}
          documentosEnSubcarpetas={[...descendantIds(childrenMap, borrandoCarpeta.id)]
            .reduce((n, id) => n + (folderById.get(id)?.documentCount ?? 0), 0)}
          onCancelar={() => setBorrandoCarpeta(null)}
          onConfirmar={(opciones) => confirmarBorrarCarpeta(borrandoCarpeta, opciones)}
        />
      )}

      {showTags && (
        <TagTaxonomyModal onChanged={() => { refresh(); reloadAllTags(); }} onClose={() => setShowTags(false)} />
      )}

      {bulkTagModalOpen && (
        <BulkTagModal
          count={selectedIds.size}
          todasLasTags={allTags}
          onApply={bulkTag}
          onClose={() => setBulkTagModalOpen(false)}
        />
      )}

      {tagDocId && (() => {
        const doc = documents.find((d) => d.id === tagDocId);
        if (!doc) return null;
        return (
          <TagEditModal
            nombre={doc.name}
            tags={doc.tags ?? []}
            todasLasTags={allTags}
            onAdd={async (tag) => {
              await patch(doc.id, { tags: [...(doc.tags ?? []), tag] });
              reloadAllTags();
            }}
            onRemove={async (tag) => {
              await patch(doc.id, { tags: (doc.tags ?? []).filter((t) => t !== tag) });
              reloadAllTags();
            }}
            onClose={() => setTagDocId(null)}
          />
        );
      })()}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────

/**
 * Barra de agarre entre el sidebar y el listado (achicar/alargar). Se mueve
 * con pointermove/pointerup en `window` (no en el propio div) para que el
 * drag no se corte si el mouse sale del hilo de 12px mientras arrastra.
 * Persiste sólo en `onCommit` (pointerup) — escribir en cada pixel arrastrado
 * sería cientos de writes a localStorage por un solo drag.
 */
function SidebarResizeHandle({
  width, onChange, onCommit, min, max,
}: {
  width: number;
  onChange: (w: number) => void;
  onCommit: (w: number) => void;
  min: number;
  max: number;
}) {
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(width);
  const lastW = useRef(width);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const next = Math.min(max, Math.max(min, startW.current + (e.clientX - startX.current)));
      lastW.current = next;
      onChange(next);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      onCommit(lastW.current);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [onChange, onCommit, min, max]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionar barra lateral"
      title="Arrastrá para achicar o alargar · doble click para restaurar"
      onPointerDown={(e) => {
        dragging.current = true;
        startX.current = e.clientX;
        startW.current = width;
        lastW.current = width;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
      onDoubleClick={() => { onChange(SIDEBAR_DEFAULT_W); onCommit(SIDEBAR_DEFAULT_W); }}
      className="group hidden lg:flex cursor-col-resize items-center justify-center"
    >
      <div className="h-10 w-1 rounded-full bg-[var(--rule-base)] group-hover:bg-primary transition-colors" />
    </div>
  );
}

function StatBlock({ label, value, icon: Icon, tint }: { label: string; value: string; icon: typeof FileIcon; tint: string }) {
  return (
    <div className="bg-white border border-[var(--rule-base)] rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p>
          <p className={cn("text-2xl font-extrabold tabular-nums mt-0.5 truncate", tint)}>{value}</p>
        </div>
        <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", tint)} />
      </div>
    </div>
  );
}

/** ADR-119 — anillo de almacenamiento usado vs cuota orientativa del plan. */
function StorageRing({ usedBytes, quotaBytes }: { usedBytes: number; quotaBytes: number }) {
  const pct = Math.min(100, Math.round((usedBytes / quotaBytes) * 100));
  const r = 18;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 90 ? "var(--color-danger, #ef4444)" : pct >= 70 ? "var(--color-warning, #ff6b5b)" : "var(--color-primary)";
  return (
    <div className="bg-white border border-[var(--rule-base)] rounded-2xl p-4 flex items-center gap-3">
      <div className="relative h-12 w-12 shrink-0">
        <svg viewBox="0 0 44 44" className="h-12 w-12 -rotate-90">
          <circle cx="22" cy="22" r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth="4" />
          <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${dash} ${circ}`} />
        </svg>
        <HardDrive className="absolute inset-0 m-auto h-4 w-4" style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Espacio usado</p>
        <p className="text-xl font-extrabold tabular-nums leading-tight whitespace-nowrap" style={{ color }}>{formatBytes(usedBytes)}</p>
        <p className="text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)] tabular-nums">{pct}% de {formatBytes(quotaBytes)}</p>
      </div>
    </div>
  );
}

/** ADR-119 — badge de vencimiento con semáforo (rojo/ámbar/verde). */
/**
 * Chip de UBICACIÓN del documento en las vistas generales: con carpeta muestra
 * el nombre (clic = abrirla); sin carpeta, un chip punteado que lo delata —
 * lo suelto se ve de un vistazo y se arrastra a su lugar.
 */
function FolderChip({ nombre, onClick }: { nombre: string | null; onClick?: () => void }) {
  if (nombre === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--rule-strong)] px-1.5 py-0.5 text-[length:var(--ts-2xs,11px)] font-bold text-[var(--text-tertiary)]" title="Este documento no está en ninguna carpeta">
        <Folder className="h-3 w-3 shrink-0" /> Sin carpeta
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      title={`Abrir la carpeta "${nombre}"`}
      className="inline-flex max-w-[140px] items-center gap-1 rounded-md bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[length:var(--ts-2xs,11px)] font-bold text-[var(--text-secondary)] transition hover:text-primary"
    >
      <Folder className="h-3 w-3 shrink-0" /> <span className="truncate">{nombre}</span>
    </button>
  );
}

function ExpiryBadge({ expiresAt, className }: { expiresAt: string | null; className?: string }) {
  const n = daysUntil(expiresAt);
  if (n === null) return null;
  const err = "bg-[var(--data-error-50)] text-[var(--data-error-700)] border-[var(--data-error-500)]/40 dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]";
  const warn = "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] border-[var(--data-warning-500)]/40 dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]";
  const ok = "bg-[var(--data-success-50)] text-[var(--data-success-700)] border-[var(--data-success-500)]/40 dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]";
  const { label, cls } =
    n < 0
      ? { label: "Vencido", cls: err }
      : n === 0
      ? { label: "Vence hoy", cls: err }
      : n <= 7
      ? { label: `Vence en ${n}d`, cls: err }
      : n <= 30
      ? { label: `Vence en ${n}d`, cls: warn }
      : { label: new Date(expiresAt!).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit" }), cls: ok };
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[length:var(--ts-2xs,11px)] font-bold", cls, className)}>
      <AlarmClock className="h-3 w-3" /> {label}
    </span>
  );
}

// ── Estados / workflow del documento ──
/**
 * Cómo se pinta cada tono de estado. La lista de estados y sus etiquetas viven
 * en `lib/documents/estados-doc` (la comparten los endpoints); acá sólo el
 * vestuario: el punto del chip, el texto, el fondo y —lo que hace que se vean
 * de lejos— el borde y la franja de la tarjeta.
 */
const TONO_CLASES: Record<TonoEstado, { dot: string; text: string; bg: string; borde: string; franja: string }> = {
  neutro: {
    dot: "bg-[var(--text-tertiary)]", text: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-sunken)]",
    borde: "border-[var(--rule-strong)]", franja: "bg-[var(--text-tertiary)]",
  },
  aviso: {
    dot: "bg-[var(--data-warning-500)]", text: "text-[var(--data-warning)]", bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/15",
    borde: "border-[var(--data-warning-500)]", franja: "bg-[var(--data-warning-500)]",
  },
  alerta: {
    dot: "bg-[var(--data-error-500)]", text: "text-[var(--data-error)]", bg: "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15",
    borde: "border-[var(--data-error-500)]", franja: "bg-[var(--data-error-500)]",
  },
  ok: {
    dot: "bg-[var(--data-success-500)]", text: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]", bg: "bg-[var(--data-success-50)] dark:bg-[var(--data-success-500)]/15",
    borde: "border-[var(--data-success-500)]", franja: "bg-[var(--data-success-500)]",
  },
  info: {
    dot: "bg-[var(--data-info-500)]", text: "text-[var(--data-info-700)] dark:text-[var(--data-info-500)]", bg: "bg-[var(--data-info-100)] dark:bg-[var(--data-info-500)]/15",
    borde: "border-[var(--data-info-500)]", franja: "bg-[var(--data-info-500)]",
  },
};

/** Clases + etiqueta de un estado, en un solo lugar. */
function pinta(estado: string) {
  const e = estadoDeDoc(estado);
  return { ...TONO_CLASES[META_ESTADO[e].tono], label: META_ESTADO[e].label, ayuda: META_ESTADO[e].ayuda, estado: e };
}

const STATUS_META: Record<string, { label: string; dot: string; text: string; bg: string }> = Object.fromEntries(
  ORDEN_ESTADOS.map((e) => [e, pinta(e)]),
);
const STATUS_ORDER: string[] = ORDEN_ESTADOS;

// Chip de estado que además abre un dropdown (fixed) para cambiarlo. "none" = sin estado.
function StatusControl({ status, onChange }: { status: string; onChange: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left });
    setOpen(true);
  };
  const meta = STATUS_META[status];
  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title="Estado del documento"
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[length:var(--ts-2xs,11px)] font-bold transition-colors",
          meta ? cn(meta.bg, meta.text) : "border border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)] hover:border-primary hover:text-primary"
        )}
      >
        {meta ? (
          <><span className={cn("h-2 w-2 rounded-full", meta.dot)} /> {meta.label}</>
        ) : (
          <><Plus className="h-2.5 w-2.5" /> estado</>
        )}
      </button>
      {open && pos && (
        <div className="fixed z-50 min-w-[160px] overflow-hidden rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] py-1 shadow-xl" style={{ top: pos.top, left: pos.left }} onClick={(e) => e.stopPropagation()}>
          {STATUS_ORDER.map((k) => {
            const m = STATUS_META[k];
            return (
              <button
                key={k}
                onClick={(e) => { e.stopPropagation(); setOpen(false); onChange(k); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
              >
                <span className={cn("h-2.5 w-2.5 rounded-full", m.dot)} /> {m.label}
                {status === k && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
              </button>
            );
          })}
          {status !== "none" && (
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onChange("none"); }}
              className="flex w-full items-center gap-2 border-t border-[var(--rule-base)] px-3 py-1.5 text-sm font-medium text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)]"
            >
              Sin estado
            </button>
          )}
        </div>
      )}
    </>
  );
}

function DocCard({
  doc, selected, isRenaming, renameValue, terminos, folderNombre, onOpenFolder,
  onSelect, onPreview, onToggleFav, onRemove, onWhatsApp, onSetStatus,
  onStartRename, onCommitRename, onCancelRename, onRenameChange, onDownload,
  onDragStart, onDragEnd, dragging, onTagClick, tagsActivos, onPromoteAiTag,
}: {
  doc: DbDocument;
  selected: boolean;
  isRenaming: boolean;
  renameValue: string;
  /** Términos buscados: deciden si se muestra la descripción o el fragmento. */
  terminos: string[];
  /** Nombre de la carpeta, null = sin carpeta, undefined = no mostrar el chip. */
  folderNombre?: string | null;
  onOpenFolder?: () => void;
  onSelect: () => void;
  onPreview: () => void;
  onToggleFav: () => void;
  onRemove: () => void;
  onWhatsApp: () => void;
  onSetStatus: (s: string) => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onRenameChange: (v: string) => void;
  onDownload: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  dragging: boolean;
  /** Clic en un #tag: lo suma/saca del filtro por etiqueta sin abrir el panel. */
  onTagClick: (tag: string) => void;
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
      // Pasar el mouse ya trae el visor: cuando hace clic, el chunk pesado
      // (exceljs / jszip) suele estar listo y la vista previa abre de una.
      onMouseEnter={() => precargarVisor(familiaDe(doc.name, doc.mimeType))}
      // El navegador se saltea el cálculo y el dibujo de las tarjetas que no
      // están en pantalla. En una carpeta con 292 documentos eso es casi todo:
      // antes se maquetaban las 292 aunque se vieran diez. El alto declarado
      // evita que la barra de scroll salte al entrar y salir cada tarjeta.
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 320px" }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border-2 bg-white transition-all cursor-grab active:cursor-grabbing",
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
      <button onClick={onPreview} className="block w-full aspect-square bg-[var(--surface-sunken)] overflow-hidden" aria-label={`Ver ${doc.name}`}>
        <DocThumb doc={doc} Icon={Icon} tint={tint} bg={bg} />
      </button>

      {/* Hover actions */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFav(); }}
          className={cn(
            "h-7 w-7 rounded-full flex items-center justify-center backdrop-blur-sm",
            doc.favorite ? "bg-amber-400 text-white" : "bg-white/85 text-[var(--text-tertiary)] hover:text-amber-500"
          )}
          aria-label={doc.favorite ? "Quitar favorito" : "Marcar favorito"}
        >
          <Star className={cn("h-3.5 w-3.5", doc.favorite && "fill-current")} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onWhatsApp(); }} className="h-7 w-7 rounded-full flex items-center justify-center bg-white/85 backdrop-blur-sm text-[var(--text-tertiary)] hover:text-[var(--data-success-700)]" aria-label="Enviar por WhatsApp">
          <MessageCircle className="h-3.5 w-3.5" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDownload(); }} className="h-7 w-7 rounded-full flex items-center justify-center bg-white/85 backdrop-blur-sm text-[var(--text-tertiary)] hover:text-primary" aria-label="Descargar">
          <Download className="h-3.5 w-3.5" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="h-7 w-7 rounded-full flex items-center justify-center bg-white/85 backdrop-blur-sm text-[var(--text-tertiary)] hover:text-[var(--data-error)]" aria-label="Eliminar">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Info */}
      <div className="p-3">
        {isRenaming ? (
          <input
            type="text"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onCommitRename(); if (e.key === "Escape") onCancelRename(); }}
            onBlur={onCommitRename}
            autoFocus
            className="w-full px-2 py-1 rounded-md border-2 border-primary text-sm font-bold outline-none"
          />
        ) : (
          <button
            onClick={onPreview}
            onDoubleClick={(e) => { e.preventDefault(); onStartRename(); }}
            className="text-left w-full"
            title="Doble-click para renombrar"
          >
            <p className="text-sm font-bold text-[var(--text-primary)] truncate hover:text-primary transition-colors">{doc.name}</p>
          </button>
        )}
        <div className="flex items-center justify-between mt-1 text-[length:var(--ts-2xs,11px)]">
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
          {folderNombre !== undefined && <FolderChip nombre={folderNombre} onClick={onOpenFolder} />}
          <StatusControl status={doc.status} onChange={onSetStatus} />
          <ExpiryBadge expiresAt={doc.expiresAt} />
          <StructuredChip doc={doc} />
        </div>
        {(doc.tags.length > 0 || doc.aiTags.length > 0) && (
          <div className="flex flex-wrap gap-1 mt-2">
            {doc.tags.slice(0, 2).map((t) => (
              <button
                key={t}
                onClick={(e) => { e.stopPropagation(); onTagClick(t); }}
                title={tagsActivos.includes(t) ? `Quitar "#${t}" del filtro` : `Filtrar por "#${t}"`}
                className={cn(
                  "text-[length:var(--ts-2xs,11px)] px-1.5 py-0.5 rounded font-bold transition-colors",
                  tagsActivos.includes(t)
                    ? "bg-primary text-white"
                    : "bg-primary/10 text-[var(--accent-ink)] hover:bg-primary/20 dark:text-[var(--accent)]",
                )}
              >
                #{t}
              </button>
            ))}
            {/* Ya aceptada = ahora es un tag real (arriba); no mostrarla dos veces. */}
            {doc.aiTags.filter((t) => !doc.tags.includes(t)).slice(0, 1).map((t) => (
              <button
                key={`ai-${t}`}
                onClick={(e) => { e.stopPropagation(); onPromoteAiTag(t); }}
                title={`Sugerencia de la IA — clic para aceptarla como etiqueta`}
                className="text-[length:var(--ts-2xs,11px)] px-1.5 py-0.5 rounded bg-violet-100 text-[var(--accent)] font-bold inline-flex items-center gap-0.5 hover:bg-violet-200"
              >
                <Sparkles className="h-2.5 w-2.5" />{t}
              </button>
            ))}
            {doc.tags.length + doc.aiTags.length > 3 && (
              <span className="text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)] tabular-nums font-bold">+{doc.tags.length + doc.aiTags.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="bg-white border-2 border-dashed border-[var(--rule-base)] rounded-2xl p-10 text-center">
      <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] mb-4">
        <Upload className="h-7 w-7" />
      </div>
      <p className="text-lg font-extrabold text-[var(--text-primary)]">Subí tu primer documento</p>
      <p className="text-sm text-[var(--text-secondary)] mt-1.5 max-w-md mx-auto">
        Arrastrá y soltá archivos en cualquier parte de la pantalla, o usá el botón. Aceptamos PDF, imágenes, planillas, Word, ZIP y más (hasta 50 MB c/u).
      </p>
      <button onClick={onUpload} className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors">
        <Upload className="h-4 w-4" /> Subir archivos
      </button>
    </div>
  );
}

// ── Menú de acciones por fila (kebab) — reemplaza los 5 íconos amontonados en
// la vista lista. Dropdown `position: fixed` para no quedar recortado por el
// overflow del contenedor de la tabla. ──
function RowActions({ onPreview, onAnalyze, onDownload, onRename, onMove, onTag, onWhatsApp, onSign, onStamp, onRotate, onSplit, onEditPages, isPdf, onToggleFav, onDelete, favorite }: {
  onPreview: () => void; onAnalyze: () => void; onDownload: () => void; onRename: () => void; onMove: () => void; onTag: () => void; onWhatsApp: () => void; onSign: () => void; onStamp: () => void; onRotate: () => void; onSplit: () => void; onEditPages: () => void; isPdf: boolean; onToggleFav: () => void; onDelete: () => void; favorite: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number; maxHeight: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeAll = () => setOpen(false);
    // Scrollear DENTRO del menú (para ver las opciones que no entran) no debe
    // cerrarlo — el listener de "scroll" en window recibe TAMBIÉN el scroll de
    // este contenedor interno (fase de captura), así que hay que distinguir
    // por `e.target`. Un scroll de la página de atrás (o cualquier otro
    // contenedor) sí cierra, como antes.
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("click", closeAll);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", closeAll);
    return () => {
      window.removeEventListener("click", closeAll);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", closeAll);
    };
  }, [open]);
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const GAP = 4;
      const MARGIN = 12;
      const right = window.innerWidth - r.right;
      const spaceBelow = window.innerHeight - r.bottom - GAP - MARGIN;
      const spaceAbove = r.top - GAP - MARGIN;
      // El menú puede tener hasta 13 ítems: una fila cerca del final de la
      // tabla no siempre tiene sitio abajo. Con scroll interno alcanza casi
      // siempre, pero si abajo queda MUY poco (y arriba hay más), mejor
      // abrirlo hacia arriba que dejarlo apretado contra el borde inferior.
      if (spaceBelow < 160 && spaceAbove > spaceBelow) {
        setPos({ bottom: window.innerHeight - r.top + GAP, right, maxHeight: Math.max(120, spaceAbove) });
      } else {
        setPos({ top: r.bottom + GAP, right, maxHeight: Math.max(120, spaceBelow) });
      }
    }
    setOpen(true);
  };
  const item = (Icon: typeof Eye, label: string, onClick: () => void, danger?: boolean) => (
    <button
      onClick={(e) => { e.stopPropagation(); setOpen(false); onClick(); }}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-sm font-medium transition-colors hover:bg-[var(--surface-sunken)]",
        danger ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--text-secondary)]"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" /> {label}
    </button>
  );
  return (
    <>
      <button ref={btnRef} onClick={toggle} className="p-1.5 rounded-md text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)]" title="Acciones" aria-label="Acciones del documento">
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && pos && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[170px] overflow-y-auto overscroll-contain rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] py-1 shadow-xl"
          style={{ top: pos.top, bottom: pos.bottom, right: pos.right, maxHeight: pos.maxHeight }}
          onClick={(e) => e.stopPropagation()}
        >
          {item(Eye, "Ver", onPreview)}
          {item(Wand2, "Analizar con IA", onAnalyze)}
          {item(Pencil, "Renombrar", onRename)}
          {item(FolderInput, "Mover a carpeta", onMove)}
          {item(Tag, "Etiquetar", onTag)}
          {item(MessageCircle, "Enviar por WhatsApp", onWhatsApp)}
          {item(PenLine, "Solicitar firma", onSign)}
          {isPdf && item(Stamp, "Poner sello", onStamp)}
          {isPdf && item(RotateCw, "Rotar 90°", onRotate)}
          {isPdf && item(FileStack, "Editar páginas", onEditPages)}
          {isPdf && item(Scissors, "Dividir en páginas", onSplit)}
          {item(Download, "Descargar", onDownload)}
          {item(Star, favorite ? "Quitar favorito" : "Marcar favorito", onToggleFav)}
          {item(Trash2, "Eliminar", onDelete, true)}
        </div>
      )}
    </>
  );
}

