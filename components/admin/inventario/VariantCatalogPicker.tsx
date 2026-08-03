"use client";

/**
 * VariantCatalogPicker — modal que muestra plantillas del catálogo global
 * (mantenido por el superadmin) y permite al admin del tenant:
 *   1. Importar TODA una plantilla con sus opciones (botón principal)
 *   2. Importar OPCIONES INDIVIDUALES (modo selectivo con checkboxes)
 *
 * Ambos modos copian a ProductModifierGroup + ProductModifierOption del tenant.
 */

import { useEffect, useState } from "react";
import { z } from "zod";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  Loader2, Check, Image as ImageIcon, ChevronDown, ChevronRight,
  CheckSquare, Square, Plus,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import AdminModal from "@/components/admin/shared/AdminModal";

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
type CatOption = z.infer<typeof OptionSchema>;

interface Props {
  productId: number;
  onClose: () => void;
  onImported: () => void;
}

export default function VariantCatalogPicker({ productId, onClose, onImported }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [importedFull, setImportedFull] = useState<Set<string>>(new Set());
  const [expandedTpl, setExpandedTpl] = useState<string | null>(null);
  // Map<templateId, Set<optionId>> — opciones tildadas por plantilla
  const [selected, setSelected] = useState<Map<string, Set<string>>>(new Map());

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

  const filtered = templates.filter((t) => {
    if (activeCategory && t.category !== activeCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.name.toLowerCase().includes(q)
        && !t.category.toLowerCase().includes(q)
        && !t.options.some((o) => o.name.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const toggleOption = (templateId: string, optionId: string) => {
    setSelected((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(templateId) ?? []);
      if (set.has(optionId)) set.delete(optionId);
      else set.add(optionId);
      if (set.size === 0) next.delete(templateId);
      else next.set(templateId, set);
      return next;
    });
  };

  const toggleAllOptions = (template: Template) => {
    setSelected((prev) => {
      const next = new Map(prev);
      const current = next.get(template.id);
      const allSelected = current && current.size === template.options.length;
      if (allSelected) {
        next.delete(template.id);
      } else {
        next.set(template.id, new Set(template.options.map((o) => o.id)));
      }
      return next;
    });
  };

  const importFull = async (template: Template) => {
    setImporting(template.id);
    setError(null);
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
      setImportedFull((prev) => new Set([...prev, template.id]));
      // Permite seguir importando sin cerrar — al final el usuario hace click en "Listo".
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo importar");
    } finally {
      setImporting(null);
    }
  };

  const importSelected = async (template: Template) => {
    const optionIds = Array.from(selected.get(template.id) ?? []);
    if (optionIds.length === 0) return;
    setImporting(template.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/products/${productId}/import-from-catalog`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ templateId: template.id, optionIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      // Marca como importadas y limpia las selecciones
      setImportedFull((prev) => new Set([...prev, template.id]));
      setSelected((prev) => {
        const next = new Map(prev);
        next.delete(template.id);
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo importar");
    } finally {
      setImporting(null);
    }
  };

  const totalSelected = Array.from(selected.values()).reduce((sum, s) => sum + s.size, 0);

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Catálogo de adicionales"
      description="Importá plantillas completas o seleccioná opciones específicas (con sus imágenes)."
      variant="wide"
    >
          {/* Filtros */}
          <div className="shrink-0 px-5 py-3 border-b border-[var(--rule-soft)] space-y-2 bg-white dark:bg-card">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar plantilla, categoría o opción…"
              className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setActiveCategory(null)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-bold border transition-colors",
                    !activeCategory
                      ? "border-primary bg-primary text-white"
                      : "border-[var(--rule-base)] bg-white dark:bg-card text-[var(--text-secondary)] hover:border-primary/40"
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
                        "px-3 py-1.5 rounded-full text-xs font-bold border transition-colors",
                        active
                          ? "border-primary bg-primary text-white"
                          : "border-[var(--rule-base)] bg-white dark:bg-card text-[var(--text-secondary)] hover:border-primary/40"
                      )}
                    >
                      {c} ({count})
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {loading && (
              <div className="flex items-center justify-center py-10 gap-2 text-[var(--text-tertiary)]">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Cargando catálogo…</span>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/5 p-3 text-sm text-[var(--data-error-500)]">
                {error}
              </div>
            )}

            {!loading && filtered.length === 0 && (
              <div className="text-center py-10">
                <ImageIcon className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-3" />
                <p className="text-sm text-[var(--text-secondary)]">
                  {search ? `Sin resultados para "${search}"` : `Sin plantillas ${activeCategory ? `en "${activeCategory}"` : ""}`}
                </p>
              </div>
            )}

            {filtered.map((t) => (
              <TemplateRow
                key={t.id}
                template={t}
                expanded={expandedTpl === t.id}
                onToggleExpand={() => setExpandedTpl(expandedTpl === t.id ? null : t.id)}
                isImporting={importing === t.id}
                isImported={importedFull.has(t.id)}
                selectedIds={selected.get(t.id) ?? new Set()}
                onToggleOption={(optionId) => toggleOption(t.id, optionId)}
                onToggleAll={() => toggleAllOptions(t)}
                onImportFull={() => importFull(t)}
                onImportSelected={() => importSelected(t)}
              />
            ))}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-[var(--rule-soft)] px-5 py-3 flex items-center justify-between gap-2 bg-white dark:bg-card">
            <span className="text-xs text-[var(--text-tertiary)]">
              {totalSelected > 0
                ? `${totalSelected} opción${totalSelected === 1 ? "" : "es"} seleccionada${totalSelected === 1 ? "" : "s"}`
                : "Las plantillas son globales — al importar se copian a tu producto."}
            </span>
            <button
              onClick={() => { onImported(); }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90"
            >
              <Check className="h-4 w-4" />
              Listo
            </button>
          </div>
    </AdminModal>
  );
}

// ─── Template row (collapsed/expanded) ───────────────────────────────────────

function TemplateRow({
  template, expanded, onToggleExpand, isImporting, isImported,
  selectedIds, onToggleOption, onToggleAll, onImportFull, onImportSelected,
}: {
  template: Template;
  expanded: boolean;
  onToggleExpand: () => void;
  isImporting: boolean;
  isImported: boolean;
  selectedIds: Set<string>;
  onToggleOption: (optionId: string) => void;
  onToggleAll: () => void;
  onImportFull: () => void;
  onImportSelected: () => void;
}) {
  const allSelected = selectedIds.size === template.options.length && template.options.length > 0;

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-white dark:bg-card overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <button onClick={onToggleExpand} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors mt-1">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">{template.name}</h3>
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
                {template.category}
              </span>
              {template.required && (
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
                  Obligatorio
                </span>
              )}
            </div>
            {template.description && (
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">{template.description}</p>
            )}
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              {template.options.length} {template.options.length === 1 ? "opción" : "opciones"}
              {" · "}
              {template.minSelect === template.maxSelect ? `exactamente ${template.maxSelect}` : `${template.minSelect}–${template.maxSelect}`} selecciones
            </p>
          </div>
          <button
            onClick={onImportFull}
            disabled={isImporting}
            className={cn(
              "shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors",
              isImported
                ? "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)] border border-[var(--data-success-500)]/30"
                : "bg-primary text-white hover:bg-primary/90",
              "disabled:opacity-50"
            )}
          >
            {isImported ? <><Check className="h-3.5 w-3.5" /> Importado</> :
             isImporting ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Importando…</> :
             <><Plus className="h-3.5 w-3.5" /> Importar todo</>}
          </button>
        </div>

        {/* Preview thumbnails (collapsed) */}
        {!expanded && template.options.length > 0 && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-1.5">
            {template.options.slice(0, 6).map((opt) => (
              <OptionPreview key={opt.id} option={opt} compact />
            ))}
            {template.options.length > 6 && (
              <button
                onClick={onToggleExpand}
                className="rounded-lg border border-dashed border-[var(--rule-soft)] p-2 flex items-center justify-center text-xs font-bold text-[var(--text-tertiary)] hover:border-primary hover:text-primary transition-colors min-h-[44px]"
              >
                +{template.options.length - 6} más
              </button>
            )}
          </div>
        )}
      </div>

      {/* Expanded — selectivo con checkboxes */}
      {expanded && (
        <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-canvas)]/50 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <button
              onClick={onToggleAll}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
            >
              {allSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
              {allSelected ? "Deseleccionar todas" : "Seleccionar todas"}
            </button>
            <span className="text-xs text-[var(--text-tertiary)]">
              {selectedIds.size > 0 ? `${selectedIds.size} de ${template.options.length} elegidas` : "Tocá las que querés importar"}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {template.options.map((opt) => {
              const isChecked = selectedIds.has(opt.id);
              return (
                <button
                  key={opt.id}
                  onClick={() => onToggleOption(opt.id)}
                  className={cn(
                    "text-left rounded-xl border-2 p-2.5 transition-all relative",
                    isChecked
                      ? "border-primary bg-primary/5"
                      : "border-[var(--rule-soft)] bg-white dark:bg-card hover:border-primary/40"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={cn(
                      "flex h-5 w-5 items-center justify-center rounded border-2 shrink-0",
                      isChecked ? "border-primary bg-primary text-white" : "border-[var(--rule-base)]"
                    )}>
                      {isChecked && <Check className="h-3 w-3" />}
                    </span>
                    <OptionPreview option={opt} />
                  </div>
                </button>
              );
            })}
          </div>

          {selectedIds.size > 0 && !isImported && (
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--rule-soft)]">
              <p className="text-xs text-[var(--text-secondary)]">
                Se copiarán <strong>{selectedIds.size}</strong> opción{selectedIds.size === 1 ? "" : "es"} con sus imágenes al producto.
              </p>
              <button
                onClick={onImportSelected}
                disabled={isImporting}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 disabled:opacity-50"
              >
                {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Importar selección
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Option preview (con imagen) ─────────────────────────────────────────────

function OptionPreview({ option, compact }: { option: CatOption; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 min-w-0", compact && "flex-col gap-1")}>
      <div className={cn(
        "rounded-lg shrink-0 overflow-hidden border border-[var(--rule-soft)]",
        compact ? "h-10 w-10" : "h-9 w-9",
        option.imageUrl ? "" : "bg-[var(--surface-sunken)] flex items-center justify-center"
      )}>
        {option.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={option.imageUrl} alt={option.name} className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
        )}
      </div>
      <div className={cn("min-w-0", compact && "text-center w-full")}>
        <p className={cn("text-xs font-semibold text-[var(--text-primary)] truncate", compact && "text-[length:var(--ts-2xs)]")}>{option.name}</p>
        {option.priceDelta !== 0 && (
          <p className="text-[length:var(--ts-2xs)] font-mono text-[var(--text-secondary)]">
            {option.priceDelta > 0 ? "+" : ""}S/ {Number(option.priceDelta).toFixed(2)}
          </p>
        )}
      </div>
    </div>
  );
}
