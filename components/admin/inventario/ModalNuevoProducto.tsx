"use client";

import { SectionTitle } from "@buleje/design-system";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { Loader2, Plus, X, Camera, PackagePlus } from "@buleje/design-system/icons";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { fmt } from "@/components/admin/inventario/inventario-compartido";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";
import NuevoProductoDatos from "@/components/admin/inventario/NuevoProductoDatos";
import NuevoProductoVariantes from "@/components/admin/inventario/NuevoProductoVariantes";
import NuevoProductoContenido from "@/components/admin/inventario/NuevoProductoContenido";

/** Ventana «Nuevo producto». Pieza de InventoryTab: recibe `useInventario` entero. */
export default function ModalNuevoProducto({ inv }: { inv: Inventario }) {
  const {
    saving, showAdd, setShowAdd, addModalRef, ventanaAdd, addForm, addVariants, addGallery,
    setAddGallery, galleryUploading, setGalleryUploading, galleryRef, uploadImageFile, formCategories,
    addProduct,
  } = inv;
  return (
    <>
      {/* ── Add product modal ── */}
      {showAdd && (
        <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-[2px] sm:p-4" onClick={(e) => e.target === e.currentTarget && !ventanaAdd.fijado && setShowAdd(false)}>
          <div ref={addModalRef} role="dialog" aria-modal="true" aria-label="Nuevo producto" tabIndex={-1} className="relative bg-[var(--surface-raised)] w-full sm:max-w-5xl sm:rounded-2xl rounded-t-2xl overflow-y-auto max-h-[92dvh] border border-[var(--rule-base)] shadow-xl">
            <div {...ventanaAdd.asaProps} className="sticky top-0 z-10 flex items-center justify-between gap-3 px-6 py-4 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)]/95 backdrop-blur">
              <div className="min-w-0">
                <SectionTitle className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)]">Nuevo producto</SectionTitle>
                <p className="text-xs text-[var(--text-tertiary)]">Producto físico o servicio del catálogo</p>
              </div>
              <span className="ml-auto flex items-center gap-1 shrink-0">
                <ControlesDeVentana ventana={ventanaAdd} />
                <button onClick={() => setShowAdd(false)} aria-label="Cerrar" className="h-9 w-9 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </span>
            </div>
            <form onSubmit={addProduct} className="p-6 space-y-6">
              {/* Vista previa compacta — solo mobile (en desktop va la tarjeta sticky de la derecha) */}
              <div className="lg:hidden flex items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
                {addForm.image ? (
                  <Image src={addForm.image} alt="" width={48} height={48} unoptimized={addForm.image.startsWith("data:")} className="h-12 w-12 rounded-lg object-cover border border-[var(--rule-soft)] bg-[var(--surface-alt)]" />
                ) : (
                  <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"><PackagePlus className="h-6 w-6" /></span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold text-[var(--text-primary)]">{addForm.name.trim() || "Nuevo producto"}</p>
                  <p className="truncate text-xs text-[var(--text-tertiary)]">{formCategories.find(c => c.id === addForm.category)?.label ?? "Sin categoría"} · {addForm.type === "service" ? "Servicio" : "Producto"}</p>
                </div>
                <span className="shrink-0 font-mono text-base font-extrabold text-primary">{addForm.price ? fmt(Number(addForm.price)) : "S/—"}</span>
              </div>

              {/* Layout 2 columnas: formulario (izq) + vista previa sticky (der, desktop) */}
              <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6 lg:items-start">
                <div className="space-y-6 min-w-0">
              <NuevoProductoDatos inv={inv} />

              <NuevoProductoVariantes inv={inv} />

              <NuevoProductoContenido inv={inv} />

              {/* Fase 2: Galería de fotos adicionales (ProductImage[]) */}
              <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Camera className="h-4 w-4 text-[var(--text-secondary)]" />
                    <p className="text-sm font-bold text-[var(--text-primary)]">Galería <span className="font-normal text-[var(--text-tertiary)]">(fotos adicionales)</span></p>
                  </div>
                  <button
                    type="button"
                    onClick={() => galleryRef.current?.click()}
                    disabled={galleryUploading}
                    className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-2.5 py-1.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/5 transition-colors disabled:opacity-50"
                  >
                    {galleryUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Agregar foto
                  </button>
                </div>
                <input
                  ref={galleryRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const files = [...(e.target.files ?? [])];
                    e.target.value = "";
                    if (!files.length) return;
                    setGalleryUploading(true);
                    try {
                      const urls = await Promise.all(files.map(f => uploadImageFile(f)));
                      setAddGallery(g => [...g, ...urls.filter((u): u is string => !!u)]);
                    } catch (err) {
                      console.error("[InventoryTab] galería upload falló", err);
                    } finally {
                      setGalleryUploading(false);
                    }
                  }}
                />
                {addGallery.length === 0 ? (
                  <p className="text-xs text-[var(--text-tertiary)]">Sube más ángulos del producto. La principal es la de arriba; estas son extra.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {addGallery.map((url, i) => (
                      <div key={i} className="relative h-16 w-16 rounded-lg overflow-hidden border border-[var(--rule-base)] bg-[var(--surface-alt)]">
                        <Image src={url} alt={`Foto ${i + 1}`} fill unoptimized={url.startsWith("data:")} className="object-cover" sizes="64px" />
                        <button
                          type="button"
                          onClick={() => setAddGallery(g => g.filter((_, j) => j !== i))}
                          title="Quitar foto"
                          className="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-[var(--data-error-500)] transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
                </div>

                {/* Columna derecha — vista previa en vivo (desktop, sticky) */}
                <aside className="hidden lg:block">
                  <div className="sticky top-4">
                    <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
                      <p className="px-4 pt-3 text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Vista previa</p>
                      <div className="mx-4 mt-2 aspect-square rounded-xl overflow-hidden bg-[var(--surface-sunken)] flex items-center justify-center relative">
                        {addForm.image ? (
                          <Image src={addForm.image} alt={addForm.name || "Producto"} fill unoptimized={addForm.image.startsWith("data:")} className="object-cover" sizes="300px" />
                        ) : (
                          <PackagePlus className="h-14 w-14 text-[var(--text-tertiary)]" strokeWidth={1.25} />
                        )}
                        {addForm.badge && (
                          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--accent)] text-white">{addForm.badge}</span>
                        )}
                      </div>
                      <div className="p-4 space-y-2">
                        <p className="text-xs text-[var(--text-tertiary)]">
                          {formCategories.find(c => c.id === addForm.category)?.label ?? "Sin categoría"}{addForm.brand ? ` · ${addForm.brand}` : ""}
                        </p>
                        <p className="text-sm font-extrabold text-[var(--text-primary)] line-clamp-2 min-h-[2.5em]">{addForm.name.trim() || "Nombre del producto"}</p>
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-xl font-extrabold text-primary">{addForm.price ? fmt(Number(addForm.price)) : "S/—"}</span>
                          {addForm.unit && <span className="text-xs text-[var(--text-tertiary)]">/ {addForm.unit}</span>}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {(() => {
                            const price = Number(addForm.price) || 0;
                            const cost = Number(addForm.costPrice) || 0;
                            if (cost > 0 && price > 0) {
                              return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">Margen {((1 - cost / price) * 100).toFixed(0)}%</span>;
                            }
                            return null;
                          })()}
                          {addForm.type !== "service" && addForm.trackStock && addForm.stock !== "" && (() => {
                            const s = Number(addForm.stock) || 0;
                            const min = addForm.stockMin !== "" ? Number(addForm.stockMin) : 0;
                            const cls = s <= 0 ? "bg-[var(--data-error-100)] text-[var(--data-error-500)]" : s <= min ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]" : "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]";
                            const txt = s <= 0 ? "Sin stock" : s <= min ? `Stock bajo · ${s}` : `En stock · ${s}`;
                            return <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", cls)}>{txt}</span>;
                          })()}
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
                            {addForm.taxType === "exonerado" ? "Exonerado" : addForm.taxType === "inafecto" ? "Inafecto" : "IGV 18%"}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
                            {addForm.type === "service" ? "Servicio" : "Producto"}
                          </span>
                        </div>
                        {addForm.type !== "service" && (addForm.weightKg || addForm.dimensions) && (
                          <p className="text-xs text-[var(--text-tertiary)]">
                            {addForm.weightKg ? `${addForm.weightKg} kg` : ""}{addForm.weightKg && addForm.dimensions ? " · " : ""}{addForm.dimensions || ""}
                          </p>
                        )}
                        {addVariants.filter(v => v.name.trim()).length > 0 && (
                          <p className="text-xs font-semibold text-[var(--accent)]">{addVariants.filter(v => v.name.trim()).length} presentación(es)</p>
                        )}
                        <p className="pt-1 text-[length:var(--ts-2xs,0.6875rem)] text-[var(--text-tertiary)] leading-snug">Así se verá en tu tienda mientras lo creas.</p>
                      </div>
                    </div>
                  </div>
                </aside>
              </div>

              <div className="sticky bottom-0 -mx-6 -mb-6 flex items-center gap-3 border-t-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] px-6 py-4">
                <button type="button" onClick={() => setShowAdd(false)} className="h-11 px-5 rounded-xl border border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors">Cancelar</button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold text-white shadow-[var(--shadow-lg)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-xl)] active:translate-y-0 disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none"
                  style={{ backgroundImage: "linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)" }}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" strokeWidth={2.5} />}
                  {saving ? "Guardando…" : (addForm.type === "service" ? "Agregar servicio" : "Agregar producto")}
                </button>
              </div>
            </form>
            <TiradorDeVentana ventana={ventanaAdd} />
          </div>
        </div>
      )}
    </>
  );
}
