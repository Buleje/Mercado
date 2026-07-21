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
  Camera, AlarmClock, Wand2, Tag, RotateCcw, MoreVertical, FileArchive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { useDocuments, getSignedDownloadUrl } from "@/hooks/use-documents";
import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { TemplateGenerator } from "./TemplateGenerator";

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

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

interface BuiltinCategory {
  id: "all" | "favorites" | "recent" | "expiring" | "trash";
  label: string;
  icon: typeof Folder;
  color: string;
}

const BUILTIN_CATEGORIES: BuiltinCategory[] = [
  { id: "all", label: "Todos", icon: FolderArchive, color: "text-primary" },
  { id: "favorites", label: "Favoritos", icon: Star, color: "text-amber-500" },
  { id: "recent", label: "Recientes", icon: Clock, color: "text-slate-500" },
  { id: "expiring", label: "Por vencer", icon: AlarmClock, color: "text-red-500" },
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

// ─────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────

export default function DocumentosModule() {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState<"recent" | "name" | "size" | "expiry">("recent");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [semantic, setSemantic] = useState(false);
  const [filterMode, setFilterMode] = useState<"all" | "favorites" | "recent" | "expiring" | "folder" | "trash">("all");
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<{ name: string; expiresAt: string | null } | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<DbDocument | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [bulkTagValue, setBulkTagValue] = useState("");
  const [expiryBannerDismissed, setExpiryBannerDismissed] = useState(false);
  const [zipping, setZipping] = useState(false);
  // Drag & drop de documentos hacia carpetas de la barra lateral.
  const [draggingDocId, setDraggingDocId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

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
    upload, scan, patch, bulk, restore, purge, createFolder, deleteFolder,
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
  }, [documents, filterMode, sortBy]);

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
      setUploadProgress({ done: 0, total: arr.length });
      try {
        await upload(arr, {
          folderId: activeFolderId,
          onProgress: (done, total) => setUploadProgress({ done, total }),
        });
      } finally {
        setUploadProgress(null);
      }
    },
    [upload, activeFolderId]
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
    // Drag interno de un documento (mover a carpeta) → no es una subida de archivos.
    if (e.dataTransfer.types.includes("application/x-doc-id")) return;
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
  // Descarga en lote como ZIP (client-side con jszip): baja cada archivo del
  // proxy /raw y los empaqueta. Evita nombres duplicados con un sufijo (n).
  const bulkDownloadZip = async () => {
    if (selectedIds.size === 0 || zipping) return;
    setZipping(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const seen = new Map<string, number>();
      for (const id of Array.from(selectedIds)) {
        const doc = documents.find((d) => d.id === id);
        if (!doc) continue;
        const res = await fetch(`/api/admin/documents/${id}/raw`, { credentials: "include" });
        if (!res.ok) continue;
        const blob = await res.blob();
        let name = doc.name || `documento-${id}`;
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
      a.download = `documentos-${selectedIds.size}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      clearSelection();
    } finally {
      setZipping(false);
    }
  };

  // Mover UN documento a una carpeta al soltarlo (drag & drop).
  const dropDocOnFolder = async (docId: string, folderId: string | null) => {
    setDragOverFolderId(null);
    setDraggingDocId(null);
    if (!docId) return;
    await bulk("move", [docId], { folderId });
  };

  // ── Folder actions ──
  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    await createFolder({ name, parentId: null });
    setNewFolderName("");
    setShowNewFolder(false);
  };
  const handleDeleteFolder = async (f: DbDocumentFolder) => {
    if (!confirm(`¿Eliminar la carpeta "${f.name}"? Los documentos pasarán a la raíz.`)) return;
    await deleteFolder(f.id);
    if (activeFolderId === f.id) {
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
        <button
          onClick={() => scanInputRef.current?.click()}
          className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white border-2 border-[var(--rule-base)] text-sm font-bold text-[var(--text-secondary)] hover:border-primary hover:text-primary transition-colors"
          title="Tomá una foto de un documento — la IA lo nombra, clasifica y detecta su vencimiento"
        >
          <Camera className="h-4 w-4" /> Escanear
        </button>
        <button
          onClick={() => setShowTemplates(true)}
          className="hidden sm:inline-flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white border-2 border-[var(--rule-base)] text-sm font-bold text-[var(--text-secondary)] hover:border-primary hover:text-primary transition-colors"
        >
          <Sparkles className="h-4 w-4" /> Generar plantilla
        </button>
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

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          <X className="h-4 w-4 shrink-0" /> {error}
          <button onClick={refresh} className="ml-auto text-xs underline">Reintentar</button>
        </div>
      )}

      {/* Hero stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                      active ? "bg-primary/10 text-primary" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : cat.color)} />
                    <span className="flex-1 text-left">{cat.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between px-3 py-2">
            <p className="text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Carpetas
            </p>
            <button
              onClick={() => setShowNewFolder(true)}
              className="h-6 w-6 inline-flex items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-primary transition-colors"
              aria-label="Nueva carpeta"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {showNewFolder && (
            <div className="flex items-stretch gap-1 px-2 mb-2">
              <input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); if (e.key === "Escape") { setShowNewFolder(false); setNewFolderName(""); } }}
                autoFocus
                placeholder="Nombre…"
                className="flex-1 px-2 py-1.5 rounded-md border-2 border-[var(--rule-base)] text-xs outline-none focus:border-primary"
              />
              <button onClick={handleCreateFolder} className="px-2 rounded-md bg-primary text-white text-xs font-bold hover:bg-primary-dark"><Check className="h-3 w-3" /></button>
            </div>
          )}

          <ul className="space-y-1">
            {folders.length === 0 && (
              <li className="px-3 py-2 text-xs text-[var(--text-tertiary)] italic">Sin carpetas. Creá la primera.</li>
            )}
            {folders.map((f) => {
              const active = filterMode === "folder" && activeFolderId === f.id;
              const dropTarget = dragOverFolderId === f.id;
              return (
                <li
                  key={f.id}
                  className={cn("group relative rounded-lg transition-all", dropTarget && "bg-primary/10 ring-2 ring-primary")}
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
                >
                  <button
                    onClick={() => { setFilterMode("folder"); setActiveFolderId(f.id); }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 pr-9 rounded-lg text-sm font-bold transition-colors",
                      active ? "bg-primary/10 text-primary" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                    )}
                  >
                    <Folder className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-[var(--text-tertiary)]")} />
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
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDeleteFolder(f); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-50 hover:text-red-500 text-[var(--text-tertiary)] transition-all"
                    aria-label={`Eliminar carpeta ${f.name}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* ─── Main list ─── */}
        <div className="space-y-4">
          {/* Toolbar */}
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

          {/* Indicador del modo de búsqueda IA (semántica) */}
          {semantic && (
            <div className="flex items-center gap-2 rounded-lg bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--accent)]">
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              Modo IA activo: describí el documento (ej. &ldquo;el contrato del local&rdquo;), no solo palabras exactas.
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
                {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                <option value="__none__">Sin carpeta</option>
              </select>
              <button onClick={bulkDownloadZip} disabled={zipping} className="text-xs px-2.5 py-1 rounded-md bg-white/20 hover:bg-white/30 font-bold inline-flex items-center gap-1 disabled:opacity-60">
                <FileArchive className="h-3 w-3" /> {zipping ? "Comprimiendo…" : "ZIP"}
              </button>
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

          {loading && documents.length === 0 ? (
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
                  onSelect={() => toggleSelect(doc.id)}
                  onPreview={() => setPreview(doc)}
                  onToggleFav={() => patch(doc.id, { favorite: !doc.favorite })}
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
                          <button onClick={() => setPreview(doc)} className="flex items-center gap-3 text-left min-w-0 hover:text-primary transition-colors">
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
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className="text-xs text-[var(--text-secondary)] capitalize">{doc.category}</span>
                        </td>
                        <td className="px-4 py-3 text-right hidden md:table-cell tabular-nums text-xs text-[var(--text-secondary)]">{formatBytes(doc.size)}</td>
                        <td className="px-4 py-3 text-right hidden md:table-cell tabular-nums text-xs text-[var(--text-tertiary)]">
                          {new Date(doc.uploadedAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <RowActions
                            favorite={!!doc.favorite}
                            onPreview={() => setPreview(doc)}
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
            onClose={() => setPreview(null)}
            onRefresh={refresh}
            onPrev={idx > 0 ? () => setPreview(displayDocs[idx - 1]) : undefined}
            onNext={idx >= 0 && idx < displayDocs.length - 1 ? () => setPreview(displayDocs[idx + 1]) : undefined}
            position={idx >= 0 ? { current: idx + 1, total: displayDocs.length } : undefined}
          />
        );
      })()}

      {showTemplates && (
        <TemplateGenerator
          onClose={() => setShowTemplates(false)}
          onGenerated={() => {
            setShowTemplates(false);
            refresh();
          }}
        />
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
        <p className="text-xl font-extrabold tabular-nums leading-tight" style={{ color }}>{formatBytes(usedBytes)}</p>
        <p className="text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)] tabular-nums">{pct}% de {formatBytes(quotaBytes)}</p>
      </div>
    </div>
  );
}

/** ADR-119 — badge de vencimiento con semáforo (rojo/ámbar/verde). */
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

function DocCard({
  doc, selected, isRenaming, renameValue,
  onSelect, onPreview, onToggleFav, onRemove,
  onStartRename, onCommitRename, onCancelRename, onRenameChange, onDownload,
  onDragStart, onDragEnd, dragging,
}: {
  doc: DbDocument;
  selected: boolean;
  isRenaming: boolean;
  renameValue: string;
  onSelect: () => void;
  onPreview: () => void;
  onToggleFav: () => void;
  onRemove: () => void;
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

      {/* Thumbnail — imagen real para archivos de imagen; ícono para el resto. */}
      <button onClick={onPreview} className="block w-full aspect-square bg-[var(--surface-sunken)] overflow-hidden" aria-label={`Ver ${doc.name}`}>
        {doc.mimeType.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/admin/documents/${doc.id}/raw`} alt={doc.name} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className={cn("w-full h-full flex items-center justify-center", bg)}>
            <Icon className={cn("h-12 w-12", tint)} />
          </div>
        )}
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
        <ExpiryBadge expiresAt={doc.expiresAt} className="mt-2" />
        {(doc.tags.length > 0 || doc.aiTags.length > 0) && (
          <div className="flex flex-wrap gap-1 mt-2">
            {doc.tags.slice(0, 2).map((t) => (
              <span key={t} className="text-[length:var(--ts-2xs,11px)] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">#{t}</span>
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
      <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 text-primary mb-4">
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
function RowActions({ onPreview, onDownload, onToggleFav, onDelete, favorite }: {
  onPreview: () => void; onDownload: () => void; onToggleFav: () => void; onDelete: () => void; favorite: boolean;
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
