"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { z } from "zod";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Plus, Trash2, ChevronDown, ChevronRight, Image as ImageIcon, Save, X,
  Loader2, Upload, Camera, Check, AlertTriangle, Sparkles,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/superadmin/_shared/useConfirm";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const OptionSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  priceDelta: z.number(),
  position: z.number(),
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
  position: z.number(),
  isPublished: z.boolean(),
  options: z.array(OptionSchema),
});

const ListResponseSchema = z.object({ templates: z.array(TemplateSchema) });

type Template = z.infer<typeof TemplateSchema>;
type Option = z.infer<typeof OptionSchema>;

// ─── Quick presets para "Nueva plantilla" ─────────────────────────────────────
// Click en preset → llena el form con valores típicos de ese tipo de negocio.

interface TemplatePreset {
  id: string;
  category: string;
  name: string;
  description: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  exampleOptions: string;
}

const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: "polleria-cremas",
    category: "Pollería",
    name: "Cremas",
    description: "Cremas de la casa para acompañar el pollo",
    required: false,
    minSelect: 0,
    maxSelect: 4,
    exampleOptions: "Mayonesa, Ají amarillo, Mostaza, Salsa BBQ",
  },
  {
    id: "polleria-presa",
    category: "Pollería",
    name: "Presa",
    description: "Elegí la presa de tu preferencia",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    exampleOptions: "Pierna, Pecho, Encuentro, Mixto",
  },
  {
    id: "pizzeria-tamano",
    category: "Pizzería",
    name: "Tamaño",
    description: "Tamaño de la pizza",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    exampleOptions: "Personal, Mediana, Familiar, Súper",
  },
  {
    id: "pizzeria-extras",
    category: "Pizzería",
    name: "Extras",
    description: "Toppings adicionales",
    required: false,
    minSelect: 0,
    maxSelect: 6,
    exampleOptions: "Queso extra, Tocino, Champiñones, Aceitunas",
  },
  {
    id: "heladeria-toppings",
    category: "Heladería",
    name: "Toppings",
    description: "Decora tu helado",
    required: false,
    minSelect: 0,
    maxSelect: 5,
    exampleOptions: "Chispas, Sirope chocolate, Frutas, Maní",
  },
  {
    id: "ropa-talla",
    category: "Ropa",
    name: "Talla",
    description: "Talla del producto",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    exampleOptions: "S, M, L, XL, XXL",
  },
  {
    id: "ropa-color",
    category: "Ropa",
    name: "Color",
    description: "Color disponible",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    exampleOptions: "Negro, Blanco, Rojo, Azul",
  },
  {
    id: "bebidas-tamano",
    category: "Bebidas",
    name: "Tamaño",
    description: "Tamaño del envase",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    exampleOptions: "200ml, 500ml, 1L, 2L",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function VariantCatalogClient() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showNewTemplate, setShowNewTemplate] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/superadmin/variant-catalog");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const parsed = ListResponseSchema.safeParse(data);
      if (!parsed.success) throw new Error("Respuesta inválida");
      setTemplates(parsed.data.templates);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const grouped = templates.reduce<Record<string, Template[]>>((acc, t) => {
    (acc[t.category] ??= []).push(t);
    return acc;
  }, {});

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-[var(--text-secondary)]">
          {loading ? "Cargando..." : `${templates.length} plantillas en ${Object.keys(grouped).length} categorías`}
        </p>
        <button
          onClick={() => setShowNewTemplate(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary/90 transition-colors min-h-[44px]"
        >
          <Plus className="h-4 w-4" />
          Nueva plantilla
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/5 p-3 text-sm text-[var(--data-error-500)]">
          {error}
        </div>
      )}

      <NewTemplateModal
        open={showNewTemplate}
        onOpenChange={setShowNewTemplate}
        onSaved={() => { setShowNewTemplate(false); reload(); }}
      />

      {/* Lista por categoría */}
      {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([category, list]) => (
        <section key={category} className="space-y-2">
          <h2 className="text-xs uppercase tracking-widest font-bold text-[var(--text-tertiary)]">
            {category}
          </h2>
          <div className="space-y-2">
            {list.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                expanded={expandedIds.has(t.id)}
                onToggle={() => toggleExpanded(t.id)}
                onChanged={reload}
              />
            ))}
          </div>
        </section>
      ))}

      {!loading && templates.length === 0 && !showNewTemplate && (
        <div className="rounded-xl border border-dashed border-[var(--rule-base)] p-10 text-center">
          <ImageIcon className="w-8 h-8 text-[var(--text-tertiary)] mx-auto mb-3" />
          <p className="text-sm text-[var(--text-secondary)] font-medium">
            Aún no hay plantillas. Crea la primera para que los tenants puedan importarla.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── ImageDropzone — reusable, drag & drop + click + URL paste ───────────────

interface ImageDropzoneProps {
  value: string;
  onChange: (url: string) => void;
  folder?: string;
}

function ImageDropzone({ value, onChange, folder = "variant-catalog" }: ImageDropzoneProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadInfo, setUploadInfo] = useState<{ savedPct: number; size: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    setUploadInfo(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", folder);
      fd.append("mode", "square");
      const res = await fetch("/api/superadmin/upload", {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({}),
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { url: string; savedPct: number; size: number };
      onChange(data.url);
      setUploadInfo({ savedPct: data.savedPct, size: data.size });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Error subiendo imagen");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
        onClick={() => !uploading && fileRef.current?.click()}
        className={cn(
          "relative rounded-xl border-2 border-dashed p-4 cursor-pointer transition-all",
          dragOver
            ? "border-primary bg-primary/10"
            : value
              ? "border-[var(--rule-base)] bg-[var(--surface-canvas)]"
              : "border-[var(--rule-base)] bg-[var(--surface-sunken)] hover:border-primary/40 hover:bg-primary/5",
          uploading && "opacity-60 cursor-wait"
        )}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
        {value ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="h-20 w-20 rounded-lg overflow-hidden border border-[var(--rule-soft)] bg-[var(--surface-sunken)] shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={value} alt="preview" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-[180px]">
              <p className="text-xs text-[var(--text-secondary)] truncate font-mono">{value}</p>
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-1">
                Click o arrastrá otra imagen para reemplazar
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(""); setUploadInfo(null); }}
              className="text-xs font-semibold text-[var(--data-error-500)] hover:underline"
            >
              Quitar
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            {uploading ? (
              <>
                <Loader2 className="h-8 w-8 text-primary animate-spin mb-2" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">Subiendo y optimizando…</p>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-[var(--text-tertiary)] mb-2" />
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Arrastrá una imagen aquí
                </p>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">
                  o <span className="text-primary font-bold underline">click para buscar en tu computadora</span>
                </p>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-2">
                  JPG · PNG · WebP — máx 8 MB. Se optimiza a WebP 800x800 automáticamente.
                </p>
              </>
            )}
          </div>
        )}
      </div>
      {uploadInfo && (
        <p className="text-[length:var(--ts-2xs)] text-[var(--data-success-500)] flex items-center gap-1.5">
          <Check className="h-3 w-3" />
          Optimizada: {(uploadInfo.size / 1024).toFixed(0)} KB · {uploadInfo.savedPct}% más liviana que el original.
        </p>
      )}
      {uploadError && (
        <p className="text-[length:var(--ts-2xs)] text-[var(--data-error-500)] flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3" />
          {uploadError}
        </p>
      )}
      {/* URL externa como alternativa */}
      <details className="text-xs">
        <summary className="text-[var(--text-tertiary)] cursor-pointer hover:text-[var(--text-secondary)]">
          o pegar URL externa
        </summary>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://cdn.tu-cdn.com/imagen.jpg"
          className="w-full mt-2 px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm outline-none focus:border-primary"
        />
      </details>
    </div>
  );
}

// ─── New template MODAL — Radix Dialog with presets ──────────────────────────

function NewTemplateModal({
  open, onOpenChange, onSaved,
}: { open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [step, setStep] = useState<"preset" | "form">("preset");
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [required, setRequired] = useState(false);
  const [minSelect, setMinSelect] = useState(0);
  const [maxSelect, setMaxSelect] = useState(1);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setStep("preset");
      setCategory(""); setName(""); setDescription("");
      setRequired(false); setMinSelect(0); setMaxSelect(1);
      setErr(null); setSaving(false);
    }
  }, [open]);

  const applyPreset = (p: TemplatePreset) => {
    setCategory(p.category);
    setName(p.name);
    setDescription(p.description);
    setRequired(p.required);
    setMinSelect(p.minSelect);
    setMaxSelect(p.maxSelect);
    setStep("form");
  };

  const startBlank = () => {
    setCategory(""); setName(""); setDescription("");
    setRequired(false); setMinSelect(0); setMaxSelect(1);
    setStep("form");
  };

  const submit = async () => {
    if (!category.trim() || !name.trim()) {
      setErr("Categoría y nombre son obligatorios");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/superadmin/variant-catalog", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          category: category.trim(),
          name: name.trim(),
          description: description.trim() || null,
          required, minSelect, maxSelect,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-2xl">
          <div className="sticky top-0 z-10 bg-[var(--surface-raised)] border-b border-[var(--rule-soft)] px-6 py-4 flex items-center justify-between">
            <div>
              <Dialog.Title className="text-base font-extrabold text-[var(--text-primary)]">
                {step === "preset" ? "Nueva plantilla de variantes" : "Configurar plantilla"}
              </Dialog.Title>
              <Dialog.Description className="text-xs text-[var(--text-tertiary)] mt-0.5">
                {step === "preset"
                  ? "Empezá desde un preset común o creá una en blanco"
                  : `${category}${name ? ` · ${name}` : ""}`}
              </Dialog.Description>
            </div>
            <Dialog.Close className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors">
              <X className="h-4 w-4 text-[var(--text-tertiary)]" />
            </Dialog.Close>
          </div>

          {step === "preset" ? (
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {TEMPLATE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p)}
                    className="text-left p-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-primary hover:bg-primary/5 transition-all"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                        {p.category}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-[var(--text-primary)]">{p.name}</p>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-snug">{p.description}</p>
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-1.5 italic">
                      Ej: {p.exampleOptions}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      {p.required && (
                        <span className="text-[length:var(--ts-2xs)] font-bold uppercase px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                          Obligatorio
                        </span>
                      )}
                      <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                        {p.minSelect}–{p.maxSelect} {p.maxSelect === 1 ? "selección" : "selecciones"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <span className="flex-1 h-px bg-[var(--rule-soft)]" />
                <span className="text-[length:var(--ts-2xs)] uppercase tracking-wider font-bold text-[var(--text-tertiary)]">o</span>
                <span className="flex-1 h-px bg-[var(--rule-soft)]" />
              </div>

              <button
                onClick={startBlank}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-[var(--text-primary)] border-2 border-dashed border-[var(--rule-base)] hover:border-primary hover:bg-primary/5 transition-all"
              >
                <Plus className="h-4 w-4" />
                Crear plantilla en blanco
              </button>
            </div>
          ) : (
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Categoría *" hint="Tipo de negocio">
                  <input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Pollería, Pizzería, Heladería…"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </Field>
                <Field label="Nombre *" hint="Lo que verá el dueño al importar">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Cremas, Presas, Tamaño…"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </Field>
              </div>

              <Field label="Descripción" hint="Texto que ve el cliente al elegir (opcional)">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Cremas de la casa para acompañar el pollo"
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
                />
              </Field>

              <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Reglas de selección
                </p>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={required}
                    onChange={(e) => setRequired(e.target.checked)}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="text-sm font-semibold text-[var(--text-primary)]">Obligatorio</span>
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] leading-snug">
                      El cliente DEBE elegir al menos una opción para agregar al carrito.
                    </p>
                  </div>
                </label>
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[var(--rule-soft)]">
                  <Field label="Mínimo" hint={required ? "Mín 1" : "0 = opcional"}>
                    <input
                      type="number" min={0} max={20}
                      value={minSelect}
                      onChange={(e) => setMinSelect(Number(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm tabular-nums outline-none focus:border-primary"
                    />
                  </Field>
                  <Field label="Máximo" hint="1 = single, 2+ = multi">
                    <input
                      type="number" min={1} max={20}
                      value={maxSelect}
                      onChange={(e) => setMaxSelect(Number(e.target.value) || 1)}
                      className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm tabular-nums outline-none focus:border-primary"
                    />
                  </Field>
                </div>
              </div>

              {err && (
                <p className="text-xs text-[var(--data-error-500)] flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3" /> {err}
                </p>
              )}

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--rule-soft)] -mx-6 px-6 -mb-2 pb-4">
                <button
                  onClick={() => setStep("preset")}
                  className="text-sm font-semibold text-[var(--text-secondary)] hover:text-primary"
                >
                  ← Cambiar preset
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => onOpenChange(false)}
                    className="px-4 py-2 rounded-xl text-sm font-medium text-[var(--text-secondary)] border border-[var(--rule-base)] hover:bg-[var(--surface-sunken)] transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={submit}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Crear plantilla
                  </button>
                </div>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── Template card (collapsed/expanded) ───────────────────────────────────────

function TemplateCard({
  template, expanded, onToggle, onChanged,
}: {
  template: Template; expanded: boolean; onToggle: () => void; onChanged: () => void;
}) {
  const [optionModal, setOptionModal] = useState<{ mode: "new" } | { mode: "edit"; option: Option } | null>(null);
  const { confirm, confirmModal } = useConfirm();

  const deleteTemplate = async () => {
    const ok = await confirm({
      title: "Eliminar plantilla",
      message: `Se eliminará "${template.name}" y sus ${template.options.length} ${template.options.length === 1 ? "opción" : "opciones"}. No se puede deshacer.`,
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/superadmin/variant-catalog/${template.id}`, {
      method: "DELETE",
      headers: csrfHeaders(),
    });
    if (res.ok) onChanged();
  };

  const togglePublished = async () => {
    await fetch(`/api/superadmin/variant-catalog/${template.id}`, {
      method: "PATCH",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ isPublished: !template.isPublished }),
    });
    onChanged();
  };

  return (
    <>
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
        <div className="flex items-center gap-3 p-4">
          <button onClick={onToggle} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">{template.name}</h3>
              <span className="text-xs text-[var(--text-tertiary)]">
                {template.options.length} {template.options.length === 1 ? "opción" : "opciones"}
              </span>
              {template.required && (
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                  Obligatorio
                </span>
              )}
              {!template.isPublished && (
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
                  Borrador
                </span>
              )}
            </div>
            {template.description && (
              <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">{template.description}</p>
            )}
          </div>
          <button
            onClick={togglePublished}
            className="text-xs font-semibold text-[var(--text-secondary)] hover:text-primary transition-colors"
          >
            {template.isPublished ? "Despublicar" : "Publicar"}
          </button>
          <button
            onClick={deleteTemplate}
            className="p-1.5 rounded text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-500)]/5 transition-colors"
            title="Eliminar plantilla"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {expanded && (
          <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]/30 p-4 space-y-3">
            {template.options.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {template.options.map((opt) => (
                  <OptionCard
                    key={opt.id}
                    option={opt}
                    onEdit={() => setOptionModal({ mode: "edit", option: opt })}
                    onChanged={onChanged}
                  />
                ))}
              </div>
            )}

            <button
              onClick={() => setOptionModal({ mode: "new" })}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-primary border border-dashed border-primary/40 hover:bg-primary/5 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Añadir opción
            </button>
          </div>
        )}
      </div>

      <OptionModal
        open={optionModal !== null}
        onOpenChange={(o) => { if (!o) setOptionModal(null); }}
        templateId={template.id}
        templateName={template.name}
        editing={optionModal?.mode === "edit" ? optionModal.option : null}
        onSaved={() => { setOptionModal(null); onChanged(); }}
      />
      {confirmModal}
    </>
  );
}

// ─── Option card ──────────────────────────────────────────────────────────────

function OptionCard({ option, onEdit, onChanged }: { option: Option; onEdit: () => void; onChanged: () => void }) {
  const { confirm, confirmModal } = useConfirm();

  const remove = async () => {
    const ok = await confirm({
      title: "Eliminar opción",
      message: `Se eliminará la opción "${option.name}". No se puede deshacer.`,
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/superadmin/variant-catalog/options/${option.id}`, {
      method: "DELETE",
      headers: csrfHeaders(),
    });
    if (res.ok) onChanged();
  };

  return (
    <>
    <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3">
      <div className="flex items-start gap-3">
        <div className={cn(
          "h-14 w-14 rounded-lg shrink-0 overflow-hidden border border-[var(--rule-soft)]",
          option.imageUrl ? "" : "bg-[var(--surface-sunken)] flex items-center justify-center",
        )}>
          {option.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={option.imageUrl} alt={option.name} className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="h-5 w-5 text-[var(--text-tertiary)]" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{option.name}</p>
          {option.priceDelta !== 0 && (
            <p className="text-xs font-mono text-[var(--text-secondary)]">
              {option.priceDelta > 0 ? "+" : ""}S/ {Number(option.priceDelta).toFixed(2)}
            </p>
          )}
          {option.isDefault && (
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--data-success-500)]">
              Por defecto
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <button onClick={onEdit} className="text-xs text-primary font-semibold hover:underline">
            Editar
          </button>
          <button onClick={remove} className="text-xs text-[var(--data-error-500)] font-semibold hover:underline">
            Borrar
          </button>
        </div>
      </div>
    </div>
    {confirmModal}
    </>
  );
}

// ─── Option MODAL — usa Radix Dialog + ImageDropzone ─────────────────────────

function OptionModal({
  open, onOpenChange, templateId, templateName, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  templateId: string;
  templateName: string;
  editing: Option | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [priceDelta, setPriceDelta] = useState(0);
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setImageUrl(editing?.imageUrl ?? "");
      setPriceDelta(editing?.priceDelta ?? 0);
      setIsDefault(editing?.isDefault ?? false);
      setErr(null); setSaving(false);
    }
  }, [open, editing]);

  const submit = async () => {
    if (!name.trim()) {
      setErr("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const body = {
        name: name.trim(),
        imageUrl: imageUrl.trim() || null,
        priceDelta,
        isDefault,
      };
      const url = editing
        ? `/api/superadmin/variant-catalog/options/${editing.id}`
        : `/api/superadmin/variant-catalog/${templateId}/options`;
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string; issues?: { message: string }[] };
        const issuesMsg = data.issues?.map((i) => i.message).join(", ");
        throw new Error(data.error ?? issuesMsg ?? `HTTP ${res.status}`);
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[95vw] max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-2xl">
          <div className="sticky top-0 z-10 bg-[var(--surface-raised)] border-b border-[var(--rule-soft)] px-6 py-4 flex items-center justify-between">
            <div>
              <Dialog.Title className="text-base font-extrabold text-[var(--text-primary)]">
                {editing ? "Editar opción" : "Nueva opción"}
              </Dialog.Title>
              <Dialog.Description className="text-xs text-[var(--text-tertiary)] mt-0.5">
                Plantilla: <span className="font-bold">{templateName}</span>
              </Dialog.Description>
            </div>
            <Dialog.Close className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors">
              <X className="h-4 w-4 text-[var(--text-tertiary)]" />
            </Dialog.Close>
          </div>

          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Nombre *" hint="Lo que verá el cliente">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Crema huancaína"
                  autoFocus
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </Field>
              <Field label="Delta de precio (S/)" hint="0 si no afecta">
                <input
                  type="number"
                  step="0.10"
                  value={priceDelta}
                  onChange={(e) => setPriceDelta(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm tabular-nums outline-none focus:border-primary"
                />
              </Field>
            </div>

            <Field label="Imagen" hint="Arrastrá un archivo, hacé click para buscarlo, o pegá una URL externa">
              <ImageDropzone value={imageUrl} onChange={setImageUrl} folder="variant-catalog" />
            </Field>

            <label className="flex items-start gap-2 p-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] cursor-pointer hover:border-primary/40">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="mt-0.5"
              />
              <div>
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  Marcar como opción por defecto
                </span>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] leading-snug">
                  Aparece pre-seleccionada cuando el cliente abre el producto.
                </p>
              </div>
            </label>

            {err && (
              <p className="text-xs text-[var(--data-error-500)] flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3" /> {err}
              </p>
            )}
          </div>

          <div className="sticky bottom-0 bg-[var(--surface-raised)] border-t border-[var(--rule-soft)] px-6 py-4 flex justify-end gap-2">
            <button
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-[var(--text-secondary)] border border-[var(--rule-base)] hover:bg-[var(--surface-sunken)] transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={submit}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editing ? "Guardar cambios" : "Crear opción"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── Reusable field ───────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
        {label}
      </span>
      {children}
      {hint && <span className="block text-xs text-[var(--text-tertiary)] mt-1">{hint}</span>}
    </label>
  );
}

// Camera/Upload icons re-exported via lucide-react to avoid TS "imported but unused" warnings
void Camera; void ChevronRight;
