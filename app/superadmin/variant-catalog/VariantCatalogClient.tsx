"use client";

import { useState, useEffect, useCallback } from "react";
import { z } from "zod";
import { Plus, Trash2, ChevronDown, ChevronRight, Image as ImageIcon, Save, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
        <div className="rounded-xl border border-[var(--data-error)]/40 bg-[var(--data-error)]/5 p-3 text-sm text-[var(--data-error)]">
          {error}
        </div>
      )}

      {showNewTemplate && (
        <NewTemplateForm
          onSaved={() => { setShowNewTemplate(false); reload(); }}
          onCancel={() => setShowNewTemplate(false)}
        />
      )}

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

// ─── New template form ────────────────────────────────────────────────────────

function NewTemplateForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [required, setRequired] = useState(false);
  const [minSelect, setMinSelect] = useState(0);
  const [maxSelect, setMaxSelect] = useState(1);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: category.trim(),
          name: name.trim(),
          description: description.trim() || null,
          required,
          minSelect,
          maxSelect,
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
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">Nueva plantilla</h3>
        <button onClick={onCancel} className="p-1 rounded hover:bg-[var(--surface-sunken)]">
          <X className="h-4 w-4 text-[var(--text-tertiary)]" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Categoría" hint="Ej: Pollería, Pizzería, Heladería">
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Pollería"
            className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </Field>
        <Field label="Nombre" hint="Ej: Cremas para pollo, Presas, Toppings">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Cremas para pollo"
            className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </Field>
      </div>

      <Field label="Descripción (opcional)">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Información que ve el cliente al elegir"
          className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none"
        />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          <span>Obligatorio</span>
        </label>
        <Field label="Mín. selección">
          <input
            type="number"
            min={0}
            max={20}
            value={minSelect}
            onChange={(e) => setMinSelect(Number(e.target.value) || 0)}
            className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm tabular-nums outline-none focus:border-primary"
          />
        </Field>
        <Field label="Máx. selección">
          <input
            type="number"
            min={1}
            max={20}
            value={maxSelect}
            onChange={(e) => setMaxSelect(Number(e.target.value) || 1)}
            className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm tabular-nums outline-none focus:border-primary"
          />
        </Field>
      </div>

      {err && <p className="text-xs text-[var(--data-error)]">{err}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-sm font-medium text-[var(--text-secondary)] border border-[var(--rule-base)] hover:bg-[var(--surface-sunken)] transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={submit}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Crear
        </button>
      </div>
    </div>
  );
}

// ─── Template card (collapsed/expanded) ───────────────────────────────────────

function TemplateCard({
  template,
  expanded,
  onToggle,
  onChanged,
}: {
  template: Template;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const [showAddOption, setShowAddOption] = useState(false);

  const deleteTemplate = async () => {
    if (!confirm(`¿Eliminar plantilla "${template.name}" y todas sus ${template.options.length} opciones?`)) return;
    const res = await fetch(`/api/superadmin/variant-catalog/${template.id}`, { method: "DELETE" });
    if (res.ok) onChanged();
  };

  const togglePublished = async () => {
    await fetch(`/api/superadmin/variant-catalog/${template.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublished: !template.isPublished }),
    });
    onChanged();
  };

  return (
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
          className="p-1.5 rounded text-[var(--text-tertiary)] hover:text-[var(--data-error)] hover:bg-[var(--data-error)]/5 transition-colors"
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
                <OptionCard key={opt.id} option={opt} onChanged={onChanged} />
              ))}
            </div>
          )}

          {showAddOption ? (
            <NewOptionForm
              templateId={template.id}
              onSaved={() => { setShowAddOption(false); onChanged(); }}
              onCancel={() => setShowAddOption(false)}
            />
          ) : (
            <button
              onClick={() => setShowAddOption(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-primary border border-dashed border-primary/40 hover:bg-primary/5 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Añadir opción
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Option card ──────────────────────────────────────────────────────────────

function OptionCard({ option, onChanged }: { option: Option; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);

  const remove = async () => {
    if (!confirm(`¿Eliminar opción "${option.name}"?`)) return;
    const res = await fetch(`/api/superadmin/variant-catalog/options/${option.id}`, { method: "DELETE" });
    if (res.ok) onChanged();
  };

  if (editing) {
    return <OptionEditForm option={option} onSaved={() => { setEditing(false); onChanged(); }} onCancel={() => setEditing(false)} />;
  }

  return (
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
              {option.priceDelta > 0 ? "+" : ""}S/ {option.priceDelta.toFixed(2)}
            </p>
          )}
          {option.isDefault && (
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--data-success)]">
              Por defecto
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <button onClick={() => setEditing(true)} className="text-xs text-primary font-semibold hover:underline">
            Editar
          </button>
          <button onClick={remove} className="text-xs text-[var(--data-error)] font-semibold hover:underline">
            Borrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Option forms ─────────────────────────────────────────────────────────────

function NewOptionForm({ templateId, onSaved, onCancel }: { templateId: string; onSaved: () => void; onCancel: () => void }) {
  return <OptionForm initial={{ name: "", imageUrl: "", priceDelta: 0, isDefault: false }} onSubmit={async (data) => {
    const res = await fetch(`/api/superadmin/variant-catalog/${templateId}/options`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name,
        imageUrl: data.imageUrl || null,
        priceDelta: data.priceDelta,
        isDefault: data.isDefault,
      }),
    });
    if (res.ok) onSaved();
    else throw new Error((await res.json().catch(() => ({}))).error || "Error");
  }} onCancel={onCancel} title="Nueva opción" />;
}

function OptionEditForm({ option, onSaved, onCancel }: { option: Option; onSaved: () => void; onCancel: () => void }) {
  return <OptionForm initial={{ name: option.name, imageUrl: option.imageUrl ?? "", priceDelta: option.priceDelta, isDefault: option.isDefault }} onSubmit={async (data) => {
    const res = await fetch(`/api/superadmin/variant-catalog/options/${option.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name,
        imageUrl: data.imageUrl || null,
        priceDelta: data.priceDelta,
        isDefault: data.isDefault,
      }),
    });
    if (res.ok) onSaved();
    else throw new Error((await res.json().catch(() => ({}))).error || "Error");
  }} onCancel={onCancel} title="Editar opción" />;
}

function OptionForm({
  initial,
  onSubmit,
  onCancel,
  title,
}: {
  initial: { name: string; imageUrl: string; priceDelta: number; isDefault: boolean };
  onSubmit: (data: { name: string; imageUrl: string; priceDelta: number; isDefault: boolean }) => Promise<void>;
  onCancel: () => void;
  title: string;
}) {
  const [data, setData] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!data.name.trim()) {
      setErr("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await onSubmit({ ...data, name: data.name.trim(), imageUrl: data.imageUrl.trim() });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-[var(--text-primary)]">{title}</h4>
        <button onClick={onCancel} className="p-1 rounded hover:bg-[var(--surface-sunken)]">
          <X className="h-4 w-4 text-[var(--text-tertiary)]" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Nombre">
          <input
            value={data.name}
            onChange={(e) => setData((d) => ({ ...d, name: e.target.value }))}
            placeholder="Crema huancaína"
            className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </Field>
        <Field label="Delta de precio (S/)" hint="0 si no afecta el precio">
          <input
            type="number"
            step="0.10"
            value={data.priceDelta}
            onChange={(e) => setData((d) => ({ ...d, priceDelta: Number(e.target.value) || 0 }))}
            className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm tabular-nums outline-none focus:border-primary"
          />
        </Field>
      </div>

      <Field label="URL de imagen" hint="https://...  (deja vacío si no tiene foto)">
        <input
          value={data.imageUrl}
          onChange={(e) => setData((d) => ({ ...d, imageUrl: e.target.value }))}
          placeholder="https://cdn.tu-cdn.com/cremas/huancaina.jpg"
          className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </Field>

      {data.imageUrl && (
        <div className="flex items-center gap-3">
          <div className="h-16 w-16 rounded-lg overflow-hidden border border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={data.imageUrl} alt="Preview" className="w-full h-full object-cover" />
          </div>
          <span className="text-xs text-[var(--text-tertiary)]">Vista previa</span>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={data.isDefault} onChange={(e) => setData((d) => ({ ...d, isDefault: e.target.checked }))} />
        <span>Marcar como opción por defecto</span>
      </label>

      {err && <p className="text-xs text-[var(--data-error)]">{err}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-sm font-medium text-[var(--text-secondary)] border border-[var(--rule-base)] hover:bg-[var(--surface-sunken)] transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={submit}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar
        </button>
      </div>
    </div>
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
