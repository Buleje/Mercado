"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus } from "@buleje/design-system/icons";
import { useCompare, type CompareProduct } from "@/contexts/compare-context";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import type { CompareProductData } from "@/lib/db/marketplace-compare.db";
import CompareHero from "./CompareHero";
import CompareEmptyState from "./CompareEmptyState";
import CompareTable from "./CompareTable";
import ProductPickerModal from "./ProductPickerModal";
import Breadcrumbs from "@/components/ui-system/Breadcrumbs";
import RelatedFeatures from "@/components/ui-system/RelatedFeatures";
import { relatedFor } from "@/lib/navigation/feature-registry";

export default function CompareClient() {
  const { items, remove, clear, add, max } = useCompare();
  const { addItem } = useMarketplaceCart();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hydratedProducts, setHydratedProducts] = useState<CompareProductData[]>([]);
  const [loading, setLoading] = useState(false);

  // Cada vez que cambia el set de items, hidrata los datos completos desde la API
  useEffect(() => {
    if (items.length === 0) {
      setHydratedProducts([]);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const idsCsv = items.map((i) => i.id).join(",");
    fetch(`/api/marketplace/compare?ids=${idsCsv}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((json) => {
        const arr: CompareProductData[] = Array.isArray(json?.data) ? json.data : [];
        // Si la API no devolvió todos (producto inactivo), hacemos fallback con
        // la data de localStorage para no dejar columnas vacías.
        const byId = new Map(arr.map((p) => [p.id, p]));
        const merged: CompareProductData[] = items.map((it) => {
          const real = byId.get(it.id);
          if (real) return real;
          return {
            id: it.id,
            name: it.name,
            description: it.description ?? null,
            category: it.category ?? null,
            price: it.price,
            wholesalePrice: null,
            unit: it.unit ?? null,
            badge: it.badge ?? null,
            stock: it.stock ?? null,
            image: it.image ?? "",
            storeProductId: "",
            minOrderQty: 1,
            store: {
              id: "",
              name: it.storeName ?? "Marketplace",
              slug: it.storeSlug ?? "",
              logo: null,
            },
          };
        });
        setHydratedProducts(merged);
      })
      .catch(() => {
        /* cancel or error — mantener lo que ya haya */
      })
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [items]);

  const handleAddToCart = useCallback(
    (p: CompareProductData) => {
      addItem({
        storeId: p.store.id,
        storeName: p.store.name,
        storeSlug: p.store.slug,
        storeProductId: p.storeProductId,
        productId: p.id,
        name: p.name,
        price: p.price,
        image: p.image,
        unit: p.unit,
        quantity: p.minOrderQty || 1,
      });
    },
    [addItem],
  );

  const handlePickFromModal = useCallback(
    (p: CompareProduct) => {
      add(p);
      setPickerOpen(false);
    },
    [add],
  );

  const remainingSlots = useMemo(() => max - items.length, [items.length, max]);
  const excludeIds = useMemo(() => items.map((i) => i.id), [items]);

  return (
    <div className="min-h-screen bg-[var(--surface-alt)] dark:bg-gray-950">
      {/* Breadcrumbs estandarizados */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <Breadcrumbs
            items={[
              { label: "Marketplace", href: "/marketplace" },
              { label: "Comparar productos" },
            ]}
          />
        </div>
      </div>

      <CompareHero count={items.length} max={max} onClear={clear} />

      <main className="py-8 sm:py-10">
        {items.length === 0 ? (
          <CompareEmptyState onPickStart={() => setPickerOpen(true)} />
        ) : (
          <>
            {loading && hydratedProducts.length === 0 && (
              <div className="mx-auto max-w-7xl px-4 mb-6">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Cargando productos…
                </div>
              </div>
            )}

            <CompareTable
              products={hydratedProducts}
              onRemove={remove}
              onAddToCart={handleAddToCart}
            />

            {remainingSlots > 0 && (
              <div className="mx-auto max-w-7xl px-4 mt-6 flex justify-center">
                <button
                  onClick={() => setPickerOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 px-5 py-3 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:border-primary hover:text-primary transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Agregar producto {items.length + 1} de {max}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      <ProductPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handlePickFromModal}
        excludeIds={excludeIds}
        disabled={items.length >= max}
      />

      <RelatedFeatures features={relatedFor("comparar")} />
    </div>
  );
}
