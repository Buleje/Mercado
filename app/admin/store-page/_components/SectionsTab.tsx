"use client";

/**
 * SectionsTab — Builder de secciones de la pagina publica del tenant.
 *
 * El bodeguero arma su /t/[slug] con secciones desde plantillas pre-armadas.
 * Cada plantilla viene con copy realista que el dueño edita inline.
 *
 * Acciones:
 *   - Agregar seccion desde plantilla (modal de seleccion)
 *   - Editar contenido inline (form por tipo)
 *   - Ocultar/mostrar (toggle visible)
 *   - Reordenar (up/down arrows · drag-and-drop seria v2)
 *   - Eliminar
 *
 * Persistencia: PUT /api/store-page/sections — guarda en TenantStorePage.
 */

import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Trash2,
  Save,
  Edit3,
  Check,
  X,
  Loader2,
  Sparkles,
  Layers,
} from "@buleje/design-system/icons";
import AdminTabShell from "../../_components/_shared/AdminTabShell";
import { ADMIN_TOKENS } from "../../_components/_shared/admin-tokens";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  SECTION_TEMPLATES,
  SECTION_TAG_STYLES,
  type Section,
  type SectionType,
  type SectionTemplate,
} from "@/lib/store-sections-types";

const TYPE_EMOJI: Record<SectionType, string> = {
  about: "📖",
  hours: "🕐",
  payment: "💳",
  "how-to-order": "🛒",
  faq: "❓",
  benefits: "✨",
  gallery: "📸",
  "image-text": "🖼️",
};

const TYPE_LABEL: Record<SectionType, string> = {
  about: "Sobre Nosotros",
  hours: "Horarios",
  payment: "Métodos de pago",
  "how-to-order": "Cómo pedir",
  faq: "Preguntas frecuentes",
  benefits: "Beneficios",
  gallery: "Galería de fotos",
  "image-text": "Imagen + texto",
};

export default function SectionsTab() {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // ── Load ────────────────────────────────────────────────────────────
  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/store-page/sections");
      if (res.ok) {
        const json = (await res.json()) as { sections: Section[] };
        setSections(Array.isArray(json.sections) ? json.sections : []);
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Save ────────────────────────────────────────────────────────────
  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/store-page/sections", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ sections }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: unknown };
        setError(typeof j.error === "string" ? j.error : "Error al guardar");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } catch {
      setError("Error de red");
    } finally {
      setSaving(false);
    }
  }

  // ── Mutations ──────────────────────────────────────────────────────
  const addSection = useCallback((tpl: SectionTemplate) => {
    const draft = tpl.create();
    const newSection = {
      ...draft,
      id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      order: sections.length,
    } as Section;
    setSections((prev) => [...prev, newSection]);
    setShowTemplates(false);
    setEditingId(newSection.id);
  }, [sections.length]);

  const removeSection = useCallback((id: string) => {
    if (!confirm("¿Eliminar esta sección? Esta acción no se puede deshacer.")) return;
    setSections((prev) => prev.filter((s) => s.id !== id).map((s, i) => ({ ...s, order: i })));
  }, []);

  const toggleVisible = useCallback((id: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s)),
    );
  }, []);

  const moveSection = useCallback((id: string, dir: -1 | 1) => {
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx === -1) return prev;
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next.map((s, i) => ({ ...s, order: i }));
    });
  }, []);

  const updateSectionData = useCallback((id: string, patch: Partial<Section["data"]>) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === id ? ({ ...s, data: { ...s.data, ...patch } } as Section) : s,
      ),
    );
  }, []);

  // ── Render ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[var(--text-tertiary)]">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <AdminTabShell
      title="Secciones de tu página pública"
      description="Arma tu /t/[slug] con bloques pre-elaborados. Agregás, editás y reordenás — todo se refleja en vivo cuando guardás."
      icon={Layers}
    >
      {/* Header con acciones */}
      <section className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] px-3 py-1.5 font-black tabular-nums">
            {sections.length} {sections.length === 1 ? "sección" : "secciones"}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] px-3 py-1.5 font-black tabular-nums">
            {sections.filter((s) => s.visible).length} visibles
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowTemplates(true)}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] text-white px-4 h-10 text-sm font-black hover:bg-[var(--accent)]/90 transition-colors shadow-md"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Añadir sección
        </button>
      </section>

      {/* Estado vacio */}
      {sections.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] p-10 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] mb-4">
            <Layers className="h-7 w-7" strokeWidth={1.75} />
          </span>
          <h3 className="text-lg font-black text-[var(--text-primary)] mb-1">
            Tu página pública aún no tiene secciones
          </h3>
          <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto mb-5">
            Agregá bloques desde las plantillas: Sobre Nosotros, Horarios, Métodos de Pago, Cómo Pedir, FAQ y más.
          </p>
          <button
            type="button"
            onClick={() => setShowTemplates(true)}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] text-white px-5 h-11 text-sm font-black hover:bg-[var(--accent)]/90 transition-colors"
          >
            <Sparkles className="w-4 h-4" strokeWidth={2.5} />
            Empezar con una plantilla
          </button>
        </div>
      )}

      {/* Lista de secciones */}
      {sections.length > 0 && (
        <div className="space-y-3">
          {sections.map((section, idx) => {
            const isEditing = editingId === section.id;
            return (
              <div
                key={section.id}
                className={`rounded-2xl border-2 bg-[var(--surface-raised)] transition-all ${
                  isEditing ? "border-[var(--accent)] shadow-lg" : "border-[var(--rule-base)]"
                } ${!section.visible ? "opacity-60" : ""}`}
              >
                {/* Header de la card */}
                <div className="flex items-center gap-3 p-4 border-b border-[var(--rule-soft)]">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-xl shrink-0">
                    {TYPE_EMOJI[section.type]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-[var(--text-primary)] truncate">
                      {TYPE_LABEL[section.type]}
                    </p>
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">
                      {(section.data as { title?: string }).title ?? ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Up/Down */}
                    <button
                      type="button"
                      onClick={() => moveSection(section.id, -1)}
                      disabled={idx === 0}
                      aria-label="Subir"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSection(section.id, 1)}
                      disabled={idx === sections.length - 1}
                      aria-label="Bajar"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    {/* Toggle visible */}
                    <button
                      type="button"
                      onClick={() => toggleVisible(section.id)}
                      aria-label={section.visible ? "Ocultar" : "Mostrar"}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      {section.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                    {/* Editar */}
                    <button
                      type="button"
                      onClick={() => setEditingId(isEditing ? null : section.id)}
                      aria-label={isEditing ? "Cerrar editor" : "Editar"}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                        isEditing
                          ? "bg-[var(--accent)] text-white"
                          : "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      {isEditing ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <Edit3 className="h-4 w-4" />}
                    </button>
                    {/* Eliminar */}
                    <button
                      type="button"
                      onClick={() => removeSection(section.id)}
                      aria-label="Eliminar"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--data-error-500)] hover:bg-[var(--data-error-50,#fef2f2)] transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Editor inline */}
                {isEditing && (
                  <div className="p-5">
                    <SectionEditor
                      section={section}
                      onChange={(patch) => updateSectionData(section.id, patch)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Sticky Save bar */}
      <div className="sticky bottom-4 flex items-center justify-end gap-3 p-4 rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-base)] shadow-lg">
        {error && <span className="text-sm text-[var(--data-error-500)]">{error}</span>}
        {saved && <span className="text-sm text-[var(--data-success-500)] font-semibold">Guardado · refrescá /t/[slug] para verlo</span>}
        <button
          onClick={save}
          disabled={saving}
          className={ADMIN_TOKENS.btnPrimary}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar y publicar
        </button>
      </div>

      {/* Modal de templates */}
      {showTemplates && (
        <TemplatesModal
          onClose={() => setShowTemplates(false)}
          onPick={addSection}
        />
      )}
    </AdminTabShell>
  );
}

// ─── Modal de plantillas ──────────────────────────────────────────────
function TemplatesModal({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (tpl: SectionTemplate) => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Elegí una plantilla"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-base)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 px-6 py-4 border-b border-[var(--rule-soft)]">
          <div>
            <p className="text-[length:var(--ts-2xs)] font-black uppercase tracking-wider text-[var(--accent)]">
              Galería de plantillas
            </p>
            <h2 className="text-xl font-black text-[var(--text-primary)] tracking-tight">
              Elegí una sección para agregar
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SECTION_TEMPLATES.map((tpl) => (
            <button
              key={tpl.type}
              type="button"
              onClick={() => onPick(tpl)}
              className="group text-left rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5 hover:border-[var(--accent)] hover:-translate-y-0.5 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <span className="text-2xl">{tpl.emoji}</span>
                <span className={`text-[length:var(--ts-2xs)] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${SECTION_TAG_STYLES[tpl.tag]}`}>
                  {tpl.tag}
                </span>
              </div>
              <p className="font-black text-base text-[var(--text-primary)] leading-tight">
                {tpl.label}
              </p>
              <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-snug">
                {tpl.description}
              </p>
              <p className="mt-3 text-[length:var(--ts-2xs)] font-black uppercase tracking-wider text-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity">
                Agregar →
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Editor inline por tipo ───────────────────────────────────────────
function SectionEditor({
  section,
  onChange,
}: {
  section: Section;
  onChange: (patch: Partial<Section["data"]>) => void;
}) {
  const inputCls = "w-full px-3 h-10 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] transition";
  const textareaCls = inputCls + " py-2 h-auto resize-y";

  if (section.type === "about") {
    const data = section.data;
    return (
      <div className="space-y-3">
        <FieldLabel label="Título">
          <input value={data.title} onChange={(e) => onChange({ title: e.target.value })} className={inputCls} />
        </FieldLabel>
        <FieldLabel label="Texto">
          <textarea rows={5} value={data.body} onChange={(e) => onChange({ body: e.target.value })} className={textareaCls} />
        </FieldLabel>
        <FieldLabel label="Imagen URL (opcional)">
          <input type="url" value={data.imageUrl ?? ""} onChange={(e) => onChange({ imageUrl: e.target.value })} placeholder="https://..." className={inputCls} />
        </FieldLabel>
      </div>
    );
  }

  if (section.type === "hours") {
    const data = section.data;
    return (
      <div className="space-y-3">
        <FieldLabel label="Título">
          <input value={data.title} onChange={(e) => onChange({ title: e.target.value })} className={inputCls} />
        </FieldLabel>
        <FieldLabel label="Nota (opcional)">
          <input value={data.note ?? ""} onChange={(e) => onChange({ note: e.target.value })} className={inputCls} />
        </FieldLabel>
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-[var(--text-secondary)] mb-1.5">Horarios por día</p>
          {data.schedule.map((row, i) => (
            <div key={row.day} className="flex items-center gap-2 p-2 rounded-lg bg-[var(--surface-sunken)]/50">
              <span className="text-xs font-black uppercase w-10 shrink-0">{row.day}</span>
              <label className="inline-flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={row.open}
                  onChange={(e) => {
                    const newSch = [...data.schedule];
                    newSch[i] = { ...row, open: e.target.checked };
                    onChange({ schedule: newSch });
                  }}
                />
                Abierto
              </label>
              <input
                type="time"
                value={row.from ?? ""}
                disabled={!row.open}
                onChange={(e) => {
                  const newSch = [...data.schedule];
                  newSch[i] = { ...row, from: e.target.value };
                  onChange({ schedule: newSch });
                }}
                className={inputCls + " w-28"}
              />
              <span className="text-xs text-[var(--text-tertiary)]">a</span>
              <input
                type="time"
                value={row.to ?? ""}
                disabled={!row.open}
                onChange={(e) => {
                  const newSch = [...data.schedule];
                  newSch[i] = { ...row, to: e.target.value };
                  onChange({ schedule: newSch });
                }}
                className={inputCls + " w-28"}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (section.type === "payment") {
    const data = section.data;
    return (
      <div className="space-y-3">
        <FieldLabel label="Título">
          <input value={data.title} onChange={(e) => onChange({ title: e.target.value })} className={inputCls} />
        </FieldLabel>
        <FieldLabel label="Subtítulo">
          <input value={data.subtitle ?? ""} onChange={(e) => onChange({ subtitle: e.target.value })} className={inputCls} />
        </FieldLabel>
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-[var(--text-secondary)] mb-1.5">Métodos aceptados</p>
          {data.methods.map((m, i) => (
            <label key={m.id} className="flex items-center justify-between gap-2 p-3 rounded-lg bg-[var(--surface-sunken)]/50 cursor-pointer">
              <span className="text-sm font-bold">{m.label}</span>
              <input
                type="checkbox"
                checked={m.enabled}
                onChange={(e) => {
                  const newMethods = [...data.methods];
                  newMethods[i] = { ...m, enabled: e.target.checked };
                  onChange({ methods: newMethods });
                }}
              />
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (section.type === "how-to-order") {
    const data = section.data;
    return (
      <div className="space-y-3">
        <FieldLabel label="Título">
          <input value={data.title} onChange={(e) => onChange({ title: e.target.value })} className={inputCls} />
        </FieldLabel>
        <FieldLabel label="Subtítulo">
          <input value={data.subtitle ?? ""} onChange={(e) => onChange({ subtitle: e.target.value })} className={inputCls} />
        </FieldLabel>
        <div className="space-y-2">
          <p className="text-xs font-bold text-[var(--text-secondary)]">Pasos</p>
          {data.steps.map((step, i) => (
            <div key={i} className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)]/50 p-3 space-y-2">
              <p className="text-xs font-black text-[var(--accent)]">Paso {i + 1}</p>
              <input
                value={step.title}
                placeholder="Título del paso"
                onChange={(e) => {
                  const newSteps = [...data.steps];
                  newSteps[i] = { ...step, title: e.target.value };
                  onChange({ steps: newSteps });
                }}
                className={inputCls}
              />
              <textarea
                rows={2}
                value={step.description}
                placeholder="Descripción corta"
                onChange={(e) => {
                  const newSteps = [...data.steps];
                  newSteps[i] = { ...step, description: e.target.value };
                  onChange({ steps: newSteps });
                }}
                className={textareaCls}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (section.type === "faq") {
    const data = section.data;
    return (
      <div className="space-y-3">
        <FieldLabel label="Título">
          <input value={data.title} onChange={(e) => onChange({ title: e.target.value })} className={inputCls} />
        </FieldLabel>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-[var(--text-secondary)]">Preguntas y respuestas</p>
            <button
              type="button"
              onClick={() => onChange({ items: [...data.items, { question: "", answer: "" }] })}
              className="text-xs font-black text-[var(--accent)] hover:underline"
            >
              + Agregar pregunta
            </button>
          </div>
          {data.items.map((item, i) => (
            <div key={i} className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)]/50 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-black text-[var(--accent)]">Pregunta {i + 1}</p>
                <button
                  type="button"
                  onClick={() => onChange({ items: data.items.filter((_, k) => k !== i) })}
                  className="text-xs text-[var(--data-error-500)] hover:underline"
                >
                  Eliminar
                </button>
              </div>
              <input
                value={item.question}
                placeholder="Pregunta"
                onChange={(e) => {
                  const newItems = [...data.items];
                  newItems[i] = { ...item, question: e.target.value };
                  onChange({ items: newItems });
                }}
                className={inputCls}
              />
              <textarea
                rows={2}
                value={item.answer}
                placeholder="Respuesta"
                onChange={(e) => {
                  const newItems = [...data.items];
                  newItems[i] = { ...item, answer: e.target.value };
                  onChange({ items: newItems });
                }}
                className={textareaCls}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (section.type === "gallery") {
    const data = section.data;
    const addImage = () => onChange({ images: [...data.images, { url: "", alt: "" }] });
    const removeImage = (i: number) => onChange({ images: data.images.filter((_, k) => k !== i) });
    return (
      <div className="space-y-3">
        <FieldLabel label="Título">
          <input value={data.title} onChange={(e) => onChange({ title: e.target.value })} className={inputCls} />
        </FieldLabel>
        <FieldLabel label="Subtítulo (opcional)">
          <input value={data.subtitle ?? ""} onChange={(e) => onChange({ subtitle: e.target.value })} className={inputCls} />
        </FieldLabel>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-[var(--text-secondary)]">Imágenes (URL · sube a Imgur, Vercel Blob o S3)</p>
            <button type="button" onClick={addImage} className="text-xs font-black text-[var(--accent)] hover:underline">
              + Agregar foto
            </button>
          </div>
          {data.images.map((img, i) => (
            <div key={i} className="flex gap-2 p-3 rounded-lg bg-[var(--surface-sunken)]/50 items-start">
              {/* Mini preview */}
              <div className="w-16 h-16 rounded-lg bg-[var(--surface-canvas)] border border-[var(--rule-base)] overflow-hidden shrink-0">
                {img.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[var(--text-tertiary)] text-[length:var(--ts-2xs)] font-bold">
                    Foto {i + 1}
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2 min-w-0">
                <input
                  type="url"
                  placeholder="https://imgur.com/abc.jpg"
                  value={img.url}
                  onChange={(e) => {
                    const newImages = [...data.images];
                    newImages[i] = { ...img, url: e.target.value };
                    onChange({ images: newImages });
                  }}
                  className={inputCls}
                />
                <input
                  placeholder="Descripción (alt + caption)"
                  value={img.alt ?? ""}
                  onChange={(e) => {
                    const newImages = [...data.images];
                    newImages[i] = { ...img, alt: e.target.value };
                    onChange({ images: newImages });
                  }}
                  className={inputCls}
                />
              </div>
              <button
                type="button"
                onClick={() => removeImage(i)}
                aria-label="Eliminar imagen"
                className="text-[var(--data-error-500)] hover:bg-[var(--data-error-50,#fef2f2)] inline-flex h-9 w-9 items-center justify-center rounded-md shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (section.type === "image-text") {
    const data = section.data;
    return (
      <div className="space-y-3">
        <FieldLabel label="Título">
          <input value={data.title} onChange={(e) => onChange({ title: e.target.value })} className={inputCls} />
        </FieldLabel>
        <FieldLabel label="Texto">
          <textarea rows={5} value={data.body} onChange={(e) => onChange({ body: e.target.value })} className={textareaCls} />
        </FieldLabel>
        <FieldLabel label="URL de la imagen">
          <div className="flex gap-2 items-start">
            <div className="w-20 h-20 rounded-lg bg-[var(--surface-canvas)] border border-[var(--rule-base)] overflow-hidden shrink-0">
              {data.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.imageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[var(--text-tertiary)] text-[length:var(--ts-2xs)] font-bold">
                  Preview
                </div>
              )}
            </div>
            <input
              type="url"
              placeholder="https://..."
              value={data.imageUrl}
              onChange={(e) => onChange({ imageUrl: e.target.value })}
              className={inputCls + " flex-1"}
            />
          </div>
        </FieldLabel>
        <FieldLabel label="Texto alternativo (alt)">
          <input value={data.imageAlt ?? ""} onChange={(e) => onChange({ imageAlt: e.target.value })} className={inputCls} />
        </FieldLabel>
        <div>
          <p className="text-xs font-bold text-[var(--text-secondary)] mb-1.5">Posición de la imagen</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onChange({ imagePosition: "left" })}
              className={`flex-1 rounded-lg border-2 px-3 h-10 text-xs font-black transition-all ${
                data.imagePosition === "left"
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--rule-base)] text-[var(--text-secondary)]"
              }`}
            >
              ← Imagen a la izquierda
            </button>
            <button
              type="button"
              onClick={() => onChange({ imagePosition: "right" })}
              className={`flex-1 rounded-lg border-2 px-3 h-10 text-xs font-black transition-all ${
                data.imagePosition === "right"
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--rule-base)] text-[var(--text-secondary)]"
              }`}
            >
              Imagen a la derecha →
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FieldLabel label="Texto del botón (opcional)">
            <input value={data.ctaLabel ?? ""} onChange={(e) => onChange({ ctaLabel: e.target.value })} placeholder="Conocenos más" className={inputCls} />
          </FieldLabel>
          <FieldLabel label="URL del botón">
            <input value={data.ctaUrl ?? ""} onChange={(e) => onChange({ ctaUrl: e.target.value })} placeholder="/tienda" className={inputCls} />
          </FieldLabel>
        </div>
      </div>
    );
  }

  if (section.type === "benefits") {
    const data = section.data;
    const iconOptions: Array<typeof data.items[number]["icon"]> = ["truck", "shield", "clock", "tag", "heart", "sparkles"];
    return (
      <div className="space-y-3">
        <FieldLabel label="Título">
          <input value={data.title} onChange={(e) => onChange({ title: e.target.value })} className={inputCls} />
        </FieldLabel>
        <div className="space-y-2">
          <p className="text-xs font-bold text-[var(--text-secondary)]">Beneficios</p>
          {data.items.map((item, i) => (
            <div key={i} className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)]/50 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={item.icon}
                  onChange={(e) => {
                    const newItems = [...data.items];
                    newItems[i] = { ...item, icon: e.target.value as typeof item.icon };
                    onChange({ items: newItems });
                  }}
                  className={inputCls + " w-32"}
                >
                  {iconOptions.map((ico) => (
                    <option key={ico} value={ico}>{ico}</option>
                  ))}
                </select>
                <input
                  value={item.title}
                  placeholder="Título"
                  onChange={(e) => {
                    const newItems = [...data.items];
                    newItems[i] = { ...item, title: e.target.value };
                    onChange({ items: newItems });
                  }}
                  className={inputCls + " flex-1"}
                />
              </div>
              <textarea
                rows={2}
                value={item.description}
                placeholder="Descripción corta"
                onChange={(e) => {
                  const newItems = [...data.items];
                  newItems[i] = { ...item, description: e.target.value };
                  onChange({ items: newItems });
                }}
                className={textareaCls}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <p className="text-sm text-[var(--text-tertiary)]">Editor no disponible para este tipo.</p>;
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">{label}</span>
      {children}
    </label>
  );
}
