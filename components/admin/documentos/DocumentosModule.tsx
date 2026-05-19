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
  if (type.startsWith("image/")) return { Icon: ImageIcon, tint: "text-[var(--accent)]", bg: "bg-pink-50" };
  if (type.startsWith("video/")) return { Icon: Film, tint: "text-[var(--accent)]", bg: "bg-violet-50" };
  if (type.startsWith("audio/")) return { Icon: Music, tint: "text-emerald-500", bg: "bg-emerald-50" };
  if (type === "application/pdf") return { Icon: FileText, tint: "text-red-500", bg: "bg-red-50" };
  if (type.includes("spreadsheet") || type.includes("excel") || type.includes("csv")) return { Icon: FileSpreadsheet, tint: "text-emerald-500", bg: "bg-emerald-50" };
  if (type.includes("word") || type.includes("document")) return { Icon: FileText, tint: "text-blue-500", bg: "bg-blue-50" };
  return { Icon: FileIcon, tint: "text-[var(--text-tertiary)]", bg: "bg-[var(--surface-sunken)]" };
}

interface BuiltinCategory {
  id: "all" | "favorites" | "recent" | "trash";
  label: string;
  icon: typeof Folder;
  color: string;
}

const BUILTIN_CATEGORIES: BuiltinCategory[] = [
  { id: "all", label: "Todos", icon: FolderArchive, color: "text-primary" },
  { id: "favorites", label: "Favoritos", icon: Star, color: "text-amber-500" },
  { id: "recent", label: "Recientes", icon: Clock, color: "text-slate-500" },
];

// ─────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────

export default function DocumentosModule() {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "favorites" | "recent" | "folder">("all");
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<DbDocument | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

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
    }),
    [filterMode, activeFolderId, searchDebounced]
  );

  const {
    documents, folders, loading, error, refresh,
    upload, patch, bulk, createFolder, deleteFolder,
  } = useDocuments(filters);

  // ── Filtrado client-side adicional (recent) ──
  const displayDocs = useMemo(() => {
    let list = documents;
    if (filterMode === "recent") {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      list = list.filter((d) => new Date(d.uploadedAt).getTime() > cutoff);
    }
    return list;
  }, [documents, filterMode]);

  const totalSize = useMemo(() => documents.reduce((s, d) => s + d.size, 0), [documents]);
  const favCount = useMemo(() => documents.filter((d) => d.favorite).length, [documents]);
  const lastUpload = documents[0]?.uploadedAt;

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
        description="Drive interno multi-tenant: contratos, facturas, manuales, plantillas, firma digital y audit."
        icon={FolderArchive}
      >
        <button
          onClick={() => setShowTemplates(true)}
          className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white border-2 border-[var(--rule-base)] text-sm font-bold text-[var(--text-secondary)] hover:border-primary hover:text-primary transition-colors"
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
              Subiendo {uploadProgress.done}/{uploadProgress.total}…
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
      </AdminModuleHeader>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <X className="h-4 w-4 shrink-0" /> {error}
          <button onClick={refresh} className="ml-auto text-xs underline">Reintentar</button>
        </div>
      )}

      {/* Hero stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBlock label="Total archivos" value={documents.length.toString()} icon={FileIcon} tint="text-primary" />
        <StatBlock label="Espacio usado" value={formatBytes(totalSize)} icon={HardDrive} tint="text-blue-500" />
        <StatBlock label="Favoritos" value={favCount.toString()} icon={Star} tint="text-amber-500" />
        <StatBlock
          label="Último upload"
          value={lastUpload ? new Date(lastUpload).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }) : "—"}
          icon={Clock}
          tint="text-slate-500"
        />
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
              const active =
                (cat.id === "all" && filterMode === "all") ||
                (cat.id === "favorites" && filterMode === "favorites") ||
                (cat.id === "recent" && filterMode === "recent");
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
              return (
                <li key={f.id} className="group relative">
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
                placeholder="Buscar por nombre, tag o contenido OCR…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-[var(--rule-base)] bg-white text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>
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
                          <div className="inline-flex items-center gap-1">
                            <button onClick={() => setPreview(doc)} className="p-1.5 rounded-md hover:bg-primary/10 hover:text-primary text-[var(--text-tertiary)] transition-colors" title="Ver"><Eye className="h-4 w-4" /></button>
                            <button onClick={() => handleDownload(doc)} className="p-1.5 rounded-md hover:bg-blue-50 hover:text-blue-600 text-[var(--text-tertiary)] transition-colors" title="Descargar"><Download className="h-4 w-4" /></button>
                            <button onClick={() => patch(doc.id, { favorite: !doc.favorite })} className="p-1.5 rounded-md hover:bg-amber-50 hover:text-amber-500 text-[var(--text-tertiary)] transition-colors" title="Favorito">
                              <Star className={cn("h-4 w-4", doc.favorite && "fill-amber-400 text-amber-400")} />
                            </button>
                            <button onClick={() => bulk("delete", [doc.id])} className="p-1.5 rounded-md hover:bg-red-50 hover:text-red-500 text-[var(--text-tertiary)] transition-colors" title="Eliminar"><Trash2 className="h-4 w-4" /></button>
                          </div>
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
      {preview && (
        <DocumentPreviewModal
          docId={preview.id}
          onClose={() => setPreview(null)}
          onRefresh={refresh}
        />
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

function DocCard({
  doc, selected, isRenaming, renameValue,
  onSelect, onPreview, onToggleFav, onRemove,
  onStartRename, onCommitRename, onCancelRename, onRenameChange, onDownload,
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
}) {
  const { Icon, tint, bg } = getFileIcon(doc.mimeType);
  return (
    <div className={cn(
      "group relative overflow-hidden rounded-2xl border-2 bg-white transition-all",
      selected ? "border-primary shadow-md" : "border-[var(--rule-base)] hover:border-primary/40 hover:shadow-md"
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

      {/* Thumbnail */}
      <button onClick={onPreview} className="block w-full aspect-square bg-[var(--surface-sunken)] overflow-hidden" aria-label={`Ver ${doc.name}`}>
        <div className={cn("w-full h-full flex items-center justify-center", bg)}>
          <Icon className={cn("h-12 w-12", tint)} />
        </div>
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
