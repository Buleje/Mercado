"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageTitle } from "@buleje/design-system";
import {
  FolderOpen,
  Upload,
  Loader2,
  X,
  AlertCircle,
  FileText,
  Trash2,
  ArrowLeft,
  ScanLine,
  Sparkles,
  Archive,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DbDocument } from "@/lib/types/documents";
import { computeStats, selectDocs, type QuickFilter, type SortKey, type ViewMode } from "./shared";
import { useSuperAdminDocuments } from "./use-superadmin-documents";
import DocumentKpis from "./DocumentKpis";
import DocumentToolbar from "./DocumentToolbar";
import DocumentFoldersBar, { type FolderFilter } from "./DocumentFoldersBar";
import DocumentRow from "./DocumentRow";
import DocumentCard from "./DocumentCard";
import DocumentEditModal from "./DocumentEditModal";
import DocumentShareModal from "./DocumentShareModal";
import DocumentVersionsModal from "./DocumentVersionsModal";
import DocumentActivityModal from "./DocumentActivityModal";
import DocumentTrashView from "./DocumentTrashView";
import DocumentTemplatesModal from "./DocumentTemplatesModal";
import DocumentSignModal from "./DocumentSignModal";
import DocumentPreviewModal from "./DocumentPreviewModal";
import BulkActionBar from "./BulkActionBar";

export default function SuperAdminDocumentsModule() {
  const {
    docs,
    loading,
    error,
    uploading,
    busyId,
    setError,
    reload,
    upload,
    download,
    toggleFavorite,
    changeCategory,
    saveMeta,
    remove,
    removeMany,
    folders,
    creatingFolder,
    createFolder,
    bulkMove,
    searchContent,
    trash,
    trashLoading,
    reloadTrash,
    restore,
    purge,
    scanUpload,
    exporting,
    exportZip,
    bulkTag,
    bulkFavorite,
  } = useSuperAdminDocuments();

  const [search, setSearch] = useState("");
  const [quick, setQuick] = useState<QuickFilter>("todos");
  const [category, setCategory] = useState("todos");
  const [sort, setSort] = useState<SortKey>("recientes");
  const [view, setView] = useState<ViewMode>("list");
  const [folderFilter, setFolderFilter] = useState<FolderFilter>("todas");
  const [contentMode, setContentMode] = useState(false);
  const [contentResults, setContentResults] = useState<DbDocument[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const [trashMode, setTrashMode] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<DbDocument | null>(null);
  const [preview, setPreview] = useState<DbDocument | null>(null);
  const [sharing, setSharing] = useState<DbDocument | null>(null);
  const [versioning, setVersioning] = useState<DbDocument | null>(null);
  const [activityDoc, setActivityDoc] = useState<DbDocument | null>(null);
  const [signing, setSigning] = useState<DbDocument | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => computeStats(docs), [docs]);

  const folderCounts = useMemo(() => {
    const byId: Record<string, number> = {};
    let none = 0;
    for (const d of docs) {
      if (d.folderId) byId[d.folderId] = (byId[d.folderId] ?? 0) + 1;
      else none++;
    }
    return { todas: docs.length, none, byId };
  }, [docs]);

  // Búsqueda en contenido (OCR): consulta al servidor con debounce.
  useEffect(() => {
    if (!contentMode) {
      setContentResults([]);
      setContentLoading(false);
      return;
    }
    const term = search.trim();
    if (term.length < 2) {
      setContentResults([]);
      setContentLoading(false);
      return;
    }
    let cancelled = false;
    setContentLoading(true);
    const t = setTimeout(async () => {
      const res = await searchContent(term);
      if (!cancelled) {
        setContentResults(res);
        setContentLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [contentMode, search, searchContent]);

  const baseDocs = contentMode ? contentResults : docs;
  const filtered = useMemo(() => {
    let list = selectDocs(baseDocs, {
      search: contentMode ? "" : search,
      quick,
      category,
      sort,
    });
    if (folderFilter === "none") list = list.filter((d) => !d.folderId);
    else if (folderFilter !== "todas") list = list.filter((d) => d.folderId === folderFilter);
    return list;
  }, [baseDocs, contentMode, search, quick, category, sort, folderFilter]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === filtered.length ? new Set() : new Set(filtered.map((d) => d.id)),
    );
  }, [filtered]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setSelecting(false);
  }, []);

  const openTrash = useCallback(() => {
    setTrashMode(true);
    clearSelection();
    reloadTrash();
  }, [clearSelection, reloadTrash]);

  const handleRemove = useCallback(
    (doc: DbDocument) => {
      if (!confirm(`¿Borrar "${doc.name}"? Esta acción lo quita del repositorio.`)) return;
      remove(doc);
    },
    [remove],
  );

  const handlePurge = useCallback(
    (doc: DbDocument) => {
      if (!confirm(`¿Borrar DEFINITIVAMENTE "${doc.name}"? Esta acción no se puede deshacer.`))
        return;
      purge(doc);
    },
    [purge],
  );

  const bulkDelete = useCallback(async () => {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirm(`¿Borrar ${ids.length} documento(s)? Esta acción los quita del repositorio.`))
      return;
    await removeMany(ids);
    clearSelection();
  }, [selected, removeMany, clearSelection]);

  const bulkDownload = useCallback(async () => {
    for (const id of selected) {
      const doc = docs.find((d) => d.id === id);
      if (doc) await download(doc);
    }
  }, [selected, docs, download]);

  const bulkMoveTo = useCallback(
    async (folderId: string | null) => {
      const ids = [...selected];
      if (!ids.length) return;
      await bulkMove(ids, folderId);
      clearSelection();
    },
    [selected, bulkMove, clearSelection],
  );

  const bulkTagTo = useCallback(async () => {
    const ids = [...selected];
    if (!ids.length) return;
    const tag = prompt("Etiqueta para los documentos seleccionados:");
    if (!tag || !tag.trim()) return;
    await bulkTag(ids, tag.trim());
    clearSelection();
  }, [selected, bulkTag, clearSelection]);

  const bulkFavoriteTo = useCallback(async () => {
    const ids = [...selected];
    if (!ids.length) return;
    await bulkFavorite(ids, true);
    clearSelection();
  }, [selected, bulkFavorite, clearSelection]);

  const toggleSelecting = useCallback(() => {
    setSelecting((s) => {
      if (s) setSelected(new Set());
      return !s;
    });
  }, []);

  const showSpinner = loading || (contentMode && contentLoading);
  const contentTooShort = contentMode && search.trim().length < 2;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <PageTitle className="flex items-center gap-2 text-[var(--text-primary)]">
            <FolderOpen className="h-6 w-6 text-primary" /> Mis Documentos
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Repositorio privado del superadmin — almacená todos tus documentos de plataforma.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTemplatesOpen(true)}
            className="flex items-center gap-2 px-4 h-12 rounded-2xl border-2 border-[var(--rule-base)] text-base font-semibold text-[var(--text-secondary)] hover:border-primary hover:text-primary transition-colors"
          >
            <Sparkles className="h-5 w-5" />
            <span className="hidden sm:inline">Plantilla</span>
          </button>
          <button
            type="button"
            onClick={() => scanInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 h-12 rounded-2xl border-2 border-[var(--rule-base)] text-base font-semibold text-[var(--text-secondary)] hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
          >
            <ScanLine className="h-5 w-5" />
            <span className="hidden sm:inline">Escanear</span>
          </button>
          <button
            type="button"
            onClick={openTrash}
            className="flex items-center gap-2 px-4 h-12 rounded-2xl border-2 border-[var(--rule-base)] text-base font-semibold text-[var(--text-secondary)] hover:border-primary hover:text-primary transition-colors"
          >
            <Trash2 className="h-5 w-5" />
            <span className="hidden sm:inline">Papelera</span>
          </button>
          <button
            type="button"
            onClick={exportZip}
            disabled={exporting}
            title="Descargar todo el vault en un ZIP"
            className="flex items-center gap-2 px-4 h-12 rounded-2xl border-2 border-[var(--rule-base)] text-base font-semibold text-[var(--text-secondary)] hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Archive className="h-5 w-5" />
            )}
            <span className="hidden sm:inline">Exportar</span>
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 h-12 rounded-2xl bg-primary text-white text-base font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Upload className="h-5 w-5" />
            )}
            Subir documento
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) upload(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={scanInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) scanUpload(f);
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-red-950/20 p-3">
          <AlertCircle className="h-5 w-5 text-[var(--data-error-500)] shrink-0" />
          <p className="text-sm font-semibold text-[var(--data-error-500)]">{error}</p>
          <button type="button" onClick={() => setError(null)} className="ml-auto" aria-label="Cerrar">
            <X className="h-4 w-4 text-[var(--data-error-500)]" />
          </button>
        </div>
      )}

      {trashMode ? (
        <>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setTrashMode(false)}
              className="flex items-center gap-1.5 h-10 px-3 rounded-xl border-2 border-[var(--rule-base)] text-base font-semibold text-[var(--text-secondary)] hover:border-primary hover:text-primary transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Volver
            </button>
            <h2 className="text-lg font-extrabold text-[var(--text-primary)]">
              Papelera{trash.length > 0 ? ` · ${trash.length}` : ""}
            </h2>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Los documentos borrados se pueden restaurar o eliminar definitivamente (también del
            almacenamiento).
          </p>
          <DocumentTrashView
            docs={trash}
            loading={trashLoading}
            busyId={busyId}
            onRestore={restore}
            onPurge={handlePurge}
          />
        </>
      ) : (
        <>
          {/* Dropzone */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Subir documentos"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files) upload(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors",
              dragOver
                ? "border-primary bg-primary/10"
                : "border-[var(--rule-base)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-alt)]",
            )}
          >
            <Upload className="h-8 w-8 mx-auto text-[var(--text-tertiary)] mb-2" />
            <p className="text-base font-semibold text-[var(--text-primary)]">
              Arrastrá archivos acá o hacé clic para subir
            </p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              PDF, imágenes, Office, texto — hasta 50 MB.
            </p>
          </div>

          <DocumentKpis stats={stats} active={quick} onPick={setQuick} />

          <DocumentFoldersBar
            folders={folders}
            active={folderFilter}
            counts={folderCounts}
            onPick={setFolderFilter}
            onCreate={createFolder}
            creating={creatingFolder}
          />

          <DocumentToolbar
            search={search}
            onSearch={setSearch}
            category={category}
            onCategory={setCategory}
            sort={sort}
            onSort={setSort}
            view={view}
            onView={setView}
            selecting={selecting}
            onToggleSelecting={toggleSelecting}
            contentMode={contentMode}
            onToggleContentMode={() => setContentMode((c) => !c)}
          />

          {selecting && selected.size > 0 && (
            <BulkActionBar
              count={selected.size}
              allSelected={selected.size === filtered.length && filtered.length > 0}
              folders={folders}
              onSelectAll={selectAll}
              onDownload={bulkDownload}
              onMove={bulkMoveTo}
              onTag={bulkTagTo}
              onFavorite={bulkFavoriteTo}
              onDelete={bulkDelete}
              onClear={clearSelection}
            />
          )}

          {/* Contenido */}
          {showSpinner ? (
            <div className="p-10 text-center bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] rounded-2xl">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-[var(--text-tertiary)]" />
            </div>
          ) : contentTooShort ? (
            <div className="p-10 text-center bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] rounded-2xl">
              <FileText className="h-10 w-10 mx-auto text-[var(--text-tertiary)] mb-2" />
              <p className="text-base font-semibold text-[var(--text-secondary)]">
                Escribí al menos 2 caracteres para buscar dentro del contenido.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] rounded-2xl">
              <FileText className="h-10 w-10 mx-auto text-[var(--text-tertiary)] mb-2" />
              <p className="text-base font-semibold text-[var(--text-secondary)]">
                {contentMode
                  ? "Sin coincidencias dentro del contenido."
                  : docs.length === 0
                    ? "Todavía no subiste ningún documento."
                    : "Sin resultados para ese filtro."}
              </p>
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {filtered.map((d) => (
                <DocumentCard
                  key={d.id}
                  doc={d}
                  busy={busyId === d.id}
                  selecting={selecting}
                  selected={selected.has(d.id)}
                  onToggleSelect={toggleSelect}
                  onToggleFavorite={toggleFavorite}
                  onPreview={setPreview}
                  onEdit={setEditing}
                  onShare={setSharing}
                  onVersions={setVersioning}
                  onActivity={setActivityDoc}
                  onSign={setSigning}
                  onDownload={download}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          ) : (
            <div className="bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] rounded-2xl overflow-hidden">
              <ul className="divide-y divide-[var(--rule-soft)]">
                {filtered.map((d) => (
                  <DocumentRow
                    key={d.id}
                    doc={d}
                    busy={busyId === d.id}
                    selecting={selecting}
                    selected={selected.has(d.id)}
                    onToggleSelect={toggleSelect}
                    onToggleFavorite={toggleFavorite}
                    onChangeCategory={changeCategory}
                    onPreview={setPreview}
                    onEdit={setEditing}
                    onShare={setSharing}
                    onVersions={setVersioning}
                    onActivity={setActivityDoc}
                    onSign={setSigning}
                    onDownload={download}
                    onRemove={handleRemove}
                  />
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {editing && (
        <DocumentEditModal doc={editing} onClose={() => setEditing(null)} onSave={saveMeta} />
      )}
      {preview && <DocumentPreviewModal doc={preview} onClose={() => setPreview(null)} />}
      {sharing && <DocumentShareModal doc={sharing} onClose={() => setSharing(null)} />}
      {versioning && (
        <DocumentVersionsModal
          doc={versioning}
          onClose={() => setVersioning(null)}
          onChanged={reload}
        />
      )}
      {activityDoc && (
        <DocumentActivityModal doc={activityDoc} onClose={() => setActivityDoc(null)} />
      )}
      {signing && (
        <DocumentSignModal doc={signing} onClose={() => setSigning(null)} onSigned={reload} />
      )}
      {templatesOpen && (
        <DocumentTemplatesModal onClose={() => setTemplatesOpen(false)} onGenerated={reload} />
      )}
    </div>
  );
}
