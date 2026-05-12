"use client";

/**
 * DocumentosModule — Drive interno de documentación profesional.
 *
 * Capacidades:
 *   • Drag & drop multi-archivo (PDF, imágenes, docs, hojas de cálculo, ZIP)
 *   • Carpetas inteligentes con iconos por tipo + categorías custom
 *   • Búsqueda instantánea por nombre / tag / tipo
 *   • Vista grid (preview thumbnails) y lista (densa)
 *   • Modal de previsualización: PDF inline, imagen, video, código highlight
 *   • Tagging con autocomplete
 *   • Stats de espacio usado, último upload, distribución por tipo
 *   • Persistencia en localStorage por ahora (Phase 2: API + Supabase Storage)
 *
 * UX:
 *   • Hero con stats + barra de espacio
 *   • Sidebar de carpetas con count
 *   • Toolbar con búsqueda + filtros + view toggle + upload trigger
 *   • Grid de cards con preview, hover-actions, badges
 *   • Drag-over visual feedback (overlay teal con texto centrado)
 *
 * Brandon decisión 2026-05-09: módulo dedicado para almacenar todo tipo
 * de documento del negocio (contratos firmados, escaneos SUNAT, fotos
 * de inventario, manuales, recibos, etc.). Pueblo de Pucallpa que confía
 * en papel necesita un drive serio para pasar a digital.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Upload,
  Search,
  Grid3x3,
  List,
  FolderArchive,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  FileSpreadsheet,
  File as FileIcon,
  Download,
  Trash2,
  Eye,
  Plus,
  Folder,
  Star,
  Clock,
  HardDrive,
  X,
  CheckCircle,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";

// ─────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────
type DocCategory =
  | "all"
  | "favorites"
  | "recent"
  | "contratos"
  | "facturas"
  | "manuales"
  | "fotos"
  | "personal"
  | "otros";

interface DocItem {
  id: string;
  name: string;
  size: number;
  type: string;
  category: DocCategory;
  tags: string[];
  favorite: boolean;
  uploadedAt: string;
  /** dataURL para preview offline (Phase 1). Phase 2: URL remota Supabase. */
  dataUrl?: string;
}

const CATEGORIES: { id: DocCategory; label: string; icon: typeof Folder; color: string }[] = [
  { id: "all",        label: "Todos",       icon: FolderArchive, color: "text-primary" },
  { id: "favorites",  label: "Favoritos",   icon: Star,          color: "text-[var(--data-warning)]" },
  { id: "recent",     label: "Recientes",   icon: Clock,         color: "text-[var(--text-secondary)]" },
  { id: "contratos",  label: "Contratos",   icon: FileText,      color: "text-blue-500" },
  { id: "facturas",   label: "Facturas",    icon: FileSpreadsheet, color: "text-emerald-500" },
  { id: "manuales",   label: "Manuales",    icon: FileText,      color: "text-violet-500" },
  { id: "fotos",      label: "Fotos",       icon: ImageIcon,     color: "text-pink-500" },
  { id: "personal",   label: "Personal",    icon: Folder,        color: "text-orange-500" },
  { id: "otros",      label: "Otros",       icon: FileIcon,      color: "text-[var(--text-tertiary)]" },
];

const STORAGE_KEY = "buleje-documentos-v1";
const MAX_STORAGE = 100 * 1024 * 1024; // 100 MB soft-limit del demo (Phase 1)

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function detectCategory(file: File): DocCategory {
  const n = file.name.toLowerCase();
  if (file.type.startsWith("image/")) return "fotos";
  if (n.includes("contrato") || n.includes("contract")) return "contratos";
  if (n.includes("factura") || n.includes("invoice") || file.type.includes("spreadsheet") || file.type.includes("excel")) return "facturas";
  if (n.includes("manual") || n.includes("guia")) return "manuales";
  return "otros";
}

function getFileIcon(type: string): { Icon: typeof FileIcon; tint: string; bg: string } {
  if (type.startsWith("image/")) return { Icon: ImageIcon, tint: "text-pink-500", bg: "bg-pink-50" };
  if (type.startsWith("video/")) return { Icon: Film, tint: "text-violet-500", bg: "bg-violet-50" };
  if (type.startsWith("audio/")) return { Icon: Music, tint: "text-emerald-500", bg: "bg-emerald-50" };
  if (type === "application/pdf") return { Icon: FileText, tint: "text-red-500", bg: "bg-red-50" };
  if (type.includes("spreadsheet") || type.includes("excel") || type.includes("csv")) return { Icon: FileSpreadsheet, tint: "text-emerald-500", bg: "bg-emerald-50" };
  if (type.includes("word") || type.includes("document")) return { Icon: FileText, tint: "text-blue-500", bg: "bg-blue-50" };
  return { Icon: FileIcon, tint: "text-[var(--text-tertiary)]", bg: "bg-[var(--surface-sunken)]" };
}

async function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────
export default function DocumentosModule() {
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [category, setCategory] = useState<DocCategory>("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<DocItem | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cargar de localStorage (Phase 1 — luego API)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setDocs(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  // Persistir
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
    } catch (err) {
      // QuotaExceeded — el demo guarda dataURLs y se llena rápido. Avisar al user.
      const e = err as DOMException;
      if (e.name === "QuotaExceededError") {
        setUploadError("Almacenamiento local lleno. Eliminá archivos o conectá Supabase Storage.");
      }
    }
  }, [docs]);

  // ── Upload handlers ─────────────────────────────────
  const handleUpload = useCallback(async (files: FileList | File[]) => {
    setUploadError(null);
    setUploading(true);
    const arr = Array.from(files);
    const newDocs: DocItem[] = [];

    for (const f of arr) {
      try {
        const dataUrl = await readAsDataUrl(f);
        newDocs.push({
          id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          name: f.name,
          size: f.size,
          type: f.type || "application/octet-stream",
          category: detectCategory(f),
          tags: [],
          favorite: false,
          uploadedAt: new Date().toISOString(),
          dataUrl,
        });
      } catch {
        setUploadError(`No se pudo leer "${f.name}".`);
      }
    }
    setDocs((prev) => [...newDocs, ...prev]);
    setUploading(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleUpload(e.dataTransfer.files);
  }, [handleUpload]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget === e.target) setDragOver(false);
  }, []);

  // ── Mutations ───────────────────────────────────────
  const toggleFav = (id: string) => setDocs((d) => d.map((x) => x.id === id ? { ...x, favorite: !x.favorite } : x));
  const removeDoc = (id: string) => setDocs((d) => d.filter((x) => x.id !== id));
  const addTag = (id: string, tag: string) => {
    const t = tag.trim().toLowerCase();
    if (!t) return;
    setDocs((d) => d.map((x) => x.id === id && !x.tags.includes(t) ? { ...x, tags: [...x.tags, t] } : x));
  };
  const removeTag = (id: string, tag: string) => setDocs((d) => d.map((x) => x.id === id ? { ...x, tags: x.tags.filter((t) => t !== tag) } : x));
  const moveCategory = (id: string, cat: DocCategory) => setDocs((d) => d.map((x) => x.id === id ? { ...x, category: cat } : x));

  // ── Derived ─────────────────────────────────────────
  const totalSize = useMemo(() => docs.reduce((s, d) => s + d.size, 0), [docs]);
  const usagePct = Math.min(100, (totalSize / MAX_STORAGE) * 100);
  const lastUpload = docs[0]?.uploadedAt;

  const counts = useMemo(() => {
    const c: Record<DocCategory, number> = {
      all: docs.length, favorites: 0, recent: 0,
      contratos: 0, facturas: 0, manuales: 0, fotos: 0, personal: 0, otros: 0,
    };
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const d of docs) {
      if (d.favorite) c.favorites++;
      if (new Date(d.uploadedAt).getTime() > sevenDaysAgo) c.recent++;
      if (d.category !== "all" && d.category !== "favorites" && d.category !== "recent") c[d.category]++;
    }
    return c;
  }, [docs]);

  const filtered = useMemo(() => {
    let list = docs;
    if (category === "favorites") list = list.filter((d) => d.favorite);
    else if (category === "recent") {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      list = list.filter((d) => new Date(d.uploadedAt).getTime() > cutoff);
    } else if (category !== "all") {
      list = list.filter((d) => d.category === category);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((d) =>
        d.name.toLowerCase().includes(q) ||
        d.tags.some((t) => t.includes(q)) ||
        d.type.toLowerCase().includes(q)
      );
    }
    return list;
  }, [docs, category, search]);

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
          <div className="bg-white border-4 border-dashed border-primary rounded-3xl p-8 shadow-2xl">
            <Upload className="h-12 w-12 mx-auto text-primary mb-3" />
            <p className="text-xl font-extrabold text-[var(--text-primary)]">Soltá los archivos para subir</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">PDF, imágenes, docs, hojas de cálculo</p>
          </div>
        </div>
      )}

      <AdminModuleHeader
        title="Documentación"
        description="Tu drive interno: contratos, facturas, manuales, fotos. Drag & drop, preview y búsqueda."
        icon={FolderArchive}
      >
        <button
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors shadow-sm"
        >
          {uploading ? (
            <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {uploading ? "Subiendo…" : "Subir archivos"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleUpload(e.target.files)}
        />
      </AdminModuleHeader>

      {uploadError && (
        <div className="flex items-center gap-2 p-3 bg-[var(--data-error-50)] border border-[var(--data-error)] rounded-xl text-sm text-[var(--data-error)]">
          <X className="h-4 w-4 shrink-0" />
          {uploadError}
          <button onClick={() => setUploadError(null)} className="ml-auto text-xs underline">Cerrar</button>
        </div>
      )}

      {/* ── Hero stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBlock
          label="Total archivos"
          value={docs.length.toString()}
          icon={FileIcon}
          tint="text-primary"
        />
        <StatBlock
          label="Espacio usado"
          value={formatBytes(totalSize)}
          icon={HardDrive}
          tint="text-blue-500"
          progress={usagePct}
        />
        <StatBlock
          label="Favoritos"
          value={counts.favorites.toString()}
          icon={Star}
          tint="text-[var(--data-warning)]"
        />
        <StatBlock
          label="Último upload"
          value={lastUpload ? new Date(lastUpload).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }) : "—"}
          icon={Clock}
          tint="text-[var(--text-secondary)]"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-5">
        {/* ── Sidebar de carpetas ── */}
        <aside className="bg-white border border-[var(--rule-base)] rounded-2xl p-3 h-fit">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] px-3 py-2">Carpetas</p>
          <ul className="space-y-1">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const active = category === cat.id;
              const count = counts[cat.id];
              return (
                <li key={cat.id}>
                  <button
                    onClick={() => setCategory(cat.id)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-bold transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : cat.color)} />
                    <span className="flex-1 text-left">{cat.label}</span>
                    {count > 0 && (
                      <span className={cn(
                        "text-[length:var(--ts-2xs)] tabular-nums px-1.5 py-0.5 rounded-md font-bold",
                        active ? "bg-primary text-white" : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
                      )}>
                        {count}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* ── Lista principal ── */}
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex-1 min-w-[220px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
              <input
                type="text"
                placeholder="Buscar por nombre, tag o tipo…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-[var(--rule-base)] bg-white text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>
            <div className="inline-flex rounded-xl border-2 border-[var(--rule-base)] bg-white overflow-hidden">
              <button
                onClick={() => setView("grid")}
                className={cn(
                  "px-3 py-2 transition-colors",
                  view === "grid" ? "bg-primary text-white" : "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
                )}
                aria-label="Vista grilla"
              >
                <Grid3x3 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setView("list")}
                className={cn(
                  "px-3 py-2 transition-colors border-l-2 border-[var(--rule-base)]",
                  view === "list" ? "bg-primary text-white" : "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
                )}
                aria-label="Vista lista"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState category={category} onUpload={() => fileInputRef.current?.click()} />
          ) : view === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filtered.map((doc) => (
                <DocCard
                  key={doc.id}
                  doc={doc}
                  onPreview={() => setPreview(doc)}
                  onToggleFav={() => toggleFav(doc.id)}
                  onRemove={() => removeDoc(doc.id)}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white border border-[var(--rule-base)] rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-sunken)] border-b border-[var(--rule-base)]">
                  <tr>
                    <th className="text-left px-4 py-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Nombre</th>
                    <th className="text-left px-4 py-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] hidden sm:table-cell">Carpeta</th>
                    <th className="text-right px-4 py-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] hidden md:table-cell">Tamaño</th>
                    <th className="text-right px-4 py-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] hidden md:table-cell">Subido</th>
                    <th className="text-center px-4 py-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--rule-soft)]">
                  {filtered.map((doc) => {
                    const { Icon, tint, bg } = getFileIcon(doc.type);
                    return (
                      <tr key={doc.id} className="hover:bg-[var(--surface-sunken)] transition-colors">
                        <td className="px-4 py-3">
                          <button onClick={() => setPreview(doc)} className="flex items-center gap-3 text-left min-w-0 hover:text-primary transition-colors">
                            <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg shrink-0", bg)}>
                              <Icon className={cn("h-4 w-4", tint)} />
                            </span>
                            <span className="font-bold text-[var(--text-primary)] truncate max-w-[280px]">{doc.name}</span>
                            {doc.favorite && <Star className="h-3.5 w-3.5 fill-[var(--data-warning)] text-[var(--data-warning)] shrink-0" />}
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
                            <button onClick={() => toggleFav(doc.id)} className="p-1.5 rounded-md hover:bg-[var(--data-warning)]/10 hover:text-[var(--data-warning)] text-[var(--text-tertiary)] transition-colors" title="Favorito"><Star className={cn("h-4 w-4", doc.favorite && "fill-[var(--data-warning)] text-[var(--data-warning)]")} /></button>
                            <button onClick={() => removeDoc(doc.id)} className="p-1.5 rounded-md hover:bg-[var(--data-error-50)] hover:text-[var(--data-error)] text-[var(--text-tertiary)] transition-colors" title="Eliminar"><Trash2 className="h-4 w-4" /></button>
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

      {/* Modal preview */}
      {preview && (
        <PreviewModal
          doc={preview}
          onClose={() => setPreview(null)}
          onAddTag={(tag) => addTag(preview.id, tag)}
          onRemoveTag={(tag) => removeTag(preview.id, tag)}
          onMoveCategory={(cat) => { moveCategory(preview.id, cat); setPreview({ ...preview, category: cat }); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────
function StatBlock({
  label, value, icon: Icon, tint, progress,
}: {
  label: string;
  value: string;
  icon: typeof FileIcon;
  tint: string;
  progress?: number;
}) {
  return (
    <div className="bg-white border border-[var(--rule-base)] rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p>
          <p className={cn("text-2xl font-extrabold tabular-nums mt-0.5 truncate", tint)}>{value}</p>
        </div>
        <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", tint)} />
      </div>
      {progress !== undefined && (
        <div className="mt-3 h-1.5 rounded-full bg-[var(--rule-soft)] overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", progress > 80 ? "bg-[var(--data-warning)]" : "bg-primary")}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

function DocCard({
  doc, onPreview, onToggleFav, onRemove,
}: {
  doc: DocItem;
  onPreview: () => void;
  onToggleFav: () => void;
  onRemove: () => void;
}) {
  const { Icon, tint, bg } = getFileIcon(doc.type);
  const isImage = doc.type.startsWith("image/") && doc.dataUrl;
  return (
    <div className="group relative overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-white hover:border-primary/40 hover:shadow-md transition-all">
      {/* Thumbnail */}
      <button
        onClick={onPreview}
        className="block w-full aspect-square bg-[var(--surface-sunken)] overflow-hidden"
        aria-label={`Ver ${doc.name}`}
      >
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={doc.dataUrl} alt={doc.name} className="w-full h-full object-cover" />
        ) : (
          <div className={cn("w-full h-full flex items-center justify-center", bg)}>
            <Icon className={cn("h-12 w-12", tint)} />
          </div>
        )}
      </button>

      {/* Favorite button */}
      <button
        onClick={onToggleFav}
        className={cn(
          "absolute top-2 left-2 h-7 w-7 rounded-full flex items-center justify-center transition-all backdrop-blur-sm",
          doc.favorite
            ? "bg-[var(--data-warning)] text-white"
            : "bg-white/85 text-[var(--text-tertiary)] hover:text-[var(--data-warning)] opacity-0 group-hover:opacity-100"
        )}
        aria-label={doc.favorite ? "Quitar favorito" : "Marcar favorito"}
      >
        <Star className={cn("h-3.5 w-3.5", doc.favorite && "fill-current")} />
      </button>

      {/* Hover actions */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {doc.dataUrl && (
          <a
            href={doc.dataUrl}
            download={doc.name}
            onClick={(e) => e.stopPropagation()}
            className="h-7 w-7 rounded-full flex items-center justify-center bg-white/85 backdrop-blur-sm text-[var(--text-tertiary)] hover:text-primary transition-colors"
            aria-label="Descargar"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
        )}
        <button
          onClick={onRemove}
          className="h-7 w-7 rounded-full flex items-center justify-center bg-white/85 backdrop-blur-sm text-[var(--text-tertiary)] hover:text-[var(--data-error)] transition-colors"
          aria-label="Eliminar"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Info */}
      <div className="p-3">
        <button onClick={onPreview} className="text-left w-full">
          <p className="text-sm font-bold text-[var(--text-primary)] truncate hover:text-primary transition-colors">{doc.name}</p>
        </button>
        <div className="flex items-center justify-between mt-1 text-[length:var(--ts-2xs)]">
          <span className="capitalize text-[var(--text-tertiary)]">{doc.category}</span>
          <span className="tabular-nums text-[var(--text-tertiary)]">{formatBytes(doc.size)}</span>
        </div>
        {doc.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {doc.tags.slice(0, 2).map((t) => (
              <span key={t} className="text-[length:var(--ts-2xs)] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">#{t}</span>
            ))}
            {doc.tags.length > 2 && (
              <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] tabular-nums font-bold">+{doc.tags.length - 2}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewModal({
  doc, onClose, onAddTag, onRemoveTag, onMoveCategory,
}: {
  doc: DocItem;
  onClose: () => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onMoveCategory: (cat: DocCategory) => void;
}) {
  const [tagInput, setTagInput] = useState("");
  const isImage = doc.type.startsWith("image/") && doc.dataUrl;
  const isPdf = doc.type === "application/pdf" && doc.dataUrl;
  const isVideo = doc.type.startsWith("video/") && doc.dataUrl;
  const { Icon, tint, bg } = getFileIcon(doc.type);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl max-h-[90vh] overflow-hidden bg-white rounded-3xl shadow-2xl flex flex-col"
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--rule-base)] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl shrink-0", bg)}>
              <Icon className={cn("h-5 w-5", tint)} />
            </span>
            <div className="min-w-0">
              <p className="text-base font-extrabold text-[var(--text-primary)] truncate">{doc.name}</p>
              <p className="text-xs text-[var(--text-tertiary)] tabular-nums">
                {formatBytes(doc.size)} · {doc.type || "Desconocido"} · {new Date(doc.uploadedAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {doc.dataUrl && (
              <a
                href={doc.dataUrl}
                download={doc.name}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-base)] text-xs font-bold text-[var(--text-secondary)] hover:text-primary hover:border-primary transition-colors"
              >
                <Download className="h-3.5 w-3.5" /> Descargar
              </a>
            )}
            <button
              onClick={onClose}
              className="h-8 w-8 inline-flex items-center justify-center rounded-full bg-[var(--surface-sunken)] border border-[var(--rule-base)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Body grid: preview + sidebar */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-[1fr_280px] min-h-0">
          {/* Preview */}
          <div className="bg-[var(--surface-sunken)] flex items-center justify-center overflow-auto p-4">
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={doc.dataUrl} alt={doc.name} className="max-w-full max-h-full object-contain rounded-lg shadow-md" />
            ) : isPdf ? (
              <iframe src={doc.dataUrl} title={doc.name} className="w-full h-[75vh] rounded-lg border border-[var(--rule-base)]" />
            ) : isVideo ? (
              <video src={doc.dataUrl} controls className="max-w-full max-h-full rounded-lg" />
            ) : (
              <div className="text-center px-6">
                <span className={cn("inline-flex items-center justify-center h-20 w-20 rounded-2xl mb-4", bg)}>
                  <Icon className={cn("h-10 w-10", tint)} />
                </span>
                <p className="text-base font-extrabold text-[var(--text-primary)]">{doc.name}</p>
                <p className="text-sm text-[var(--text-secondary)] mt-1">Sin previsualización para este tipo de archivo.</p>
                {doc.dataUrl && (
                  <a
                    href={doc.dataUrl}
                    download={doc.name}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors"
                  >
                    <Download className="h-4 w-4" /> Descargar para abrir
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Sidebar info */}
          <aside className="border-l border-[var(--rule-base)] overflow-y-auto p-5 space-y-5 bg-white">
            {/* Categoría */}
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">Carpeta</p>
              <div className="grid grid-cols-2 gap-1.5">
                {CATEGORIES.filter((c) => !["all", "favorites", "recent"].includes(c.id)).map((cat) => {
                  const Cicon = cat.icon;
                  const active = doc.category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => onMoveCategory(cat.id)}
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors",
                        active
                          ? "bg-primary text-white"
                          : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                      )}
                    >
                      <Cicon className={cn("h-3.5 w-3.5", active ? "text-white" : cat.color)} />
                      <span className="truncate">{cat.label}</span>
                      {active && <CheckCircle className="h-3 w-3 ml-auto" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tags */}
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2 flex items-center gap-1.5">
                <Tag className="h-3 w-3" /> Etiquetas
              </p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {doc.tags.length === 0 ? (
                  <span className="text-xs text-[var(--text-tertiary)] italic">Sin etiquetas</span>
                ) : (
                  doc.tags.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-bold">
                      #{t}
                      <button
                        onClick={() => onRemoveTag(t)}
                        className="hover:text-[var(--data-error)] transition-colors"
                        aria-label={`Quitar etiqueta ${t}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>
              <div className="flex items-stretch rounded-lg border-2 border-[var(--rule-base)] bg-white focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary transition-all overflow-hidden">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      onAddTag(tagInput);
                      setTagInput("");
                    }
                  }}
                  placeholder="Nueva etiqueta…"
                  className="flex-1 min-w-0 px-3 py-2 bg-transparent text-xs text-[var(--text-primary)] outline-none"
                />
                <button
                  onClick={() => { onAddTag(tagInput); setTagInput(""); }}
                  disabled={!tagInput.trim()}
                  className="px-3 bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-colors disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Metadata */}
            <div className="space-y-2">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Detalles</p>
              <dl className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[var(--text-tertiary)]">Tipo</dt>
                  <dd className="font-bold text-[var(--text-primary)] truncate">{doc.type || "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[var(--text-tertiary)]">Tamaño</dt>
                  <dd className="font-bold text-[var(--text-primary)] tabular-nums">{formatBytes(doc.size)}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-[var(--text-tertiary)]">Subido</dt>
                  <dd className="font-bold text-[var(--text-primary)] tabular-nums">{new Date(doc.uploadedAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}</dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ category, onUpload }: { category: DocCategory; onUpload: () => void }) {
  const isFiltered = category !== "all";
  return (
    <div className="bg-white border-2 border-dashed border-[var(--rule-base)] rounded-2xl p-10 text-center">
      <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 text-primary mb-4">
        <Upload className="h-7 w-7" />
      </div>
      <p className="text-lg font-extrabold text-[var(--text-primary)]">
        {isFiltered ? `Sin documentos en "${category}"` : "Subí tu primer documento"}
      </p>
      <p className="text-sm text-[var(--text-secondary)] mt-1.5 max-w-md mx-auto">
        Arrastrá y soltá archivos en cualquier parte de la pantalla, o usá el botón.
        Aceptamos PDF, imágenes, hojas de cálculo, documentos de Word, ZIP y más.
      </p>
      <button
        onClick={onUpload}
        className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors"
      >
        <Upload className="h-4 w-4" /> Subir archivos
      </button>
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-xl mx-auto">
        {[
          { icon: FileText, tint: "text-red-500", label: "PDF" },
          { icon: ImageIcon, tint: "text-pink-500", label: "Imágenes" },
          { icon: FileSpreadsheet, tint: "text-emerald-500", label: "Excel" },
          { icon: FileIcon, tint: "text-[var(--text-tertiary)]", label: "Otros" },
        ].map((t, i) => {
          const Icon = t.icon;
          return (
            <div key={i} className="flex flex-col items-center gap-1 p-3 rounded-xl bg-[var(--surface-sunken)] border border-[var(--rule-base)]">
              <Icon className={cn("h-5 w-5", t.tint)} />
              <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">{t.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
