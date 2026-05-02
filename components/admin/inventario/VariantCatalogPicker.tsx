"use client";

/**
 * VariantCatalogPicker — modal que muestra plantillas del catálogo global
 * (mantenido por el superadmin) y permite al admin del tenant importar una
 * a su producto. Al importar, se clona el template + options al
 * ProductModifierGroup + ProductModifierOption del tenant.
 */

import { useEffect, useState } from "react";
import { z } from "zod";
import { csrfHeaders } from "@/lib/csrf-client";
import { X, BookOpen, Loader2, Check, Image as ImageIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

const OptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  priceDelta: z.number(),
  isDefault: z.boolean(),
});

const TemplateSchema = z.object({
  id: z.string(),
  category: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  required: z.boolean(),
  minSelect: z.number(),
  maxSelect: z.number(),
  options: z.array(OptionSchema),
});

const ResponseSchema = z.object({
  templates: z.array(TemplateSchema),
  categories: z.array(z.string()),
});

type Template = z.infer<typeof TemplateSchema>;

interface Props {
  productId: number;
  onClose: () => void;
  onImported: () => void;
}

export default function VariantCatalogPicker({ productId, onClose, onImported }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/admin/variant-catalog")
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data) => {
        if (cancelled) return;
        const parsed = ResponseSchema.safeParse(data);
        if (!parsed.success) throw new Error("Respuesta inválida");
        setTemplates(parsed.data.templates);
        setCategories(parsed.data.categories);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Error"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  const filtered = activeCategory ? templates.filter((t) => t.category === activeCategory) : templates;

  const importTemplate = async (template: Template) => {
    setImporting(template.id);
    try {
      const res = await fetch(`/api/admin/products/${productId}/import-from-catalog`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ templateId: template.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setImported((prev) => new Set([...prev, template.id]));
      // Pequeño delay para mostrar el "importado" antes de cerrar
      setTimeout(() => onImported(), 500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo importar");
    } finally {
      setImporting(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[var(--surface-canvas)] rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 px-5 py-4 border-b border-[var(--rule-soft)] flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-[var(--text-primary)]">Catálogo de variaciones</h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Importa una plantilla con sus opciones e imágenes a tu producto.
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--surface-sunken)]">
            <X className="h-5 w-5 text-[var(--text-tertiary)]" />
          </button>
        </div>

        {/* Categorías */}
        {categories.length > 0 && (
          <div className="shrink-0 px-5 py-3 border-b border-[var(--rule-soft)] flex flex-wrap gap-1.5">
            <button
              onClick={() => setActiveCategory(null)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                !activeCategory
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-primary/40"
              )}
            >
              Todas ({templates.length})
            </button>
            {categories.map((c) => {
              const count = templates.filter((t) => t.category === c).length;
              const active = activeCategory === c;
              return (
                <button
                  key={c}
                  onClick={() => setActiveCategory(c)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-primary/40"
                  )}
                >
                  {c} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-10 gap-2 text-[var(--text-tertiary)]">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Cargando catálogo...</span>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-[var(--data-error)]/40 bg-[var(--data-error)]/5 p-3 text-sm text-[var(--data-error)]">
              {error}
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="text-center py-10">
              <ImageIcon className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-3" />
              <p className="text-sm text-[var(--text-secondary)]">
                Aún no hay plantillas {activeCategory ? `en "${activeCategory}"` : "publicadas"}.
              </p>
            </div>
          )}

          {filtered.map((t) => {
            const isImporting = importing === t.id;
            const isDone = imported.has(t.id);
            return (
              <div key={t.id} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-[var(--text-primary)]">{t.name}</h3>
                      <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
                        {t.category}
                      </span>
                      {t.required && (
                        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                          Obligatorio
                        </span>
                      )}
                    </div>
                    {t.description && (
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">{t.description}</p>
                    )}
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">
                      {t.options.length} {t.options.length === 1 ? "opción" : "opciones"}
                      {" · "}
                      Selección: {t.minSelect === t.maxSelect ? `exactamente ${t.maxSelect}` : `${t.minSelect}–${t.maxSelect}`}
                    </p>
                  </div>
                  <button
                    onClick={() => importTemplate(t)}
                    disabled={isImporting || isDone}
                    className={cn(
                      "shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors min-h-[44px]",
                      isDone
                        ? "bg-[var(--data-success)]/10 text-[var(--data-success)] border border-[var(--data-success)]/30"
                        : "bg-primary text-white hover:bg-primary/90",
                      "disabled:opacity-50"
                    )}
                  >
                    {isDone ? <><Check className="h-4 w-4" /> Importado</> :
                     isImporting ? <><Loader2 className="h-4 w-4 animate-spin" /> Importando...</> :
                     "Importar"}
                  </button>
                </div>

                {/* Preview de options con imágenes */}
                {t.options.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {t.options.slice(0, 8).map((opt) => (
                      <div key={opt.id} className="rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-2 flex items-center gap-2">
                        <div className={cn(
                          "h-10 w-10 rounded shrink-0 overflow-hidden border border-[var(--rule-soft)]",
                          opt.imageUrl ? "" : "bg-[var(--surface-sunken)] flex items-center justify-center"
                        )}>
                          {opt.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={opt.imageUrl} alt={opt.name} className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon className="h-4 w-4 text-[var(--text-tertiary)]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{opt.name}</p>
                          {opt.priceDelta !== 0 && (
                            <p className="text-[length:var(--ts-2xs)] font-mono text-[var(--text-secondary)]">
                              {opt.priceDelta > 0 ? "+" : ""}S/ {opt.priceDelta.toFixed(2)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                    {t.options.length > 8 && (
                      <div className="rounded-lg border border-dashed border-[var(--rule-soft)] p-2 flex items-center justify-center text-xs text-[var(--text-tertiary)]">
                        +{t.options.length - 8} más
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="shrink-0 border-t border-[var(--rule-soft)] px-5 py-3 flex items-center justify-between text-xs text-[var(--text-tertiary)] bg-[var(--surface-canvas)]">
          <span>Las plantillas son globales del SaaS — al importar se copia a tu producto y puedes editar luego.</span>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-[var(--surface-sunken)]">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
