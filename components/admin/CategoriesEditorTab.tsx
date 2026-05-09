"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useState, useEffect, useCallback } from "react";
import {
  Loader2, Save, Check, GripVertical, Eye, EyeOff,
  ArrowUp, ArrowDown, Layers, Search, Globe, Tag, FileText, Link2, Sparkles,
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
          Reordena, renombra y oculta categorías del catálogo.
        </p>
        <div className="flex flex-wrap items-center gap-2">
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
            {saved ? "¡Guardado!" : "Guardar orden"}
          </button>
        </div>
      </div>

      {/* Category list */}
      <div className="space-y-2">
        {cats.map((cat, i) => {
          const seoScore = getSeoScore(cat);
          const isSeoExpanded = expandedSeo.has(cat.id);
          
          return (
            <div
              key={cat.id}
              className={cn(
                "bg-white dark:bg-card border rounded-xl transition-all",
                cat.visible
                  ? "border-[var(--rule-base)] dark:border-card-border"
                  : "border-[var(--rule-soft)] dark:border-card-border/50 opacity-50"
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
                  className="flex-1 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-[var(--surface-alt)] dark:bg-background px-3 py-1.5 text-sm font-medium"
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
                  <button onClick={() => moveUp(i)} disabled={i === 0} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-accent disabled:opacity-20 transition-colors">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => moveDown(i)} disabled={i === cats.length - 1} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-accent disabled:opacity-20 transition-colors">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => toggleVisibility(i)} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-accent transition-colors">
                    {cat.visible ? <Eye className="h-3.5 w-3.5 text-[var(--data-success-500)]" /> : <EyeOff className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />}
                  </button>
                </div>
              </div>

              {/* SEO Expanded Section */}
              {isSeoExpanded && (
                <div className="border-t border-[var(--rule-soft)] dark:border-card-border px-4 py-4 space-y-4 bg-[var(--surface-alt)]/50 dark:bg-background/50">
                  <div className="flex items-center justify-between mb-2">
                    <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
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
                      className="w-full rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card px-3 py-2 text-sm"
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
                      className="w-full rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card px-3 py-2 text-sm resize-none"
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
                      className="w-full rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card px-3 py-2 text-sm"
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
                        className="w-full rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card px-3 py-2 text-sm font-mono"
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
                        className="w-full rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card px-3 py-2 text-sm"
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
                      className="w-full rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card px-3 py-2 text-sm"
                    />
                  </div>

                  {/* SEO Preview Card */}
                  <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4">
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

