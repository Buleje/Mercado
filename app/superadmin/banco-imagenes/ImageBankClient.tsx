"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import {
  Plus, Trash2, Image as ImageIcon,
  Loader2, X, Upload, Check, AlertTriangle, Pencil, Camera,
  ZoomIn, FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BankItem { id: string; name: string; imageUrl: string }
interface BankCategory { id: string; name: string; description?: string; items: BankItem[] }

// ─── Safe URL guard ──────────────────────────────────────────────────────────
//
// Por qué: `imageUrl` viaja al cliente y se renderiza en <img src>. Si un usuario
// (o un payload manipulado) inserta `javascript:alert(1)`, el navegador podría
// ejecutarlo. Validamos: o es path relativo (/uploads/, /api/, /…) o protocolo
// http/https. Cualquier otra cosa → cae al placeholder "Sin foto".
function isSafeImageUrl(url: string | undefined | null): url is string {
  if (!url || typeof url !== "string") return false;
  if (url.startsWith("/")) return true;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export default function ImageBankClient() {
  const [categories, setCategories] = useState<BankCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // openCatId = qué categoría tiene el modal abierto (solo una a la vez).
  // Antes era un Set<string> con accordion expansivo — eso forzaba a la
  // página a crecer hacia abajo y empujar el resto del contenido.
  const [openCatId, setOpenCatId] = useState<string | null>(null);
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

  const totalItems = categories.reduce((s, c) => s + c.items.length, 0);
  const itemsWithImage = categories.reduce(
    (s, c) => s + c.items.filter((it) => isSafeImageUrl(it.imageUrl)).length,
    0,
  );

  // Mantengo referencia "viva" para que cuando reload() actualice la lista,
  // el modal abierto refresque sus items sin cerrarse.
  const openCategory = openCatId ? categories.find((c) => c.id === openCatId) ?? null : null;

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
        <div role="alert" className="rounded-xl border border-[var(--data-error)]/40 bg-[var(--data-error)]/5 p-3 text-sm text-[var(--data-error)]">
          {error}
        </div>
      )}

      <NewCategoryModal open={showNewCat} onOpenChange={setShowNewCat} onSaved={() => { setShowNewCat(false); reload(); }} />

      {/* Categorías — grid de cards resumen, click abre modal */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {categories.map((cat) => (
          <CategorySummaryCard
            key={cat.id}
            category={cat}
            onOpen={() => setOpenCatId(cat.id)}
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

      {/* Modal de detalle — solo una categoría a la vez */}
      {openCategory && (
        <CategoryDetailModal
          category={openCategory}
          open={!!openCategory}
          onOpenChange={(o) => { if (!o) setOpenCatId(null); }}
          onChanged={reload}
        />
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

// ─── Category summary card (click → modal) ───────────────────────────────────
//
// Antes: accordion expansivo que empujaba la página hacia abajo.
// Ahora: card compacta con preview de hasta 3 imágenes, contador y botón "Abrir"
// que dispara CategoryDetailModal. Eliminar categoría usa ConfirmDialog
// (no más confirm() nativo que no respeta dark mode ni a11y).

function CategorySummaryCard({
  category,
  onOpen,
  onChanged,
}: {
  category: BankCategory;
  onOpen: () => void;
  onChanged: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const itemsWithImage = category.items.filter((it) => isSafeImageUrl(it.imageUrl)).length;
  // Preview: las primeras 3 imágenes válidas de la categoría como thumbnails.
  const previewItems = category.items.filter((it) => isSafeImageUrl(it.imageUrl)).slice(0, 3);

  const doRemove = async () => {
    setRemoving(true);
    setRemoveError(null);
    try {
      const res = await fetch(`/api/superadmin/image-bank/${category.id}`, { method: "DELETE" });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setConfirmRemove(false);
      onChanged();
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <div className="group rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden hover:border-primary/40 hover:shadow-md transition-all">
        {/* Preview strip */}
        <button
          onClick={onOpen}
          className="w-full block text-left"
          aria-label={`Abrir categoría ${category.name}`}
        >
          <div className="aspect-[3/1] bg-[var(--surface-sunken)] flex items-center justify-center gap-1 p-2 border-b border-[var(--rule-soft)]">
            {previewItems.length === 0 ? (
              <div className="flex flex-col items-center text-[var(--text-tertiary)]">
                <Camera className="h-5 w-5 mb-0.5" />
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase">Sin fotos aún</span>
              </div>
            ) : (
              previewItems.map((it) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={it.id}
                  src={it.imageUrl}
                  alt={it.name}
                  className="h-full w-1/3 object-contain rounded"
                />
              ))
            )}
          </div>
        </button>

        <div className="p-3 flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">{category.name}</h3>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">
              {category.items.length} item{category.items.length === 1 ? "" : "s"}
              {" · "}
              <strong className="text-[var(--data-success)]">{itemsWithImage} con foto</strong>
            </p>
            {category.description && (
              <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{category.description}</p>
            )}
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <button
              onClick={onOpen}
              title="Abrir"
              className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors"
            >
              <FolderOpen className="h-4 w-4" />
            </button>
            <button
              onClick={() => setConfirmRemove(true)}
              title="Eliminar categoría"
              className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error)] hover:bg-[var(--data-error)]/5 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={(o) => { if (!o) { setConfirmRemove(false); setRemoveError(null); } }}
        title={`Eliminar "${category.name}"`}
        description={
          category.items.length > 0
            ? `Esta acción borrará la categoría y sus ${category.items.length} item${category.items.length === 1 ? "" : "s"}. No se puede deshacer.`
            : "Esta acción no se puede deshacer."
        }
        confirmLabel="Eliminar categoría"
        variant="danger"
        loading={removing}
        error={removeError}
        onConfirm={doRemove}
      />
    </>
  );
}

// ─── Category detail modal ───────────────────────────────────────────────────
//
// Modal grande (max-w-5xl) con la grilla de items + zona "agregar item nuevo".
// Reutiliza el mismo NewItemForm/ItemForm que ya existían — solo cambió el
// envoltorio. El modal escucha cambios de la lista global vía props.

function CategoryDetailModal({
  category,
  open,
  onOpenChange,
  onChanged,
}: {
  category: BankCategory;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChanged: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const itemsWithImage = category.items.filter((it) => isSafeImageUrl(it.imageUrl)).length;

  // Cuando cambia la categoría abierta, resetear el form de "nuevo item".
  useEffect(() => { setShowAdd(false); }, [category.id]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[95vw] max-w-5xl max-h-[90vh] flex flex-col rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-base)] shadow-2xl"
          aria-describedby={undefined}
        >
          <div className="px-6 py-4 border-b border-[var(--rule-soft)] flex items-center justify-between gap-3 shrink-0">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-extrabold text-[var(--text-primary)] truncate">
                {category.name}
              </Dialog.Title>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                {category.items.length} item{category.items.length === 1 ? "" : "s"}
                {" · "}
                <strong className="text-[var(--data-success)]">{itemsWithImage} con foto</strong>
                {category.description ? ` · ${category.description}` : ""}
              </p>
            </div>
            <Dialog.Close className="p-2 rounded-lg hover:bg-[var(--surface-sunken)] shrink-0" aria-label="Cerrar">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-auto p-6 space-y-4">
            {category.items.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {category.items.map((it) => (
                  <ItemCard key={it.id} categoryId={category.id} item={it} onChanged={onChanged} />
                ))}
              </div>
            ) : (
              !showAdd && (
                <div className="rounded-xl border border-dashed border-[var(--rule-base)] p-8 text-center">
                  <Camera className="h-7 w-7 text-[var(--text-tertiary)] mx-auto mb-2" />
                  <p className="text-sm text-[var(--text-secondary)] font-medium">
                    Esta categoría aún no tiene items.
                  </p>
                </div>
              )
            )}

            {showAdd && (
              <NewItemForm
                categoryId={category.id}
                onSaved={() => { setShowAdd(false); onChanged(); }}
                onCancel={() => setShowAdd(false)}
              />
            )}
          </div>

          <div className="px-6 py-4 border-t border-[var(--rule-soft)] flex justify-end gap-2 shrink-0">
            {!showAdd && (
              <button
                onClick={() => setShowAdd(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                Agregar item
              </button>
            )}
            <Dialog.Close asChild>
              <button className="px-4 py-2 rounded-xl text-sm font-medium border border-[var(--rule-base)] hover:bg-[var(--surface-sunken)]">
                Cerrar
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── Confirm dialog (replaces native confirm) ────────────────────────────────
//
// Razón: confirm() nativo (1) no respeta dark mode, (2) no es localizable bien,
// (3) en algunas combinaciones de browser/OS bloquea el event loop. Radix
// AlertDialog le da focus trap, ESC, click-outside, role=alertdialog y soporte
// de loading state mientras la mutación viaja al server.

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "default",
  loading,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  loading?: boolean;
  error?: string | null;
  onConfirm: () => void;
}) {
  const confirmClass = variant === "danger"
    ? "bg-[var(--data-error)] hover:brightness-110 text-white"
    : "bg-primary hover:bg-primary/90 text-white";

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2 w-[95vw] max-w-md rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-base)] shadow-2xl p-5">
          <div className="flex items-start gap-3">
            {variant === "danger" && (
              <div className="w-10 h-10 rounded-xl bg-[var(--data-error)]/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-[var(--data-error)]" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <AlertDialog.Title className="text-base font-extrabold text-[var(--text-primary)]">{title}</AlertDialog.Title>
              {description && (
                <AlertDialog.Description className="text-sm text-[var(--text-secondary)] mt-1">
                  {description}
                </AlertDialog.Description>
              )}
              {error && (
                <p role="alert" className="mt-2 text-xs text-[var(--data-error)] flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  {error}
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <AlertDialog.Cancel asChild>
              <button
                disabled={loading}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-[var(--rule-base)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
              >
                {cancelLabel}
              </button>
            </AlertDialog.Cancel>
            <button
              onClick={(e) => { e.preventDefault(); onConfirm(); }}
              disabled={loading}
              className={cn("inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50", confirmClass)}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {confirmLabel}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

// ─── Image preview dialog (full size) ────────────────────────────────────────

function ImagePreviewDialog({
  src,
  alt,
  open,
  onOpenChange,
}: {
  src: string;
  alt: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  if (!isSafeImageUrl(src)) return null;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 w-[95vw] max-w-3xl max-h-[90vh] flex flex-col items-center"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">{alt}</Dialog.Title>
          <Dialog.Close
            className="absolute top-2 right-2 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
            aria-label="Cerrar preview"
          >
            <X className="h-5 w-5" />
          </Dialog.Close>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
          />
          <p className="mt-3 text-sm text-white/90 font-medium text-center px-4">{alt}</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── Item card ───────────────────────────────────────────────────────────────

function ItemCard({ categoryId, item, onChanged }: { categoryId: string; item: BankItem; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const safeUrl = isSafeImageUrl(item.imageUrl) ? item.imageUrl : "";

  const doRemove = async () => {
    setRemoving(true);
    setRemoveError(null);
    try {
      const res = await fetch(`/api/superadmin/image-bank/${categoryId}/items/${item.id}`, { method: "DELETE" });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setConfirmRemove(false);
      onChanged();
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : "Error");
    } finally {
      setRemoving(false);
    }
  };

  if (editing) {
    return (
      <ItemForm
        initial={{ name: item.name, imageUrl: safeUrl }}
        categoryId={categoryId}
        itemId={item.id}
        onSaved={() => { setEditing(false); onChanged(); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
      <div className="aspect-square bg-[var(--surface-sunken)] relative group">
        {safeUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={safeUrl} alt={item.name} className="w-full h-full object-contain p-2" />
            <button
              onClick={() => setPreviewOpen(true)}
              className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/40 opacity-0 hover:opacity-100 transition-all"
              aria-label={`Ver "${item.name}" en grande`}
            >
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-black/70 text-white text-xs font-bold">
                <ZoomIn className="h-3.5 w-3.5" />
                Ver grande
              </span>
            </button>
          </>
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
            <Pencil className="h-3 w-3" /> {safeUrl ? "Editar" : "Subir foto"}
          </button>
          <button
            onClick={() => setConfirmRemove(true)}
            aria-label={`Eliminar "${item.name}"`}
            className="inline-flex items-center justify-center px-2 py-1 rounded-lg text-[var(--data-error)] border border-[var(--rule-soft)] hover:bg-[var(--data-error)]/5"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={(o) => { if (!o) { setConfirmRemove(false); setRemoveError(null); } }}
        title={`Eliminar "${item.name}"`}
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="danger"
        loading={removing}
        error={removeError}
        onConfirm={doRemove}
      />
      <ImagePreviewDialog
        src={safeUrl}
        alt={item.name}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
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
