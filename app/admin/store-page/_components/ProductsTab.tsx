"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, Star, Eye, EyeOff, Trash2, Plus } from "lucide-react";

type Override = {
  id: string;
  productId: number;
  exclusivePrice: number | null;
  featured: boolean;
  sortOrder: number;
  badge: string | null;
  visible: boolean;
  productName: string;
  productImage: string;
  productCategory: string;
  productUnit: string;
  productBasePrice: number;
  savingsPercent: number | null;
};

type CatalogProduct = {
  id: number;
  name: string;
  price: number;
  image: string;
  category: string;
  unit: string;
};

export default function ProductsTab() {
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/store-page/overrides");
      if (res.ok) setOverrides(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function loadCatalog() {
    const res = await fetch("/api/products?limit=200");
    if (res.ok) {
      const json = await res.json();
      const list: CatalogProduct[] = Array.isArray(json) ? json : json.products ?? [];
      setCatalog(
        list.map((p) => ({
          id: p.id,
          name: p.name,
          price: Number(p.price),
          image: p.image,
          category: p.category,
          unit: p.unit,
        })),
      );
    }
  }

  async function upsert(partial: {
    productId: number;
    exclusivePrice?: number | null;
    featured?: boolean;
    badge?: string | null;
    visible?: boolean;
    sortOrder?: number;
  }) {
    const res = await fetch("/api/store-page/overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    });
    if (res.ok) await load();
  }

  async function remove(productId: number) {
    if (!confirm("¿Eliminar este producto de la página individual?")) return;
    const res = await fetch(`/api/store-page/overrides/${productId}`, {
      method: "DELETE",
    });
    if (res.ok) await load();
  }

  const filtered = overrides.filter((o) =>
    o.productName.toLowerCase().includes(search.toLowerCase()),
  );

  const catalogFiltered = catalog
    .filter((p) => !overrides.some((o) => o.productId === p.id))
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 50);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto…"
            className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
          />
        </div>
        <button
          onClick={async () => {
            if (catalog.length === 0) await loadCatalog();
            setShowPicker((v) => !v);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm"
        >
          <Plus className="w-4 h-4" />
          Agregar producto
        </button>
      </div>

      {/* Picker modal inline */}
      {showPicker && (
        <section className="p-4 rounded-xl border-2 border-teal-500 bg-teal-50 dark:bg-teal-900/10 space-y-2 max-h-96 overflow-y-auto">
          <h4 className="font-bold text-sm mb-2">Selecciona un producto del inventario</h4>
          {catalogFiltered.length === 0 ? (
            <p className="text-sm text-gray-500">Sin resultados</p>
          ) : (
            catalogFiltered.map((p) => (
              <button
                key={p.id}
                onClick={async () => {
                  await upsert({ productId: p.id, visible: true });
                  setShowPicker(false);
                }}
                className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-white dark:hover:bg-gray-800 text-left"
              >
                <div className="w-10 h-10 rounded bg-gray-200 overflow-hidden flex-shrink-0">
                  {p.image && <img src={p.image} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{p.name}</p>
                  <p className="text-xs text-gray-500">
                    S/{p.price.toFixed(2)} · {p.category}
                  </p>
                </div>
                <Plus className="w-4 h-4 text-teal-600" />
              </button>
            ))
          )}
        </section>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">
          Todavía no hay productos destacados. Agregá uno con el botón arriba.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => (
            <OverrideRow
              key={o.id}
              override={o}
              onUpdate={upsert}
              onRemove={remove}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OverrideRow({
  override,
  onUpdate,
  onRemove,
}: {
  override: Override;
  onUpdate: (p: {
    productId: number;
    exclusivePrice?: number | null;
    featured?: boolean;
    badge?: string | null;
    visible?: boolean;
  }) => Promise<void>;
  onRemove: (productId: number) => Promise<void>;
}) {
  const [price, setPrice] = useState(
    override.exclusivePrice != null ? String(override.exclusivePrice) : "",
  );
  const [badge, setBadge] = useState(override.badge ?? "");
  const [dirty, setDirty] = useState(false);

  return (
    <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center gap-4 flex-wrap">
      <div className="w-14 h-14 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
        {override.productImage && (
          <img
            src={override.productImage}
            alt=""
            className="w-full h-full object-cover"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm truncate">{override.productName}</p>
        <p className="text-xs text-gray-500">
          Precio base: <span className="font-mono">S/{override.productBasePrice.toFixed(2)}</span>
          {override.savingsPercent != null && override.savingsPercent > 0 && (
            <span className="ml-2 inline-block px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold">
              -{override.savingsPercent}%
            </span>
          )}
        </p>
      </div>

      <label className="flex items-center gap-2 text-xs">
        <span className="text-gray-500">Precio exclusivo S/</span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={price}
          onChange={(e) => {
            setPrice(e.target.value);
            setDirty(true);
          }}
          onBlur={async () => {
            if (!dirty) return;
            const num = price === "" ? null : Number(price);
            await onUpdate({
              productId: override.productId,
              exclusivePrice: num,
            });
            setDirty(false);
          }}
          placeholder="—"
          className="w-20 px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-mono"
        />
      </label>

      <label className="flex items-center gap-2 text-xs">
        <span className="text-gray-500">Badge</span>
        <input
          type="text"
          maxLength={40}
          value={badge}
          onChange={(e) => {
            setBadge(e.target.value);
            setDirty(true);
          }}
          onBlur={async () => {
            if (!dirty) return;
            await onUpdate({
              productId: override.productId,
              badge: badge || null,
            });
            setDirty(false);
          }}
          placeholder="—"
          className="w-24 px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs"
        />
      </label>

      <button
        onClick={() =>
          onUpdate({
            productId: override.productId,
            featured: !override.featured,
          })
        }
        title="Destacado"
        className={`p-2 rounded-lg transition-colors ${
          override.featured
            ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30"
            : "bg-gray-100 dark:bg-gray-800 text-gray-400"
        }`}
      >
        <Star
          className="w-4 h-4"
          fill={override.featured ? "currentColor" : "none"}
        />
      </button>

      <button
        onClick={() =>
          onUpdate({
            productId: override.productId,
            visible: !override.visible,
          })
        }
        title={override.visible ? "Visible" : "Oculto"}
        className={`p-2 rounded-lg transition-colors ${
          override.visible
            ? "bg-green-100 text-green-600 dark:bg-green-900/30"
            : "bg-gray-100 dark:bg-gray-800 text-gray-400"
        }`}
      >
        {override.visible ? (
          <Eye className="w-4 h-4" />
        ) : (
          <EyeOff className="w-4 h-4" />
        )}
      </button>

      <button
        onClick={() => onRemove(override.productId)}
        title="Eliminar"
        className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
