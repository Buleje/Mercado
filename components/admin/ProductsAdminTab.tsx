"use client";

import { CardTitle, LoadingState, SectionTitle } from "@buleje/design-system";
import { validateProductImage, type ImageValidationResult } from "@/lib/image-validator";
import { ImageValidationPanel, ImageRequirementsGuide } from "@/components/admin/shared/ImageValidationPanel";
import { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import {
  Plus, Pencil, Trash2, Search, X, Package, CheckCircle, XCircle,
  ChevronUp, ChevronDown, RefreshCw, Eye, EyeOff, Save, AlertTriangle, LayoutGrid, List, Filter, Download, Upload, Tag,
  Loader2, Globe, Camera } from "@buleje/design-system/icons";
import TagBadge, { TAG_COLORS, type TagColor, type Tag as TagType } from "./TagBadge";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/admin/EmptyState";
import { categories } from "@/data/products";
import type { Product } from "@/types/erp";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import ExcelProductImporter from "./ExcelProductImporter";
import { csrfHeaders } from "@/lib/csrf-client";

// ── Types ────────────────────────────────────────────────────────────────────


// Tags se manejan localmente como array; se serializan a JSON string en el campo badge
// El campo badge sigue siendo el canal de persistencia (ya existe en el schema)
// formato: si badge empieza con "[", se interpreta como JSON de tags;
// si no, es el badge display legacy (string libre)
function parseTags(badge?: string): TagType[] {
  if (!badge) return [];
  if (badge.startsWith("[")) {
    try { return JSON.parse(badge) as TagType[]; } catch { return []; }
  }
  return [];
}

const DEFAULT_FORM: Omit<Product, "id"> = {
  name: "",
  category: "abarrotes",
  price: 0,
  costPrice: undefined,
  unit: "unidad",
  image: "",
  badge: "",
  description: "",
  stock: undefined,
  stockMin: undefined,
  active: true,
};

const CATEGORY_OPTS = categories.filter((c) => c.id !== "todos");
const UNIT_OPTS = ["kg", "unidad", "bolsa", "botella", "lata", "frasco", "caja", "paquete", "litro", "atado", "bandeja", "pack", "rollo", "barra", "bloque", "spray"];

// ── Notification Toast ───────────────────────────────────────────────────────

function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  return (
    <div className={cn(
      "fixed bottom-6 right-6 z-9999 flex items-center gap-2 px-2 sm:px-4 py-2 sm:py-3 rounded-xl text-sm font-semibold",
      type === "success" ? "bg-[var(--accent-soft)] text-white" : "bg-[var(--data-error)] text-white"
    )}>
      {type === "success" ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
      {msg}
    </div>
  );
}

// ── Product Form Modal ───────────────────────────────────────────────────────

function ProductFormModal({
  initial,
  onSave,
  onClose,
  saving,
}: {
  initial: Omit<Product, "id"> & { id?: number };
  onSave: (data: Omit<Product, "id"> & { id?: number }) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(initial);
  const [imgError, setImgError] = useState(false);
  const [nameDuplicate, setNameDuplicate] = useState(false);
  const [nameChecking, setNameChecking] = useState(false);
  const nameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // ── Tags state ──────────────────────────────────────────────────────────────
  const [tags, setTags] = useState<TagType[]>(() => parseTags(initial.badge));
  const [tagInput, setTagInput] = useState("");
  const [tagColor, setTagColor] = useState<TagColor>("teal");
  const [availableTags, setAvailableTags] = useState<TagType[]>([]);

  useEffect(() => {
    // Cargar tags disponibles para sugerir
    fetch("/api/tags?entity=product")
      .then(r => r.ok ? r.json() : [])
      .then((data: Array<{ name: string; color: TagColor }>) => setAvailableTags(data))
      .catch(() => {});
  }, []);

  const addTag = (name: string, color: TagColor) => {
    const trimmed = name.trim();
    if (!trimmed || tags.some(t => t.name.toLowerCase() === trimmed.toLowerCase())) return;
    const newTags = [...tags, { name: trimmed, color }];
    setTags(newTags);
    // Sincronizar al campo badge como JSON
    set("badge", JSON.stringify(newTags));
    setTagInput("");
  };

  const removeTag = (name: string) => {
    const newTags = tags.filter(t => t.name !== name);
    setTags(newTags);
    set("badge", newTags.length > 0 ? JSON.stringify(newTags) : "");
  };

  // ── National database search ──────────────────────────────────────────────
  const [nationalQuery, setNationalQuery] = useState("");
  const [nationalResults, setNationalResults] = useState<Array<{
    name: string; brand: string; image: string; barcode: string;
    category: string; quantity: string; unit: string;
  }>>([]);
  const [nationalLoading, setNationalLoading] = useState(false);
  const [showNationalDropdown, setShowNationalDropdown] = useState(false);
  const nationalDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Image upload ──────────────────────────────────────────────────────────
  const [uploading, setUploading] = useState(false);
  const [imageValidation, setImageValidation] = useState<ImageValidationResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const searchNational = useCallback((q: string) => {
    if (nationalDebounceRef.current) clearTimeout(nationalDebounceRef.current);
    if (q.trim().length < 2) {
      setNationalResults([]);
      setShowNationalDropdown(false);
      return;
    }
    setNationalLoading(true);
    nationalDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/products/search-national?q=${encodeURIComponent(q.trim())}&limit=8`);
        if (res.ok) {
          const data = await res.json();
          setNationalResults(data.results || []);
          setShowNationalDropdown(true);
        }
      } catch {
        setNationalResults([]);
      } finally {
        setNationalLoading(false);
      }
    }, 350);
  }, []);

  const selectNationalProduct = (product: typeof nationalResults[0]) => {
    set("name", product.name);
    if (product.category) set("category", product.category);
    if (product.image) set("image", product.image);
    if (product.unit) set("unit", product.unit);
    if (product.brand) {
      set("description", `${product.brand}${product.quantity ? ` — ${product.quantity}` : ""}`);
    }
    setShowNationalDropdown(false);
    setNationalQuery("");
    setNationalResults([]);
  };

  const handleImageUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      // Validar contra el estándar de imágenes de producto del marketplace.
      // Los errores bloquean; warnings se muestran pero permiten subir.
      const validation = await validateProductImage(file);
      setImageValidation(validation);
      if (!validation.ok) {
        // Hay errores bloqueantes — aborta upload
        setUploading(false);
        return;
      }

      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "products");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (res.ok) {
        const data = await res.json();
        set("image", data.url);
      }
    } catch {
      // silently fail
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (k: keyof typeof form, v: unknown) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (k === "image") setImgError(false);
  };

  const checkNameDuplicate = (name: string) => {
    if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
    if (name.trim().length < 2) { setNameDuplicate(false); return; }
    setNameChecking(true);
    nameDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(name.trim())}`);
        if (res.ok) {
          const products: Product[] = await res.json();
          const exists = products.some(
            (p) =>
              p.name.trim().toLowerCase() === name.trim().toLowerCase() &&
              p.id !== initial.id
          );
          setNameDuplicate(exists);
        }
      } catch {
        // Si falla la consulta, no bloqueamos
      } finally {
        setNameChecking(false);
      }
    }, 300);
  };

  const valid = form.name.trim().length >= 2 && form.price > 0 && form.unit.trim().length > 0;

  return (
    <div className="modal-backdrop flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-card rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto border border-[var(--rule-base)] dark:border-card-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-card z-10 flex items-center justify-between px-3 sm:px-6 py-4 border-b border-[var(--rule-soft)] dark:border-card-border">
          <SectionTitle className="text-lg font-extrabold text-foreground">
            {form.id ? "Editar producto" : "Nuevo producto"}
          </SectionTitle>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-surface transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* National database search — only for new products */}
          {!form.id && (
            <div className="relative">
              <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted flex items-center gap-1.5">
                <Globe className="h-3 w-3" />
                Buscar en base nacional
              </label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
                <input
                  value={nationalQuery}
                  onChange={(e) => {
                    setNationalQuery(e.target.value);
                    searchNational(e.target.value);
                  }}
                  onFocus={() => nationalResults.length > 0 && setShowNationalDropdown(true)}
                  onBlur={() => setTimeout(() => setShowNationalDropdown(false), 200)}
                  placeholder="Ej: arroz, leche gloria, galletas..."
                  className="w-full pl-9 pr-8 py-2.5 rounded-lg border border-primary/30 bg-primary/5 dark:bg-primary/10 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                {nationalLoading && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
                )}
                {nationalQuery && !nationalLoading && (
                  <button
                    type="button"
                    onClick={() => { setNationalQuery(""); setNationalResults([]); setShowNationalDropdown(false); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {showNationalDropdown && nationalResults.length > 0 && (
                <div className="absolute z-50 left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border">
                  {nationalResults.map((r, i) => (
                    <button
                      key={`${r.barcode}-${i}`}
                      type="button"
                      onClick={() => selectNationalProduct(r)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors text-left border-b border-gray-50 dark:border-card-border last:border-0"
                    >
                      {r.image ? (
                        <Image src={r.image} alt={r.name} width={40} height={40} className="rounded-lg object-cover bg-gray-100 shrink-0" />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-surface flex items-center justify-center shrink-0">
                          <Package className="h-5 w-5 text-[var(--text-tertiary)]" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{r.name}</p>
                        <p className="text-xs text-muted truncate">
                          {r.brand && <span>{r.brand}</span>}
                          {r.quantity && <span> · {r.quantity}</span>}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {showNationalDropdown && nationalResults.length === 0 && !nationalLoading && nationalQuery.length >= 2 && (
                <div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-4 text-center text-sm text-muted">
                  No se encontraron productos para &ldquo;{nationalQuery}&rdquo;
                </div>
              )}
            </div>
          )}

          {/* Image — upload + preview */}
          <div>
            <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Imagen del producto</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ""; }}
            />
            <div
              className="mt-1 relative aspect-video w-full rounded-lg overflow-hidden bg-gray-50 dark:bg-surface border border-dashed border-[var(--rule-base)] dark:border-card-border cursor-pointer group"
              onClick={() => !uploading && fileInputRef.current?.click()}
            >
              {form.image && !imgError ? (
                <>
                  <Image src={form.image} alt="Preview" fill className="object-cover" onError={() => setImgError(true)} unoptimized />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/90 text-[var(--text-primary)] text-sm font-semibold">
                      <Camera className="h-4 w-4" />
                      Cambiar imagen
                    </div>
                  </div>
                </>
              ) : uploading ? (
                <LoadingState message="Subiendo imagen..." />
              ) : (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-[var(--text-tertiary)] group-hover:text-primary transition-colors">
                  <Camera className="h-10 w-10" />
                  <span className="text-xs font-semibold text-[var(--text-tertiary)] group-hover:text-primary">Click para subir imagen</span>
                </div>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[length:var(--ts-2xs)] text-muted shrink-0">o pega URL:</span>
              <input
                value={form.image ?? ""}
                onChange={(e) => set("image", e.target.value)}
                placeholder="https://..."
                className="flex-1 px-2.5 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>

            {/* Validación de imagen contra estándar del marketplace */}
            {imageValidation && (
              <ImageValidationPanel result={imageValidation} className="mt-3" />
            )}

            {/* Guía de requisitos (visible solo si no hay imagen aún) */}
            {!form.image && !imageValidation && (
              <ImageRequirementsGuide className="mt-3" />
            )}
          </div>

          {/* Name */}
          <div>
            <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Nombre *</label>
            <input
              ref={nameRef}
              value={form.name}
              onChange={(e) => {
                set("name", e.target.value);
                setNameDuplicate(false);
              }}
              onBlur={(e) => checkNameDuplicate(e.target.value)}
              placeholder="Ej: Arroz Extra 5kg"
              className={cn(
                "mt-1 w-full px-3 py-2.5 rounded-lg border bg-white dark:bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:border-primary",
                nameDuplicate
                  ? "border-[var(--data-warning)] dark:border-[var(--data-warning)] focus:ring-[var(--data-warning)]"
                  : "border-[var(--rule-base)] dark:border-card-border focus:ring-primary/30"
              )}
            />
            {nameChecking && (
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">Verificando nombre...</p>
            )}
            {nameDuplicate && !nameChecking && (
              <p className="mt-1 text-xs text-[var(--data-warning)] dark:text-[var(--data-warning)] flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Ya existe un producto con este nombre
              </p>
            )}
          </div>

          {/* Category + Unit */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Categoría *</label>
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              >
                {CATEGORY_OPTS.map((c) => (
                  <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Unidad *</label>
              <select
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              >
                {UNIT_OPTS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* Price + Cost + Stock */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Precio S/ *</label>
              <input
                type="number"
                min={0}
                step={0.1}
                value={form.price === 0 ? "" : form.price}
                onChange={(e) => set("price", parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="mt-1 w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Costo S/</label>
              <input
                type="number"
                min={0}
                step={0.1}
                value={form.costPrice ?? ""}
                onChange={(e) => set("costPrice", e.target.value === "" ? undefined : parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="mt-1 w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              {form.costPrice != null && form.price > 0 && (
                <p className="text-[length:var(--ts-2xs)] text-[var(--data-success)] mt-0.5">Margen: {((1 - form.costPrice / form.price) * 100).toFixed(0)}%</p>
              )}
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Stock</label>
              <input
                type="number"
                min={0}
                value={form.stock ?? ""}
                onChange={(e) => set("stock", e.target.value === "" ? undefined : parseInt(e.target.value) || 0)}
                placeholder="—"
                className="mt-1 w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Stock mín.</label>
              <input
                type="number"
                min={0}
                value={form.stockMin ?? ""}
                onChange={(e) => set("stockMin", e.target.value === "" ? undefined : parseInt(e.target.value) || 0)}
                placeholder="5"
                className="mt-1 w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
          </div>

          {/* Tags personalizados */}
          <div>
            <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted flex items-center gap-1.5">
              <Tag className="h-3 w-3" />
              Etiquetas
            </label>
            {/* Tags activos */}
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.map(tag => (
                  <TagBadge
                    key={tag.name}
                    tag={tag}
                    onRemove={() => removeTag(tag.name)}
                  />
                ))}
              </div>
            )}
            {/* Input nuevo tag */}
            <div className="mt-2 flex gap-2 items-center">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(tagInput, tagColor); } }}
                  placeholder="Agregar etiqueta…"
                  maxLength={30}
                  list="tag-suggestions"
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                {availableTags.length > 0 && (
                  <datalist id="tag-suggestions">
                    {availableTags
                      .filter(t => !tags.some(at => at.name === t.name))
                      .map(t => <option key={t.name} value={t.name} />)
                    }
                  </datalist>
                )}
              </div>
              {/* Color picker */}
              <div className="flex gap-1">
                {(Object.keys(TAG_COLORS) as TagColor[]).map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setTagColor(c)}
                    title={c}
                    className={cn(
                      "h-5 w-5 rounded-full border-2 transition-transform",
                      TAG_COLORS[c].dot,
                      tagColor === c ? "border-gray-700 dark:border-white scale-110" : "border-transparent",
                    )}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => addTag(tagInput, tagColor)}
                disabled={!tagInput.trim()}
                className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            {/* Tags sugeridos */}
            {availableTags.filter(t => !tags.some(at => at.name === t.name)).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {availableTags
                  .filter(t => !tags.some(at => at.name === t.name))
                  .slice(0, 8)
                  .map(t => (
                    <button
                      key={t.name}
                      type="button"
                      onClick={() => addTag(t.name, t.color)}
                      className="px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-medium border border-dashed border-[var(--rule-base)] dark:border-gray-600 text-[var(--text-secondary)] hover:border-primary/50 hover:text-primary transition-colors"
                    >
                      + {t.name}
                    </button>
                  ))
                }
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Descripción</label>
            <textarea
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              placeholder="Descripción breve del producto…"
              className="mt-1 w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
            />
          </div>

          {/* Active toggle */}
          <div className="flex flex-wrap items-center gap-3 bg-gray-50 dark:bg-surface rounded-xl px-2 sm:px-4 py-2 sm:py-3">
            <span className="text-sm font-semibold text-foreground flex-1">Visible en tienda</span>
            <button
              type="button"
              onClick={() => set("active", !form.active)}
              className={cn(
                "relative h-6 w-11 rounded-full transition-colors duration-[var(--dur-base)]",
                form.active ? "bg-[var(--accent-soft)]" : "bg-gray-300 dark:bg-gray-600"
              )}
            >
              <span className={cn(
                "absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform duration-[var(--dur-base)]",
                form.active ? "translate-x-6" : "translate-x-1"
              )} />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-card px-3 sm:px-6 py-4 border-t border-[var(--rule-soft)] dark:border-card-border flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-gray-100 dark:hover:bg-surface transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => valid && onSave(form)}
            disabled={!valid || saving}
            className="flex flex-wrap items-center gap-2 px-5 py-2 rounded-lg bg-primary text-white text-sm font-bold  hover:bg-primary-dark active:scale-95 transition-all disabled:opacity-50"
          >
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Guardando…" : form.id ? "Guardar cambios" : "Crear producto"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function ProductsAdminTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("todos");
  const [viewMode, setViewMode] = useState<"grid" | "list">(() =>
    typeof window !== "undefined" ? (localStorage.getItem("admin-products-view") as "grid" | "list") || "list" : "list"
  );
  const [sortBy, setSortBy] = useState<"name" | "price" | "stock">("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [modal, setModal] = useState<null | "create" | { product: Product }>(null);
  const [showExcelImporter, setShowExcelImporter] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<null | { msg: string; type: "success" | "error" }>(null);

  const showToast = useCallback((msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error("Error cargando productos");
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch {
      showToast("Error cargando productos", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void fetchProducts(); }, [fetchProducts]);

  /* ── CSV Import/Export ──────────────────── */
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvImporting, setCsvImporting] = useState(false);

  const handleExportCSV = () => {
    window.open("/api/products/csv", "_blank");
  };

  const handleImportCSV = async (file: File) => {
    setCsvImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/products/csv", { method: "POST", body: fd });
      const result = await res.json();
      if (res.ok) {
        showToast(`CSV importado: ${result.created} nuevos, ${result.updated} actualizados${result.errors ? `, ${result.errors} errores` : ""}`, "success");
        await fetchProducts();
      } else {
        showToast(result.error ?? "Error al importar CSV", "error");
      }
    } catch {
      showToast("Error al importar CSV", "error");
    } finally {
      setCsvImporting(false);
    }
  };

  const handleSave = async (data: Omit<Product, "id"> & { id?: number }) => {
    setSaving(true);
    try {
      const method = data.id ? "PATCH" : "POST";
      const url = data.id ? `/api/products/${data.id}` : "/api/products";
      const body = { ...data };
      if (!data.id) delete (body as { id?: number }).id;

      const res = await fetch(url, {
        method,
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast(data.id ? "Producto actualizado" : "Producto creado", "success");
      setModal(null);
      await fetchProducts();
    } catch {
      showToast("Error al guardar", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (p: Product) => {
    try {
      const res = await fetch(`/api/products/${p.id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ active: !p.active }),
      });
      if (!res.ok) throw new Error();
      setProducts((prev) => prev.map((x) => x.id === p.id ? { ...x, active: !p.active } : x));
      showToast(!p.active ? "Producto activado" : "Producto ocultado", "success");
    } catch {
      showToast("Error al actualizar visibilidad", "error");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      showToast("Producto eliminado", "success");
      setDeleteTarget(null);
      await fetchProducts();
    } catch {
      showToast("Error al eliminar", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleSort = (key: "name" | "price" | "stock") => {
    if (sortBy === key) setSortAsc((v) => !v);
    else { setSortBy(key); setSortAsc(true); }
  };

  const filtered = products
    .filter((p) =>
      (catFilter === "todos" || p.category === catFilter) &&
      (!search || p.name.toLowerCase().includes(search.toLowerCase()))
    )
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") cmp = a.name.localeCompare(b.name);
      else if (sortBy === "price") cmp = a.price - b.price;
      else if (sortBy === "stock") cmp = (a.stock ?? -1) - (b.stock ?? -1);
      return sortAsc ? cmp : -cmp;
    });

  const SortIcon = ({ col }: { col: "name" | "price" | "stock" }) =>
    sortBy === col
      ? sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
      : <ChevronUp className="h-3 w-3 opacity-30" />;

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-gray-100 dark:bg-surface rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <>
      {/* Header row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
        <div>
          <CardTitle className="text-lg font-extrabold text-foreground">Catálogo de Productos</CardTitle>
          <p className="text-xs text-muted mt-0.5">{filtered.length} de {products.length} productos</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={fetchProducts}
            className="h-9 w-9 rounded-xl border border-[var(--rule-base)] dark:border-card-border flex items-center justify-center text-[var(--text-tertiary)] hover:text-primary hover:border-primary/50 transition-colors"
            title="Recargar"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <div className="flex bg-gray-100 dark:bg-accent rounded-xl p-0.5">
            {(["list", "grid"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => { setViewMode(mode); localStorage.setItem("admin-products-view", mode); }}
                className={cn("p-2 rounded-lg transition-all", viewMode === mode ? "bg-white dark:bg-card text-primary " : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]")}
              >
                {mode === "list" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
              </button>
            ))}
          </div>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-accent text-[var(--text-secondary)] dark:text-muted text-sm font-semibold hover:bg-gray-200 transition-colors"
            title="Exportar productos a CSV"
          >
            <Download className="h-4 w-4" /> CSV
          </button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportCSV(f); e.target.value = ""; }}
          />
          <button
            onClick={() => csvInputRef.current?.click()}
            disabled={csvImporting}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-accent text-[var(--text-secondary)] dark:text-muted text-sm font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50"
            title="Importar productos desde CSV"
          >
            <Upload className="h-4 w-4" /> {csvImporting ? "Importando…" : "Importar"}
          </button>
          <button
            onClick={() => setShowExcelImporter(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success)] dark:text-[var(--data-success)] text-sm font-semibold hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] border border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 transition-colors"
            title="Importar productos desde Excel (.xlsx)"
          >
            <Upload className="h-4 w-4" /> Excel
          </button>
          <button
            onClick={() => setModal("create")}
            className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-primary text-white text-sm font-bold  hover:bg-primary-dark active:scale-95 transition-all"
          >
            <Plus className="h-4 w-4" /> Nuevo
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre…"
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="px-3 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="todos">Todas las categorías</option>
            {CATEGORY_OPTS.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
          </select>
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <EmptyState
          icon={<Package className="h-10 w-10 text-[var(--text-tertiary)]" />}
          title="No se encontraron productos"
          description="Intenta otro término de búsqueda o categoría, o agrega un producto nuevo."
          actions={[
            { label: "Nuevo producto", href: "/admin?tab=productos&new=1", variant: "primary" },
            { label: "Limpiar filtros", onClick: () => {}, variant: "secondary" },
          ]}
        />
      )}

      {/* List view */}
      {viewMode === "list" && filtered.length > 0 && (
        <div className="rounded-xl border border-[var(--rule-base)] dark:border-card-border overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 items-center bg-gray-50 dark:bg-surface px-2 sm:px-4 py-1.5 sm:py-2.5 text-xs font-bold text-muted">
            <span className="w-10">Img</span>
            <button onClick={() => toggleSort("name")} className="flex items-center gap-1 hover:text-foreground">Producto <SortIcon col="name" /></button>
            <span className="w-24 text-center">Categoría</span>
            <button onClick={() => toggleSort("price")} className="flex items-center gap-1 hover:text-foreground w-16 justify-end">Precio <SortIcon col="price" /></button>
            <button onClick={() => toggleSort("stock")} className="flex items-center gap-1 hover:text-foreground w-16 justify-center">Stock <SortIcon col="stock" /></button>
            <span className="w-20 text-right">Acciones</span>
          </div>
          {/* Rows */}
          <div className="divide-y divide-gray-100 dark:divide-card-border">
            {filtered.map((p) => {
              const cat = CATEGORY_OPTS.find((c) => c.id === p.category);
              const isLow = p.stock !== undefined && p.stockMin !== undefined && p.stock <= p.stockMin && p.stock > 0;
              const isOut = p.stock !== undefined && p.stock <= 0;
              return (
                <div
                  key={p.id}
                  className={cn(
                    "grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 items-center px-2 sm:px-4 py-2 sm:py-3 hover:bg-gray-50/50 dark:hover:bg-surface/50 transition-colors",
                    p.active === false && "opacity-50"
                  )}
                >
                  {/* Thumbnail */}
                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 dark:bg-surface shrink-0 relative">
                    {p.image ? (
                      <Image src={p.image} alt={p.name} fill className="object-cover" sizes="40px" unoptimized />
                    ) : (
                      <div className="h-full flex items-center justify-center text-[var(--text-tertiary)]"><Package className="h-5 w-5" /></div>
                    )}
                  </div>
                  {/* Name + badges */}
                  <div className="min-w-0">
                    <p className={cn("text-sm font-semibold text-foreground truncate", p.active === false && "line-through")}>{p.name}</p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[length:var(--ts-2xs)] text-muted">{p.unit}</span>
                      {p.badge && (
                        <span className="text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{p.badge}</span>
                      )}
                      {p.description && (
                        <span className="text-[length:var(--ts-2xs)] text-muted truncate max-w-40 hidden sm:inline">{p.description}</span>
                      )}
                    </div>
                  </div>
                  {/* Category */}
                  <span className="text-[length:var(--ts-xs)] text-muted w-24 text-center truncate">{cat?.emoji} {cat?.label}</span>
                  {/* Price */}
                  <span className="text-sm font-extrabold text-primary w-16 text-right">S/{p.price.toFixed(2)}</span>
                  {/* Stock */}
                  <span className={cn(
                    "text-xs font-bold w-16 text-center",
                    isOut ? "text-[var(--data-error)]" : isLow ? "text-[var(--data-warning)]" : "text-[var(--data-success)]"
                  )}>
                    {p.stock !== undefined ? p.stock : "—"}
                  </span>
                  {/* Actions */}
                  <div className="flex items-center gap-1 w-20 justify-end">
                    <button
                      onClick={() => handleToggleActive(p)}
                      className={cn(
                        "h-7 w-7 rounded-lg flex items-center justify-center transition-colors",
                        p.active === false
                          ? "text-[var(--text-tertiary)] hover:text-[var(--data-success)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)]"
                          : "text-[var(--data-success)] hover:text-[var(--text-tertiary)] hover:bg-gray-100 dark:hover:bg-surface"
                      )}
                      title={p.active === false ? "Activar" : "Ocultar"}
                    >
                      {p.active === false ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => setModal({ product: p })}
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-primary hover:bg-primary/10 transition-colors"
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(p)}
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--data-error)] hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error)]/20 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Grid view */}
      {viewMode === "grid" && filtered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map((p) => {
            const cat = CATEGORY_OPTS.find((c) => c.id === p.category);
            const isOut = p.stock !== undefined && p.stock <= 0;
            return (
              <div
                key={p.id}
                className={cn(
                  "bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border overflow-hidden group",
                  p.active === false && "opacity-50"
                )}
              >
                <div className="relative aspect-square bg-gray-50 dark:bg-surface">
                  {p.image ? (
                    <Image src={p.image} alt={p.name} fill className="object-cover" sizes="200px" unoptimized />
                  ) : (
                    <div className="h-full flex items-center justify-center text-gray-200"><Package className="h-10 w-10" /></div>
                  )}
                  {/* Overlay actions */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <button onClick={() => setModal({ product: p })} className="h-8 w-8 rounded-full bg-white text-primary flex items-center justify-center hover:scale-110 transition-transform">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleToggleActive(p)} className="h-8 w-8 rounded-full bg-white text-[var(--text-secondary)] flex items-center justify-center hover:scale-110 transition-transform">
                      {p.active === false ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => setDeleteTarget(p)} className="h-8 w-8 rounded-full bg-white text-[var(--data-error)] flex items-center justify-center hover:scale-110 transition-transform">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {isOut && <span className="absolute top-1.5 right-1.5 text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded-full bg-[var(--data-error)] text-white">Agotado</span>}
                  {p.active === false && <span className="absolute top-1.5 left-1.5 text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded-full bg-gray-500 text-white">Oculto</span>}
                  {p.badge && p.active !== false && <span className="absolute top-1.5 left-1.5 text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded-full bg-primary text-white">{p.badge}</span>}
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-semibold text-foreground truncate">{p.name}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs font-extrabold text-primary">S/{p.price.toFixed(2)}</span>
                    <span className="text-[length:var(--ts-2xs)] text-muted">{cat?.emoji} {p.stock !== undefined ? `${p.stock} uds.` : ""}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {modal !== null && (
        <ProductFormModal
          initial={modal === "create" ? { ...DEFAULT_FORM } : { ...(modal.product as Omit<Product, "id"> & { id?: number }) }}
          onSave={handleSave}
          onClose={() => setModal(null)}
          saving={saving}
        />
      )}
      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="¿Eliminar producto?"
        description={deleteTarget ? `"${deleteTarget.name}" será eliminado del catálogo. Esta acción no se puede deshacer.` : "Esta acción no se puede deshacer"}
        confirmText="Sí, eliminar"
        loading={saving}
      />
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Excel importer modal */}
      {showExcelImporter && (
        <div
          className="modal-backdrop flex items-center justify-center p-4"
          onClick={() => setShowExcelImporter(false)}
        >
          <div
            className="bg-white dark:bg-card rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-[var(--rule-base)] dark:border-card-border p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <SectionTitle className="text-lg font-extrabold text-foreground">Importar desde Excel</SectionTitle>
              <button
                onClick={() => { setShowExcelImporter(false); void fetchProducts(); }}
                className="h-8 w-8 rounded-full flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-surface transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ExcelProductImporter />
          </div>
        </div>
      )}
    </>
  );
}
