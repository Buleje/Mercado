"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { csrfHeaders } from "@/lib/csrf-client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PriceVersion {
  id: string;
  productName: string;
  sku?: string;
  oldPrice: number;
  newPrice: number;
  effectiveDate: string;
}

interface CatalogProduct {
  productId: number;
  name: string;
  currentPrice: number;
  costPrice: number | null;
  unit: string;
  sku: string | null;
  stock: number | null;
  priceHistory: PriceVersion[];
}

interface EditingState {
  productId: number;
  value: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Price History Drawer ─────────────────────────────────────────────────────

function PriceHistoryPanel({
  product,
  onClose,
}: {
  product: CatalogProduct;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label="Cerrar"
      />
      <div className="relative w-full max-w-sm bg-white dark:bg-gray-900 h-full overflow-y-auto shadow-2xl p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">
            Historial de precios
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none"
          >
            &times;
          </button>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">{product.name}</p>

        {product.priceHistory.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500">Sin cambios previos registrados.</p>
        ) : (
          <ul className="space-y-3">
            {product.priceHistory.map((v) => (
              <li
                key={v.id}
                className="rounded-xl border border-gray-100 dark:border-gray-800 p-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-gray-400 line-through">
                    S/ {fmt(v.oldPrice)}
                  </span>
                  <span className="font-semibold text-[var(--accent)]">S/ {fmt(v.newPrice)}</span>
                </div>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  {new Date(v.effectiveDate).toLocaleDateString("es-PE", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Offer Modal ──────────────────────────────────────────────────────────────

interface OfferForm {
  title: string;
  description: string;
  discountPercent: string;
  minQuantity: string;
  validFrom: string;
  validUntil: string;
}

function OfferModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<OfferForm>({
    title: "",
    description: "",
    discountPercent: "",
    minQuantity: "",
    validFrom: "",
    validUntil: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/supplier/offers", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          discountPercent: form.discountPercent ? parseFloat(form.discountPercent) : undefined,
          minQuantity: form.minQuantity ? parseInt(form.minQuantity, 10) : undefined,
          validFrom: new Date(form.validFrom).toISOString(),
          validUntil: new Date(form.validUntil).toISOString(),
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? "Error al crear oferta");
      }
      setSuccess(true);
      setTimeout(onClose, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label="Cerrar"
      />
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Nueva oferta</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {success ? (
          <p className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm text-[var(--data-success-700)] dark:text-emerald-400 text-center">
            Oferta creada correctamente
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {[
              { name: "title", label: "Título", type: "text", required: true, placeholder: "Ej: Oferta de fin de mes" },
              { name: "description", label: "Descripción", type: "textarea", required: false, placeholder: "Detalle opcional" },
              { name: "discountPercent", label: "Descuento (%)", type: "number", required: false, placeholder: "Ej: 10" },
              { name: "minQuantity", label: "Cantidad mínima", type: "number", required: false, placeholder: "Ej: 12" },
              { name: "validFrom", label: "Válido desde", type: "datetime-local", required: true, placeholder: "" },
              { name: "validUntil", label: "Válido hasta", type: "datetime-local", required: true, placeholder: "" },
            ].map((f) => (
              <div key={f.name}>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  {f.label}
                  {f.required && <span className="text-[var(--data-error-500)] ml-0.5">*</span>}
                </label>
                {f.type === "textarea" ? (
                  <textarea
                    name={f.name}
                    value={form[f.name as keyof OfferForm]}
                    onChange={handleChange}
                    placeholder={f.placeholder}
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 resize-none"
                  />
                ) : (
                  <input
                    name={f.name}
                    type={f.type}
                    value={form[f.name as keyof OfferForm]}
                    onChange={handleChange}
                    placeholder={f.placeholder}
                    required={f.required}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                  />
                )}
              </div>
            ))}

            {error && (
              <p className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-[var(--data-error-600)] dark:text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {saving ? "Publicando..." : "Publicar oferta"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SupplierCatalogoPage() {
  const router = useRouter();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estado de edición inline de precios
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Panel de historial
  const [historyProduct, setHistoryProduct] = useState<CatalogProduct | null>(null);

  // Modal de oferta
  const [showOfferModal, setShowOfferModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/supplier/catalog");
      if (res.status === 401) {
        router.replace("/supplier");
        return;
      }
      if (!res.ok) throw new Error("Error al cargar catálogo");
      const json = await res.json() as { products: CatalogProduct[] };
      setProducts(json.products);
    } catch {
      setError("No se pudo cargar el catálogo.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = (p: CatalogProduct) => {
    setEditing({ productId: p.productId, value: String(p.currentPrice) });
    setSaveError(null);
  };

  const cancelEdit = () => setEditing(null);

  const savePrice = async (p: CatalogProduct) => {
    if (!editing) return;
    const newPrice = parseFloat(editing.value);
    if (isNaN(newPrice) || newPrice <= 0) {
      setSaveError("Ingresa un precio válido");
      return;
    }
    if (newPrice === p.currentPrice) {
      setEditing(null);
      return;
    }
    setSavingId(p.productId);
    setSaveError(null);
    try {
      const res = await fetch("/api/supplier/catalog", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          updates: [{ productId: p.productId, newPrice, sku: p.sku ?? undefined }],
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? "Error al actualizar");
      }
      // Actualizar local
      setProducts((prev) =>
        prev.map((item) =>
          item.productId === p.productId
            ? {
                ...item,
                currentPrice: newPrice,
                priceHistory: [
                  {
                    id: `local-${Date.now()}`,
                    productName: item.name,
                    sku: item.sku ?? undefined,
                    oldPrice: item.currentPrice,
                    newPrice,
                    effectiveDate: new Date().toISOString(),
                  },
                  ...item.priceHistory,
                ].slice(0, 5),
              }
            : item,
        ),
      );
      setEditing(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--accent)] border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-gray-500 dark:text-gray-400">{error}</p>
        <button
          onClick={load}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
          style={{ background: "var(--accent)" }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mi catálogo</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {products.length} producto{products.length !== 1 ? "s" : ""} suministrado
            {products.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/supplier/dashboard"
            className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Dashboard
          </a>
          <button
            onClick={() => setShowOfferModal(true)}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "#f4a261" }}
          >
            + Publicar oferta
          </button>
        </div>
      </div>

      {saveError && (
        <p className="rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-2 text-sm text-[var(--data-error-600)] dark:text-red-400">
          {saveError}
        </p>
      )}

      {/* Tabla de productos */}
      {products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-12 text-center">
          <p className="text-gray-400 dark:text-gray-500 text-sm">
            Aún no hay productos en tu catálogo. Los productos aparecen cuando se registran órdenes de compra a tu nombre.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Producto
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    SKU
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Precio actual
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Stock
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Historial
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {products.map((p) => {
                  const isEditing = editing?.productId === p.productId;
                  const isSaving = savingId === p.productId;

                  return (
                    <tr
                      key={p.productId}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200">
                        {p.name}
                        <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">
                          / {p.unit}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400 dark:text-gray-500">
                        {p.sku ?? "—"}
                      </td>

                      {/* Precio editable inline */}
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-xs text-gray-400">S/</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={editing.value}
                              onChange={(e) =>
                                setEditing((prev) =>
                                  prev ? { ...prev, value: e.target.value } : null,
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") savePrice(p);
                                if (e.key === "Escape") cancelEdit();
                              }}
                              autoFocus
                              className="w-24 rounded-lg border border-[var(--accent)] bg-white dark:bg-gray-800 px-2 py-1 text-right text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                            />
                            <button
                              onClick={() => savePrice(p)}
                              disabled={isSaving}
                              className="rounded-md px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                              style={{ background: "var(--accent)" }}
                            >
                              {isSaving ? "..." : "OK"}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="rounded-md px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700"
                            >
                              &times;
                            </button>
                          </div>
                        ) : (
                          <span className="font-semibold text-gray-900 dark:text-white">
                            S/ {fmt(p.currentPrice)}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {p.stock != null ? (
                          <span
                            className={
                              p.stock <= 0
                                ? "text-[var(--data-error-500)] dark:text-red-400 font-semibold"
                                : "text-gray-700 dark:text-gray-300"
                            }
                          >
                            {p.stock}
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setHistoryProduct(p)}
                          className="text-xs text-[var(--accent)] hover:underline font-medium"
                        >
                          Ver ({p.priceHistory.length})
                        </button>
                      </td>

                      <td className="px-4 py-3 text-right">
                        {!isEditing && (
                          <button
                            onClick={() => startEdit(p)}
                            className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                          >
                            Editar precio
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Panel historial de precios */}
      {historyProduct && (
        <PriceHistoryPanel product={historyProduct} onClose={() => setHistoryProduct(null)} />
      )}

      {/* Modal nueva oferta */}
      {showOfferModal && <OfferModal onClose={() => setShowOfferModal(false)} />}
    </div>
  );
}
