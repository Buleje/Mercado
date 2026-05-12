"use client";

/**
 * ProductVariantsInline — editor inline de variantes para un producto.
 *
 * Carga vía GET /api/marketplace/products/{id}/variants y persiste via
 * POST/PUT/DELETE. Cada variante: nombre, atributo (e.g. "500ml"), delta
 * de precio sobre el padre, stock propio, imagen opcional.
 *
 * El campo `attributesJson` (text en DB) almacena un JSON con shape:
 *   { "attr": "500ml", "image": "data:image/webp;base64,..." }
 *
 * Uso:
 *   <ProductVariantsInline productId={123} basePrice={5.5} parentImage="..." />
 */

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { csrfHeaders } from "@/lib/csrf-client";
import { Plus, Trash2, Camera, Check, X, Loader2, AlertTriangle, GripVertical, Sparkles, ChevronDown } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Plantillas — sets pre-armados de variantes comunes ──────────────────────
// Formato: { name } se usa como label; { attr } se guarda en attributesJson.
// El priceModifier arranca en 0 para todas — el usuario lo ajusta luego.

interface TemplateItem { name: string; attr: string }

const VARIANT_TEMPLATES: { id: string; label: string; description: string; items: TemplateItem[] }[] = [
  {
    id: "tallas",
    label: "Tallas",
    description: "S, M, L, XL — ropa, calzado",
    items: [
      { name: "Talla S", attr: "S" },
      { name: "Talla M", attr: "M" },
      { name: "Talla L", attr: "L" },
      { name: "Talla XL", attr: "XL" },
    ],
  },
  {
    id: "tallas-completas",
    label: "Tallas completas",
    description: "XS hasta XXL",
    items: [
      { name: "Talla XS", attr: "XS" },
      { name: "Talla S", attr: "S" },
      { name: "Talla M", attr: "M" },
      { name: "Talla L", attr: "L" },
      { name: "Talla XL", attr: "XL" },
      { name: "Talla XXL", attr: "XXL" },
    ],
  },
  {
    id: "tamanos-liquido",
    label: "Tamaños — líquido",
    description: "200ml, 500ml, 1L, 2L",
    items: [
      { name: "200 ml", attr: "200ml" },
      { name: "500 ml", attr: "500ml" },
      { name: "1 litro", attr: "1L" },
      { name: "2 litros", attr: "2L" },
    ],
  },
  {
    id: "tamanos-peso",
    label: "Tamaños — peso",
    description: "100g, 250g, 500g, 1kg",
    items: [
      { name: "100 g", attr: "100g" },
      { name: "250 g", attr: "250g" },
      { name: "500 g", attr: "500g" },
      { name: "1 kg", attr: "1kg" },
    ],
  },
  {
    id: "sabores-basicos",
    label: "Sabores básicos",
    description: "Chocolate, vainilla, fresa",
    items: [
      { name: "Chocolate", attr: "chocolate" },
      { name: "Vainilla", attr: "vainilla" },
      { name: "Fresa", attr: "fresa" },
    ],
  },
  {
    id: "sabores-extendidos",
    label: "Sabores extendidos",
    description: "Chocolate, vainilla, fresa, mango, lúcuma",
    items: [
      { name: "Chocolate", attr: "chocolate" },
      { name: "Vainilla", attr: "vainilla" },
      { name: "Fresa", attr: "fresa" },
      { name: "Mango", attr: "mango" },
      { name: "Lúcuma", attr: "lucuma" },
    ],
  },
  {
    id: "colores-basicos",
    label: "Colores básicos",
    description: "Rojo, azul, negro, blanco",
    items: [
      { name: "Rojo", attr: "rojo" },
      { name: "Azul", attr: "azul" },
      { name: "Negro", attr: "negro" },
      { name: "Blanco", attr: "blanco" },
    ],
  },
  {
    id: "packs",
    label: "Packs / cantidades",
    description: "Unidad, pack x6, pack x12, pack x24",
    items: [
      { name: "Unidad", attr: "x1" },
      { name: "Pack x6", attr: "x6" },
      { name: "Pack x12", attr: "x12" },
      { name: "Pack x24", attr: "x24" },
    ],
  },
];

interface VariantRow {
  id?: string;
  name: string;
  attr: string;
  priceModifier: number;
  stock: number | null;
  image: string | null;
  sku: string | null;
}

interface VariantApiRow {
  id: string;
  name: string;
  sku: string | null;
  priceModifier: number;
  stock: number | null;
  attributesJson: string | null;
  isActive: boolean;
  position: number;
}

function parseAttrs(json: string | null): { attr: string; image: string | null } {
  if (!json) return { attr: "", image: null };
  try {
    const o = JSON.parse(json) as { attr?: string; image?: string };
    return { attr: o.attr ?? "", image: o.image ?? null };
  } catch {
    return { attr: json, image: null };
  }
}

function buildAttrs(attr: string, image: string | null): string {
  const obj: { attr?: string; image?: string } = {};
  if (attr) obj.attr = attr;
  if (image) obj.image = image;
  return JSON.stringify(obj);
}

async function compressVariantImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Archivo no es imagen");
  if (file.size > 30 * 1024 * 1024) throw new Error("Imagen >30MB");
  const img = new window.Image();
  const url = URL.createObjectURL(file);
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("No se pudo leer"));
    img.src = url;
  });
  URL.revokeObjectURL(url);
  // Variantes son thumbs — más chicas que la imagen principal
  const maxPx = 600;
  const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  // Iterar quality hasta <30KB (cabe en attributesJson 50KB con margen)
  let q = 0.82;
  let dataUrl = canvas.toDataURL("image/webp", q);
  while (((dataUrl.split(",")[1] ?? "").length * 0.75) > 30 * 1024 && q > 0.4) {
    q -= 0.08;
    dataUrl = canvas.toDataURL("image/webp", q);
  }
  return dataUrl;
}

interface Props {
  productId: number;
  basePrice: number;
  parentImage?: string | null;
}

export default function ProductVariantsInline({ productId, basePrice, parentImage }: Props) {
  const [rows, setRows] = useState<VariantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [draftRow, setDraftRow] = useState<VariantRow | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImageFor, setPendingImageFor] = useState<"draft" | string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [generatingFromTemplate, setGeneratingFromTemplate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/marketplace/products/${productId}/variants`);
      if (!res.ok) throw new Error("Error al cargar variantes");
      const data = await res.json() as { data: VariantApiRow[] };
      const mapped = (data.data ?? []).map(v => {
        const a = parseAttrs(v.attributesJson);
        return {
          id: v.id,
          name: v.name,
          attr: a.attr,
          priceModifier: v.priceModifier ?? 0,
          stock: v.stock ?? null,
          image: a.image,
          sku: v.sku ?? null,
        };
      });
      setRows(mapped);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => { load(); }, [load]);

  const handleSaveRow = async (row: VariantRow, isNew: boolean) => {
    if (!row.name.trim()) {
      setError("El nombre de la variante es obligatorio");
      return;
    }
    setError(null);
    setSaving(row.id ?? "draft");
    try {
      const body = {
        name: row.name.trim(),
        priceModifier: row.priceModifier,
        stock: row.stock ?? undefined,
        sku: row.sku ?? undefined,
        attributesJson: buildAttrs(row.attr.trim(), row.image),
      };
      const url = isNew
        ? `/api/marketplace/products/${productId}/variants`
        : `/api/marketplace/products/${productId}/variants?variantId=${encodeURIComponent(row.id ?? "")}`;
      const res = await fetch(url, {
        method: isNew ? "POST" : "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error ?? "Error al guardar");
      }
      if (isNew) setDraftRow(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(null);
    }
  };

  const handleGenerateFromTemplate = async (templateId: string) => {
    const tpl = VARIANT_TEMPLATES.find(t => t.id === templateId);
    if (!tpl) return;
    setShowTemplates(false);
    setGeneratingFromTemplate(true);
    setError(null);
    let createdCount = 0;
    let failCount = 0;
    try {
      // Filtrar items que ya existen (mismo attr) para no duplicar
      const existingAttrs = new Set(rows.map(r => r.attr.toLowerCase()));
      const itemsToCreate = tpl.items.filter(it => !existingAttrs.has(it.attr.toLowerCase()));
      if (itemsToCreate.length === 0) {
        setError(`Ya tenés todas las variantes de "${tpl.label}"`);
        return;
      }
      // POST en serie (no paralelo) para preservar position y evitar rate limits
      for (let i = 0; i < itemsToCreate.length; i++) {
        const it = itemsToCreate[i];
        const body = {
          name: it.name,
          priceModifier: 0,
          attributesJson: JSON.stringify({ attr: it.attr }),
        };
        const res = await fetch(`/api/marketplace/products/${productId}/variants`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...csrfHeaders() },
          body: JSON.stringify(body),
        });
        if (res.ok) createdCount++;
        else failCount++;
      }
      await load();
      if (failCount > 0 && createdCount === 0) {
        setError(`No se pudieron crear las variantes`);
      } else if (failCount > 0) {
        setError(`Se crearon ${createdCount} de ${itemsToCreate.length} (${failCount} fallaron)`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error generando variantes");
    } finally {
      setGeneratingFromTemplate(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta variante?")) return;
    setSaving(id);
    try {
      const res = await fetch(`/api/marketplace/products/${productId}/variants?variantId=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: { ...csrfHeaders() },
      });
      if (!res.ok) throw new Error("No se pudo eliminar");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setSaving(null);
    }
  };

  const handleFileSelected = async (file: File, target: "draft" | string) => {
    setError(null);
    try {
      const dataUrl = await compressVariantImage(file);
      if (target === "draft" && draftRow) {
        setDraftRow({ ...draftRow, image: dataUrl });
      } else {
        setRows(rs => rs.map(r => r.id === target ? { ...r, image: dataUrl } : r));
        const target_row = rows.find(r => r.id === target);
        if (target_row) await handleSaveRow({ ...target_row, image: dataUrl }, false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al procesar imagen");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[var(--data-error-50)] dark:bg-red-950/20 text-[var(--data-error-500)] text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Lista de variantes existentes */}
      {rows.length === 0 && !draftRow ? (
        <div className="text-center py-6 px-4 rounded-lg border border-dashed border-[var(--rule-base)] dark:border-[var(--rule-base)]">
          <p className="text-sm text-[var(--text-tertiary)] dark:text-muted">
            Este producto no tiene variantes (presentaciones, tallas, sabores).
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <VariantCard
              key={r.id}
              row={r}
              basePrice={basePrice}
              parentImage={parentImage}
              saving={saving === r.id}
              onChange={(patch) => setRows(rs => rs.map(x => x.id === r.id ? { ...x, ...patch } : x))}
              onSave={() => handleSaveRow(r, false)}
              onDelete={() => r.id && handleDelete(r.id)}
              onUploadImage={() => { setPendingImageFor(r.id ?? null); fileInputRef.current?.click(); }}
              onDropImage={(file) => r.id && handleFileSelected(file, r.id)}
            />
          ))}
        </div>
      )}

      {/* Form draft para nueva variante */}
      {draftRow && (
        <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Plus className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider text-primary">Nueva variante</span>
          </div>
          <VariantCard
            row={draftRow}
            basePrice={basePrice}
            parentImage={parentImage}
            saving={saving === "draft"}
            onChange={(patch) => setDraftRow(d => d ? { ...d, ...patch } : d)}
            onSave={() => handleSaveRow(draftRow, true)}
            onDelete={() => setDraftRow(null)}
            onUploadImage={() => { setPendingImageFor("draft"); fileInputRef.current?.click(); }}
            onDropImage={(file) => handleFileSelected(file, "draft")}
            isDraft
          />
        </div>
      )}

      {/* Acciones — agregar + plantillas */}
      {!draftRow && (
        <div className="flex flex-wrap items-stretch gap-2">
          <button
            type="button"
            onClick={() => setDraftRow({ name: "", attr: "", priceModifier: 0, stock: null, image: null, sku: null })}
            className="flex-1 min-w-[160px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-primary/40 text-primary hover:bg-primary/5 transition-colors text-sm font-bold"
          >
            <Plus className="h-4 w-4" />
            Agregar variante
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowTemplates(s => !s)}
              disabled={generatingFromTemplate}
              className="h-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-linear-to-r from-primary to-[var(--data-success-500)] text-white text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50"
              title="Crear varias variantes desde una plantilla pre-armada"
            >
              {generatingFromTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generatingFromTemplate ? "Creando…" : "Desde plantilla"}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showTemplates && "rotate-180")} />
            </button>
            {showTemplates && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowTemplates(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 w-72 max-h-80 overflow-y-auto rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-xl">
                  <div className="px-3 py-2 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                    <p className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Elegí una plantilla</p>
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">Crea todas las variantes en un click. Después podés editarlas o agregar más.</p>
                  </div>
                  {VARIANT_TEMPLATES.map(tpl => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => handleGenerateFromTemplate(tpl.id)}
                      className="w-full text-left px-3 py-2.5 hover:bg-[var(--surface-sunken)] dark:hover:bg-surface transition-colors border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] last:border-b-0"
                    >
                      <p className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{tpl.label}</p>
                      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">{tpl.description}</p>
                      <p className="text-[length:var(--ts-2xs)] text-primary font-semibold mt-0.5">{tpl.items.length} variantes</p>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* File input compartido para todas las variantes */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file || !pendingImageFor) return;
          await handleFileSelected(file, pendingImageFor);
          e.target.value = "";
          setPendingImageFor(null);
        }}
      />
    </div>
  );
}

// ── Variant card (row inline-editable) ───────────────────────────────────────

interface CardProps {
  row: VariantRow;
  basePrice: number;
  parentImage?: string | null;
  saving: boolean;
  isDraft?: boolean;
  onChange: (patch: Partial<VariantRow>) => void;
  onSave: () => void;
  onDelete: () => void;
  onUploadImage: () => void;
  onDropImage?: (file: File) => void;
}

function VariantCard({ row, basePrice, parentImage, saving, isDraft, onChange, onSave, onDelete, onUploadImage, onDropImage }: CardProps) {
  const finalPrice = basePrice + (row.priceModifier ?? 0);
  const previewImg = row.image || parentImage || "";

  return (
    <div className={cn(
      "flex flex-wrap items-start gap-3 p-3 rounded-xl bg-[var(--surface-raised)] border",
      isDraft ? "border-primary/40" : "border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-[var(--rule-strong)]"
    )}>
      {!isDraft && (
        <div className="hidden sm:flex items-center pt-1.5 text-[var(--text-tertiary)] dark:text-muted cursor-grab" title="Arrastrar para reordenar (próximamente)">
          <GripVertical className="h-4 w-4" />
        </div>
      )}

      {/* Imagen — click para subir o arrastrar al cuadro */}
      <button
        type="button"
        onClick={onUploadImage}
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("ring-2", "ring-primary"); }}
        onDragLeave={(e) => { e.currentTarget.classList.remove("ring-2", "ring-primary"); }}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove("ring-2", "ring-primary");
          const file = e.dataTransfer.files?.[0];
          if (file && onDropImage) onDropImage(file);
        }}
        className="relative h-16 w-16 rounded-lg overflow-hidden border-2 border-dashed border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary shrink-0 bg-[var(--surface-sunken)] dark:bg-surface group transition-all"
        title="Click para elegir o arrastrá una imagen aquí"
      >
        {previewImg ? (
          <Image
            src={previewImg}
            alt={row.name || "variante"}
            fill
            unoptimized={previewImg.startsWith("data:")}
            className={cn("object-cover", !row.image && "opacity-40")}
            sizes="64px"
          />
        ) : null}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
          <Camera className="h-4 w-4 text-white opacity-0 group-hover:opacity-100" />
        </div>
        {!row.image && parentImage && (
          <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[length:var(--ts-2xs)] py-0.5 text-center font-bold">
            heredada
          </span>
        )}
        {!row.image && !parentImage && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--text-tertiary)]">
            <Camera className="h-4 w-4" />
            <span className="text-[length:var(--ts-2xs)] font-bold mt-0.5">+ foto</span>
          </div>
        )}
      </button>

      {/* Inputs */}
      <div className="flex-1 min-w-[200px] grid grid-cols-1 sm:grid-cols-4 gap-2">
        <input
          value={row.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Nombre (ej: Talla M)"
          className="sm:col-span-2 px-2.5 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary"
        />
        <input
          value={row.attr}
          onChange={(e) => onChange({ attr: e.target.value })}
          placeholder="Atributo (500ml, M, rojo)"
          className="sm:col-span-2 px-2.5 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary"
        />
        <div className="flex items-center gap-1">
          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-bold">±S/</span>
          <input
            type="number"
            step="0.10"
            value={row.priceModifier}
            onChange={(e) => onChange({ priceModifier: Number(e.target.value) || 0 })}
            placeholder="0.00"
            className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm font-mono text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary"
            title="Diferencia de precio respecto al padre"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-bold">stock</span>
          <input
            type="number"
            min="0"
            value={row.stock ?? ""}
            onChange={(e) => onChange({ stock: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="—"
            className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm font-mono text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary"
          />
        </div>
        <input
          value={row.sku ?? ""}
          onChange={(e) => onChange({ sku: e.target.value || null })}
          placeholder="SKU (opcional)"
          className="sm:col-span-2 px-2.5 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm font-mono text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary"
        />

        {/* Resumen precio final */}
        <p className="sm:col-span-4 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">
          Precio final: <strong className="text-[var(--text-primary)] dark:text-[var(--text-primary)]">S/{finalPrice.toFixed(2)}</strong>
          {row.priceModifier !== 0 && (
            <span className="ml-1.5">
              ({row.priceModifier > 0 ? "+" : ""}{Number(row.priceModifier).toFixed(2)} sobre el base S/{basePrice.toFixed(2)})
            </span>
          )}
        </p>
      </div>

      {/* Acciones */}
      <div className="flex flex-col gap-1 shrink-0">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-colors disabled:opacity-60"
          title={isDraft ? "Crear variante" : "Guardar cambios"}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {isDraft ? "Crear" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-surface border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--data-error-500)] text-xs font-bold hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/20 transition-colors"
          title={isDraft ? "Cancelar" : "Eliminar"}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {isDraft ? "" : ""}
        </button>
      </div>
    </div>
  );
}
