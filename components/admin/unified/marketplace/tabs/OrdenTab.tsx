"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  GripVertical,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Save,
  CheckCircle,
  AlertCircle,
  Tag,
  ShoppingCart,
  Image as ImageIcon,
} from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import CategoryImageUploader from "@/components/admin/marketplace/CategoryImageUploader";
import { TableSkeleton, type MarketplaceProduct } from "../types";

// ── Local interfaces ──────────────────────────────────────────────────────────
interface OrdenCategoryRow {
  name: string;
  count: number;
}

interface OrdenProductRow {
  id: string;
  name: string;
  retailPrice: number;
  image: string | null;
  isActive: boolean;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function OrdenTab() {
  const [rows, setRows]                           = useState<OrdenCategoryRow[]>([]);
  const [initialCatOrder, setInitialCatOrder]     = useState<string[]>([]);
  const [productsByCat, setProductsByCat]         = useState<Record<string, OrdenProductRow[]>>({});
  const [initialProductOrder, setInitialProductOrder] = useState<Record<string, string[]>>({});
  const [storeSlug, setStoreSlug]                 = useState<string | null>(null);
  const [loading, setLoading]                     = useState(true);
  const [saving, setSaving]                       = useState(false);
  const [error, setError]                         = useState<string | null>(null);
  const [success, setSuccess]                     = useState<string | null>(null);
  const [expandedCats, setExpandedCats]           = useState<Set<string>>(new Set());

  // Imágenes por categoría
  const [ownImages, setOwnImages]           = useState<Record<string, string>>({});
  const [globalImages, setGlobalImages]     = useState<Record<string, string>>({});
  const [initialOwnImages, setInitialOwnImages] = useState<Record<string, string>>({});

  // Drag state — namespace "cat:N" o "prod:CAT:N" para evitar mezclas
  const [dragCatIdx, setDragCatIdx]     = useState<number | null>(null);
  const [dragOverCat, setDragOverCat]   = useState<number | null>(null);
  const [dragProd, setDragProd]         = useState<{ cat: string; idx: number } | null>(null);
  const [dragOverProd, setDragOverProd] = useState<{ cat: string; idx: number } | null>(null);

  // ── Data load ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [productsRes, catOrderRes, prodOrderRes, imagesRes] = await Promise.all([
        fetch("/api/marketplace/stores/my/products"),
        fetch("/api/admin/marketplace/category-order"),
        fetch("/api/admin/marketplace/product-order"),
        fetch("/api/admin/marketplace/category-images"),
      ]);

      const products: MarketplaceProduct[] = productsRes.ok ? await productsRes.json() : [];
      const catOrderJson = catOrderRes.ok
        ? (await catOrderRes.json()) as { order: string[]; storeSlug: string | null }
        : { order: [], storeSlug: null };
      const prodOrderJson = prodOrderRes.ok
        ? (await prodOrderRes.json()) as { byCategory: Record<string, string[]>; storeSlug: string | null }
        : { byCategory: {}, storeSlug: null };
      const imagesJson = imagesRes.ok
        ? ((await imagesRes.json()) as {
            ownImages: Record<string, string>;
            resolvedImages: Record<string, string>;
            storeSlug: string | null;
          })
        : { ownImages: {}, resolvedImages: {}, storeSlug: null };

      const own = imagesJson.ownImages ?? {};
      // Global = resolved − own (lo que viene del default que NO sobrescribió la tienda)
      const global: Record<string, string> = {};
      for (const [k, v] of Object.entries(imagesJson.resolvedImages ?? {})) {
        if (!own[k]) global[k] = v;
      }
      setOwnImages(own);
      setInitialOwnImages(own);
      setGlobalImages(global);

      // Agrupar productos por categoría
      const grouped = new Map<string, OrdenProductRow[]>();
      const counts  = new Map<string, number>();
      for (const p of products) {
        const cat = (p.category ?? "").trim();
        if (!cat) continue;
        counts.set(cat, (counts.get(cat) ?? 0) + 1);
        if (!grouped.has(cat)) grouped.set(cat, []);
        grouped.get(cat)!.push({
          id: p.id,
          name: p.name,
          retailPrice: p.retailPrice,
          image: p.image,
          isActive: p.isActive,
        });
      }

      const base: OrdenCategoryRow[] = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count }));

      // Aplicar orden persistido de categorías
      const persisted = catOrderJson.order ?? [];
      const orderedCats: OrdenCategoryRow[] = persisted.length === 0
        ? base
        : (() => {
            const idxMap = new Map<string, number>();
            persisted.forEach((name, i) => idxMap.set(name, i));
            return [...base].sort((a, b) => {
              const ra = idxMap.has(a.name) ? idxMap.get(a.name)! : Number.MAX_SAFE_INTEGER;
              const rb = idxMap.has(b.name) ? idxMap.get(b.name)! : Number.MAX_SAFE_INTEGER;
              if (ra !== rb) return ra - rb;
              return b.count - a.count;
            });
          })();

      // Aplicar orden persistido de productos por categoría
      const productOrderMap = prodOrderJson.byCategory ?? {};
      const groupedOrdered: Record<string, OrdenProductRow[]> = {};
      for (const [cat, items] of grouped) {
        const persistedIds = productOrderMap[cat];
        if (!persistedIds || persistedIds.length === 0) {
          groupedOrdered[cat] = items;
        } else {
          const idxMap = new Map<string, number>();
          persistedIds.forEach((id, i) => idxMap.set(id, i));
          groupedOrdered[cat] = [...items].sort((a, b) => {
            const ra = idxMap.has(a.id) ? idxMap.get(a.id)! : Number.MAX_SAFE_INTEGER;
            const rb = idxMap.has(b.id) ? idxMap.get(b.id)! : Number.MAX_SAFE_INTEGER;
            return ra - rb;
          });
        }
      }

      // Snapshot inicial para detectar dirty
      const initProdSnap: Record<string, string[]> = {};
      for (const [cat, items] of Object.entries(groupedOrdered)) {
        initProdSnap[cat] = items.map((p) => p.id);
      }

      setRows(orderedCats);
      setInitialCatOrder(orderedCats.map((r) => r.name));
      setProductsByCat(groupedOrdered);
      setInitialProductOrder(initProdSnap);
      setStoreSlug(catOrderJson.storeSlug);
    } catch {
      setError("No se pudieron cargar las categorías de tu tienda.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Dirty detection ────────────────────────────────────────────────────────
  const dirty = (() => {
    if (rows.length !== initialCatOrder.length) return true;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].name !== initialCatOrder[i]) return true;
    }
    for (const cat of Object.keys(productsByCat)) {
      const current = productsByCat[cat].map((p) => p.id).join(",");
      const initial = (initialProductOrder[cat] ?? []).join(",");
      if (current !== initial) return true;
    }
    const allKeys = new Set([...Object.keys(ownImages), ...Object.keys(initialOwnImages)]);
    for (const k of allKeys) {
      if (ownImages[k] !== initialOwnImages[k]) return true;
    }
    return false;
  })();

  // ── Category movement ──────────────────────────────────────────────────────
  const moveCat = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return;
    setRows((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };
  const moveCatUp   = (i: number) => moveCat(i, i - 1);
  const moveCatDown = (i: number) => moveCat(i, i + 1);
  const moveCatTop  = (i: number) => moveCat(i, 0);
  const moveCatEnd  = (i: number) => moveCat(i, rows.length - 1);

  // ── Product movement within a category ────────────────────────────────────
  const moveProd = (cat: string, from: number, to: number) => {
    setProductsByCat((prev) => {
      const items = prev[cat];
      if (!items) return prev;
      if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return prev;
      const next = [...items];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return { ...prev, [cat]: next };
    });
  };
  const moveProdUp   = (cat: string, i: number) => moveProd(cat, i, i - 1);
  const moveProdDown = (cat: string, i: number) => moveProd(cat, i, i + 1);

  // ── Toggle expand ──────────────────────────────────────────────────────────
  const toggleExpand = (cat: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // ── Reset ──────────────────────────────────────────────────────────────────
  const reset = () => {
    setRows((prev) => [...prev].sort((a, b) => b.count - a.count));
    setProductsByCat((prev) => {
      const next: Record<string, OrdenProductRow[]> = {};
      for (const [cat, items] of Object.entries(prev)) {
        const initIds = initialProductOrder[cat] ?? [];
        if (initIds.length === 0) {
          next[cat] = items;
        } else {
          const idxMap = new Map<string, number>();
          initIds.forEach((id, i) => idxMap.set(id, i));
          next[cat] = [...items].sort((a, b) => {
            const ra = idxMap.has(a.id) ? idxMap.get(a.id)! : Number.MAX_SAFE_INTEGER;
            const rb = idxMap.has(b.id) ? idxMap.get(b.id)! : Number.MAX_SAFE_INTEGER;
            return ra - rb;
          });
        }
      }
      return next;
    });
  };

  // ── Save: categorías + productos + imágenes en paralelo ───────────────────
  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const byCategory: Record<string, string[]> = {};
      for (const [cat, items] of Object.entries(productsByCat)) {
        byCategory[cat] = items.map((p) => p.id);
      }

      // Diff de imágenes — solo las que cambiaron (set o delete)
      const imagesDiff: Record<string, string | null> = {};
      const allImageKeys = new Set([...Object.keys(ownImages), ...Object.keys(initialOwnImages)]);
      for (const k of allImageKeys) {
        if (ownImages[k] !== initialOwnImages[k]) {
          imagesDiff[k] = ownImages[k] ?? null;
        }
      }

      const [catRes, prodRes, imgRes] = await Promise.all([
        fetch("/api/admin/marketplace/category-order", {
          method: "PUT",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ order: rows.map((r) => r.name) }),
        }),
        fetch("/api/admin/marketplace/product-order", {
          method: "PUT",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ byCategory }),
        }),
        Object.keys(imagesDiff).length > 0
          ? fetch("/api/admin/marketplace/category-images", {
              method: "PUT",
              headers: csrfHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify({ images: imagesDiff }),
            })
          : Promise.resolve(new Response(JSON.stringify({ ok: true }))),
      ]);

      if (!catRes.ok) {
        const j = await catRes.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "save_failed");
      }
      if (!prodRes.ok) {
        const j = await prodRes.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "save_failed");
      }
      if (!imgRes.ok) {
        const j = await imgRes.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "save_failed");
      }

      setInitialCatOrder(rows.map((r) => r.name));
      setInitialProductOrder(byCategory);
      setInitialOwnImages(ownImages);
      setSuccess("Orden e imágenes guardados · se aplicará al storefront en segundos");
      setTimeout(() => setSuccess(null), 4000);
    } catch (e) {
      setError(
        e instanceof Error && e.message === "no_store_for_tenant"
          ? "Tu cuenta aún no tiene una tienda en el marketplace."
          : "No se pudo guardar el orden. Intenta nuevamente.",
      );
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <TableSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header explicativo */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center shrink-0">
            <ArrowUpDown className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <div className="flex-1">
            <CardTitle>
              Orden de categorías y productos en tu tienda
            </CardTitle>
            <p className="text-[var(--ts-sm)] text-[var(--text-secondary)] mt-1 leading-relaxed">
              Decide en qué orden aparecen las categorías cuando un cliente entra a
              {storeSlug
                ? (
                  <>
                    {" "}tu storefront{" "}
                    <code className="px-1 py-0.5 bg-[var(--surface-sunken)] rounded text-[var(--ts-xs)]">
                      /marketplace/{storeSlug}
                    </code>.
                  </>
                )
                : " tu storefront."
              }
              {" "}Arrastrá las filas o usá las flechas.{" "}
              <strong className="text-[var(--text-primary)]">Click en la flecha</strong>{" "}
              para expandir y reordenar los productos dentro de cada categoría.
            </p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2 text-[var(--ts-sm)] text-[var(--text-tertiary)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
            {rows.length} {rows.length === 1 ? "categoría" : "categorías"}
          </span>
          {dirty && (
            <span className="px-2 py-0.5 rounded-full bg-[var(--data-warning-100)] text-[var(--data-warning)] text-[var(--ts-xs)] font-bold">
              Cambios sin guardar
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={reset}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--ts-sm)] font-medium text-[var(--text-primary)] hover:border-[var(--rule-strong)] hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-50"
            title="Volver al orden por número de productos"
          >
            <RotateCcw className="h-4 w-4" />
            Restablecer
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving || rows.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-[var(--ts-sm)] font-bold hover:bg-[var(--data-success-600)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4" />
            {saving ? "Guardando..." : "Guardar orden"}
          </button>
        </div>
      </div>

      {/* Banners */}
      {success && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--data-success-50)] border border-[var(--data-success-500)] text-[var(--data-success)]">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span className="text-[var(--ts-sm)] font-medium">{success}</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--data-error-50)] border border-[var(--data-error-500)] text-[var(--data-error)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-[var(--ts-sm)] font-medium">{error}</span>
        </div>
      )}

      {/* Lista de categorías */}
      {rows.length === 0 ? (
        <div className="text-center py-12 rounded-xl border-2 border-dashed border-[var(--rule-base)]">
          <Tag className="h-10 w-10 mx-auto text-[var(--text-tertiary)] mb-3" />
          <p className="text-[var(--ts-base)] font-bold text-[var(--text-primary)]">
            Aún no tenés productos con categoría
          </p>
          <p className="text-[var(--ts-sm)] text-[var(--text-secondary)] mt-1">
            Cargá productos y asigná categorías para ordenarlas acá.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row, i) => {
            const isFirst      = i === 0;
            const isLast       = i === rows.length - 1;
            const isDragging   = dragCatIdx === i;
            const isDropTarget = dragOverCat === i && dragCatIdx !== null && dragCatIdx !== i;
            const expanded     = expandedCats.has(row.name);
            const products     = productsByCat[row.name] ?? [];

            return (
              <li
                key={row.name}
                className={cn(
                  "rounded-xl border bg-[var(--surface-raised)] transition-all overflow-hidden",
                  "border-[var(--rule-base)]",
                  isDragging   && "opacity-40",
                  isDropTarget && "border-[var(--accent)] ring-2 ring-[var(--accent-muted)]",
                )}
              >
                {/* Category header row — drag/drop only on this div */}
                <div
                  draggable
                  onDragStart={(e) => {
                    setDragCatIdx(i);
                    try { e.dataTransfer.effectAllowed = "move"; } catch {}
                    try { e.dataTransfer.setData("application/x-cat-idx", String(i)); } catch {}
                  }}
                  onDragEnd={() => { setDragCatIdx(null); setDragOverCat(null); }}
                  onDragOver={(e) => {
                    if (dragCatIdx === null) return;
                    e.preventDefault();
                    try { e.dataTransfer.dropEffect = "move"; } catch {}
                    if (dragOverCat !== i) setDragOverCat(i);
                  }}
                  onDragLeave={() => { if (dragOverCat === i) setDragOverCat(null); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const fromStr = e.dataTransfer.getData("application/x-cat-idx");
                    const from    = Number.parseInt(fromStr, 10);
                    if (!Number.isNaN(from)) moveCat(from, i);
                    setDragCatIdx(null); setDragOverCat(null);
                  }}
                  className="group flex items-center gap-3 p-3 hover:border-[var(--rule-strong)]"
                >
                  {/* Drag handle */}
                  <span
                    className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-grab active:cursor-grabbing"
                    title="Arrastrá para reordenar la categoría"
                    aria-hidden
                  >
                    <GripVertical className="h-5 w-5" />
                  </span>

                  {/* Expand caret */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(row.name)}
                    className="p-1 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors shrink-0"
                    title={expanded ? "Colapsar productos" : "Ver productos para reordenarlos"}
                    aria-expanded={expanded}
                    aria-label={expanded ? "Colapsar productos" : "Expandir productos"}
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform duration-200",
                        expanded ? "rotate-0" : "-rotate-90",
                      )}
                    />
                  </button>

                  {/* Position badge */}
                  <span
                    className={cn(
                      "h-7 w-7 rounded-full flex items-center justify-center text-[var(--ts-xs)] font-bold tabular-nums shrink-0",
                      isFirst
                        ? "bg-[var(--accent)] text-white shadow-[0_0_0_2px_var(--accent-soft)]"
                        : "bg-[var(--surface-sunken)] text-[var(--text-primary)] border border-[var(--rule-base)]",
                    )}
                  >
                    {i + 1}
                  </span>

                  {/* Category image uploader */}
                  <CategoryImageUploader
                    categoryName={row.name}
                    value={ownImages[row.name] ?? null}
                    defaultValue={globalImages[row.name] ?? null}
                    onChange={(url) =>
                      setOwnImages((prev) => {
                        const next = { ...prev };
                        if (url) next[row.name] = url;
                        else delete next[row.name];
                        return next;
                      })
                    }
                  />

                  {/* Name + count */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[var(--ts-sm)] font-bold text-[var(--text-primary)] truncate">
                        {row.name}
                      </span>
                      {isFirst && (
                        <span className="px-1.5 py-0.5 rounded text-[var(--ts-2xs)] font-bold uppercase tracking-wide bg-[var(--accent-soft)] text-[var(--accent)]">
                          Destacada
                        </span>
                      )}
                    </div>
                    <p className="text-[var(--ts-xs)] text-[var(--text-tertiary)] mt-0.5">
                      {row.count} {row.count === 1 ? "producto" : "productos"}
                    </p>
                  </div>

                  {/* Category action buttons */}
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveCatTop(i)}
                      disabled={isFirst || saving}
                      className="p-1.5 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--text-tertiary)]"
                      title="Mover al inicio"
                      aria-label="Mover categoría al inicio"
                    >
                      <ArrowUp className="h-4 w-4" />
                      <ArrowUp className="h-4 w-4 -mt-2" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveCatUp(i)}
                      disabled={isFirst || saving}
                      className="p-1.5 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--text-tertiary)]"
                      title="Subir categoría"
                      aria-label="Subir categoría un puesto"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveCatDown(i)}
                      disabled={isLast || saving}
                      className="p-1.5 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--text-tertiary)]"
                      title="Bajar categoría"
                      aria-label="Bajar categoría un puesto"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveCatEnd(i)}
                      disabled={isLast || saving}
                      className="p-1.5 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--text-tertiary)]"
                      title="Mover al final"
                      aria-label="Mover categoría al final"
                    >
                      <ArrowDown className="h-4 w-4" />
                      <ArrowDown className="h-4 w-4 -mt-2" />
                    </button>
                  </div>
                </div>

                {/* Product sublista — preview horizontal estilo storefront real */}
                {expanded && (
                  <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-4 py-4">
                    {products.length === 0 ? (
                      <p className="text-center text-[var(--ts-base)] text-[var(--text-secondary)] py-6">
                        Esta categoría no tiene productos.
                      </p>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-3 gap-3">
                          <p className="text-[var(--ts-sm)] font-bold text-[var(--text-primary)]">
                            Orden de productos · vista previa de tu tienda
                          </p>
                          <p className="text-[var(--ts-xs)] text-[var(--text-tertiary)] hidden md:block">
                            Arrastrá lateralmente o usá{" "}
                            <ChevronLeft className="inline h-3 w-3 -mt-0.5" />{" "}
                            <ChevronRight className="inline h-3 w-3 -mt-0.5" />{" "}
                            para reordenar
                          </p>
                        </div>

                        {/* Scroller horizontal con scroll-snap */}
                        <div
                          className="relative overflow-x-auto pb-3 -mx-1 px-1"
                          style={{ scrollSnapType: "x proximity" }}
                          role="list"
                          aria-label={`Productos de ${row.name}`}
                        >
                          <ul className="flex gap-3" style={{ minWidth: "min-content" }}>
                            {products.map((prod, j) => {
                              const pIsDragging   = dragProd?.cat === row.name && dragProd?.idx === j;
                              const pIsDropTarget =
                                dragOverProd?.cat === row.name &&
                                dragOverProd?.idx === j &&
                                !(dragProd?.cat === row.name && dragProd?.idx === j);
                              const pIsFirst = j === 0;
                              const pIsLast  = j === products.length - 1;

                              return (
                                <li
                                  key={prod.id}
                                  draggable
                                  onDragStart={(e) => {
                                    setDragProd({ cat: row.name, idx: j });
                                    try { e.dataTransfer.effectAllowed = "move"; } catch {}
                                    try { e.dataTransfer.setData("application/x-prod-idx", `${row.name}|${j}`); } catch {}
                                    e.stopPropagation();
                                  }}
                                  onDragEnd={() => { setDragProd(null); setDragOverProd(null); }}
                                  onDragOver={(e) => {
                                    if (!dragProd || dragProd.cat !== row.name) return;
                                    e.preventDefault();
                                    e.stopPropagation();
                                    try { e.dataTransfer.dropEffect = "move"; } catch {}
                                    if (dragOverProd?.cat !== row.name || dragOverProd?.idx !== j) {
                                      setDragOverProd({ cat: row.name, idx: j });
                                    }
                                  }}
                                  onDragLeave={() => {
                                    if (dragOverProd?.cat === row.name && dragOverProd?.idx === j) {
                                      setDragOverProd(null);
                                    }
                                  }}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const data = e.dataTransfer.getData("application/x-prod-idx");
                                    if (data) {
                                      const [fromCat, fromIdxStr] = data.split("|");
                                      const fromIdx = Number.parseInt(fromIdxStr, 10);
                                      if (fromCat === row.name && !Number.isNaN(fromIdx)) {
                                        moveProd(row.name, fromIdx, j);
                                      }
                                    }
                                    setDragProd(null); setDragOverProd(null);
                                  }}
                                  style={{ scrollSnapAlign: "start" }}
                                  className={cn(
                                    "group relative flex flex-col w-[200px] sm:w-[220px] shrink-0 rounded-2xl border bg-[var(--surface-raised)] overflow-hidden transition-all cursor-grab active:cursor-grabbing",
                                    "border-[var(--rule-base)] hover:border-[var(--accent)] hover:shadow-lg hover:-translate-y-0.5",
                                    pIsDragging    && "opacity-40 scale-95",
                                    pIsDropTarget  && "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface-canvas)]",
                                    !prod.isActive && "opacity-70",
                                  )}
                                  title="Arrastrá hacia los lados para reordenar"
                                >
                                  {/* Position pill */}
                                  <span
                                    className={cn(
                                      "absolute top-2 left-2 z-10 h-7 w-7 rounded-full flex items-center justify-center text-[var(--ts-xs)] font-black tabular-nums shadow-md",
                                      pIsFirst
                                        ? "bg-[var(--accent)] text-white shadow-[0_0_0_2px_var(--accent-soft)]"
                                        : "bg-[var(--surface-canvas)] text-[var(--text-primary)] border border-[var(--rule-base)]",
                                    )}
                                  >
                                    {j + 1}
                                  </span>

                                  {/* Drag handle */}
                                  <span
                                    className="absolute top-2 right-2 z-10 h-7 w-7 rounded-full flex items-center justify-center bg-[var(--surface-canvas)]/90 backdrop-blur border border-[var(--rule-base)] text-[var(--text-secondary)] shadow-sm group-hover:text-[var(--accent)]"
                                    aria-hidden
                                  >
                                    <GripVertical className="h-3.5 w-3.5" />
                                  </span>

                                  {/* Inactivo badge */}
                                  {!prod.isActive && (
                                    <span className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-2 py-0.5 rounded-md text-[var(--ts-2xs)] font-black uppercase tracking-wider bg-[var(--data-warning)] text-[var(--surface-canvas)]">
                                      Inactivo
                                    </span>
                                  )}

                                  {/* Imagen — aspect 4:3 */}
                                  <div className="relative aspect-[4/3] bg-[var(--surface-sunken)] overflow-hidden border-b border-[var(--rule-soft)]">
                                    {prod.image ? (
                                      /* eslint-disable-next-line @next/next/no-img-element */
                                      <img
                                        src={prod.image}
                                        alt=""
                                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                        loading="lazy"
                                        draggable={false}
                                      />
                                    ) : (
                                      <div className="h-full w-full flex items-center justify-center">
                                        <ImageIcon className="h-12 w-12 text-[var(--text-tertiary)]" />
                                      </div>
                                    )}
                                  </div>

                                  {/* Content */}
                                  <div className="flex flex-1 flex-col p-3 gap-1.5">
                                    <h4
                                      className={cn(
                                        "text-[var(--ts-sm)] font-bold leading-snug line-clamp-2 min-h-[2.5rem]",
                                        prod.isActive
                                          ? "text-[var(--text-primary)]"
                                          : "text-[var(--text-tertiary)] line-through",
                                      )}
                                    >
                                      {prod.name}
                                    </h4>

                                    {/* Precio + carrito mock */}
                                    <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                                      <div className="min-w-0 flex-1">
                                        <span className="block text-[var(--ts-xl)] font-black tabular-nums tracking-tight text-[var(--text-primary)] leading-none">
                                          S/ {prod.retailPrice.toFixed(2)}
                                        </span>
                                      </div>
                                      {/* Mock carrito — decorativo */}
                                      <span
                                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-md group-hover:scale-110 transition-transform"
                                        aria-hidden
                                      >
                                        <ShoppingCart className="h-4 w-4" />
                                      </span>
                                    </div>

                                    {/* Reorder controles laterales */}
                                    <div className="flex items-center justify-between gap-1 mt-1 pt-2 border-t border-[var(--rule-soft)]">
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); moveProdUp(row.name, j); }}
                                        disabled={pIsFirst || saving}
                                        className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[var(--ts-xs)] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                        title="Mover hacia la izquierda"
                                        aria-label="Mover producto a la izquierda"
                                      >
                                        <ChevronLeft className="h-4 w-4" />
                                        <span className="sr-only md:not-sr-only">Atrás</span>
                                      </button>
                                      <span className="text-[var(--ts-2xs)] text-[var(--text-tertiary)] font-bold tabular-nums px-1">
                                        {j + 1}/{products.length}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); moveProdDown(row.name, j); }}
                                        disabled={pIsLast || saving}
                                        className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[var(--ts-xs)] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                        title="Mover hacia la derecha"
                                        aria-label="Mover producto a la derecha"
                                      >
                                        <span className="sr-only md:not-sr-only">Adelante</span>
                                        <ChevronRight className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </div>

                        <p className="text-[var(--ts-xs)] text-[var(--text-tertiary)] mt-2 md:hidden">
                          Tip: arrastrá las tarjetas hacia los lados o usá{" "}
                          <ChevronLeft className="inline h-3 w-3 -mt-0.5" />{" "}
                          <ChevronRight className="inline h-3 w-3 -mt-0.5" />{" "}
                          para reordenar.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Footer hint */}
      {rows.length > 0 && (
        <p className="text-[var(--ts-xs)] text-[var(--text-tertiary)] text-center pt-2">
          Tip: usá teclado{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] border border-[var(--rule-base)] text-[var(--ts-2xs)]">
            Tab
          </kbd>{" "}
          para navegar y las flechas para reordenar.
        </p>
      )}
    </div>
  );
}
