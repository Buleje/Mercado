"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2, Save, Check, RotateCcw, Eye,
  Layout, Sparkles, BarChart3, ShoppingBag,
  ChevronDown, ChevronUp,
  AlignLeft, Megaphone, Clock, HelpCircle, Heart, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type HomepageContent, DEFAULT_HOMEPAGE } from "@/lib/homepage-content";

// ── Section card ──────────────────────────────────────────

type SectionConfig = {
  id: string;
  icon: React.ReactNode;
  bgColor: string;
  title: string;
  description: string;
  fields: FieldConfig[];
};

type FieldConfig = {
  key: keyof HomepageContent;
  label: string;
  type: "text" | "textarea" | "toggle" | "url";
  placeholder?: string;
};

function SectionEditor({
  section,
  content,
  onChange,
  expanded,
  onToggle,
}: {
  section: SectionConfig;
  content: HomepageContent;
  onChange: (key: keyof HomepageContent, value: string | boolean) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <button
        onClick={onToggle}
        className="w-full flex flex-wrap items-center gap-3 px-5 py-4 text-left group"
      >
        <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", section.bgColor)}>
          {section.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 dark:text-foreground text-sm">{section.title}</p>
          <p className="text-xs text-gray-500 dark:text-muted">{section.description}</p>
        </div>
        <div className="w-7 h-7 rounded-lg bg-gray-50 dark:bg-surface flex items-center justify-center group-hover:bg-primary/8 transition-colors shrink-0">
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted" /> : <ChevronDown className="h-3.5 w-3.5 text-muted" />}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-gray-100 dark:border-card-border space-y-4 pt-4">
          {section.fields.map((field) => {
            const value = content[field.key];
            if (field.type === "toggle") {
              return (
                <div key={field.key} className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 dark:text-foreground">{field.label}</label>
                  <button
                    type="button"
                    onClick={() => onChange(field.key, !value)}
                    className={cn(
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                      value ? "bg-primary" : "bg-gray-300 dark:bg-surface"
                    )}
                  >
                    <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform", value ? "translate-x-6" : "translate-x-1")} />
                  </button>
                </div>
              );
            }
            return (
              <div key={field.key}>
                <label className="block text-xs font-semibold text-gray-600 dark:text-muted mb-1.5">{field.label}</label>
                {field.type === "textarea" ? (
                  <textarea
                    value={String(value)}
                    onChange={(e) => onChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    rows={3}
                    className="w-full rounded-xl border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-background px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
                  />
                ) : (
                  <input
                    type={field.type === "url" ? "url" : "text"}
                    value={String(value)}
                    onChange={(e) => onChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full rounded-xl border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-background px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────

export default function HomepageEditorTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [content, setContent] = useState<HomepageContent>(DEFAULT_HOMEPAGE);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["hero"]));
  const [originalJson, setOriginalJson] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.homepageContent) {
          const merged = { ...DEFAULT_HOMEPAGE, ...d.homepageContent };
          setContent(merged);
          setOriginalJson(JSON.stringify(merged));
        } else {
          setOriginalJson(JSON.stringify(DEFAULT_HOMEPAGE));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const hasChanges = JSON.stringify(content) !== originalJson;

  const handleChange = useCallback((key: keyof HomepageContent, value: string | boolean) => {
    setContent((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ homepageContent: content }),
      });
      setOriginalJson(JSON.stringify(content));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* silent */}
    setSaving(false);
  }, [content]);

  const handleReset = useCallback(() => {
    setContent(DEFAULT_HOMEPAGE);
  }, []);

  const toggleSection = useCallback((id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const SECTIONS: SectionConfig[] = [
    {
      id: "hero",
      icon: <Layout className="h-6 w-6 text-indigo-500" />,
      bgColor: "bg-indigo-50 dark:bg-indigo-900/20",
      title: "Hero / Portada",
      description: "Título principal, subtítulo y botones de acción",
      fields: [
        { key: "heroGreetingEnabled", label: "Mostrar saludo dinámico", type: "toggle" },
        { key: "heroTitle", label: "Título principal", type: "text", placeholder: "Tus abarrotes" },
        { key: "heroTitleAccent", label: "Texto con acento", type: "text", placeholder: "en tu puerta" },
        { key: "heroSubtitle", label: "Subtítulo", type: "textarea", placeholder: "Descripción breve..." },
        { key: "heroCta1Text", label: "Texto botón principal", type: "text", placeholder: "Explorar Tienda" },
        { key: "heroCta1Link", label: "Enlace botón principal", type: "url", placeholder: "/tienda" },
        { key: "heroCta2Text", label: "Texto botón secundario", type: "text", placeholder: "Pedir por WhatsApp" },
        { key: "heroCta2Link", label: "Enlace botón secundario", type: "url" },
        { key: "heroBadgeText", label: "Texto badge flotante", type: "text", placeholder: "Delivery GRATIS" },
        { key: "heroBadgeSubtext", label: "Subtexto badge", type: "text", placeholder: "Compras desde S/50" },
      ],
    },
    {
      id: "announcement",
      icon: <Megaphone className="h-6 w-6 text-pink-500" />,
      bgColor: "bg-pink-50 dark:bg-pink-900/20",
      title: "Barra de Anuncios",
      description: "Mensajes rotativos en la barra superior",
      fields: [
        { key: "announcementEnabled", label: "Mostrar barra de anuncios", type: "toggle" },
      ],
    },
    {
      id: "countdown",
      icon: <Clock className="h-6 w-6 text-red-500" />,
      bgColor: "bg-red-50 dark:bg-red-900/20",
      title: "Banner Countdown",
      description: "Banner de ofertas del día con cuenta regresiva",
      fields: [
        { key: "countdownEnabled", label: "Mostrar countdown", type: "toggle" },
        { key: "countdownTitle", label: "Título", type: "text", placeholder: "🔥 OFERTAS DEL DÍA" },
        { key: "countdownSubtitle", label: "Subtítulo", type: "text", placeholder: "¡Aprovecha antes de la medianoche!" },
        { key: "countdownCtaText", label: "Texto botón", type: "text", placeholder: "Ver ofertas" },
      ],
    },
    {
      id: "stats",
      icon: <BarChart3 className="h-6 w-6 text-emerald-500" />,
      bgColor: "bg-emerald-50 dark:bg-emerald-900/20",
      title: "Nuestros Números",
      description: "Estadísticas que se muestran debajo del hero",
      fields: [
        { key: "statProducts", label: "Productos", type: "text", placeholder: "500+" },
        { key: "statClients", label: "Clientes", type: "text", placeholder: "1200+" },
        { key: "statOrders", label: "Pedidos", type: "text", placeholder: "3500+" },
        { key: "statRating", label: "Calificación", type: "text", placeholder: "4.8/5" },
      ],
    },
    {
      id: "products",
      icon: <ShoppingBag className="h-6 w-6 text-orange-500" />,
      bgColor: "bg-orange-50 dark:bg-orange-900/20",
      title: "Productos Destacados",
      description: "Sección de productos destacados en la landing",
      fields: [
        { key: "previewBadge", label: "Badge superior", type: "text", placeholder: "Lo más pedido" },
        { key: "previewTitle", label: "Título", type: "text", placeholder: "Productos" },
        { key: "previewTitleAccent", label: "Título con acento", type: "text", placeholder: "destacados" },
        { key: "previewSubtitle", label: "Subtítulo", type: "textarea", placeholder: "Descripción..." },
        { key: "previewCtaText", label: "Texto del CTA", type: "text", placeholder: "Ver todo el catálogo" },
      ],
    },
    {
      id: "footer",
      icon: <AlignLeft className="h-6 w-6 text-violet-500" />,
      bgColor: "bg-violet-50 dark:bg-violet-900/20",
      title: "Footer / Pie de Página",
      description: "Descripción, redes sociales y datos del pie de página",
      fields: [
        { key: "footerDescription", label: "Descripción del negocio", type: "textarea", placeholder: "Tienda virtual de abarrotes..." },
        { key: "footerWhatsApp", label: "Enlace WhatsApp", type: "url" },
        { key: "footerFacebook", label: "Enlace Facebook", type: "url" },
        { key: "footerInstagram", label: "Enlace Instagram", type: "url" },
        { key: "footerRating", label: "Rating (ej. 4.8 / 5 · +800 clientes)", type: "text" },
      ],
    },
  ];

  /* ── List editors (FAQ, Benefits, Testimonials) ── */
  const handleListAdd = useCallback((key: "faqItems" | "benefitItems" | "testimonialItems") => {
    setContent((prev) => {
      const items = [...(prev[key] as unknown[])];
      if (key === "faqItems") items.push({ question: "", answer: "" });
      else if (key === "benefitItems") items.push({ title: "", description: "" });
      else items.push({ name: "", location: "", text: "", rating: 5 });
      return { ...prev, [key]: items };
    });
  }, []);

  const handleListRemove = useCallback((key: "faqItems" | "benefitItems" | "testimonialItems", idx: number) => {
    setContent((prev) => {
      const items = [...(prev[key] as unknown[])];
      items.splice(idx, 1);
      return { ...prev, [key]: items };
    });
  }, []);

  const handleListChange = useCallback((key: "faqItems" | "benefitItems" | "testimonialItems", idx: number, field: string, value: string | number) => {
    setContent((prev) => {
      const items = [...(prev[key] as Record<string, unknown>[])];
      items[idx] = { ...items[idx], [field]: value };
      return { ...prev, [key]: items };
    });
  }, []);

  if (loading) {
    return (
      <div className="h-40 flex items-center justify-center text-gray-400 dark:text-muted">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando contenido…
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 sm:gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <Layout className="h-5 w-5 text-primary" />
            Editor de Página de Inicio
          </h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">
            Personaliza el contenido de cada sección de la landing page
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-gray-600 dark:text-foreground bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors"
          >
            <Eye className="h-3.5 w-3.5" /> Vista previa
          </a>
          <button
            onClick={handleReset}
            disabled={!hasChanges}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-gray-600 dark:text-foreground bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Restaurar
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className={cn(
              "inline-flex items-center gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs font-bold text-white shadow-md transition-all",
              saved
                ? "bg-emerald-500"
                : "bg-primary hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : saved ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saved ? "¡Guardado!" : "Guardar cambios"}
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex flex-wrap items-start gap-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-700/30 rounded-2xl px-2 sm:px-4 py-2 sm:py-3">
        <Sparkles className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
        <p className="text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed">
          Los cambios se guardan en la configuración del sistema. Haz clic en <strong>Guardar cambios</strong> y luego refresca la página de inicio para ver los cambios aplicados.
        </p>
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {SECTIONS.map((section) => (
          <SectionEditor
            key={section.id}
            section={section}
            content={content}
            onChange={handleChange}
            expanded={expandedSections.has(section.id)}
            onToggle={() => toggleSection(section.id)}
          />
        ))}

        {/* FAQ Editor */}
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden shadow-sm">
          <button onClick={() => toggleSection("faq")} className="w-full flex flex-wrap items-center gap-3 px-5 py-4 text-left group">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-amber-50 dark:bg-amber-900/20">
              <HelpCircle className="h-6 w-6 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 dark:text-foreground text-sm">Preguntas Frecuentes (FAQ)</p>
              <p className="text-xs text-gray-500 dark:text-muted">{content.faqItems.length} preguntas configuradas</p>
            </div>
            <div className="w-7 h-7 rounded-lg bg-gray-50 dark:bg-surface flex items-center justify-center">
              {expandedSections.has("faq") ? <ChevronUp className="h-3.5 w-3.5 text-muted" /> : <ChevronDown className="h-3.5 w-3.5 text-muted" />}
            </div>
          </button>
          {expandedSections.has("faq") && (
            <div className="px-5 pb-5 border-t border-gray-100 dark:border-card-border space-y-3 pt-4">
              {content.faqItems.map((item, i) => (
                <div key={i} className="border border-gray-100 dark:border-card-border rounded-xl p-3 space-y-2">
                  <input value={item.question} onChange={(e) => handleListChange("faqItems", i, "question", e.target.value)} placeholder="Pregunta..." className="w-full rounded-lg border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  <textarea value={item.answer} onChange={(e) => handleListChange("faqItems", i, "answer", e.target.value)} placeholder="Respuesta..." rows={2} className="w-full rounded-lg border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
                  <button onClick={() => handleListRemove("faqItems", i)} className="text-xs text-red-500 hover:text-red-700">Eliminar</button>
                </div>
              ))}
              <button onClick={() => handleListAdd("faqItems")} className="text-xs font-bold text-primary hover:text-primary-dark">+ Agregar pregunta</button>
            </div>
          )}
        </div>

        {/* Benefits Editor */}
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden shadow-sm">
          <button onClick={() => toggleSection("benefits")} className="w-full flex flex-wrap items-center gap-3 px-5 py-4 text-left group">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-green-50 dark:bg-green-900/20">
              <Heart className="h-6 w-6 text-green-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 dark:text-foreground text-sm">Beneficios</p>
              <p className="text-xs text-gray-500 dark:text-muted">{content.benefitItems.length} beneficios configurados</p>
            </div>
            <div className="w-7 h-7 rounded-lg bg-gray-50 dark:bg-surface flex items-center justify-center">
              {expandedSections.has("benefits") ? <ChevronUp className="h-3.5 w-3.5 text-muted" /> : <ChevronDown className="h-3.5 w-3.5 text-muted" />}
            </div>
          </button>
          {expandedSections.has("benefits") && (
            <div className="px-5 pb-5 border-t border-gray-100 dark:border-card-border space-y-3 pt-4">
              {content.benefitItems.map((item, i) => (
                <div key={i} className="border border-gray-100 dark:border-card-border rounded-xl p-3 space-y-2">
                  <input value={item.title} onChange={(e) => handleListChange("benefitItems", i, "title", e.target.value)} placeholder="Título del beneficio..." className="w-full rounded-lg border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  <textarea value={item.description} onChange={(e) => handleListChange("benefitItems", i, "description", e.target.value)} placeholder="Descripción..." rows={2} className="w-full rounded-lg border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
                  <button onClick={() => handleListRemove("benefitItems", i)} className="text-xs text-red-500 hover:text-red-700">Eliminar</button>
                </div>
              ))}
              <button onClick={() => handleListAdd("benefitItems")} className="text-xs font-bold text-primary hover:text-primary-dark">+ Agregar beneficio</button>
            </div>
          )}
        </div>

        {/* Testimonials Editor */}
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden shadow-sm">
          <button onClick={() => toggleSection("testimonials")} className="w-full flex flex-wrap items-center gap-3 px-5 py-4 text-left group">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-cyan-50 dark:bg-cyan-900/20">
              <MessageSquare className="h-6 w-6 text-cyan-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 dark:text-foreground text-sm">Testimonios</p>
              <p className="text-xs text-gray-500 dark:text-muted">{content.testimonialItems.length} testimonios configurados</p>
            </div>
            <div className="w-7 h-7 rounded-lg bg-gray-50 dark:bg-surface flex items-center justify-center">
              {expandedSections.has("testimonials") ? <ChevronUp className="h-3.5 w-3.5 text-muted" /> : <ChevronDown className="h-3.5 w-3.5 text-muted" />}
            </div>
          </button>
          {expandedSections.has("testimonials") && (
            <div className="px-5 pb-5 border-t border-gray-100 dark:border-card-border space-y-3 pt-4">
              {content.testimonialItems.map((item, i) => (
                <div key={i} className="border border-gray-100 dark:border-card-border rounded-xl p-3 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input value={item.name} onChange={(e) => handleListChange("testimonialItems", i, "name", e.target.value)} placeholder="Nombre..." className="rounded-lg border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    <input value={item.location} onChange={(e) => handleListChange("testimonialItems", i, "location", e.target.value)} placeholder="Ubicación..." className="rounded-lg border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                  <textarea value={item.text} onChange={(e) => handleListChange("testimonialItems", i, "text", e.target.value)} placeholder="Testimonio..." rows={2} className="w-full rounded-lg border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-xs text-muted">Rating:</label>
                    <select value={item.rating} onChange={(e) => handleListChange("testimonialItems", i, "rating", parseInt(e.target.value))} className="rounded-lg border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-background px-2 py-1 text-sm">
                      {[1,2,3,4,5].map(r => <option key={r} value={r}>{r} ⭐</option>)}
                    </select>
                    <button onClick={() => handleListRemove("testimonialItems", i)} className="ml-auto text-xs text-red-500 hover:text-red-700">Eliminar</button>
                  </div>
                </div>
              ))}
              <button onClick={() => handleListAdd("testimonialItems")} className="text-xs font-bold text-primary hover:text-primary-dark">+ Agregar testimonio</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

