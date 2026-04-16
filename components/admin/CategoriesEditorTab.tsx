"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2, Save, Check, GripVertical, Eye, EyeOff,
  ArrowUp, ArrowDown, Layers, Search, Globe, Tag, FileText, Link2, Sparkles,
} from "lucide-react";
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
          return found || { 
            ...c, 
            visible: true, 
            order: i,
            seo: {
              metaTitle: `${c.label} - Buleje`,
              metaDescription: `Compra ${c.label.toLowerCase()} frescos y de calidad en Buleje. Entrega rápida en tu zona.`,
              keywords: [c.label.toLowerCase()],
              slug: c.id,
            }
          };
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

  const updateField = useCallback((idx: number, field: "label" | "emoji", val: string) => {
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
    const metaTitle = `${cat.label} - Buleje | Compra Online`;
    const metaDescription = `Descubre nuestra seleccion de ${cat.label.toLowerCase()} frescos y de calidad. Entrega rapida a domicilio. Compra ahora en Buleje!`;
    const keywords = [cat.label.toLowerCase(), "delivery", "buleje", "compra online"];
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
  }, [cats]);

  const bulkGenerateSeo = useCallback(() => {
    setCats((prev) => prev.map(cat => ({
      ...cat,
      seo: {
        ...cat.seo,
        metaTitle: `${cat.label} - Buleje | Compra Online`,
        metaDescription: `Descubre nuestra seleccion de ${cat.label.toLowerCase()} frescos y de calidad. Entrega rapida a domicilio. Compra ahora en Buleje!`,
        keywords: [cat.label.toLowerCase(), "delivery", "buleje", "compra online"],
        slug: cat.id,
      }
    })));
  }, []);

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
        headers: { "Content-Type": "application/json" },
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
      <div className="h-40 flex items-center justify-center text-gray-400 dark:text-muted">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando categorías…
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 sm:gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Gestión de Categorías
          </h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">
            Reordena, renombra y oculta categorías del catálogo
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={bulkGenerateSeo}
            className="inline-flex items-center gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 transition-all"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Auto-generar SEO
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className={cn(
              "inline-flex items-center gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs font-bold text-white transition-all",
              saved ? "bg-emerald-500" : "bg-primary hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
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
                  ? "border-gray-200 dark:border-card-border"
                  : "border-gray-100 dark:border-card-border/50 opacity-50"
              )}
            >
              {/* Main Category Row */}
              <div className="flex flex-wrap items-center gap-3 px-2 sm:px-4 py-2 sm:py-3">
                <GripVertical className="h-4 w-4 text-gray-300 shrink-0" />
                <span className="text-lg shrink-0 w-8 text-center">{cat.emoji}</span>
                <input
                  value={cat.emoji}
                  onChange={(e) => updateField(i, "emoji", e.target.value)}
                  className="w-12 text-center rounded-lg border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-background px-1 py-1 text-sm"
                  maxLength={4}
                />
                <input
                  value={cat.label}
                  onChange={(e) => updateField(i, "label", e.target.value)}
                  className="flex-1 rounded-lg border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-background px-3 py-1.5 text-sm font-medium"
                />
                <span className="text-xs text-muted font-mono">{cat.id}</span>
                
                {/* SEO Score Indicator */}
                <button
                  onClick={() => toggleSeoExpanded(cat.id)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-colors",
                    seoScore === "good" && "bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400",
                    seoScore === "warning" && "bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400",
                    seoScore === "error" && "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400"
                  )}
                  title="Click para editar SEO"
                >
                  <Search className="h-3 w-3" />
                  SEO
                </button>

                <div className="flex items-center gap-1">
                  <button onClick={() => moveUp(i)} disabled={i === 0} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent disabled:opacity-20 transition-colors">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => moveDown(i)} disabled={i === cats.length - 1} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent disabled:opacity-20 transition-colors">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => toggleVisibility(i)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
                    {cat.visible ? <Eye className="h-3.5 w-3.5 text-emerald-500" /> : <EyeOff className="h-3.5 w-3.5 text-gray-400" />}
                  </button>
                </div>
              </div>

              {/* SEO Expanded Section */}
              {isSeoExpanded && (
                <div className="border-t border-gray-100 dark:border-card-border px-4 py-4 space-y-4 bg-gray-50/50 dark:bg-background/50">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-gray-700 dark:text-foreground flex flex-wrap items-center gap-2">
                      <Globe className="h-4 w-4 text-primary" />
                      SEO Metadata
                    </h3>
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
                    <label className="flex items-center justify-between text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        Meta Title
                      </span>
                      <span className={cn(
                        "font-mono",
                        (cat.seo?.metaTitle?.length || 0) > 60 ? "text-red-500" : "text-gray-400"
                      )}>
                        {cat.seo?.metaTitle?.length || 0}/60
                      </span>
                    </label>
                    <input
                      value={cat.seo?.metaTitle || ""}
                      onChange={(e) => updateSeoField(i, "metaTitle", e.target.value)}
                      placeholder={`${cat.label} - Buleje`}
                      className="w-full rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card px-3 py-2 text-sm"
                      maxLength={70}
                    />
                  </div>

                  {/* Meta Description */}
                  <div>
                    <label className="flex items-center justify-between text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        Meta Description
                      </span>
                      <span className={cn(
                        "font-mono",
                        (cat.seo?.metaDescription?.length || 0) > 160 ? "text-red-500" : "text-gray-400"
                      )}>
                        {cat.seo?.metaDescription?.length || 0}/160
                      </span>
                    </label>
                    <textarea
                      value={cat.seo?.metaDescription || ""}
                      onChange={(e) => updateSeoField(i, "metaDescription", e.target.value)}
                      placeholder={`Compra ${cat.label.toLowerCase()} frescos en línea...`}
                      className="w-full rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card px-3 py-2 text-sm resize-none"
                      rows={3}
                      maxLength={170}
                    />
                  </div>

                  {/* Keywords */}
                  <div>
                    <label className="flex items-center justify-between text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                      <span className="flex items-center gap-1">
                        <Tag className="h-3 w-3" />
                        Keywords (separadas por coma, máx 10)
                      </span>
                      <span className="font-mono text-gray-400">
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
                      className="w-full rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Slug */}
                    <div>
                      <label className="flex items-center gap-1 text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                        <Link2 className="h-3 w-3" />
                        Slug
                      </label>
                      <input
                        value={cat.seo?.slug || cat.id}
                        onChange={(e) => updateSeoField(i, "slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                        placeholder={cat.id}
                        className="w-full rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card px-3 py-2 text-sm font-mono"
                      />
                    </div>

                    {/* OG Image */}
                    <div>
                      <label className="flex items-center gap-1 text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                        <FileText className="h-3 w-3" />
                        OG Image URL (opcional)
                      </label>
                      <input
                        value={cat.seo?.ogImage || ""}
                        onChange={(e) => updateSeoField(i, "ogImage", e.target.value)}
                        placeholder="https://..."
                        className="w-full rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  {/* Canonical URL */}
                  <div>
                    <label className="flex items-center gap-1 text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                      <Link2 className="h-3 w-3" />
                      Canonical URL (opcional)
                    </label>
                    <input
                      value={cat.seo?.canonical || ""}
                      onChange={(e) => updateSeoField(i, "canonical", e.target.value)}
                      placeholder="https://buleje.pe/categoria/..."
                      className="w-full rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card px-3 py-2 text-sm"
                    />
                  </div>

                  {/* SEO Preview Card */}
                  <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-4">
                    <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-3 flex items-center gap-1.5">
                      <Search className="h-3.5 w-3.5" />
                      Vista previa en Google
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-emerald-700 dark:text-emerald-400">
                        buleje.pe › categoria › {cat.seo?.slug || cat.id}
                      </div>
                      <div className="text-lg text-emerald-600 dark:text-emerald-400 font-medium leading-snug">
                        {cat.seo?.metaTitle || `${cat.label} - Buleje`}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                        {cat.seo?.metaDescription || `Compra ${cat.label.toLowerCase()} frescos y de calidad en Buleje. Entrega rápida en tu zona.`}
                      </div>
                    </div>
                  </div>

                  {/* SEO Score Details */}
                  <div className={cn(
                    "rounded-lg p-3 text-xs",
                    seoScore === "good" && "bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30",
                    seoScore === "warning" && "bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30",
                    seoScore === "error" && "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30"
                  )}>
                    <div className={cn(
                      "font-semibold mb-1",
                      seoScore === "good" && "text-emerald-700 dark:text-emerald-400",
                      seoScore === "warning" && "text-amber-700 dark:text-amber-400",
                      seoScore === "error" && "text-red-700 dark:text-red-400"
                    )}>
                      {seoScore === "good" && "SEO óptimo"}
                      {seoScore === "warning" && "SEO mejorable"}
                      {seoScore === "error" && "SEO incompleto"}
                    </div>
                    <div className={cn(
                      "text-[10px] space-y-0.5",
                      seoScore === "good" && "text-emerald-600 dark:text-emerald-300",
                      seoScore === "warning" && "text-amber-600 dark:text-amber-300",
                      seoScore === "error" && "text-red-600 dark:text-red-300"
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

