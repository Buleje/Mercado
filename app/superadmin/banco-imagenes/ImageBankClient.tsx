"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Plus, Trash2, ChevronDown, ChevronRight, Image as ImageIcon,
  Loader2, X, Upload, Check, AlertTriangle, Pencil, Camera,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BankItem { id: string; name: string; imageUrl: string }
interface BankCategory { id: string; name: string; description?: string; items: BankItem[] }

export default function ImageBankClient() {
  const [categories, setCategories] = useState<BankCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showNewCat, setShowNewCat] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/superadmin/image-bank");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { categories: BankCategory[] };
      setCategories(data.categories ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalItems = categories.reduce((s, c) => s + c.items.length, 0);
  const itemsWithImage = categories.reduce((s, c) => s + c.items.filter((it) => it.imageUrl).length, 0);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm text-[var(--text-secondary)]">
          {loading ? "Cargando…" : (
            <>
              <strong>{categories.length}</strong> categorías ·{" "}
              <strong>{totalItems}</strong> items · <strong className="text-[var(--data-success)]">{itemsWithImage}</strong> con foto
            </>
          )}
        </div>
        <button
          onClick={() => setShowNewCat(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nueva categoría
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-[var(--data-error)]/40 bg-[var(--data-error)]/5 p-3 text-sm text-[var(--data-error)]">
          {error}
        </div>
      )}

      <NewCategoryModal open={showNewCat} onOpenChange={setShowNewCat} onSaved={() => { setShowNewCat(false); reload(); }} />

      {/* Categorías */}
      <div className="space-y-2">
        {categories.map((cat) => (
          <CategoryCard
            key={cat.id}
            category={cat}
            expanded={expanded.has(cat.id)}
            onToggle={() => toggleExpand(cat.id)}
            onChanged={reload}
          />
        ))}
      </div>

      {!loading && categories.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--rule-base)] p-10 text-center">
          <ImageIcon className="w-8 h-8 text-[var(--text-tertiary)] mx-auto mb-3" />
          <p className="text-sm text-[var(--text-secondary)] font-medium">
            Aún no hay categorías. Creá la primera para empezar.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── New category modal ──────────────────────────────────────────────────────

function NewCategoryModal({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setName(""); setDescription(""); setErr(null); }
  }, [open]);

  const submit = async () => {
    if (!name.trim()) { setErr("El nombre es obligatorio"); return; }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/superadmin/image-bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error ?? `HTTP ${res.status}`);
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[95vw] max-w-md rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-base)] shadow-2xl">
          <div className="px-5 py-4 border-b border-[var(--rule-soft)] flex items-center justify-between">
            <Dialog.Title className="text-base font-extrabold text-[var(--text-primary)]">Nueva categoría</Dialog.Title>
            <Dialog.Close className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)]"><X className="h-4 w-4" /></Dialog.Close>
          </div>
          <div className="p-5 space-y-3">
            <label className="block">
              <span className="block text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Nombre *</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Cevichería, Cafetería, Bar…"
                autoFocus
                className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Descripción</span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Opcional — qué tipo de productos incluye"
                className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            {err && <p className="text-xs text-[var(--data-error)] flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{err}</p>}
          </div>
          <div className="px-5 py-4 border-t border-[var(--rule-soft)] flex justify-end gap-2">
            <button onClick={() => onOpenChange(false)} className="px-4 py-2 rounded-xl text-sm font-medium border border-[var(--rule-base)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
            <button onClick={submit} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Crear
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── Category card ───────────────────────────────────────────────────────────

function CategoryCard({ category, expanded, onToggle, onChanged }: { category: BankCategory; expanded: boolean; onToggle: () => void; onChanged: () => void }) {
  const [showAdd, setShowAdd] = useState(false);

  const remove = async () => {
    if (!confirm(`¿Eliminar la categoría "${category.name}" y sus ${category.items.length} items?`)) return;
    const res = await fetch(`/api/superadmin/image-bank/${category.id}`, { method: "DELETE" });
    if (res.ok) onChanged();
  };

  const itemsWithImage = category.items.filter((it) => it.imageUrl).length;

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
      <div className="p-4 flex items-center gap-3">
        <button onClick={onToggle} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">{category.name}</h3>
            <span className="text-xs text-[var(--text-tertiary)]">
              {category.items.length} item{category.items.length === 1 ? "" : "s"}
              {" · "}
              <strong className="text-[var(--data-success)]">{itemsWithImage} con foto</strong>
            </span>
          </div>
          {category.description && (
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">{category.description}</p>
          )}
        </div>
        <button
          onClick={remove}
          title="Eliminar categoría"
          className="p-1.5 rounded text-[var(--text-tertiary)] hover:text-[var(--data-error)] hover:bg-[var(--data-error)]/5"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-canvas)]/50 p-4 space-y-3">
          {category.items.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {category.items.map((it) => (
                <ItemCard key={it.id} categoryId={category.id} item={it} onChanged={onChanged} />
              ))}
            </div>
          )}

          {showAdd ? (
            <NewItemForm
              categoryId={category.id}
              onSaved={() => { setShowAdd(false); onChanged(); }}
              onCancel={() => setShowAdd(false)}
            />
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-primary border-2 border-dashed border-primary/40 hover:bg-primary/5"
            >
              <Plus className="h-4 w-4" />
              Agregar item nuevo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Item card ───────────────────────────────────────────────────────────────

function ItemCard({ categoryId, item, onChanged }: { categoryId: string; item: BankItem; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);

  const remove = async () => {
    if (!confirm(`¿Eliminar "${item.name}"?`)) return;
    const res = await fetch(`/api/superadmin/image-bank/${categoryId}/items/${item.id}`, { method: "DELETE" });
    if (res.ok) onChanged();
  };

  if (editing) {
    return (
      <ItemForm
        initial={{ name: item.name, imageUrl: item.imageUrl }}
        categoryId={categoryId}
        itemId={item.id}
        onSaved={() => { setEditing(false); onChanged(); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
      <div className="aspect-square bg-[var(--surface-sunken)] relative">
        {item.imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain p-2" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--text-tertiary)]">
            <Camera className="h-6 w-6 mb-1" />
            <span className="text-[length:var(--ts-2xs)] font-bold">Sin foto</span>
          </div>
        )}
      </div>
      <div className="p-2.5">
        <p className="text-xs font-bold text-[var(--text-primary)] truncate" title={item.name}>{item.name}</p>
        <div className="flex justify-between gap-1 mt-1.5">
          <button onClick={() => setEditing(true)} className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[length:var(--ts-2xs)] font-bold text-primary border border-primary/30 hover:bg-primary/5">
            <Pencil className="h-3 w-3" /> {item.imageUrl ? "Editar" : "Subir foto"}
          </button>
          <button onClick={remove} className="inline-flex items-center justify-center px-2 py-1 rounded-lg text-[var(--data-error)] border border-[var(--rule-soft)] hover:bg-[var(--data-error)]/5">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Item forms (new + edit share component) ─────────────────────────────────

function NewItemForm({ categoryId, onSaved, onCancel }: { categoryId: string; onSaved: () => void; onCancel: () => void }) {
  return (
    <ItemForm
      initial={{ name: "", imageUrl: "" }}
      categoryId={categoryId}
      onSaved={onSaved}
      onCancel={onCancel}
      isNew
    />
  );
}

function ItemForm({
  initial, categoryId, itemId, isNew, onSaved, onCancel,
}: {
  initial: { name: string; imageUrl: string };
  categoryId: string;
  itemId?: string;
  isNew?: boolean;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [imageUrl, setImageUrl] = useState(initial.imageUrl);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) { setErr("Nombre obligatorio"); return; }
    if (!imageUrl) { setErr("Subí una imagen"); return; }
    setSaving(true);
    try {
      const url = isNew
        ? `/api/superadmin/image-bank/${categoryId}/items`
        : `/api/superadmin/image-bank/${categoryId}/items/${itemId}`;
      const res = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), imageUrl }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-black uppercase tracking-wider text-primary">
          {isNew ? "Nuevo item" : "Editar item"}
        </p>
        <button onClick={onCancel} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
          <X className="h-4 w-4" />
        </button>
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre del item (ej: Inca Kola 500ml)"
        autoFocus
        className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm outline-none focus:border-primary"
      />
      <ImageDropzone value={imageUrl} onChange={setImageUrl} />
      {err && <p className="text-xs text-[var(--data-error)]">{err}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--text-secondary)] border border-[var(--rule-base)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
        <button onClick={submit} disabled={saving} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-primary hover:bg-primary/90 disabled:opacity-50">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Guardar
        </button>
      </div>
    </div>
  );
}

// ─── Image dropzone (drag-drop + click + URL) ────────────────────────────────

function ImageDropzone({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "image-bank");
      fd.append("mode", "square");
      const res = await fetch("/api/superadmin/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      const data = await res.json() as { url: string };
      onChange(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("ring-2", "ring-primary"); }}
        onDragLeave={(e) => e.currentTarget.classList.remove("ring-2", "ring-primary")}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove("ring-2", "ring-primary");
          const f = e.dataTransfer.files?.[0];
          if (f) void upload(f);
        }}
        onClick={() => !uploading && fileRef.current?.click()}
        className={cn(
          "rounded-xl border-2 border-dashed p-3 cursor-pointer transition-all",
          value ? "border-[var(--rule-base)] bg-[var(--surface-canvas)]" : "border-[var(--rule-base)] bg-[var(--surface-sunken)] hover:border-primary/40",
          uploading && "opacity-60 cursor-wait",
        )}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }}
        />
        {value ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="preview" className="h-16 w-16 rounded-lg object-cover border border-[var(--rule-soft)]" />
            <p className="flex-1 text-xs font-mono text-[var(--text-secondary)] truncate">{value}</p>
            <button type="button" onClick={(e) => { e.stopPropagation(); onChange(""); }} className="text-xs text-[var(--data-error)] font-bold">Quitar</button>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center py-2">
            {uploading ? (
              <>
                <Loader2 className="h-6 w-6 text-primary animate-spin mb-1" />
                <p className="text-xs font-bold">Subiendo…</p>
              </>
            ) : (
              <>
                <Upload className="h-6 w-6 text-[var(--text-tertiary)] mb-1" />
                <p className="text-xs font-bold text-[var(--text-primary)]">Arrastrá una imagen o click</p>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">JPG · PNG · WebP — optimizada a WebP automáticamente</p>
              </>
            )}
          </div>
        )}
      </div>
      {error && <p className="text-[length:var(--ts-2xs)] text-[var(--data-error)]">{error}</p>}
    </div>
  );
}
