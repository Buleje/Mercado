"use client";

/**
 * CatalogOptionPicker — modal pequeño que lista TODAS las opciones del catálogo
 * global (planas, agrupadas por template) y permite agregar 1 a 1 al grupo
 * actual del editor de modificadores. NO hace fetch al backend al hacer click;
 * solo llama onPick(option) — el editor anexa al state y persiste todo en el
 * Guardar global del modal padre.
 *
 * Uso:
 *   <CatalogOptionPicker
 *     onClose={...}
 *     onPick={(opt) => addOptionToGroup(idx, opt)}
 *     existingNames={Set<string>}  // para mostrar "Ya está" en las que ya tildaste
 *   />
 */

import { useEffect, useState } from "react";
import { z } from "zod";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X, Plus, Loader2, Image as ImageIcon, Check, BookOpen, Search,
} from "@buleje/design-system/icons";
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

type CatalogOption = z.infer<typeof OptionSchema>;

export interface PickedOption {
  name: string;
  imageUrl: string | null;
  priceDelta: number;
  isDefault: boolean;
}

interface Props {
  onClose: () => void;
  onPick: (option: PickedOption) => void;
  /** Nombres (lowercase) de opciones ya en el grupo — para marcar como añadidas. */
  existingNames: Set<string>;
}

export default function CatalogOptionPicker({ onClose, onPick, existingNames }: Props) {
  const [templates, setTemplates] = useState<z.infer<typeof TemplateSchema>[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentlyPicked, setRecentlyPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
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

  const handlePick = (opt: CatalogOption) => {
    onPick({
      name: opt.name,
      imageUrl: opt.imageUrl,
      priceDelta: opt.priceDelta,
      isDefault: opt.isDefault,
    });
    setRecentlyPicked((s) => new Set([...s, opt.id]));
  };

  // Aplana templates en pares { template, option } y filtra por categoría + search
  const flatRows = templates.flatMap((t) =>
    t.options.map((o) => ({ template: t, option: o })),
  );
  const filtered = flatRows.filter(({ template, option }) => {
    if (activeCategory && template.category !== activeCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        option.name.toLowerCase().includes(q) ||
        template.name.toLowerCase().includes(q) ||
        template.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Agrupar por template para render organizado
  const grouped = filtered.reduce<Record<string, { template: typeof templates[0]; options: CatalogOption[] }>>((acc, { template, option }) => {
    const key = template.id;
    if (!acc[key]) acc[key] = { template, options: [] };
    acc[key].options.push(option);
    return acc;
  }, {});

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[8800] bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[8801] -translate-x-1/2 -translate-y-1/2 w-[95vw] max-w-3xl max-h-[88vh] flex flex-col rounded-2xl bg-[var(--surface-canvas)] shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="shrink-0 px-5 py-4 border-b border-[var(--rule-soft)] bg-white dark:bg-card flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <Dialog.Title className="text-base font-extrabold text-[var(--text-primary)]">
                Añadir desde el catálogo
              </Dialog.Title>
              <p className="text-xs text-[var(--text-secondary)]">
                Click en cada item para agregarlo a este grupo. El modal queda abierto para sumar más.
              </p>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--surface-sunken)]">
              <X className="h-5 w-5 text-[var(--text-tertiary)]" />
            </button>
          </div>

          {/* Search + chips */}
          <div className="shrink-0 px-5 py-3 border-b border-[var(--rule-soft)] space-y-2 bg-white dark:bg-card">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar item, plantilla o categoría…"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                autoFocus
              />
            </div>
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setActiveCategory(null)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-bold border transition-colors",
                    !activeCategory
                      ? "border-primary bg-primary text-white"
                      : "border-[var(--rule-base)] bg-white dark:bg-card text-[var(--text-secondary)] hover:border-primary/40",
                  )}
                >
                  Todas
                </button>
                {categories.map((c) => {
                  const active = activeCategory === c;
                  return (
                    <button
                      key={c}
                      onClick={() => setActiveCategory(c)}
                      className={cn(
                        "px-3 py-1 rounded-full text-xs font-bold border transition-colors",
                        active
                          ? "border-primary bg-primary text-white"
                          : "border-[var(--rule-base)] bg-white dark:bg-card text-[var(--text-secondary)] hover:border-primary/40",
                      )}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {loading && (
              <div className="flex items-center justify-center py-10 gap-2 text-[var(--text-tertiary)]">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Cargando catálogo…</span>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-[var(--data-error)]/40 bg-[var(--data-error)]/5 p-3 text-sm text-[var(--data-error)]">
                {error}
              </div>
            )}

            {!loading && Object.keys(grouped).length === 0 && (
              <div className="text-center py-10">
                <ImageIcon className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-3" />
                <p className="text-sm text-[var(--text-secondary)]">
                  {search ? `Sin resultados para "${search}"` : "Sin items"}
                </p>
              </div>
            )}

            {Object.values(grouped).map(({ template, options }) => (
              <section key={template.id} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    {template.category} · {template.name}
                  </h3>
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                    {options.length} item{options.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {options.map((opt) => {
                    const inGroup = existingNames.has(opt.name.toLowerCase());
                    const recent = recentlyPicked.has(opt.id);
                    return (
                      <button
                        key={opt.id}
                        onClick={() => !inGroup && handlePick(opt)}
                        disabled={inGroup}
                        className={cn(
                          "text-left rounded-xl border-2 p-2.5 transition-all flex items-center gap-2.5 group",
                          inGroup
                            ? "border-[var(--rule-soft)] bg-[var(--surface-sunken)]/50 opacity-60 cursor-not-allowed"
                            : recent
                              ? "border-[var(--data-success)]/40 bg-[var(--data-success)]/5"
                              : "border-[var(--rule-soft)] bg-white dark:bg-card hover:border-primary hover:bg-primary/5",
                        )}
                      >
                        {/* Thumbnail */}
                        <div className={cn(
                          "h-12 w-12 rounded-lg shrink-0 overflow-hidden border border-[var(--rule-soft)]",
                          opt.imageUrl ? "" : "bg-[var(--surface-sunken)] flex items-center justify-center",
                        )}>
                          {opt.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={opt.imageUrl} alt={opt.name} className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon className="h-4 w-4 text-[var(--text-tertiary)]" />
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-[var(--text-primary)] truncate">{opt.name}</p>
                          {opt.priceDelta !== 0 && (
                            <p className="text-[length:var(--ts-2xs)] font-mono text-[var(--text-secondary)]">
                              {opt.priceDelta > 0 ? "+" : ""}S/ {Number(opt.priceDelta).toFixed(2)}
                            </p>
                          )}
                        </div>

                        {/* Status badge */}
                        <span className={cn(
                          "shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-full transition-all",
                          inGroup
                            ? "bg-[var(--data-success)] text-white"
                            : recent
                              ? "bg-[var(--data-success)] text-white"
                              : "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white",
                        )}>
                          {inGroup || recent ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-[var(--rule-soft)] px-5 py-3 flex items-center justify-between gap-2 bg-white dark:bg-card">
            <span className="text-xs text-[var(--text-tertiary)]">
              {recentlyPicked.size > 0
                ? `${recentlyPicked.size} item${recentlyPicked.size === 1 ? "" : "s"} agregado${recentlyPicked.size === 1 ? "" : "s"} en esta sesión`
                : "Click en cada item para añadirlo al grupo."}
            </span>
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90"
            >
              <Check className="h-4 w-4" />
              Listo
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
