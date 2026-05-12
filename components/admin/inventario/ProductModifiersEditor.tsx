"use client";

/**
 * ProductModifiersEditor — modal CRUD para los modifier groups (adicionales)
 * de un producto.
 *
 * Diseño 2026-05: Radix Dialog, cada opción con thumbnail + drag-drop image
 * upload (compresión WebP client-side), grupos como cards visuales con
 * separación clara, footer sticky.
 *
 * Carga via GET /api/products/{id}/modifiers, persiste con PUT (replace-all).
 */

import { useEffect, useState, useRef, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  X, Plus, Trash2, BookOpen, Camera, Loader2, AlertTriangle, Check,
  Sliders, Upload, Star,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import VariantCatalogPicker from "./VariantCatalogPicker";
import CatalogOptionPicker from "./CatalogOptionPicker";

type Option = {
  id?: string;
  name: string;
  priceDelta: number;
  isDefault?: boolean;
  imageUrl?: string | null;
};
type Group = {
  id?: string;
  name: string;
  description?: string | null;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: Option[];
};

interface Props {
  productId: number;
  productName: string;
  onClose: () => void;
  onSaved?: () => void;
}

// Comprimir image client-side a WebP <30KB para caber con holgura en imageUrl
async function compressOptionImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("El archivo no es una imagen");
  if (file.size > 30 * 1024 * 1024) throw new Error("Imagen muy grande (>30 MB)");
  const img = new window.Image();
  const url = URL.createObjectURL(file);
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("No se pudo leer la imagen"));
    img.src = url;
  });
  URL.revokeObjectURL(url);
  const maxPx = 480; // adicional thumb — más chico que producto
  const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  let q = 0.82;
  let dataUrl = canvas.toDataURL("image/webp", q);
  const bytes = (u: string) => Math.round(((u.split(",")[1] ?? "").length) * 0.75);
  while (bytes(dataUrl) > 30 * 1024 && q > 0.4) {
    q -= 0.08;
    dataUrl = canvas.toDataURL("image/webp", q);
  }
  return dataUrl;
}

export default function ProductModifiersEditor({ productId, productName, onClose, onSaved }: Props) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    fetch(`/api/products/${productId}/modifiers`)
      .then((r) => (r.ok ? r.json() : { groups: [] }))
      .then((d: { groups: Group[] }) => setGroups(d.groups ?? []))
      .catch(() => setError("No se pudieron cargar los modificadores"))
      .finally(() => setLoading(false));
  }, [productId]);

  useEffect(() => { reload(); }, [reload]); // eslint-disable-line react-hooks/set-state-in-effect

  const addGroup = () => {
    setGroups((g) => [...g, {
      name: "Nuevo grupo", description: "", required: false,
      minSelect: 0, maxSelect: 1, options: [],
    }]);
  };
  const removeGroup = (idx: number) => setGroups((g) => g.filter((_, i) => i !== idx));
  const updateGroup = (idx: number, patch: Partial<Group>) =>
    setGroups((g) => g.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const addOption = (gIdx: number) =>
    setGroups((g) => g.map((it, i) =>
      i === gIdx ? { ...it, options: [...it.options, { name: "", priceDelta: 0, imageUrl: null }] } : it,
    ));
  const removeOption = (gIdx: number, oIdx: number) =>
    setGroups((g) => g.map((it, i) =>
      i === gIdx ? { ...it, options: it.options.filter((_, j) => j !== oIdx) } : it,
    ));
  const updateOption = (gIdx: number, oIdx: number, patch: Partial<Option>) =>
    setGroups((g) => g.map((it, i) =>
      i === gIdx ? { ...it, options: it.options.map((op, j) => (j === oIdx ? { ...op, ...patch } : op)) } : it,
    ));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const body = {
      groups: groups.map((g, i) => ({
        name: g.name.trim() || "Grupo",
        description: g.description?.trim() || null,
        required: g.required,
        minSelect: g.minSelect,
        maxSelect: g.maxSelect,
        position: i,
        options: g.options
          .filter((o) => o.name.trim())
          .map((o, j) => ({
            name: o.name.trim(),
            priceDelta: Number(o.priceDelta) || 0,
            isDefault: !!o.isDefault,
            position: j,
            imageUrl: o.imageUrl ?? null,
          })),
      })),
    };
    const res = await fetch(`/api/products/${productId}/modifiers`, {
      method: "PUT",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      setError(`No se guardó: ${err.error ?? `error ${res.status}`}`);
      return;
    }
    onSaved?.();
    onClose();
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[8000] bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[8001] -translate-x-1/2 -translate-y-1/2 w-[95vw] max-w-3xl max-h-[92vh] flex flex-col rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="shrink-0 px-5 py-4 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Sliders className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <Dialog.Title className="text-base font-extrabold text-[var(--text-primary)]">
                Adicionales y modificadores
              </Dialog.Title>
              <p className="text-xs text-[var(--text-tertiary)] truncate">
                {productName} — extras que el cliente elige al ordenar (cremas, salsas, presa, toppings…)
              </p>
            </div>
            <button onClick={onClose} aria-label="Cerrar"
              className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4 bg-[var(--surface-canvas)]/50">
            {loading && (
              <div className="flex items-center justify-center py-10 gap-2 text-[var(--text-tertiary)]">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Cargando…</span>
              </div>
            )}

            {!loading && groups.length === 0 && (
              <div className="rounded-xl border border-dashed border-[var(--rule-base)] p-8 text-center bg-[var(--surface-raised)]">
                <Sliders className="h-10 w-10 mx-auto text-[var(--text-tertiary)] mb-3" />
                <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1">Aún no hay adicionales</h3>
                <p className="text-xs text-[var(--text-tertiary)] max-w-md mx-auto leading-snug">
                  Agregá un grupo (ej. <em>Cremas</em>, <em>Tamaño</em>, <em>Toppings</em>) o importá uno listo desde el catálogo global.
                </p>
              </div>
            )}

            {!loading && groups.map((g, gIdx) => (
              <GroupCard
                key={gIdx}
                group={g}
                onUpdate={(patch) => updateGroup(gIdx, patch)}
                onRemove={() => removeGroup(gIdx)}
                onUpdateOption={(oIdx, patch) => updateOption(gIdx, oIdx, patch)}
                onRemoveOption={(oIdx) => removeOption(gIdx, oIdx)}
                onAddOption={() => addOption(gIdx)}
                onAddFromCatalog={(opt) => {
                  setGroups((g2) => g2.map((it, i) =>
                    i === gIdx ? { ...it, options: [...it.options, opt] } : it,
                  ));
                }}
              />
            ))}

            {!loading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                <button onClick={addGroup}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3 text-sm font-bold text-[var(--text-secondary)] hover:border-primary hover:text-primary transition-colors">
                  <Plus className="h-4 w-4" /> Agregar grupo nuevo
                </button>
                <button onClick={() => setShowCatalog(true)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-linear-to-r from-primary to-[var(--data-success-500)] text-white px-4 py-3 text-sm font-bold hover:opacity-90 transition-all">
                  <BookOpen className="h-4 w-4" /> Importar del catálogo
                </button>
              </div>
            )}

            {showCatalog && (
              <VariantCatalogPicker
                productId={productId}
                onClose={() => setShowCatalog(false)}
                onImported={() => { setShowCatalog(false); reload(); }}
              />
            )}

            {error && (
              <div className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/5 p-3 text-sm text-[var(--data-error-500)] flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="flex-1">{error}</span>
                <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-[var(--rule-soft)] px-5 py-3.5 flex items-center justify-between gap-2 bg-[var(--surface-raised)]">
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] hidden sm:block">
              Los cambios reemplazan completamente los adicionales del producto al guardar.
            </p>
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={onClose}
                className="rounded-xl border border-[var(--rule-base)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Guardar
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── Group card ───────────────────────────────────────────────────────────────

function GroupCard({
  group, onUpdate, onRemove, onUpdateOption, onRemoveOption, onAddOption, onAddFromCatalog,
}: {
  group: Group;
  onUpdate: (patch: Partial<Group>) => void;
  onRemove: () => void;
  onUpdateOption: (oIdx: number, patch: Partial<Option>) => void;
  onRemoveOption: (oIdx: number) => void;
  onAddOption: () => void;
  onAddFromCatalog: (opt: Option) => void;
}) {
  const [showCatalogPicker, setShowCatalogPicker] = useState(false);
  const existingNames = new Set(group.options.map((o) => o.name.toLowerCase()));
  return (
    <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden shadow-sm">
      {/* Group header */}
      <div className="border-b border-[var(--rule-soft)] p-4 space-y-3">
        <div className="flex items-start gap-2">
          <input
            value={group.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="Nombre del grupo (ej: Cremas, Tamaño)"
            className="flex-1 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-base font-bold text-[var(--text-primary)] outline-none focus:border-primary"
          />
          <button onClick={onRemove} title="Eliminar grupo"
            className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/20 transition-colors">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <input
          value={group.description ?? ""}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="Descripción para el cliente (opcional, ej: Elige las cremas que prefieras)"
          className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-1.5 text-sm text-[var(--text-secondary)] outline-none focus:border-primary"
        />
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={group.required}
              onChange={(e) => onUpdate({ required: e.target.checked })}
              className="h-4 w-4 accent-primary"
            />
            <span className="text-sm font-semibold text-[var(--text-primary)]">Obligatorio</span>
          </label>
          <span className="text-xs text-[var(--text-tertiary)]">·</span>
          <label className="inline-flex items-center gap-1.5">
            <span className="text-xs text-[var(--text-secondary)]">Min</span>
            <input
              type="number" min={0} max={20}
              value={group.minSelect}
              onChange={(e) => onUpdate({ minSelect: Math.max(0, Number(e.target.value) || 0) })}
              className="w-14 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 py-1 text-sm tabular-nums outline-none focus:border-primary"
            />
          </label>
          <label className="inline-flex items-center gap-1.5">
            <span className="text-xs text-[var(--text-secondary)]">Max</span>
            <input
              type="number" min={1} max={20}
              value={group.maxSelect}
              onChange={(e) => onUpdate({ maxSelect: Math.max(1, Number(e.target.value) || 1) })}
              className="w-14 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 py-1 text-sm tabular-nums outline-none focus:border-primary"
            />
          </label>
          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] italic ml-auto">
            {group.maxSelect === 1 ? "Single-select" : `Multi-select (max ${group.maxSelect})`}
          </span>
        </div>
      </div>

      {/* Options */}
      <div className="p-4 space-y-2 bg-[var(--surface-canvas)]/40">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          Opciones ({group.options.length})
        </p>
        {group.options.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)] italic py-2">Aún no hay opciones. Agregá una para empezar.</p>
        ) : (
          <div className="space-y-2">
            {group.options.map((o, oIdx) => (
              <OptionRow
                key={oIdx}
                option={o}
                onChange={(patch) => onUpdateOption(oIdx, patch)}
                onRemove={() => onRemoveOption(oIdx)}
              />
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button onClick={onAddOption}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10 transition-colors">
            <Plus className="h-3.5 w-3.5" /> Agregar opción
          </button>
          <button onClick={() => setShowCatalogPicker(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-linear-to-r from-primary to-[var(--data-success-500)] text-white px-3 py-2 text-xs font-bold hover:opacity-90 transition-all">
            <BookOpen className="h-3.5 w-3.5" /> Añadir del catálogo
          </button>
        </div>
      </div>

      {showCatalogPicker && (
        <CatalogOptionPicker
          onClose={() => setShowCatalogPicker(false)}
          onPick={(picked) => onAddFromCatalog({
            name: picked.name,
            priceDelta: picked.priceDelta,
            isDefault: picked.isDefault,
            imageUrl: picked.imageUrl,
          })}
          existingNames={existingNames}
        />
      )}
    </div>
  );
}

// ─── Option row ───────────────────────────────────────────────────────────────

function OptionRow({
  option, onChange, onRemove,
}: {
  option: Option;
  onChange: (patch: Partial<Option>) => void;
  onRemove: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    setErr(null);
    try {
      const dataUrl = await compressOptionImage(file);
      onChange({ imageUrl: dataUrl });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error procesando imagen");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Image upload zone — drag-drop + click */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("ring-2", "ring-primary"); }}
          onDragLeave={(e) => e.currentTarget.classList.remove("ring-2", "ring-primary")}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.classList.remove("ring-2", "ring-primary");
            const f = e.dataTransfer.files?.[0];
            if (f) void handleFile(f);
          }}
          className={cn(
            "relative h-12 w-12 rounded-lg overflow-hidden border-2 border-dashed shrink-0 transition-all group",
            option.imageUrl
              ? "border-[var(--rule-base)]"
              : "border-[var(--rule-base)] bg-[var(--surface-sunken)] hover:border-primary"
          )}
          title={option.imageUrl ? "Click o arrastrá para reemplazar" : "Click o arrastrá una imagen aquí"}
        >
          {option.imageUrl ? (
            <Image
              src={option.imageUrl}
              alt={option.name || "opción"}
              fill
              unoptimized={option.imageUrl.startsWith("data:")}
              className="object-cover"
              sizes="48px"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <Camera className="h-4 w-4 text-[var(--text-tertiary)] group-hover:text-primary" />
              )}
            </div>
          )}
          {option.imageUrl && (
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
              <Upload className="h-4 w-4 text-white opacity-0 group-hover:opacity-100" />
            </div>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />

        {/* Name */}
        <input
          value={option.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Nombre (ej: Mayonesa, Pierna, Queso extra)"
          className="flex-1 min-w-[140px] rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-primary"
        />

        {/* Price delta */}
        <div className="inline-flex items-center gap-1 shrink-0">
          <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">+S/</span>
          <input
            type="number" min={0} step={0.5}
            value={option.priceDelta}
            onChange={(e) => onChange({ priceDelta: Number(e.target.value) || 0 })}
            className="w-16 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 py-1.5 text-sm font-mono tabular-nums outline-none focus:border-primary"
            title="Cuánto suma al precio del producto si se elige"
          />
        </div>

        {/* Default toggle */}
        <button
          type="button"
          onClick={() => onChange({ isDefault: !option.isDefault })}
          title={option.isDefault ? "Pre-seleccionada por defecto" : "Marcar como por defecto"}
          className={cn(
            "p-1.5 rounded-lg transition-colors",
            option.isDefault
              ? "bg-[var(--data-warning-50)] text-[var(--data-warning-500)]"
              : "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
          )}
        >
          <Star className={cn("h-4 w-4", option.isDefault && "fill-current")} />
        </button>

        {/* Remove */}
        <button
          type="button"
          onClick={onRemove}
          aria-label="Eliminar opción"
          className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/20 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {err && (
        <p className="mt-1.5 text-[length:var(--ts-2xs)] text-[var(--data-error-500)] flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> {err}
        </p>
      )}
    </div>
  );
}
