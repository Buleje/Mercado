"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { PageTitle } from "@buleje/design-system";
import {
  FolderOpen,
  Upload,
  Search,
  Download,
  Trash2,
  Star,
  FileText,
  Loader2,
  X,
  AlertCircle,
  Clock,
} from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";
import { DOC_CATEGORIES, type DbDocument } from "@/lib/types/documents";

// ── Helpers ─────────────────────────────────────────────────────────────────
const CAT_LABEL: Record<string, string> = {
  contratos: "Contratos",
  facturas: "Facturas",
  manuales: "Manuales",
  fotos: "Fotos",
  personal: "Personal",
  otros: "Otros",
};
function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SuperAdminDocumentsModule() {
  const [docs, setDocs] = useState<DbDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("todos");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/superadmin/documents", { headers: csrfHeaders({}) });
      if (res.ok) {
        const data = await res.json();
        setDocs(data.documents ?? []);
      }
    } catch {
      // silently
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length) return;
      setUploading(true);
      setError(null);
      try {
        for (const file of list) {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch("/api/superadmin/documents", {
            method: "POST",
            headers: csrfHeaders({}),
            body: fd,
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setError(
              data.error === "too_large"
                ? `"${file.name}" supera el máximo permitido.`
                : data.error === "mime_not_allowed"
                  ? `Tipo de archivo no permitido: ${file.name}.`
                  : `No se pudo subir "${file.name}".`,
            );
          }
        }
        await load();
      } finally {
        setUploading(false);
      }
    },
    [load],
  );

  const download = useCallback(async (doc: DbDocument) => {
    setBusyId(doc.id);
    try {
      const res = await fetch(`/api/superadmin/documents/${doc.id}`, { headers: csrfHeaders({}) });
      if (res.ok) {
        const { signedUrl } = await res.json();
        if (signedUrl) window.open(signedUrl, "_blank", "noopener,noreferrer");
      }
    } finally {
      setBusyId(null);
    }
  }, []);

  const toggleFavorite = useCallback(
    async (doc: DbDocument) => {
      setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, favorite: !d.favorite } : d)));
      await fetch(`/api/superadmin/documents/${doc.id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ favorite: !doc.favorite }),
      }).catch(() => load());
    },
    [load],
  );

  const changeCategory = useCallback(
    async (doc: DbDocument, category: string) => {
      setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, category } : d)));
      await fetch(`/api/superadmin/documents/${doc.id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ category }),
      }).catch(() => load());
    },
    [load],
  );

  const remove = useCallback(async (doc: DbDocument) => {
    if (!confirm(`¿Borrar "${doc.name}"? Esta acción lo quita del repositorio.`)) return;
    setBusyId(doc.id);
    try {
      const res = await fetch(`/api/superadmin/documents/${doc.id}`, {
        method: "DELETE",
        headers: csrfHeaders({}),
      });
      if (res.ok) setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } finally {
      setBusyId(null);
    }
  }, []);

  const filtered = useMemo(() => {
    let list = [...docs];
    if (filterCat !== "todos") list = list.filter((d) => d.category === filterCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) => d.name.toLowerCase().includes(q) || d.tags.some((t) => t.includes(q)),
      );
    }
    return list;
  }, [docs, filterCat, search]);

  const stats = useMemo(
    () => ({
      total: docs.length,
      favoritos: docs.filter((d) => d.favorite).length,
      porVencer: docs.filter((d) => {
        const dd = daysUntil(d.expiresAt);
        return dd !== null && dd >= 0 && dd <= 30;
      }).length,
      vencidos: docs.filter((d) => {
        const dd = daysUntil(d.expiresAt);
        return dd !== null && dd < 0;
      }).length,
    }),
    [docs],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <PageTitle className="flex items-center gap-2 text-xl sm:text-2xl font-extrabold text-[var(--text-primary)]">
            <FolderOpen className="h-6 w-6 text-primary" /> Mis Documentos
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Repositorio privado del superadmin — almacená todos tus documentos de plataforma.
          </p>
        </div>
        <button
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
      </div>

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
            ? "border-primary bg-[var(--accent-soft)]"
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

      {error && (
        <div className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-red-950/20 p-3">
          <AlertCircle className="h-5 w-5 text-[var(--data-error-500)] shrink-0" />
          <p className="text-sm font-semibold text-[var(--data-error-500)]">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="h-4 w-4 text-[var(--data-error-500)]" />
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Total",
            value: stats.total,
            color: "text-[var(--text-primary)]",
            bg: "bg-[var(--surface-sunken)]",
          },
          {
            label: "Favoritos",
            value: stats.favoritos,
            color: "text-[var(--data-warning-500)]",
            bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30",
          },
          {
            label: "Por vencer",
            value: stats.porVencer,
            color: "text-[var(--data-warning-500)]",
            bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30",
          },
          {
            label: "Vencidos",
            value: stats.vencidos,
            color: "text-[var(--data-error-500)]",
            bg: "bg-[var(--data-error-50)] dark:bg-red-950/30",
          },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("rounded-xl p-4", bg)}>
            <p className="text-sm font-semibold text-[var(--text-secondary)] mb-1">{label}</p>
            <p className={cn("text-2xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o etiqueta..."
            className="w-full pl-10 pr-3 h-12 text-base border-2 border-[var(--rule-base)] rounded-2xl bg-[var(--surface-raised)] text-[var(--text-primary)]"
          />
        </div>
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className="h-12 text-base border-2 border-[var(--rule-base)] rounded-2xl px-3 bg-[var(--surface-raised)] text-[var(--text-primary)]"
        >
          <option value="todos">Todas las categorías</option>
          {DOC_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CAT_LABEL[c] ?? c}
            </option>
          ))}
        </select>
      </div>

      {/* List */}
      <div className="bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-[var(--text-tertiary)]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <FileText className="h-10 w-10 mx-auto text-[var(--text-tertiary)] mb-2" />
            <p className="text-base font-semibold text-[var(--text-secondary)]">
              {docs.length === 0
                ? "Todavía no subiste ningún documento."
                : "Sin resultados para ese filtro."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--rule-soft)]">
            {filtered.map((d) => {
              const dd = daysUntil(d.expiresAt);
              const expWarn = dd !== null && dd < 30;
              return (
                <li
                  key={d.id}
                  className="flex items-center gap-3 p-4 hover:bg-[var(--surface-alt)]/50 transition-colors"
                >
                  <FileText className="h-5 w-5 text-[var(--text-tertiary)] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-[var(--text-primary)] truncate">
                      {d.name}
                    </p>
                    <p className="text-sm text-[var(--text-tertiary)]">
                      {fmtBytes(d.size)} · subido {fmtDate(d.uploadedAt)}
                      {d.expiresAt && (
                        <span
                          className={cn(
                            "ml-1 inline-flex items-center gap-0.5 font-semibold",
                            expWarn
                              ? "text-[var(--data-warning-500)]"
                              : "text-[var(--text-secondary)]",
                          )}
                        >
                          · <Clock className="h-3.5 w-3.5" /> vence {fmtDate(d.expiresAt)}
                        </span>
                      )}
                    </p>
                  </div>
                  <select
                    value={d.category}
                    onChange={(e) => changeCategory(d, e.target.value)}
                    className="hidden sm:block text-sm border-2 border-[var(--rule-base)] rounded-xl px-2 h-9 bg-[var(--surface-raised)] text-[var(--text-secondary)]"
                  >
                    {DOC_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CAT_LABEL[c] ?? c}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => toggleFavorite(d)}
                    title="Favorito"
                    className="p-2 rounded-lg hover:bg-[var(--surface-sunken)]"
                  >
                    <Star
                      className={cn(
                        "h-5 w-5",
                        d.favorite
                          ? "fill-[var(--data-warning-500)] text-[var(--data-warning-500)]"
                          : "text-[var(--text-tertiary)]",
                      )}
                    />
                  </button>
                  <button
                    onClick={() => download(d)}
                    disabled={busyId === d.id}
                    title="Descargar"
                    className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-primary hover:bg-[var(--accent-soft)] disabled:opacity-50"
                  >
                    {busyId === d.id ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Download className="h-5 w-5" />
                    )}
                  </button>
                  <button
                    onClick={() => remove(d)}
                    disabled={busyId === d.id}
                    title="Borrar"
                    className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/20 disabled:opacity-50"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
