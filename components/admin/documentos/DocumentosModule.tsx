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
import {
  Upload, Search, Grid3x3, List, FolderArchive, FileText, Image as ImageIcon,
  Film, Music, FileSpreadsheet, File as FileIcon, Download, Trash2, Eye,
  Plus, Folder, Star, Clock, HardDrive, X, Sparkles, Check,
  Camera, AlarmClock, Wand2, Tag, RotateCcw, MoreVertical, FileArchive, Loader2,
  ChevronRight, Pencil, FolderInput, MessageCircle, Palette, History, BellRing, PenLine, Share2,
  CalendarDays, Stamp, Combine, LayoutDashboard, RotateCw, Scissors, Scan, FileStack,
} from "lucide-react";
import { cn } from "@/lib/utils";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { ModuleActionMenu } from "@/components/admin/shared/ModuleActionMenu";
import { useDocuments, getSignedDownloadUrl, analyzeDoc, mergeDocs, rotateDoc, splitDoc } from "@/hooks/use-documents";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import { buildChildrenMap, flattenVisible, flattenAll, folderPath, descendantIds } from "@/lib/documentos/folder-tree";
import { isAnalyzableMime } from "@/lib/documents/analyzable-mime";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { TemplateGenerator } from "./TemplateGenerator";
import { SendWhatsAppModal } from "./SendWhatsAppModal";
import { MoveToFolderModal } from "./MoveToFolderModal";
import { FolderEditModal } from "./FolderEditModal";
import { FolderShareModal } from "./FolderShareModal";
import { FolderGlyph } from "./folder-visuals";
import { ActivityView } from "./ActivityView";
import { CalendarView } from "./CalendarView";
import { StampModal } from "./StampModal";
import { DashboardView } from "./DashboardView";
import { SmartFolderModal } from "./SmartFolderModal";
import { CameraScanModal } from "./CameraScanModal";
import { PageEditorModal } from "./PageEditorModal";
import { loadSmartFolders, saveSmartFolders, matchesSmartFolder, describeRules, type SmartFolder } from "@/lib/documentos/smart-folders";
import { AssistantView } from "./AssistantView";
import { TagTaxonomyModal } from "./TagTaxonomyModal";

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Estado de cada archivo mientras se sube (panel de progreso). */
type EstadoArchivo = "en-cola" | "comprimiendo" | "subiendo" | "listo" | "error";

/** Clave por tenant de las sugerencias IA que el usuario descartó. */
function sugDescartadasKey(): string {
  let slug = "main";
  try { slug = localStorage.getItem("active-tenant-slug") ?? "main"; } catch { /* ignore */ }
  return `doc-sug-descartadas-${slug}`;
}

const fmtFechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

function getFileIcon(type: string): { Icon: typeof FileIcon; tint: string; bg: string } {
  // Tints por tipo de archivo (paleta categórica); con variante dark para que
  // el fondo no quede claro sobre el tema oscuro.
  if (type.startsWith("image/")) return { Icon: ImageIcon, tint: "text-[var(--accent)]", bg: "bg-pink-50 dark:bg-pink-500/15" };
  if (type.startsWith("video/")) return { Icon: Film, tint: "text-[var(--accent)]", bg: "bg-violet-50 dark:bg-violet-500/15" };
  if (type.startsWith("audio/")) return { Icon: Music, tint: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-500/15" };
  if (type === "application/pdf") return { Icon: FileText, tint: "text-red-500", bg: "bg-red-50 dark:bg-red-500/15" };
  if (type.includes("spreadsheet") || type.includes("excel") || type.includes("csv")) return { Icon: FileSpreadsheet, tint: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-500/15" };
  if (type.includes("word") || type.includes("document")) return { Icon: FileText, tint: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-500/15" };
  return { Icon: FileIcon, tint: "text-[var(--text-tertiary)]", bg: "bg-[var(--surface-sunken)]" };
}

/**
 * Miniatura de la card de la grilla: imagen real para archivos de imagen y
 * render de la 1ª página para PDFs (endpoint `/thumbnail`). Si el render falla
 * (PDF corrupto, storage caído), cae al ícono del tipo. Estado por-card para no
 * reintentar en loop.
 */
function DocThumb({ doc, Icon, tint, bg }: { doc: DbDocument; Icon: typeof FileIcon; tint: string; bg: string }) {
  const isImage = doc.mimeType.startsWith("image/");
  const isPdf = doc.mimeType === "application/pdf";
  const [failed, setFailed] = useState(false);

  if ((isImage || isPdf) && !failed) {
    const src = isImage
      ? `/api/admin/documents/${doc.id}/raw`
      : `/api/admin/documents/${doc.id}/thumbnail`;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={doc.name}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn("w-full h-full object-cover", isPdf && "object-top bg-white")}
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
 * Fragmento del contenido (ocrText) alrededor de la 1ª coincidencia del término
 * de búsqueda, con el match resaltado. Muestra DÓNDE matcheó dentro del doc —
 * la búsqueda ya matchea por ocrText en el backend, esto lo hace visible.
 */
function MatchSnippet({ text, term }: { text: string | null; term: string }) {
  if (!text || !term || term.trim().length < 2) return null;
  const t = term.trim();
  const idx = text.toLowerCase().indexOf(t.toLowerCase());
  if (idx === -1) return null;
  const start = Math.max(0, idx - 28);
  const end = Math.min(text.length, idx + t.length + 44);
  const before = (start > 0 ? "…" : "") + text.slice(start, idx);
  const match = text.slice(idx, idx + t.length);
  const after = text.slice(idx + t.length, end) + (end < text.length ? "…" : "");
  return (
    <p className="mt-1.5 line-clamp-2 text-[length:var(--ts-2xs,11px)] leading-snug text-[var(--text-tertiary)]">
      {before}
      <mark className="rounded bg-[var(--data-warning-500)]/25 px-0.5 text-[var(--text-primary)] dark:bg-[var(--data-warning-500)]/35 dark:text-[var(--text-primary)]">{match}</mark>
      {after}
    </p>
  );
}

interface BuiltinCategory {
  id: "all" | "dashboard" | "assistant" | "favorites" | "recent" | "expiring" | "calendar" | "activity" | "trash";
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
  { id: "expiring", label: "Por vencer", icon: AlarmClock, color: "text-red-500" },
  { id: "calendar", label: "Calendario", icon: CalendarDays, color: "text-primary" },
  { id: "activity", label: "Actividad", icon: History, color: "text-[var(--accent)]" },
  { id: "trash", label: "Papelera", icon: Trash2, color: "text-[var(--text-tertiary)]" },
];

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

export default function DocumentosModule() {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState<"recent" | "name" | "size" | "expiry">("recent");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [semantic, setSemantic] = useState(false);
  const [filterMode, setFilterMode] = useState<"all" | "dashboard" | "assistant" | "favorites" | "recent" | "expiring" | "calendar" | "folder" | "activity" | "trash" | "smart">("all");
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<{ name: string; expiresAt: string | null } | null>(null);
  // Resultado del análisis IA de contenido (resumen + datos clave).
  const [analyzeResult, setAnalyzeResult] = useState<{ name: string; summary: string; keyFacts: string[] } | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<DbDocument | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  /** Estado por archivo de la subida en curso (panel abajo a la derecha). */
  const [estadoSubida, setEstadoSubida] = useState<Map<string, EstadoArchivo> | null>(null);
  /** Sugerencias IA descartadas por el usuario (persisten por tenant). */
  const [sugDescartadas, setSugDescartadas] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  // Subcarpetas: `undefined` = no creando, `null` = crear en raíz, string = crear dentro de esa carpeta.
  const [newFolderParent, setNewFolderParent] = useState<string | null | undefined>(undefined);
  const [newFolderName, setNewFolderName] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [bulkTagValue, setBulkTagValue] = useState("");
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
  const [whatsappDoc, setWhatsappDoc] = useState<DbDocument | null>(null);
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
    documents, folders, loading, error, refresh,
    upload, scan, patch, bulk, restore, purge, createFolder, moveFolder, updateFolder, deleteFolder,
  } = useDocuments(filters);

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
  }, [documents, filterMode, sortBy, statusFilter, activeSmartId, smartFolders]);

  const statusCounts = useMemo(() => {
    const m: Record<string, number> = { draft: 0, review: 0, approved: 0, archived: 0 };
    for (const d of documents) if (d.status && d.status in m) m[d.status] += 1;
    return m;
  }, [documents]);

  // Docs analizables (PDF/texto/Word/Excel — single-source en analyzable-mime)
  // que todavía no fueron indexados por la IA.
  const indexableDocs = useMemo(
    () =>
      documents.filter((d) => {
        const indexed = !!(d.ocrMetadata && (d.ocrMetadata as Record<string, unknown>).analyzedAt);
        return isAnalyzableMime(d.mimeType) && !indexed;
      }),
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
      for (const d of list) {
        await analyzeDoc(d.id).catch((err) => console.warn("[documentos] analyze fail", d.id, err));
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
  const visibleFolderRows = useMemo(() => flattenVisible(childrenMap, expandedFolders), [childrenMap, expandedFolders]);
  const allFolderRows = useMemo(() => flattenAll(childrenMap), [childrenMap]);
  const activePath = useMemo(
    () => (filterMode === "folder" && activeFolderId ? folderPath(folderById, activeFolderId) : []),
    [filterMode, activeFolderId, folderById]
  );
  const activeChildren = useMemo(
    () => (filterMode === "folder" && activeFolderId ? childrenMap.get(activeFolderId) ?? [] : []),
    [filterMode, activeFolderId, childrenMap]
  );
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
  const selectAll = () => setSelectedIds(new Set(displayDocs.map((d) => d.id)));

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
      setEstadoSubida(new Map(aSubir.map((f) => [f.name, "en-cola" as EstadoArchivo])));
      try {
        await upload(aSubir, {
          folderId: activeFolderId,
          onProgress: (done, total) => setUploadProgress({ done, total }),
          onEstado: (nombre, estado) =>
            setEstadoSubida((prev) => {
              const m = new Map(prev ?? []);
              m.set(nombre, estado);
              return m;
            }),
        });
      } finally {
        setUploadProgress(null);
        // Dejar ver los ✓ un instante antes de cerrar el panel.
        setTimeout(() => setEstadoSubida(null), 2500);
      }
    },
    [upload, activeFolderId, documents]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
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
  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`¿Eliminar ${selectedIds.size} documento(s)?`)) return;
    await bulk("delete", Array.from(selectedIds));
    clearSelection();
  };
  const bulkFavorite = async (fav: boolean) => {
    if (selectedIds.size === 0) return;
    await bulk("favorite", Array.from(selectedIds), { favorite: fav });
    clearSelection();
  };
  const bulkMove = async (folderId: string | null) => {
    if (selectedIds.size === 0) return;
    await bulk("move", Array.from(selectedIds), { folderId });
    clearSelection();
  };
  const bulkTag = async (tag: string) => {
    const t = tag.trim();
    if (selectedIds.size === 0 || !t) return;
    await bulk("tag", Array.from(selectedIds), { tag: t });
    setBulkTagValue("");
    clearSelection();
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
  const handleDeleteFolder = async (f: DbDocumentFolder) => {
    const descs = descendantIds(childrenMap, f.id);
    const msg =
      descs.size > 0
        ? `¿Eliminar la carpeta "${f.name}" y sus ${descs.size} subcarpeta(s)? Los documentos pasarán a la raíz.`
        : `¿Eliminar la carpeta "${f.name}"? Los documentos pasarán a la raíz.`;
    if (!confirm(msg)) return;
    await deleteFolder(f.id);
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
        {/* Cuatro botones en el header no entraban en pantallas medianas: se
            partían en dos filas y competían con el primario. Ahora queda UNA
            acción principal (Subir archivos) y el resto en el menú del DS. */}
        <ModuleActionMenu
          label="Escanear y crear"
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
        <div className="rounded-2xl border-2 border-[var(--accent)]/40 bg-primary/10/40 px-4 py-3">
          <p className="mb-2 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--accent)]">
            <Sparkles className="h-4 w-4" /> La IA sugiere organizar
          </p>
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
        <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-emerald-50 border-2 border-emerald-200 text-emerald-800">
          <Wand2 className="h-5 w-5 shrink-0 mt-0.5 text-emerald-600" />
          <div className="min-w-0 text-sm">
            <p className="font-extrabold">Escaneado: {scanResult.name}</p>
            {scanResult.expiresAt ? (
              <p className="mt-0.5">
                📅 Detecté vencimiento el{" "}
                <strong>{new Date(scanResult.expiresAt).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })}</strong>
                {" "}— te avisaré por WhatsApp antes.
              </p>
            ) : (
              <p className="mt-0.5 text-emerald-700">La IA lo nombró y clasificó. Si vence, agregá la fecha desde el documento.</p>
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

      {/* Hero stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
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

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5">
        {/* ─── Sidebar ─── */}
        <aside className="bg-white border border-[var(--rule-base)] rounded-2xl p-3 h-fit">
          <p className="text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] px-3 py-2">
            Vista
          </p>
          <ul className="space-y-1 mb-4">
            {BUILTIN_CATEGORIES.map((cat) => {
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
            })}
          </ul>

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
            <button
              onClick={() => openCreateChild(null)}
              className="h-6 w-6 inline-flex items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-primary transition-colors"
              aria-label="Nueva carpeta"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

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
                          "flex-1 min-w-0 flex items-center gap-2 py-2 pr-14 rounded-lg text-sm font-bold transition-colors",
                          active ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                        )}
                      >
                        <FolderGlyph folder={f} active={active} className="h-4 w-4 shrink-0" />
                        <span className="flex-1 text-left truncate">{f.name}</span>
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

        {/* ─── Main list ─── */}
        <div className="space-y-4">
          {/* Toolbar — solo en vistas tipo lista (no en resumen/asistente/actividad/calendario) */}
          {filterMode !== "dashboard" && filterMode !== "assistant" && filterMode !== "activity" && filterMode !== "calendar" && (
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
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="h-[42px] rounded-xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-secondary)] outline-none focus:border-primary"
              aria-label="Ordenar documentos"
              title="Ordenar documentos"
            >
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

          {/* Bulk bar */}
          {selectedIds.size > 0 && (
            <div className="sticky top-2 z-30 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-primary text-white shadow-lg">
              <span className="text-sm font-bold tabular-nums">{selectedIds.size} seleccionado(s)</span>
              <button onClick={selectAll} className="text-xs px-2.5 py-1 rounded-md bg-white/20 hover:bg-white/30 font-bold">
                Seleccionar todos ({displayDocs.length})
              </button>
              <button onClick={() => bulkFavorite(true)} className="text-xs px-2.5 py-1 rounded-md bg-white/20 hover:bg-white/30 font-bold inline-flex items-center gap-1">
                <Star className="h-3 w-3" /> Favorito
              </button>
              <select
                onChange={(e) => { const v = e.target.value; if (v) { bulkMove(v === "__none__" ? null : v); } e.currentTarget.selectedIndex = 0; }}
                defaultValue=""
                className="text-xs px-2 py-1 rounded-md bg-white/20 hover:bg-white/30 text-white font-bold outline-none cursor-pointer [&>option]:text-[var(--text-primary)]"
                title="Mover a carpeta"
                aria-label="Mover a carpeta"
              >
                <option value="" disabled>Mover a…</option>
                {allFolderRows.map(({ folder: f, depth }) => (
                  <option key={f.id} value={f.id}>{`${"   ".repeat(depth)}${depth > 0 ? "└ " : ""}${f.name}`}</option>
                ))}
                <option value="__none__">Sin carpeta</option>
              </select>
              <button onClick={bulkDownloadZip} disabled={zipping} className="text-xs px-2.5 py-1 rounded-md bg-white/20 hover:bg-white/30 font-bold inline-flex items-center gap-1 disabled:opacity-60">
                <FileArchive className="h-3 w-3" /> {zipping ? "Comprimiendo…" : "ZIP"}
              </button>
              {selectedIds.size >= 2 && (
                <button onClick={handleMerge} disabled={merging} className="text-xs px-2.5 py-1 rounded-md bg-white/20 hover:bg-white/30 font-bold inline-flex items-center gap-1 disabled:opacity-60" title="Combinar en un PDF">
                  <Combine className="h-3 w-3" /> {merging ? "Combinando…" : "Combinar PDF"}
                </button>
              )}
              <div className="inline-flex items-center gap-1 rounded-md bg-white/20 px-2">
                <Tag className="h-3 w-3 shrink-0" />
                <input
                  value={bulkTagValue}
                  onChange={(e) => setBulkTagValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") bulkTag(bulkTagValue); }}
                  placeholder="Etiquetar…"
                  aria-label="Agregar etiqueta a la selección"
                  className="w-24 bg-transparent py-1 text-xs font-bold text-white placeholder-white/60 outline-none"
                />
              </div>
              <button onClick={bulkDelete} className="text-xs px-2.5 py-1 rounded-md bg-red-500 hover:bg-red-600 font-bold inline-flex items-center gap-1">
                <Trash2 className="h-3 w-3" /> Eliminar
              </button>
              <button onClick={clearSelection} className="ml-auto text-xs px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 font-bold">Cancelar</button>
            </div>
          )}

          {/* Filtro por estado (workflow) */}
          {filterMode !== "activity" && filterMode !== "trash" && filterMode !== "assistant" && (statusFilter !== null || STATUS_ORDER.some((k) => statusCounts[k] > 0)) && (
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

          {filterMode === "assistant" ? (
            <AssistantView
              onOpenDoc={(id) => { const d = documents.find((x) => x.id === id); if (d) setPreview(d); }}
              onSign={(id) => { const d = documents.find((x) => x.id === id); if (d) setSignDoc(d); }}
              onShare={(id) => { const d = documents.find((x) => x.id === id); if (d) setWhatsappDoc(d); }}
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
          ) : loading && documents.length === 0 ? (
            <div className="bg-white border border-[var(--rule-base)] rounded-2xl p-10 text-center text-sm text-[var(--text-tertiary)]">
              Cargando…
            </div>
          ) : filterMode === "trash" ? (
            <PapeleraView docs={displayDocs} onRestore={restore} onPurge={purge} />
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
                  searchTerm={searchDebounced}
                  folderNombre={filterMode === "folder" ? undefined : (doc.folderId ? folderById.get(doc.folderId)?.name ?? null : null)}
                  onOpenFolder={() => { if (doc.folderId) { setFilterMode("folder"); setActiveFolderId(doc.folderId); } }}
                  onSelect={() => toggleSelect(doc.id)}
                  onPreview={() => setPreview(doc)}
                  onToggleFav={() => patch(doc.id, { favorite: !doc.favorite })}
                  onWhatsApp={() => setWhatsappDoc(doc)}
                  onSetStatus={(s) => patch(doc.id, { status: s })}
                  onRemove={async () => {
                    if (!confirm(`¿Eliminar "${doc.name}"?`)) return;
                    await patch(doc.id, {}); // no-op, but ensures patch path warm
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
              <table className="w-full text-sm">
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
                    <th className="text-left px-4 py-3 text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Nombre</th>
                    <th className="text-left px-4 py-3 text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] hidden sm:table-cell">Categoría</th>
                    <th className="text-right px-4 py-3 text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] hidden md:table-cell">Tamaño</th>
                    <th className="text-right px-4 py-3 text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] hidden md:table-cell">Subido</th>
                    <th className="text-center px-4 py-3 text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--rule-soft,#f1f5f9)]">
                  {displayDocs.map((doc) => {
                    const { Icon, tint, bg } = getFileIcon(doc.mimeType);
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
                                <span className="text-[length:var(--ts-2xs)] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold">v{doc.versionCount + 1}</span>
                              )}
                              <ExpiryBadge expiresAt={doc.expiresAt} />
                            </button>
                          )}
                        </td>
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
                        <td className="px-4 py-3 text-right hidden md:table-cell tabular-nums text-xs text-[var(--text-secondary)]">{formatBytes(doc.size)}</td>
                        <td className="px-4 py-3 text-right hidden md:table-cell tabular-nums text-xs text-[var(--text-tertiary)]">
                          {new Date(doc.uploadedAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <RowActions
                            favorite={!!doc.favorite}
                            onPreview={() => setPreview(doc)}
                            onAnalyze={() => handleAnalyze(doc)}
                            onRename={() => startRename(doc)}
                            onMove={() => setMovingDoc(doc)}
                            onWhatsApp={() => setWhatsappDoc(doc)}
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
              </table>
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
            onPrev={idx > 0 ? () => setPreview(displayDocs[idx - 1]) : undefined}
            onNext={idx >= 0 && idx < displayDocs.length - 1 ? () => setPreview(displayDocs[idx + 1]) : undefined}
            position={idx >= 0 ? { current: idx + 1, total: displayDocs.length } : undefined}
          />
        );
      })()}

      {/* Panel de progreso por archivo (subida en curso) */}
      {estadoSubida && estadoSubida.size > 0 && (
        <div className="fixed bottom-24 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 shadow-xl">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            Subiendo {[...estadoSubida.values()].filter((e) => e === "listo").length}/{estadoSubida.size}
          </p>
          <ul className="max-h-48 space-y-1.5 overflow-y-auto">
            {[...estadoSubida].map(([nombre, estado]) => (
              <li key={nombre} className="flex items-center gap-2 text-sm">
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
                <span className="shrink-0 text-[length:var(--ts-2xs,11px)] font-bold text-[var(--text-tertiary)]">
                  {estado === "comprimiendo" ? "comprimiendo" : estado === "subiendo" ? "subiendo" : estado === "listo" ? "listo" : estado === "error" ? "falló" : "en cola"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showTemplates && (
        <TemplateGenerator
          onClose={() => setShowTemplates(false)}
          onGenerated={() => {
            setShowTemplates(false);
            refresh();
          }}
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

      {whatsappDoc && (
        <SendWhatsAppModal doc={whatsappDoc} onClose={() => setWhatsappDoc(null)} />
      )}

      {signDoc && (
        <SendWhatsAppModal doc={signDoc} mode="sign" onClose={() => setSignDoc(null)} />
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

      {showTags && (
        <TagTaxonomyModal onChanged={refresh} onClose={() => setShowTags(false)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────

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
const STATUS_META: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  draft: { label: "Borrador", dot: "bg-[var(--text-tertiary)]", text: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-sunken)]" },
  review: { label: "En revisión", dot: "bg-[var(--data-warning-500)]", text: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/15" },
  approved: { label: "Aprobado", dot: "bg-[var(--data-success-500)]", text: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]", bg: "bg-[var(--data-success-50)] dark:bg-[var(--data-success-500)]/15" },
  archived: { label: "Archivado", dot: "bg-[var(--data-info-500)]", text: "text-[var(--data-info-700)] dark:text-[var(--data-info-500)]", bg: "bg-[var(--data-info-100)] dark:bg-[var(--data-info-500)]/15" },
};
const STATUS_ORDER = ["draft", "review", "approved", "archived"];

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
  doc, selected, isRenaming, renameValue, searchTerm, folderNombre, onOpenFolder,
  onSelect, onPreview, onToggleFav, onRemove, onWhatsApp, onSetStatus,
  onStartRename, onCommitRename, onCancelRename, onRenameChange, onDownload,
  onDragStart, onDragEnd, dragging,
}: {
  doc: DbDocument;
  selected: boolean;
  isRenaming: boolean;
  renameValue: string;
  searchTerm: string;
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
}) {
  const { Icon, tint, bg } = getFileIcon(doc.mimeType);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group relative overflow-hidden rounded-2xl border-2 bg-white transition-all cursor-grab active:cursor-grabbing",
        selected ? "border-primary shadow-md" : "border-[var(--rule-base)] hover:border-primary/40 hover:shadow-md",
        dragging && "opacity-40"
      )}>
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={(e) => { e.stopPropagation(); onSelect(); }}
        className={cn(
          "absolute top-2 left-2 z-10 h-5 w-5 rounded border-2 border-white/80 bg-white/85 accent-[var(--color-primary)] cursor-pointer",
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
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
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="h-7 w-7 rounded-full flex items-center justify-center bg-white/85 backdrop-blur-sm text-[var(--text-tertiary)] hover:text-red-500" aria-label="Eliminar">
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
          <span className="capitalize text-[var(--text-tertiary)]">{doc.category}</span>
          <span className="tabular-nums text-[var(--text-tertiary)]">{formatBytes(doc.size)}</span>
        </div>
        {searchTerm && !doc.name.toLowerCase().includes(searchTerm.trim().toLowerCase()) && (
          <MatchSnippet text={doc.ocrText} term={searchTerm} />
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {folderNombre !== undefined && <FolderChip nombre={folderNombre} onClick={onOpenFolder} />}
          <StatusControl status={doc.status} onChange={onSetStatus} />
          <ExpiryBadge expiresAt={doc.expiresAt} />
          <StructuredChip doc={doc} />
        </div>
        {(doc.tags.length > 0 || doc.aiTags.length > 0) && (
          <div className="flex flex-wrap gap-1 mt-2">
            {doc.tags.slice(0, 2).map((t) => (
              <span key={t} className="text-[length:var(--ts-2xs,11px)] px-1.5 py-0.5 rounded bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] font-bold">#{t}</span>
            ))}
            {doc.aiTags.slice(0, 1).map((t) => (
              <span key={`ai-${t}`} className="text-[length:var(--ts-2xs,11px)] px-1.5 py-0.5 rounded bg-violet-100 text-[var(--accent)] font-bold inline-flex items-center gap-0.5">
                <Sparkles className="h-2.5 w-2.5" />{t}
              </span>
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
function RowActions({ onPreview, onAnalyze, onDownload, onRename, onMove, onWhatsApp, onSign, onStamp, onRotate, onSplit, onEditPages, isPdf, onToggleFav, onDelete, favorite }: {
  onPreview: () => void; onAnalyze: () => void; onDownload: () => void; onRename: () => void; onMove: () => void; onWhatsApp: () => void; onSign: () => void; onStamp: () => void; onRotate: () => void; onSplit: () => void; onEditPages: () => void; isPdf: boolean; onToggleFav: () => void; onDelete: () => void; favorite: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
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
    if (r) setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
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
        <div className="fixed z-50 min-w-[170px] overflow-hidden rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] py-1 shadow-xl" style={{ top: pos.top, right: pos.right }} onClick={(e) => e.stopPropagation()}>
          {item(Eye, "Ver", onPreview)}
          {item(Wand2, "Analizar con IA", onAnalyze)}
          {item(Pencil, "Renombrar", onRename)}
          {item(FolderInput, "Mover a carpeta", onMove)}
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

// ── Papelera: documentos eliminados con restaurar / eliminar definitivamente ──
function PapeleraView({ docs, onRestore, onPurge }: { docs: DbDocument[]; onRestore: (id: string) => void; onPurge: (id: string) => void }) {
  if (docs.length === 0) {
    return (
      <div className="bg-white border-2 border-dashed border-[var(--rule-base)] rounded-2xl p-10 text-center">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-[var(--surface-sunken)] text-[var(--text-tertiary)] mb-4">
          <Trash2 className="h-7 w-7" />
        </div>
        <p className="text-lg font-extrabold text-[var(--text-primary)]">La papelera está vacía</p>
        <p className="text-sm text-[var(--text-secondary)] mt-1.5">Los documentos que elimines aparecerán acá y vas a poder recuperarlos.</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] text-xs text-[var(--text-tertiary)]">
        <Trash2 className="h-3.5 w-3.5 shrink-0" /> {docs.length} documento(s) en la papelera — restaurá o eliminá definitivamente.
      </div>
      <ul className="divide-y divide-[var(--rule-soft)]">
        {docs.map((d) => {
          const { Icon, tint, bg } = getFileIcon(d.mimeType);
          return (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", bg)}>
                <Icon className={cn("h-4 w-4", tint)} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm text-[var(--text-primary)] truncate">{d.name}</p>
                <p className="text-xs text-[var(--text-tertiary)] tabular-nums">{formatBytes(d.size)}{d.category ? ` · ${d.category}` : ""}</p>
              </div>
              <button
                onClick={() => onRestore(d.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--data-success-50)] dark:bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] text-xs font-bold hover:opacity-90 transition-opacity"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Restaurar
              </button>
              <button
                onClick={() => { if (confirm(`¿Eliminar "${d.name}" definitivamente? No se puede deshacer.`)) onPurge(d.id); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15 text-[var(--data-error-700)] dark:text-[var(--data-error-500)] text-xs font-bold hover:opacity-90 transition-opacity"
              >
                <Trash2 className="h-3.5 w-3.5" /> Eliminar def.
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
