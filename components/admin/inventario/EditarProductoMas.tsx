"use client";

import { AlertTriangle, X, Camera, CheckCircle, BookOpen } from "@buleje/design-system/icons";
import Image from "next/image";
import { processImage } from "@/components/admin/inventario/inventory-helpers";
import { Field } from "@/components/admin/shared/Field";
import { FIELD_INPUT, FIELD_LABEL } from "@/components/admin/inventario/inventario-compartido";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";

/** Editar producto: imagen, SEO y más. Pieza de InventoryTab: recibe `useInventario` entero. */
export default function EditarProductoMas({ inv }: { inv: Inventario }) {
  const {
    editModalProduct, editForm, setEditForm, imgUploading, setImgUploading, imgInfo, setImgInfo,
    imgError, setImgError, setShowImageBank, editImgRef, autoSaveImage, uploadImageFile,
  } = inv;
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
        <Field label="Imagen del producto" labelClassName={FIELD_LABEL} className="sm:col-span-2">
          {(editImgFieldId) => (<>
          {/* Drag-and-drop zone — arrastrá o click para subir */}
          <div
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("ring-2", "ring-primary", "bg-primary/5"); }}
            onDragLeave={(e) => { e.currentTarget.classList.remove("ring-2", "ring-primary", "bg-primary/5"); }}
            onDrop={async (e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("ring-2", "ring-primary", "bg-primary/5");
              const file = e.dataTransfer.files?.[0];
              if (!file) return;
              setImgUploading(true);
              setImgError(null);
              try {
                const result = await processImage(file);
                setEditForm(f => ({ ...f, image: result.dataUrl }));
                setImgInfo({ originalKB: result.originalKB, finalKB: result.finalKB, width: result.width, height: result.height, quality: result.quality });
              } catch (err) {
                setImgError(err instanceof Error ? err.message : "Error al procesar imagen");
              } finally {
                setImgUploading(false);
              }
            }}
            className="flex flex-wrap gap-3 items-start p-3 rounded-xl border border-dashed border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary/40 transition-all"
          >
            {editForm.image ? (
              <div className="relative h-20 w-20 rounded-xl overflow-hidden border border-[var(--rule-base)] dark:border-[var(--rule-base)] shrink-0 bg-[var(--surface-alt)] group">
                <Image src={editForm.image} alt="preview" fill unoptimized={editForm.image.startsWith("data:")} className="object-cover" sizes="80px" />
                <button
                  type="button"
                  onClick={() => { setEditForm(f => ({ ...f, image: "" })); setImgInfo(null); }}
                  title="Quitar imagen"
                  className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-[var(--data-error-500)] transition-all"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div className="h-20 w-20 rounded-xl border border-dashed border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-sunken)] flex items-center justify-center shrink-0">
                <Camera className="h-6 w-6 text-[var(--text-tertiary)] dark:text-muted" />
              </div>
            )}
            <div className="flex-1 space-y-1.5 min-w-[180px]">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => editImgRef.current?.click()}
                  disabled={imgUploading}
                  className="inline-flex flex-wrap items-center justify-center gap-2 px-3 min-h-10 rounded-xl bg-primary text-white hover:bg-primary-dark transition-colors text-sm font-semibold disabled:opacity-50"
                >
                  <Camera className="h-4 w-4" />
                  {imgUploading ? "Procesando…" : "Subir foto"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowImageBank(true)}
                  className="inline-flex flex-wrap items-center justify-center gap-2 px-3 min-h-10 rounded-xl bg-linear-to-r from-primary to-[var(--data-success-500)] text-white hover:opacity-90 transition-all text-sm font-semibold"
                  title="Elegir una imagen del banco global mantenido por el superadmin"
                >
                  <BookOpen className="h-4 w-4" />
                  Banco de imágenes
                </button>
              </div>
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted text-center">
                o arrastra una imagen aquí — cualquier formato (JPG, PNG, WebP, AVIF…)
              </p>
              <input
                id={editImgFieldId}
                value={editForm.image ?? ""}
                onChange={(e) => setEditForm(f => ({ ...f, image: e.target.value }))}
                placeholder="o pegar URL de imagen"
                className={FIELD_INPUT}
              />
              <input
                ref={editImgRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setImgUploading(true);
                  setImgError(null);
                  try {
                    // Subir a /api/upload (Supabase Storage + Sharp) y auto-save.
                    // Antes guardaba dataUrl base64 inline — el JSON del PUT
                    // pesaba 1-5MB y a veces fallaba silencioso.
                    const url = await uploadImageFile(file);
                    if (url) {
                      setEditForm(f => ({ ...f, image: url }));
                      setImgInfo({ originalKB: Math.round(file.size / 1024), finalKB: Math.round(file.size / 1024), width: 0, height: 0, quality: 82 });
                      // AUTO-SAVE: el usuario ya no espera al click "Guardar".
                      if (editModalProduct) {
                        void autoSaveImage(editModalProduct.id, url);
                      }
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
