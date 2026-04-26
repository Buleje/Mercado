"use client";

/**
 * CategoriesTab — Gestión visual de categorías principales del marketplace.
 *
 * Features:
 *   - Upload de imagen de 3 formas: file picker, drag & drop, Ctrl+V paste
 *   - Auto-optimización server-side: sharp resize 800×800 + WebP 85
 *   - Preview live + indicador de ahorro (% bytes ahorrados)
 *   - Edición inline de label + descripción
 *   - Diseño en grilla con cards visuales (no formulario lineal)
 *
 * Storage: PageHero+JSON via /api/superadmin/marketplace/categories.
 * Upload: /api/superadmin/upload mode="square".
 */

import { useEffect, useState, useCallback } from "react";
import {
  Image as ImageIcon,
  RefreshCw,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
  Trash2,
} from "@buleje/design-system/icons";
import ImageUploader from "@/components/superadmin/_shared/ImageUploader";

interface CategoryConfig {
  id: string;
  label: string;
  description: string;
  imageUrl: string | null;
  active: boolean;
  defaultLabel: string;
  defaultDescription: string;
}

type SaveStatus = "idle" | "uploading" | "saving" | "saved" | "error";

interface DraftState {
  label?: string;
  description?: string;
  imageUrl?: string | null;
  // UI-only
  status?: SaveStatus;
  errorMsg?: string;
  savedPct?: number;
  uploadingFor?: string;
}

export function CategoriesTab() {
  const [items, setItems] = useState<CategoryConfig[] | null>(null);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [pasteTargetId, setPasteTargetId] = useState<string | null>(null);
  const [isDraggingId, setIsDraggingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/superadmin/marketplace/categories", {
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      const json = (await res.json()) as { categories: CategoryConfig[] };
      setItems(json.categories);
    } catch {
      setError("Error cargando categorías");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateDraft = useCallback(
    (id: string, patch: Partial<DraftState>) => {
      setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    },
    [],
  );

  // ── Upload core ─────────────────────────────────────────────────────────
  const uploadFile = useCallback(
    async (id: string, file: File) => {
      updateDraft(id, { status: "uploading", errorMsg: undefined });
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("folder", "marketplace-categories");
        fd.append("mode", "square");

        const res = await fetch("/api/superadmin/upload", {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error ?? "upload_failed");
        }
        const json = (await res.json()) as {
          url: string;
          size: number;
          originalSize: number;
          savedPct: number;
        };
        updateDraft(id, {
          imageUrl: json.url,
          status: "idle",
          savedPct: json.savedPct,
        });
        // Auto-save tras upload exitoso
        await saveCategory(id, { imageUrl: json.url });
      } catch (e) {
        updateDraft(id, {
          status: "error",
          errorMsg: (e as Error).message ?? "Error subiendo imagen",
        });
      }
    },
    [updateDraft],
  );

  // ── Save category (PATCH endpoint) ──────────────────────────────────────
  const saveCategory = useCallback(
    async (id: string, override?: Partial<CategoryConfig>) => {
      const cur = items?.find((c) => c.id === id);
      const draft = drafts[id] ?? {};
      if (!cur) return;
      const next = {
        id,
        label: override?.label ?? draft.label ?? cur.label,
        description:
          override?.description ?? draft.description ?? cur.description,
        imageUrl:
          override?.imageUrl !== undefined
            ? override.imageUrl ?? ""
            : draft.imageUrl !== undefined
              ? draft.imageUrl ?? ""
              : cur.imageUrl ?? "",
      };
      updateDraft(id, { status: "saving" });
      try {
        const res = await fetch("/api/superadmin/marketplace/categories", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error ?? "save_failed");
        }
        // Persistir en items local y limpiar draft de campos guardados
        setItems((prev) =>
          prev
            ? prev.map((c) =>
                c.id === id
                  ? {
                      ...c,
                      label: next.label,
                      description: next.description,
                      imageUrl: next.imageUrl || null,
                    }
                  : c,
              )
            : prev,
        );
        updateDraft(id, { status: "saved", errorMsg: undefined });
        setTimeout(() => {
          setDrafts((prev) => {
            const cur2 = prev[id];
            if (!cur2) return prev;
            return { ...prev, [id]: { ...cur2, status: "idle" } };
          });
        }, 1500);
      } catch (e) {
        updateDraft(id, {
          status: "error",
          errorMsg: (e as Error).message ?? "Error guardando",
        });
      }
    },
    [drafts, items, updateDraft],
  );

  // ── Drag & drop handlers ────────────────────────────────────────────────
  const onDragOver = useCallback(
    (e: React.DragEvent, id: string) => {
      e.preventDefault();
      if (isDraggingId !== id) setIsDraggingId(id);
    },
    [isDraggingId],
  );
  const onDragLeave = useCallback(() => setIsDraggingId(null), []);
  const onDrop = useCallback(
    (e: React.DragEvent, id: string) => {
      e.preventDefault();
      setIsDraggingId(null);
      const file = e.dataTransfer.files?.[0];
      if (file) void uploadFile(id, file);
    },
    [uploadFile],
  );

  // ── Paste handler (Ctrl+V) ──────────────────────────────────────────────
  useEffect(() => {
    if (!pasteTargetId) return;
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of Array.from(items)) {
        if (it.type.startsWith("image/")) {
          const file = it.getAsFile();
          if (file) {
            e.preventDefault();
            void uploadFile(pasteTargetId, file);
            return;
          }
        }
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [pasteTargetId, uploadFile]);

  return (
    <div className="space-y-4">
      {/* Header explicativo */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-gradient-to-br from-[var(--accent-soft)]/40 to-[var(--surface-raised)] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)] text-white">
            <Sparkles className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[var(--text-primary)]">
              Categorías principales del marketplace
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1 leading-snug">
              Cada categoría aparece en <code>/tiendas</code>. Subí una imagen
              cuadrada — el sistema la optimiza automáticamente a WebP 800×800
              (-70% peso). Métodos: <strong>click</strong>, <strong>arrastrar</strong>{" "}
              o <strong>Ctrl+V</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => load()}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2.5 py-1.5 text-xs font-bold hover:bg-[var(--surface-sunken)]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refrescar
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {!items && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-56 rounded-2xl bg-[var(--surface-sunken)] animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Grilla de cards visuales — más compacta (4 cols en xl) */}
      {items && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {items.map((cat) => {
            const draft = drafts[cat.id] ?? {};
            const draftImage =
              draft.imageUrl !== undefined ? draft.imageUrl : cat.imageUrl;
            const draftLabel = draft.label ?? cat.label;
            const draftDesc = draft.description ?? cat.description;
            const isDirty =
              draft.label !== undefined ||
              draft.description !== undefined ||
              draft.imageUrl !== undefined;
            const status = draft.status ?? "idle";
            const isUploading = status === "uploading";
            const isSaving = status === "saving";
            const isSaved = status === "saved";
            const isErr = status === "error";
            const isDragging = isDraggingId === cat.id;
            const isPasteFocused = pasteTargetId === cat.id;

            return (
              <div
                key={cat.id}
                className="relative rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden transition-all hover:border-[var(--accent)]/40"
              >
                {/* ── Image slot compacto: 4:3 (no cuadrado gigante) ── */}
                <div className="p-2.5 pb-0">
                  <ImageUploader
                    value={draftImage ?? null}
                    onChange={async (url) => {
                      updateDraft(cat.id, { imageUrl: url });
                      if (url) {
                        await saveCategory(cat.id, { imageUrl: url });
                      }
                    }}
                    folder="marketplace-categories"
                    mode="square"
                    aspectClass="aspect-[4/3]"
                    alt={draftLabel}
                  />
                </div>

                {/* ── Form abajo: label + desc + acciones ─────────── */}
                <div className="p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      {cat.id}
                    </span>
                    {isDirty && (
                      <span className="text-[10px] font-bold uppercase text-amber-600">
                        Sin guardar
                      </span>
                    )}
                  </div>

                  <input
                    type="text"
                    value={draftLabel}
                    onChange={(e) => updateDraft(cat.id, { label: e.target.value })}
                    onFocus={() => setPasteTargetId(cat.id)}
                    placeholder={cat.defaultLabel}
                    className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2.5 py-1.5 text-sm font-bold focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none"
                  />

                  <input
                    type="text"
                    value={draftDesc}
                    onChange={(e) =>
                      updateDraft(cat.id, { description: e.target.value })
                    }
                    onFocus={() => setPasteTargetId(cat.id)}
                    placeholder={cat.defaultDescription}
                    className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2.5 py-1.5 text-xs focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none"
                  />

                  {isErr && draft.errorMsg && (
                    <div className="flex items-start gap-1.5 rounded-lg bg-rose-50 border border-rose-200 px-2.5 py-1.5 text-[11px] text-rose-700">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>{draft.errorMsg}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <p className="text-[10px] text-[var(--text-tertiary)] flex items-center gap-1">
                      {isPasteFocused && !draftImage && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] font-bold">
                          Ctrl+V activo
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-1.5">
                      {draftImage && (
                        <button
                          type="button"
                          onClick={() => {
                            updateDraft(cat.id, { imageUrl: "" });
                          }}
                          aria-label="Quitar imagen"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-tertiary)] hover:text-rose-600 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => saveCategory(cat.id)}
                        disabled={!isDirty || isSaving || isUploading}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                          isSaved
                            ? "bg-emerald-100 text-emerald-700"
                            : isDirty && !isSaving
                              ? "bg-[var(--accent)] text-white hover:opacity-90"
                              : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed"
                        }`}
                      >
                        {isSaved ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Listo
                          </>
                        ) : isSaving ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            Guardando
                          </>
                        ) : (
                          <>
                            <ImageIcon className="h-3.5 w-3.5" />
                            Guardar
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
