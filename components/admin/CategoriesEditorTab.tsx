"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useState, useEffect, useCallback } from "react";
import {
  Loader2, Save, Check, GripVertical, Eye, EyeOff,
  ArrowUp, ArrowDown, Layers, Search, Globe, Tag, FileText, Link2, Sparkles,
  Plus, Trash2,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type CategoryConfig = {
  id: string;
  label: string;
  emoji: string;
  visible: boolean;
  order: number;
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string[];
    ogImage?: string;
    canonical?: string;
    slug?: string;
  };
};

type SeoScore = "good" | "warning" | "error";

export default function CategoriesEditorTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cats, setCats] = useState<CategoryConfig[]>([]);
  const [originalJson, setOriginalJson] = useState("");
  const [expandedSeo, setExpandedSeo] = useState<Set<string>>(new Set());

  // Nombre real del comercio para plantillas de SEO. Lo leemos desde el
  // endpoint público /api/settings — `useSettings` no está disponible en
  // el árbol del admin (otro provider). Fallback "tu tienda" si la
  // request falla.
  const [storeName, setStoreName] = useState("tu tienda");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) return;
        const data = await res.json();
        const themeName = data?.storeTheme?.storeName || data?.storeTheme?.name;
        const name = (typeof themeName === "string" && themeName.trim())
          || (typeof data?.businessName === "string" && data.businessName.trim())
          || "tu tienda";
        if (!cancelled) setStoreName(name);
      } catch {
        /* keep default */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then((r) => (r.ok ? r.json() : null)),
      import("@/data/products").then((m) => m.categories),
    ]).then(([settings, staticCats]) => {
      const saved = (settings?.categoryOrder as CategoryConfig[]) || [];
      // Merge static categories with saved config
      const merged: CategoryConfig[] = staticCats
        .filter((c: { id: string }) => c.id !== "todos")
        .map((c: { id: string; label: string; emoji: string }, i: number) => {
          const found = saved.find((s) => s.id === c.id);
          return (
            found || {
              id: c.id,
              label: c.label,
              // Limpia emojis decorativos del catálogo del marketplace.
              // Las categorías ahora son texto puro — más enterprise, más
              // accesibles, mejor SEO.
              emoji: "",
              visible: true,
              order: i,
              seo: {
                metaTitle: `${c.label} | Compra online con delivery`,
                metaDescription: `Compra ${c.label.toLowerCase()} frescos y de calidad. Entrega rápida en tu zona. Paga con Yape o efectivo.`,
                keywords: [c.label.toLowerCase(), "delivery", "pucallpa", "compra online"],
                slug: c.id,
              },
            }
          );
        });
      // Sort by saved order
      merged.sort((a, b) => a.order - b.order);
      setCats(merged);
      setOriginalJson(JSON.stringify(merged));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const hasChanges = JSON.stringify(cats) !== originalJson;

  const moveUp = useCallback((idx: number) => {
    if (idx === 0) return;
    setCats((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next.map((c, i) => ({ ...c, order: i }));
    });
  }, []);

  const moveDown = useCallback((idx: number) => {
    setCats((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next.map((c, i) => ({ ...c, order: i }));
    });
  }, []);

  const toggleVisibility = useCallback((idx: number) => {
    setCats((prev) => prev.map((c, i) => (i === idx ? { ...c, visible: !c.visible } : c)));
  }, []);

  const updateField = useCallback((idx: number, field: "label", val: string) => {
    setCats((prev) => prev.map((c, i) => (i === idx ? { ...c, [field]: val } : c)));
  }, []);

  const updateSeoField = useCallback((idx: number, field: keyof NonNullable<CategoryConfig["seo"]>, val: string | string[]) => {
    setCats((prev) => prev.map((c, i) => {
      if (i !== idx) return c;
      return {
        ...c,
        seo: { ...c.seo, [field]: val }
      };
    }));
  }, []);

  const toggleSeoExpanded = useCallback((id: string) => {
    setExpandedSeo((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const generateSeoForCategory = useCallback((idx: number) => {
    const cat = cats[idx];
    if (!cat) return;
    // Plantilla SEO basada en el nombre real del comercio. El comerciante
    // controla cómo aparece en Google — la marca del marketplace ya no se
    // mete en el title de cada categoría.
    const metaTitle = `${cat.label} en ${storeName} | Compra online con delivery`;
    const metaDescription = `Encuentra ${cat.label.toLowerCase()} frescos y de calidad en ${storeName}. Entrega rápida a domicilio. Paga con Yape, Plin o efectivo.`;
    const keywords = [
      cat.label.toLowerCase(),
      "delivery",
      storeName.toLowerCase(),
      "compra online",
      "pucallpa",
    ];
    const slug = cat.id;

    setCats((prev) => prev.map((c, i) => {
      if (i !== idx) return c;
      return {
        ...c,
        seo: {
          ...c.seo,
          metaTitle,
          metaDescription,
          keywords,
          slug,
        }
      };
    }));
  }, [cats, storeName]);

  const bulkGenerateSeo = useCallback(() => {
    setCats((prev) => prev.map(cat => ({
      ...cat,
      seo: {
        ...cat.seo,
        metaTitle: `${cat.label} en ${storeName} | Compra online con delivery`,
        metaDescription: `Encuentra ${cat.label.toLowerCase()} frescos y de calidad en ${storeName}. Entrega rápida a domicilio. Paga con Yape, Plin o efectivo.`,
        keywords: [
          cat.label.toLowerCase(),
          "delivery",
          storeName.toLowerCase(),
          "compra online",
          "pucallpa",
        ],
        slug: cat.id,
      }
    })));
  }, [storeName]);

  const getSeoScore = useCallback((cat: CategoryConfig): SeoScore => {
    const seo = cat.seo;
    if (!seo?.metaTitle || !seo?.metaDescription) return "error";
    if (seo.metaTitle.length < 30 || seo.metaTitle.length > 60) return "warning";
    if (seo.metaDescription.length < 120 || seo.metaDescription.length > 160) return "warning";
    if (!seo.keywords || seo.keywords.length < 3) return "warning";
    return "good";
  }, []);

  // Brandon mayo 2026 v7: CRUD completo de categorías.
  // Crear: agrega al final del array con id único (slug).
  // Eliminar: filtra del array (afecta visibilidad — los productos con esa
  //   categoría siguen existiendo pero quedan sin filtro hasta reasignarse).
  const slugify = (s: string): string =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);

  const [newCatName, setNewCatName] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);

  // Lock body scroll cuando el modal "Nueva categoría" está abierto.
  useEffect(() => {
    if (!showNewForm) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = orig; };
  }, [showNewForm]);

  const handleCreateCategory = useCallback(() => {
    const label = newCatName.trim();
    if (!label) return;
    let id = slugify(label);
    if (!id) return;
    // Si el id colisiona, agregar un sufijo numérico.
    let suffix = 2;
    const existingIds = new Set(cats.map((c) => c.id));
    while (existingIds.has(id)) {
      id = `${slugify(label)}-${suffix++}`;
    }
    const seoLabel = label.toLowerCase();
    const newCat: CategoryConfig = {
      id,
      label,
      emoji: "",
      visible: true,
      order: cats.length,
      seo: {
        metaTitle: `${label} en ${storeName} | Compra online con delivery`,
        metaDescription: `Encuentra ${seoLabel} frescos y de calidad en ${storeName}. Entrega rápida a domicilio. Paga con Yape, Plin o efectivo.`,
        keywords: [seoLabel, "delivery", storeName.toLowerCase(), "compra online", "pucallpa"],
        slug: id,
      },
    };
    setCats((prev) => [...prev, newCat]);
    setNewCatName("");
    setShowNewForm(false);
  }, [newCatName, cats, storeName]);

  const handleDeleteCategory = useCallback((idx: number) => {
    const cat = cats[idx];
    if (!cat) return;
    const ok = confirm(
      `¿Eliminar la categoría "${cat.label}"?\n\n` +
        `Los productos que la tenían quedarán sin categoría hasta que les asignes otra. ` +
        `Esto NO borra productos.`,
    );
    if (!ok) return;
    setCats((prev) => prev.filter((_, i) => i !== idx).map((c, i) => ({ ...c, order: i })));
  }, [cats]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ categoryOrder: cats }),
      });
      setOriginalJson(JSON.stringify(cats));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* silent */ }
    setSaving(false);
  }, [cats]);

  if (loading) {
    return (
      <div className="h-40 flex items-center justify-center text-[var(--text-tertiary)] dark:text-muted">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando categorías…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toolbar — encabezado lo da el módulo padre */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-[var(--text-secondary)]">
          Crea, renombra, reordena o elimina las categorías del catálogo. Los
          productos te dejarán elegir entre las visibles.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowNewForm((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-[var(--accent)] border-2 border-[var(--accent)]/40 bg-[var(--accent-soft)] hover:bg-[var(--accent)] hover:text-white transition-colors min-h-[44px]"
          >
            <Plus className="h-4 w-4" />
            Nueva categoría
          </button>
          <button
            onClick={bulkGenerateSeo}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors min-h-[44px]"
          >
            <Sparkles className="h-4 w-4" />
            Auto-generar SEO
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors min-h-[44px]",
              saved ? "bg-[var(--data-success-500)]" : "bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saved ? "¡Guardado!" : "Guardar cambios"}
          </button>
        </div>
      </div>

      {/* Modal nueva categoría — overlay centrado con backdrop */}
      {showNewForm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-cat-title"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-4"
          onClick={() => { setShowNewForm(false); setNewCatName(""); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setShowNewForm(false); setNewCatName(""); }
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] shadow-2xl overflow-hidden"
          >
            <header className="flex items-start gap-3 px-6 py-5 border-b-2 border-[var(--rule-soft)]">
              <span aria-hidden className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] shrink-0">
                <Tag className="h-6 w-6" strokeWidth={2.25} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">
                  Catálogo
                </p>
                <h2 id="new-cat-title" className="text-xl font-extrabold text-[var(--text-primary)] leading-tight">
                  Nueva categoría
                </h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)] leading-relaxed">
                  Aparece en el POS, en el formulario de productos y en tu tienda online.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setShowNewForm(false); setNewCatName(""); }}
                aria-label="Cerrar"
                className="h-10 w-10 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
              >
                <Check className="h-0 w-0" aria-hidden />
                <span aria-hidden className="text-xl leading-none">×</span>
              </button>
            </header>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label htmlFor="new-cat-name" className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5 block">
                  Nombre
                </label>
                <input
                  id="new-cat-name"
                  autoFocus
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newCatName.trim()) handleCreateCategory();
                  }}
                  placeholder="Ej: Snacks importados, Cuidado personal…"
                  className="w-full h-12 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 text-base font-semibold text-[var(--text-primary)] focus:border-[var(--accent)] focus:bg-[var(--surface-raised)] outline-none transition-colors"
                />
              </div>

              {/* Preview de slug + SEO auto */}
              {newCatName.trim() && (
                <div className="rounded-2xl bg-[var(--surface-sunken)] border border-[var(--rule-soft)] p-4 space-y-2.5">
                  <div className="flex items-center gap-2 text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                    <Globe className="h-3.5 w-3.5" aria-hidden />
                    Vista previa
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] space-y-1.5">
                    <div className="flex items-baseline gap-2 font-mono">
                      <span className="text-[var(--text-tertiary)] shrink-0">URL:</span>
                      <span className="font-semibold text-[var(--text-primary)] break-all">
                        /tienda/categoria/<strong className="text-[var(--accent)]">{slugify(newCatName) || "..."}</strong>
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-[var(--text-tertiary)] shrink-0">Título SEO:</span>
                      <span className="font-semibold text-[var(--text-primary)]">
                        {newCatName.trim()} en {storeName} | Compra online con delivery
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <footer className="px-6 py-4 bg-[var(--surface-sunken)] border-t-2 border-[var(--rule-soft)] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowNewForm(false); setNewCatName(""); }}
                className="h-11 px-4 rounded-xl text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateCategory}
                disabled={!newCatName.trim()}
                className="inline-flex items-center gap-1.5 h-11 px-5 rounded-xl bg-[var(--accent)] text-white font-extrabold text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Crear categoría
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Category list */}
      <div className="space-y-2">
        {cats.map((cat, i) => {
          const seoScore = getSeoScore(cat);
          const isSeoExpanded = expandedSeo.has(cat.id);
          
          return (
            <div
              key={cat.id}
              className={cn(
                "bg-[var(--surface-raised)] border rounded-xl transition-all",
                cat.visible
                  ? "border-[var(--rule-base)] dark:border-[var(--rule-base)]"
                  : "border-[var(--rule-soft)] dark:border-[var(--rule-base)]/50 opacity-50"
              )}
            >
              {/* Main Category Row — sin emojis decorativos.
                  Los emojis se quitaron porque el catálogo enterprise debe
                  ser sólo texto: mejor accesibilidad, mejor SEO, consistencia
                  con el resto de la UI admin (Holded-style). */}
              <div className="flex flex-wrap items-center gap-3 px-2 sm:px-4 py-2 sm:py-3">
                <GripVertical className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
                <input
                  value={cat.label}
                  onChange={(e) => updateField(i, "label", e.target.value)}
                  className="flex-1 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-alt)] dark:bg-background px-3 py-1.5 text-sm font-medium"
                />
                <span className="text-xs text-muted font-mono">{cat.id}</span>
                
                {/* SEO Score Indicator — bg neutro, color solo en icono + dot */}
                <button
                  onClick={() => toggleSeoExpanded(cat.id)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold transition-colors border border-[var(--rule-soft)] bg-[var(--surface-raised)] hover:bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                  title="Click para editar SEO"
                >
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    seoScore === "good" && "bg-[var(--data-success-500)]",
                    seoScore === "warning" && "bg-[var(--data-warning-500)]",
                    seoScore === "error" && "bg-[var(--data-error-500)]"
                  )} />
                  SEO
                </button>

                <div className="flex items-center gap-1">
                  <button onClick={() => moveUp(i)} disabled={i === 0} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-accent disabled:opacity-20 transition-colors" title="Subir">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => moveDown(i)} disabled={i === cats.length - 1} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-accent disabled:opacity-20 transition-colors" title="Bajar">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => toggleVisibility(i)} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-accent transition-colors" title={cat.visible ? "Ocultar" : "Mostrar"}>
                    {cat.visible ? <Eye className="h-3.5 w-3.5 text-[var(--data-success-500)]" /> : <EyeOff className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />}
                  </button>
                  <button
                    onClick={() => handleDeleteCategory(i)}
                    className="p-1.5 rounded-lg hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-500)] transition-colors text-[var(--text-tertiary)]"
                    title="Eliminar categoría"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* SEO Expanded Section */}
              {isSeoExpanded && (
                <div className="border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] px-4 py-4 space-y-4 bg-[var(--surface-alt)]/50 dark:bg-background/50">
                  <div className="flex items-center justify-between mb-2">
                    <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2">
                      <Globe className="h-4 w-4 text-primary" />
                      SEO Metadata
                    </CardTitle>
                    <button
                      onClick={() => generateSeoForCategory(i)}
                      className="text-xs font-semibold text-primary hover:text-primary-dark flex items-center gap-1"
                    >
                      <Sparkles className="h-3 w-3" />
                      Auto-generar
                    </button>
                  </div>

                  {/* Meta Title */}
                  <div>
                    <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        Meta Title
                      </span>
                      <span className={cn(
                        "font-mono",
                        (cat.seo?.metaTitle?.length || 0) > 60 ? "text-[var(--data-error-500)]" : "text-[var(--text-tertiary)]"
                      )}>
                        {cat.seo?.metaTitle?.length || 0}/60
                      </span>
                    </label>
                    <input
                      value={cat.seo?.metaTitle || ""}
                      onChange={(e) => updateSeoField(i, "metaTitle", e.target.value)}
                      placeholder={`${cat.label} - Buleje`}
                      className="w-full rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm"
                      maxLength={70}
                    />
                  </div>

                  {/* Meta Description */}
                  <div>
                    <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        Meta Description
                      </span>
                      <span className={cn(
                        "font-mono",
                        (cat.seo?.metaDescription?.length || 0) > 160 ? "text-[var(--data-error-500)]" : "text-[var(--text-tertiary)]"
                      )}>
                        {cat.seo?.metaDescription?.length || 0}/160
                      </span>
                    </label>
                    <textarea
                      value={cat.seo?.metaDescription || ""}
                      onChange={(e) => updateSeoField(i, "metaDescription", e.target.value)}
                      placeholder={`Compra ${cat.label.toLowerCase()} frescos en línea...`}
                      className="w-full rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm resize-none"
                      rows={3}
                      maxLength={170}
                    />
                  </div>

                  {/* Keywords */}
                  <div>
                    <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      <span className="flex items-center gap-1">
                        <Tag className="h-3 w-3" />
                        Keywords (separadas por coma, máx 10)
                      </span>
                      <span className="font-mono text-[var(--text-tertiary)]">
                        {cat.seo?.keywords?.length || 0}/10
                      </span>
                    </label>
                    <input
                      value={cat.seo?.keywords?.join(", ") || ""}
                      onChange={(e) => {
                        const keywords = e.target.value.split(",").map(k => k.trim()).filter(Boolean).slice(0, 10);
                        updateSeoField(i, "keywords", keywords);
                      }}
                      placeholder="delivery, san martín, compra online..."
                      className="w-full rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Slug */}
                    <div>
                      <label className="flex items-center gap-1 text-xs font-semibold text-[var(--text-secondary)] mb-1">
                        <Link2 className="h-3 w-3" />
                        Slug
                      </label>
                      <input
                        value={cat.seo?.slug || cat.id}
                        onChange={(e) => updateSeoField(i, "slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                        placeholder={cat.id}
                        className="w-full rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-mono"
                      />
                    </div>

                    {/* OG Image */}
                    <div>
                      <label className="flex items-center gap-1 text-xs font-semibold text-[var(--text-secondary)] mb-1">
                        <FileText className="h-3 w-3" />
                        OG Image URL (opcional)
                      </label>
                      <input
                        value={cat.seo?.ogImage || ""}
                        onChange={(e) => updateSeoField(i, "ogImage", e.target.value)}
                        placeholder="https://..."
                        className="w-full rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  {/* Canonical URL */}
                  <div>
                    <label className="flex items-center gap-1 text-xs font-semibold text-[var(--text-secondary)] mb-1">
                      <Link2 className="h-3 w-3" />
                      Canonical URL (opcional)
                    </label>
                    <input
                      value={cat.seo?.canonical || ""}
                      onChange={(e) => updateSeoField(i, "canonical", e.target.value)}
                      placeholder="https://buleje.pe/categoria/..."
                      className="w-full rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm"
                    />
                  </div>

                  {/* SEO Preview Card */}
                  <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4">
                    <div className="text-xs font-semibold text-[var(--text-secondary)] mb-3 flex items-center gap-1.5">
                      <Search className="h-3.5 w-3.5" />
                      Vista previa en Google
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
                        buleje.pe › categoria › {cat.seo?.slug || cat.id}
                      </div>
                      <div className="text-lg text-[var(--data-success-500)] dark:text-[var(--data-success-500)] font-medium leading-snug">
                        {cat.seo?.metaTitle || `${cat.label} - Buleje`}
                      </div>
                      <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                        {cat.seo?.metaDescription || `Compra ${cat.label.toLowerCase()} frescos y de calidad en Buleje. Entrega rápida en tu zona.`}
                      </div>
                    </div>
                  </div>

                  {/* SEO Score Details */}
                  <div className={cn(
                    "rounded-lg p-3 text-xs",
                    seoScore === "good" && "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30",
                    seoScore === "warning" && "bg-[var(--data-warning-50)] dark:bg-amber-950/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/30",
                    seoScore === "error" && "bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/30"
                  )}>
                    <div className={cn(
                      "font-semibold mb-1",
                      seoScore === "good" && "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
                      seoScore === "warning" && "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
                      seoScore === "error" && "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
                    )}>
                      {seoScore === "good" && "SEO óptimo"}
                      {seoScore === "warning" && "SEO mejorable"}
                      {seoScore === "error" && "SEO incompleto"}
                    </div>
                    <div className={cn(
                      "text-[length:var(--ts-2xs)] space-y-0.5",
                      seoScore === "good" && "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
                      seoScore === "warning" && "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
                      seoScore === "error" && "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]"
                    )}>
                      {!cat.seo?.metaTitle && <div>• Falta meta title</div>}
                      {cat.seo?.metaTitle && cat.seo.metaTitle.length < 30 && <div>• Meta title demasiado corto (mín 30 caracteres)</div>}
                      {cat.seo?.metaTitle && cat.seo.metaTitle.length > 60 && <div>• Meta title demasiado largo (máx 60 caracteres)</div>}
                      {!cat.seo?.metaDescription && <div>• Falta meta description</div>}
                      {cat.seo?.metaDescription && cat.seo.metaDescription.length < 120 && <div>• Meta description demasiado corta (mín 120 caracteres)</div>}
                      {cat.seo?.metaDescription && cat.seo.metaDescription.length > 160 && <div>• Meta description demasiado larga (máx 160 caracteres)</div>}
                      {(!cat.seo?.keywords || cat.seo.keywords.length < 3) && <div>• Agrega al menos 3 keywords</div>}
                      {seoScore === "good" && <div>• Todos los campos están optimizados</div>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Info */}
      <p className="text-xs text-muted">
        Los cambios en el orden y visibilidad se aplican al catálogo de la tienda después de guardar.
      </p>
    </div>
  );
}

