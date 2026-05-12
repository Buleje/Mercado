"use client";

/**
 * BulkImageAssignModal — split-view drag&drop para asignar imágenes del banco
 * a productos sin imagen en bloque. Abre con un solo click, todos los productos
 * sin foto a la derecha, banco completo a la izquierda. Drag de izq → drop en
 * der dispara PUT /api/products/:id automático y marca como asignado en verde.
 *
 * Solucion al pain point: editar un producto a la vez para asignar imagen del
 * banco era lento; aca asignas N en segundos.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { X, Search, Image as ImageIcon, Check, Loader2, Package, Sparkles } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { DbProduct } from "@/lib/jsondb";

interface BankItem { id: string; name: string; imageUrl: string }
interface BankCategory { id: string; name: string; description?: string; items: BankItem[] }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Snapshot completo de productos del tenant. */
  products: DbProduct[];
  /** Notifica al padre que un producto recibió imagen, para optimistic update. */
  onAssigned: (productId: number, imageUrl: string) => void;
}

export default function BulkImageAssignModal({ open, onOpenChange, products, onAssigned }: Props) {
  const [categories, setCategories] = useState<BankCategory[]>([]);
  const [loadingBank, setLoadingBank] = useState(true);
  const [bankError, setBankError] = useState<string | null>(null);
  const [bankSearch, setBankSearch] = useState("");
  const [activeCatId, setActiveCatId] = useState<string | null>(null);

  const [productSearch, setProductSearch] = useState("");
  const [activeProductCat, setActiveProductCat] = useState<string | null>(null);
  const [savingProductIds, setSavingProductIds] = useState<Set<number>>(new Set());
  const [recentlyAssigned, setRecentlyAssigned] = useState<Map<number, string>>(new Map());
  const [dragOverProductId, setDragOverProductId] = useState<number | null>(null);
  const [draggingItem, setDraggingItem] = useState<BankItem | null>(null);

  const reloadBank = useCallback(async () => {
    setLoadingBank(true);
    setBankError(null);
    try {
      const res = await fetch("/api/admin/image-bank");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { categories: BankCategory[] };
      setCategories(data.categories ?? []);
    } catch (e) {
      setBankError(e instanceof Error ? e.message : "Error cargando banco");
    } finally {
      setLoadingBank(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void reloadBank();
      setRecentlyAssigned(new Map());
      setBankSearch("");
      setProductSearch("");
      setActiveCatId(null);
      setActiveProductCat(null);
    }
  }, [open, reloadBank]);

  // Pool base — productos sin imagen (incluye los recien asignados para
  // que sigan visibles con badge verde mientras el modal esta abierto).
  const baseWithoutImage = useMemo(
    () => products.filter((p) => !p.image || p.image.trim() === "" || recentlyAssigned.has(p.id)),
    [products, recentlyAssigned],
  );

  // Categorias del pool — solo las que tienen al menos 1 producto sin imagen.
  // Cada chip muestra cuantos quedan pendientes (sin contar los ya asignados
  // en esta sesion) para que Brandon vea el progreso.
  const productCategories = useMemo(() => {
    const map = new Map<string, { total: number; pending: number }>();
    for (const p of baseWithoutImage) {
      const cat = p.category || "Sin categoria";
      const cur = map.get(cat) ?? { total: 0, pending: 0 };
      cur.total += 1;
      if (!recentlyAssigned.has(p.id)) cur.pending += 1;
      map.set(cat, cur);
    }
    return Array.from(map.entries())
      .map(([name, counts]) => ({ name, ...counts }))
      .sort((a, b) => b.pending - a.pending || a.name.localeCompare(b.name));
  }, [baseWithoutImage, recentlyAssigned]);

  const productsWithoutImage = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return baseWithoutImage
      .filter((p) => !activeProductCat || p.category === activeProductCat)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.barcode ?? "").includes(q))
      .sort((a, b) => {
        // Recién asignados primero (feedback visual de progreso)
        const aR = recentlyAssigned.has(a.id);
        const bR = recentlyAssigned.has(b.id);
        if (aR !== bR) return aR ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [baseWithoutImage, productSearch, activeProductCat, recentlyAssigned]);

  const visibleCats = useMemo(() => {
    return categories
      .filter((c) => !activeCatId || c.id === activeCatId)
      .map((c) => ({
        ...c,
        items: c.items.filter((it) => {
          if (!it.imageUrl || it.imageUrl.trim() === "") return false;
          if (!bankSearch.trim()) return true;
          return it.name.toLowerCase().includes(bankSearch.toLowerCase());
        }),
      }))
      .filter((c) => c.items.length > 0);
  }, [categories, activeCatId, bankSearch]);

  const totalBankItems = visibleCats.reduce((s, c) => s + c.items.length, 0);

  const assignImage = useCallback(
    async (productId: number, imageUrl: string) => {
      setSavingProductIds((prev) => new Set(prev).add(productId));
      try {
        const res = await fetch(`/api/products/${productId}`, {
          method: "PUT",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ image: imageUrl }),
        });
        if (!res.ok) {
          toast.error("No se pudo guardar la imagen", { duration: 3000 });
          return;
        }
        setRecentlyAssigned((prev) => {
          const next = new Map(prev);
          next.set(productId, imageUrl);
          return next;
        });
        onAssigned(productId, imageUrl);
        toast.success("Imagen asignada", { duration: 1200 });
      } catch {
        toast.error("Error de red", { duration: 3000 });
      } finally {
        setSavingProductIds((prev) => {
          const next = new Set(prev);
          next.delete(productId);
          return next;
        });
      }
    },
    [onAssigned],
  );

  const handleDragStart = (e: React.DragEvent<HTMLButtonElement>, item: BankItem) => {
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("application/x-bsm-image", JSON.stringify(item));
    setDraggingItem(item);
  };

  const handleDragEnd = () => {
    setDraggingItem(null);
    setDragOverProductId(null);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, productId: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (dragOverProductId !== productId) setDragOverProductId(productId);
  };

  const handleDragLeave = (productId: number) => {
    if (dragOverProductId === productId) setDragOverProductId(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, productId: number) => {
    e.preventDefault();
    setDragOverProductId(null);
    setDraggingItem(null);
    const raw = e.dataTransfer.getData("application/x-bsm-image");
    if (!raw) return;
    try {
      const item = JSON.parse(raw) as BankItem;
      if (!item.imageUrl) return;
      void assignImage(productId, item.imageUrl);
    } catch {
      /* noop */
    }
  };

  // Tap-to-assign — fallback mobile sin drag&drop nativo:
  // si hay un item "armado" via long-press / click en el banco mientras
  // tap en producto sin imagen → asigna. Para simplicidad: click en banco
  // muestra un hint, pero no toggleamos pq el flujo principal es drag.
  const handleBankItemClick = (item: BankItem) => {
    // Si hay un solo producto sin imagen filtrado, asigna directo.
    if (productsWithoutImage.length === 1) {
      const target = productsWithoutImage[0];
      if (!recentlyAssigned.has(target.id)) {
        void assignImage(target.id, item.imageUrl);
        return;
      }
    }
    toast.info("Arrastra esta imagen sobre el producto a la derecha", { duration: 2000 });
  };

  const totalAssigned = recentlyAssigned.size;
  const totalPending = productsWithoutImage.filter((p) => !recentlyAssigned.has(p.id)).length;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[8200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onOpenChange(false)}
    >
      <div className="bg-[var(--surface-canvas)] w-full h-full sm:h-[92vh] sm:max-w-[1400px] sm:rounded-2xl overflow-hidden flex flex-col shadow-[var(--shadow-xl)]">
        {/* Header */}
        <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)] flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-linear-to-br from-primary to-[var(--data-success-500)] text-white flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)]">Asignar imágenes en bloque</h2>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
              Arrastra una imagen del banco al producto sin foto. Se guarda automático.
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--data-success-500)]/10 text-[var(--data-success-500)] text-sm font-bold">
              <Check className="h-4 w-4" /> {totalAssigned} asignadas
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] text-sm font-bold">
              <Package className="h-4 w-4" /> {totalPending} pendientes
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-2 rounded-lg hover:bg-[var(--surface-sunken)] shrink-0"
            title="Cerrar"
          >
            <X className="h-5 w-5 text-[var(--text-tertiary)]" />
          </button>
        </div>

        {/* Body — split view */}
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 overflow-hidden">
          {/* Izquierda — banco de imágenes */}
          <section className="flex flex-col overflow-hidden border-b sm:border-b-0 sm:border-r border-[var(--rule-soft)] bg-[var(--surface-raised)]">
            <header className="shrink-0 px-4 py-3 border-b border-[var(--rule-soft)] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-extrabold text-[var(--text-primary)] flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-primary" />
                  Banco de Imágenes
                  <span className="text-xs font-medium text-[var(--text-tertiary)]">({totalBankItems})</span>
                </h3>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
                <input
                  value={bankSearch}
                  onChange={(e) => setBankSearch(e.target.value)}
                  placeholder="Buscar en el banco..."
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm font-medium outline-none focus:border-primary"
                />
              </div>
              {categories.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setActiveCatId(null)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-bold border-2 transition-colors",
                      !activeCatId
                        ? "border-primary bg-primary text-white"
                        : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-primary/40",
                    )}
                  >
                    Todas
                  </button>
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setActiveCatId(c.id)}
                      className={cn(
                        "px-3 py-1 rounded-full text-xs font-bold border-2 transition-colors",
                        activeCatId === c.id
                          ? "border-primary bg-primary text-white"
                          : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-primary/40",
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </header>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingBank && (
                <div className="flex items-center justify-center py-10 gap-2 text-[var(--text-tertiary)]">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Cargando banco…</span>
                </div>
              )}
              {bankError && (
                <div className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/5 p-3 text-sm text-[var(--data-error-500)]">
                  {bankError}
                </div>
              )}
              {!loadingBank && totalBankItems === 0 && (
                <div className="text-center py-10">
                  <ImageIcon className="h-10 w-10 text-[var(--text-tertiary)] mx-auto mb-3" />
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    {bankSearch ? `Sin resultados para "${bankSearch}"` : "El banco está vacío"}
                  </p>
                </div>
              )}
              {!loadingBank &&
                visibleCats.map((cat) => (
                  <section key={cat.id} className="mb-6 last:mb-0">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-2 px-1">
                      {cat.name} <span className="font-medium">· {cat.items.length}</span>
                    </h4>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {cat.items.map((item) => {
                        const isDragging = draggingItem?.id === item.id;
                        return (
                          <button
                            key={item.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, item)}
                            onDragEnd={handleDragEnd}
                            onClick={() => handleBankItemClick(item)}
                            title={`${item.name} — arrastra al producto`}
                            className={cn(
                              "group relative rounded-xl border-2 bg-[var(--surface-raised)] overflow-hidden transition-all text-left cursor-grab active:cursor-grabbing",
                              isDragging
                                ? "border-primary ring-2 ring-primary/30 opacity-60 scale-95"
                                : "border-[var(--rule-soft)] hover:border-primary hover:shadow-md",
                            )}
                          >
                            <div className="aspect-square bg-[var(--surface-sunken)] relative pointer-events-none">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="w-full h-full object-contain p-1.5"
                                draggable={false}
                              />
                            </div>
                            <p className="px-1.5 py-1 text-[length:var(--ts-2xs)] sm:text-xs font-bold text-[var(--text-primary)] truncate" title={item.name}>
                              {item.name}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
            </div>
          </section>

          {/* Derecha — productos sin imagen */}
          <section className="flex flex-col overflow-hidden bg-[var(--surface-raised)]">
            <header className="shrink-0 px-4 py-3 border-b border-[var(--rule-soft)] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-extrabold text-[var(--text-primary)] flex items-center gap-2">
                  <Package className="h-4 w-4 text-[var(--data-warning-500)]" />
                  Productos sin imagen
                  <span className="text-xs font-medium text-[var(--text-tertiary)]">({totalPending})</span>
                </h3>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
                <input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Buscar producto por nombre o código..."
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm font-medium outline-none focus:border-primary"
                />
              </div>
              {productCategories.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setActiveProductCat(null)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-bold border-2 transition-colors",
                      !activeProductCat
                        ? "border-primary bg-primary text-white"
                        : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-primary/40",
                    )}
                  >
                    Todas <span className="ml-1 opacity-80">· {baseWithoutImage.length}</span>
                  </button>
                  {productCategories.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => setActiveProductCat(c.name)}
                      className={cn(
                        "px-3 py-1 rounded-full text-xs font-bold border-2 transition-colors flex items-center gap-1",
                        activeProductCat === c.name
                          ? "border-primary bg-primary text-white"
                          : c.pending === 0
                          ? "border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]"
                          : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-primary/40",
                      )}
                      title={`${c.name}: ${c.pending} pendientes / ${c.total} totales`}
                    >
                      {c.name}
                      <span className="opacity-80">· {c.pending}</span>
                      {c.pending === 0 && c.total > 0 && <Check className="h-3 w-3" />}
                    </button>
                  ))}
                </div>
              )}
            </header>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {productsWithoutImage.length === 0 && (
                <div className="text-center py-10">
                  <Check className="h-12 w-12 text-[var(--data-success-500)] mx-auto mb-3" />
                  <p className="text-base font-extrabold text-[var(--text-primary)]">
                    {productSearch || activeProductCat ? "Sin resultados" : "¡Todos tus productos tienen imagen!"}
                  </p>
                  <p className="text-sm text-[var(--text-tertiary)] mt-1">
                    {productSearch ? "Probá otra búsqueda." : activeProductCat ? "Probá quitar el filtro de categoría." : "Buen trabajo."}
                  </p>
                </div>
              )}
              {productsWithoutImage.map((p) => {
                const assigned = recentlyAssigned.get(p.id);
                const saving = savingProductIds.has(p.id);
                const isDragOver = dragOverProductId === p.id;
                return (
                  <div
                    key={p.id}
                    onDragOver={(e) => handleDragOver(e, p.id)}
                    onDragLeave={() => handleDragLeave(p.id)}
                    onDrop={(e) => handleDrop(e, p.id)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl border-2 transition-all",
                      assigned
                        ? "border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/5"
                        : isDragOver
                        ? "border-primary bg-primary/10 ring-2 ring-primary/30 scale-[1.01]"
                        : "border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] hover:border-primary/50",
                    )}
                  >
                    <div
                      className={cn(
                        "h-14 w-14 sm:h-16 sm:w-16 rounded-xl overflow-hidden shrink-0 flex items-center justify-center",
                        assigned ? "bg-[var(--surface-raised)] border border-[var(--data-success-500)]/30" : "bg-[var(--surface-raised)] border-2 border-dashed border-[var(--rule-base)]",
                      )}
                    >
                      {assigned ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={assigned} alt={p.name} className="w-full h-full object-contain p-1" />
                      ) : (
                        <Package className="h-6 w-6 text-[var(--text-tertiary)]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-extrabold text-[var(--text-primary)] truncate" title={p.name}>
                        {p.name}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {p.category} · {p.unit}
                      </p>
                      {p.barcode && <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-mono truncate">#{p.barcode}</p>}
                    </div>
                    <div className="shrink-0">
                      {saving ? (
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      ) : assigned ? (
                        <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--data-success-500)]/15 text-[var(--data-success-500)] text-xs font-extrabold">
                          <Check className="h-3.5 w-3.5" /> Asignada
                        </div>
                      ) : isDragOver ? (
                        <div className="text-xs font-bold text-primary">Soltá acá</div>
                      ) : (
                        <div className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Drop</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Footer */}
        <footer className="shrink-0 px-4 sm:px-6 py-3 border-t border-[var(--rule-soft)] bg-[var(--surface-raised)] flex items-center justify-between gap-3">
          <div className="flex sm:hidden items-center gap-2 text-xs">
            <span className="px-2 py-1 rounded-full bg-[var(--data-success-500)]/10 text-[var(--data-success-500)] font-bold">
              {totalAssigned} ✓
            </span>
            <span className="px-2 py-1 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] font-bold">
              {totalPending} pendientes
            </span>
          </div>
          <p className="hidden sm:block text-xs text-[var(--text-tertiary)]">
            Tip: arrastrá la imagen sobre el producto. Cada drop guarda automático.
          </p>
          <button
            onClick={() => onOpenChange(false)}
            className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-extrabold hover:bg-primary-dark transition-colors"
          >
            {totalAssigned > 0 ? `Listo (${totalAssigned} asignadas)` : "Cerrar"}
          </button>
        </footer>
      </div>
    </div>
  );
}
