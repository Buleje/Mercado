"use client";

import { LoadingState } from "@buleje/design-system";
import { useState, useEffect } from "react";
import { Loader2, Search, CheckCircle, XCircle, X } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SeoData {
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  ogImage: string;
}

interface SeoEditorModalProps {
  open: boolean;
  productId: number;
  onClose: () => void;
  onSave: () => void;
}

// ── Tag Input ─────────────────────────────────────────────────────────────────

function TagInput({
  tags,
  onChange,
  max,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  max: number;
}) {
  const [input, setInput] = useState("");

  const addTag = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || tags.includes(trimmed) || tags.length >= max) return;
    onChange([...tags, trimmed]);
  };

  const removeTag = (tag: string) => onChange(tags.filter((t) => t !== tag));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
      setInput("");
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5 p-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] min-h-[44px] focus-within:ring-2 focus-within:ring-[#00B4A6]">
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/40 text-[var(--accent)] text-xs font-medium"
        >
          {tag}
          <button onClick={() => removeTag(tag)} className="ml-0.5 hover:text-teal-900 dark:hover:text-teal-100">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {tags.length < max && (
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (input) { addTag(input); setInput(""); } }}
          placeholder={tags.length === 0 ? "Escribe y presiona Enter..." : ""}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-[var(--text-primary)] focus:outline-none"
        />
      )}
    </div>
  );
}

// ── SERP Preview ──────────────────────────────────────────────────────────────

function SerpPreview({ title, description }: { title: string; description: string }) {
  const displayTitle = title || "Título de la página";
  const displayDesc = description || "Descripción de la página en los resultados de Google.";

  return (
    <div className="rounded-xl border border-[var(--rule-base)] p-4 bg-[var(--surface-canvas)]">
      <p className="text-xs text-[var(--text-tertiary)] mb-3 flex items-center gap-1.5">
        <Search className="h-3.5 w-3.5" /> Vista previa en Google
      </p>
      <div className="space-y-0.5">
        <p className="text-[#1558d6] text-[length:var(--ts-base)] leading-snug hover:underline cursor-pointer truncate font-normal">
          {displayTitle.slice(0, 70)}
        </p>
        <p className="text-[#006621] dark:text-[var(--data-success)] text-xs">
          bodegasanmartin.pe › producto
        </p>
        <p className="text-[var(--text-secondary)] text-sm leading-relaxed line-clamp-2">
          {displayDesc.slice(0, 160)}
        </p>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function SeoEditorModal({ open, productId, onClose, onSave }: SeoEditorModalProps) {
  const [form, setForm] = useState<SeoData>({
    metaTitle: "",
    metaDescription: "",
    keywords: [],
    ogImage: "",
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [errors, setErrors] = useState<{ metaTitle?: string; metaDescription?: string }>({});

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Cargar datos SEO al abrir
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/marketplace/products/${productId}/seo`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.data) {
          setForm({
            metaTitle: data.data.metaTitle ?? "",
            metaDescription: data.data.metaDescription ?? "",
            keywords: Array.isArray(data.data.keywords) ? data.data.keywords : [],
            ogImage: data.data.ogImage ?? "",
          });
        }
      })
      .catch(() => {
        // Fallback: SEO API unavailable — user can still edit manually
      })
      .finally(() => setLoading(false));
  }, [open, productId]);

  const validate = (): boolean => {
    const errs: typeof errors = {};
    if (form.metaTitle.length > 70) errs.metaTitle = "Máximo 70 caracteres";
    if (form.metaDescription.length > 160) errs.metaDescription = "Máximo 160 caracteres";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/marketplace/products/${productId}/seo`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Error al guardar");
      showToast("SEO guardado correctamente", "success");
      onSave();
      setTimeout(onClose, 800);
    } catch (e) {
      showToast(String(e) || "Error al guardar", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModal open={open} onClose={onClose} title="Editor SEO" variant="default">
      <div className="p-5 space-y-5">
        {loading ? (
          <LoadingState />
        ) : (
          <>
            {/* Meta Title */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-[var(--text-secondary)]">Meta título</label>
                <span className={cn("text-xs", form.metaTitle.length > 70 ? "text-[var(--data-error)]" : "text-[var(--text-tertiary)]")}>
                  {form.metaTitle.length}/70
                </span>
              </div>
              <input
                type="text"
                value={form.metaTitle}
                onChange={(e) => setForm((f) => ({ ...f, metaTitle: e.target.value }))}
                className={cn(
                  "w-full px-3 py-2 rounded-lg border bg-[var(--surface-canvas)] text-sm focus:outline-none focus:ring-2 focus:ring-[#00B4A6]",
                  errors.metaTitle ? "border-[var(--data-error)] dark:border-[var(--data-error)]" : "border-[var(--rule-base)]"
                )}
                placeholder="Título optimizado para Google"
              />
              {errors.metaTitle && <p className="text-xs text-[var(--data-error)] mt-1">{errors.metaTitle}</p>}
            </div>

            {/* Meta Description */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-[var(--text-secondary)]">Meta descripción</label>
                <span className={cn("text-xs", form.metaDescription.length > 160 ? "text-[var(--data-error)]" : "text-[var(--text-tertiary)]")}>
                  {form.metaDescription.length}/160
                </span>
              </div>
              <textarea
                rows={3}
                value={form.metaDescription}
                onChange={(e) => setForm((f) => ({ ...f, metaDescription: e.target.value }))}
                className={cn(
                  "w-full px-3 py-2 rounded-lg border bg-[var(--surface-canvas)] text-sm focus:outline-none focus:ring-2 focus:ring-[#00B4A6] resize-none",
                  errors.metaDescription ? "border-[var(--data-error)] dark:border-[var(--data-error)]" : "border-[var(--rule-base)]"
                )}
                placeholder="Descripción que aparecerá en los resultados de búsqueda"
              />
              {errors.metaDescription && <p className="text-xs text-[var(--data-error)] mt-1">{errors.metaDescription}</p>}
            </div>

            {/* Keywords */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-[var(--text-secondary)]">Palabras clave</label>
                <span className="text-xs text-[var(--text-tertiary)]">{form.keywords.length}/10</span>
              </div>
              <TagInput tags={form.keywords} onChange={(tags) => setForm((f) => ({ ...f, keywords: tags }))} max={10} />
              <p className="text-xs text-[var(--text-tertiary)] mt-1">Presiona Enter para agregar cada keyword</p>
            </div>

            {/* OG Image */}
            <div>
              <label className="text-sm font-medium text-[var(--text-secondary)] block mb-1.5">Imagen OG (URL)</label>
              <input
                type="text"
                value={form.ogImage}
                onChange={(e) => setForm((f) => ({ ...f, ogImage: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm focus:outline-none focus:ring-2 focus:ring-[#00B4A6]"
                placeholder="https://..."
              />
            </div>

            {/* Preview SERP */}
            <SerpPreview title={form.metaTitle} description={form.metaDescription} />
          </>
        )}

        {/* Footer */}
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} disabled={saving} className="flex-1 py-2.5 rounded-lg border border-[var(--rule-base)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || loading} className="flex-1 py-2.5 rounded-lg bg-[#00B4A6] text-white text-sm font-medium hover:bg-[#00a090] disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </button>
        </div>

        {/* Toast */}
        {toast && (
          <div className={cn(
            "fixed bottom-6 right-6 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold",
            toast.type === "success" ? "bg-[var(--accent-soft)] text-white" : "bg-[var(--data-error)] text-white"
          )}>
            {toast.type === "success" ? <CheckCircle className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
            {toast.msg}
          </div>
        )}
      </div>
    </AdminModal>
  );
}
