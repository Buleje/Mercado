"use client";

import { AlertTriangle, Search, Camera, CheckCircle } from "@buleje/design-system/icons";
import ProductSpecsEditor from "@/components/admin/inventario/ProductSpecsEditor";
import ProductRichContentEditor from "@/components/admin/inventario/ProductRichContentEditor";
import Image from "next/image";
import { cn } from "@/lib/utils";
import ImageWarningBadge from "@/components/admin/inventario/ImageWarningBadge";
import ImageUploadHints from "@/components/admin/inventario/ImageUploadHints";
import { Field } from "@/components/admin/shared/Field";
import { validateImageUrl } from "@/lib/image-validators";
import { FIELD_INPUT, FIELD_LABEL } from "@/components/admin/inventario/inventario-compartido";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";

/** Nuevo producto: SEO y contenido rico. Pieza de InventoryTab: recibe `useInventario` entero. */
export default function NuevoProductoContenido({ inv }: { inv: Inventario }) {
  const {
    addForm, setAddForm, addSeo, setAddSeo, addSpecs, setAddSpecs, addRich, setAddRich, imgUploading,
    setImgUploading, imgInfo, setImgInfo, imgError, setImgError, addImgRef, uploadImageFile,
  } = inv;
  return (
    <>
      {/* Fase 2: SEO / posicionamiento (opcional) */}
      <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-[var(--text-secondary)]" />
          <p className="text-sm font-bold text-[var(--text-primary)]">SEO / posicionamiento <span className="font-normal text-[var(--text-tertiary)]">(opcional)</span></p>
        </div>
        <Field label={<>Título SEO <span className="font-normal text-[var(--text-tertiary)]">({addSeo.metaTitle.length}/70)</span></>} labelClassName={FIELD_LABEL}>
          <input value={addSeo.metaTitle} onChange={(e) => setAddSeo(s => ({ ...s, metaTitle: e.target.value }))} maxLength={70} placeholder="Ej: Arroz Costeño 5kg — barato en Ciudad Constitución" className={FIELD_INPUT} />
        </Field>
        <Field label={<>Descripción SEO <span className="font-normal text-[var(--text-tertiary)]">({addSeo.metaDescription.length}/160)</span></>} labelClassName={FIELD_LABEL}>
          <textarea value={addSeo.metaDescription} onChange={(e) => setAddSeo(s => ({ ...s, metaDescription: e.target.value }))} maxLength={160} rows={2} placeholder="Aparece en Google bajo el título. Resume el producto en 1-2 líneas." className={cn(FIELD_INPUT, "resize-none")} />
        </Field>
        <Field label={<>Imagen para compartir (URL) <span className="font-normal text-[var(--text-tertiary)]">(opcional)</span></>} labelClassName={FIELD_LABEL}>
          <input value={addSeo.ogImage} onChange={(e) => setAddSeo(s => ({ ...s, ogImage: e.target.value }))} placeholder="https://… (si vacío, usa la imagen del producto)" className={FIELD_INPUT} />
        </Field>
        <p className="text-xs text-[var(--text-tertiary)]">Mejora cómo se ve el producto en Google y al compartir el enlace.</p>
      </div>

      {/* Contenido rico (estilo Amazon) — ficha técnica editable + bloques A+ */}
      <ProductSpecsEditor value={addSpecs} onChange={setAddSpecs} />
      <ProductRichContentEditor value={addRich} onChange={setAddRich} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
        <Field label="Imagen del producto" labelClassName={FIELD_LABEL} className="sm:col-span-2 space-y-3">
          {(imgFieldId) => (<>
          <ImageUploadHints />
          {(() => {
            const validation = validateImageUrl(addForm.image);
            if (!validation.valid && addForm.image) {
              return (
                <p className="text-sm text-[var(--data-warning-500)] flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3" strokeWidth={2} aria-hidden />
                  {validation.reason}
                </p>
              );
            }
            return null;
          })()}
          <div className="flex flex-wrap gap-3 items-start">
            {addForm.image && (
              <div className="relative h-16 w-16 rounded-xl overflow-hidden border border-[var(--rule-base)] dark:border-[var(--rule-base)] shrink-0 bg-[var(--surface-alt)] ">
                <Image src={addForm.image} alt="preview" fill unoptimized={addForm.image.startsWith("data:")} className="object-cover" sizes="64px" />
                <ImageWarningBadge image={addForm.image} size="md" />
              </div>
            )}
            <div className="flex-1 space-y-1.5">
              <button
                type="button"
                onClick={() => addImgRef.current?.click()}
                disabled={imgUploading}
                className="w-full flex flex-wrap items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed border-primary/40 text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/5 transition-colors text-sm font-medium disabled:opacity-50"
              >
                <Camera className="h-4 w-4" />
                {imgUploading ? "Procesando…" : "Subir foto"}
              </button>
              <input
                id={imgFieldId}
                value={addForm.image}
                onChange={(e) => setAddForm(f => ({ ...f, image: e.target.value }))}
                placeholder="o pegar URL de imagen (PNG con fondo transparente)"
                className={FIELD_INPUT}
              />
              <input
                ref={addImgRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setImgUploading(true);
                  setImgError(null);
                  try {
                    // Subir a /api/upload (Supabase Storage + Sharp).
                    // Antes guardaba dataUrl base64 inline — bug de lentitud.
                    const url = await uploadImageFile(file);
                    if (url) {
                      setAddForm(f => ({ ...f, image: url }));
                      setImgInfo({ originalKB: Math.round(file.size / 1024), finalKB: Math.round(file.size / 1024), width: 0, height: 0, quality: 82 });
                    } else {
                      setImgError("No se pudo subir la imagen. Reintenta.");
                    }
                  } catch (err) {
                    setImgError(err instanceof Error ? err.message : "Error al procesar imagen");
                  } finally {
                    setImgUploading(false);
                    e.target.value = "";
                  }
                }}
              />
              {imgInfo && (
                <p className="text-[length:var(--ts-2xs)] text-[var(--data-success-500)] flex items-center gap-1.5 leading-snug">
                  <CheckCircle className="h-3 w-3 shrink-0" />
                  Imagen optimizada: {imgInfo.originalKB} KB → <strong>{imgInfo.finalKB} KB</strong> · {imgInfo.width}×{imgInfo.height}px · WebP {imgInfo.quality}%
                </p>
              )}
              {imgError && (
                <p className="text-[length:var(--ts-2xs)] text-[var(--data-error-500)] flex items-center gap-1.5 leading-snug">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  {imgError}
                </p>
              )}
            </div>
          </div>
          </>)}
        </Field>
      </div>
    </>
  );
}
