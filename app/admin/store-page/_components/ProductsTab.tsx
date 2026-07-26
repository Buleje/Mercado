"use client";

import { LoadingState } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useEffect, useState } from "react";
import Image from "next/image";
import {
  Search,
  Star,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  Package,
} from "@buleje/design-system/icons";
import AdminTabShell from "../../_components/_shared/AdminTabShell";
import AdminEmptyState from "../../_components/_shared/AdminEmptyState";
import { ADMIN_TOKENS } from "../../_components/_shared/admin-tokens";

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
      headers: csrfHeaders({ "Content-Type": "application/json" }),
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
    <AdminTabShell
      title="Productos destacados"
      description="Productos del catálogo con precio exclusivo, badge o destacado en tu página individual."
      icon={Package}
      actions={
        <button
          type="button"
          onClick={async () => {
            if (catalog.length === 0) await loadCatalog();
            setShowPicker((v) => !v);
          }}
          className={ADMIN_TOKENS.btnPrimary}
        >
          <Plus className="w-4 h-4" aria-hidden />
          Agregar producto
        </button>
      }
    >
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]"
            aria-hidden
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto…"
            className={`${ADMIN_TOKENS.input} pl-10`}
          />
        </div>
      </div>

      {/* Picker modal inline */}
      {showPicker && (
        <section
          className={`${ADMIN_TOKENS.cardPadded} max-h-96 overflow-y-auto`}
        >
          <h3 className={ADMIN_TOKENS.headingH3}>
            Selecciona un producto del inventario
          </h3>
          {catalogFiltered.length === 0 ? (
            <p className={ADMIN_TOKENS.bodyText}>Sin resultados</p>
          ) : (
            catalogFiltered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={async () => {
                  await upsert({ productId: p.id, visible: true });
                  setShowPicker(false);
                }}
                className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-[var(--surface-sunken)] text-left transition-colors"
              >
                <div className="relative w-10 h-10 rounded bg-[var(--surface-sunken)] overflow-hidden flex-shrink-0">
                  {p.image && (
                    <Image
                      src={p.image}
                      alt=""
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate text-[var(--text-primary)]">
                    {p.name}
                  </p>
                  <p className={ADMIN_TOKENS.hint}>
                    S/ {Number(p.price).toFixed(2)} · {p.category}
                  </p>
                </div>
                <Plus
                  className="w-4 h-4 text-[var(--accent)]"
                  aria-hidden
                />
              </button>
            ))
          )}
        </section>
      )}

      {/* List */}
      {loading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <AdminEmptyState
          icon={Package}
          title="Sin productos destacados"
          description="Selecciona productos de tu catálogo para destacarlos en tu página individual con precio exclusivo o badges."
          action={{
            label: "Agregar primer producto",
            onClick: async () => {
              if (catalog.length === 0) await loadCatalog();
              setShowPicker(true);
            },
          }}
        />
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
    </AdminTabShell>
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
    <div className={`${ADMIN_TOKENS.card} p-4 flex items-center gap-4 flex-wrap`}>
      <div className="relative w-14 h-14 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
        {override.productImage && (
          <Image
            src={override.productImage}
            alt=""
            fill
            sizes="56px"
            className="object-cover"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm truncate">{override.productName}</p>
        <p className="text-xs text-[var(--text-secondary)]">
          Precio base: <span className="font-mono">S/{Number(override.productBasePrice).toFixed(2)}</span>
          {override.savingsPercent != null && override.savingsPercent > 0 && (
            <span className="ml-2 inline-block px-2 py-0.5 rounded-full bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] text-[length:var(--ts-2xs)] font-bold">
              -{override.savingsPercent}%
            </span>
          )}
        </p>
      </div>

      <label className="flex items-center gap-2 text-xs">
        <span className="text-[var(--text-secondary)]">Precio exclusivo S/</span>
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
          className="w-20 px-2 py-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-mono"
        />
      </label>

      <label className="flex items-center gap-2 text-xs">
        <span className="text-[var(--text-secondary)]">Badge</span>
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
          className="w-24 px-2 py-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-xs"
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
            ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/30"
            : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
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
            ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:bg-primary/15"
            : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
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
        className="p-2 rounded-lg bg-[var(--data-error-50)] text-[var(--data-error-500)] hover:bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/20"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
