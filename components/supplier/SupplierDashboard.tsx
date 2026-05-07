"use client";

import { useState, useEffect, useCallback } from "react";
import { csrfHeaders } from "@/lib/csrf-client";

// ---------- tipos ----------

interface SupplierProduct {
  id: number;
  name: string;
  wholesalePrice: number | null;
  stock: number;
  isActive: boolean;
}

interface WholesaleOrder {
  id: string;
  buyerTenantId: string;
  total: number;
  commission: number;
  status: string;
  createdAt: string;
  items: { productId: number; quantity: number; unitPrice: number }[];
}

interface CommissionEntry {
  id: string;
  type: string;
  amount: number;
  rate: number;
  status: string;
  createdAt: string;
}

// ---------- skeleton ----------

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800 ${className}`}
    />
  );
}

// ---------- KPI card ----------

function KpiCard({
  label,
  value,
  sub,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  loading: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-5 transition-shadow hover:shadow-lg"
      style={{
        background: "rgba(15,118,110,0.06)",
        border: "1px solid rgba(15,118,110,0.15)",
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </p>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-28" />
      ) : (
        <>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {value}
          </p>
          {sub && (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {sub}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ---------- badge de estado ----------

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:   "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
    approved:  "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
    rejected:  "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    shipped:   "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    delivered: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    settled:   "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };
  const cls = map[status] ?? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {status}
    </span>
  );
}

// ---------- componente principal ----------

export default function SupplierDashboard({
  supplierName,
  onLogout,
}: {
  supplierName?: string;
  onLogout?: () => void;
}) {
  // datos
  const [products, setProducts]     = useState<SupplierProduct[]>([]);
  const [orders, setOrders]         = useState<WholesaleOrder[]>([]);
  const [commissions, setCommissions] = useState<CommissionEntry[]>([]);

  // loading / error
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingOrders, setLoadingOrders]     = useState(true);
  const [loadingComm, setLoadingComm]         = useState(true);
  const [errorProducts, setErrorProducts]     = useState<string | null>(null);
  const [errorOrders, setErrorOrders]         = useState<string | null>(null);
  const [errorComm, setErrorComm]             = useState<string | null>(null);

  // ui
  const [activeTab, setActiveTab]   = useState<"products" | "orders" | "commissions">("products");
  const [updatingId, setUpdatingId] = useState<string | number | null>(null);

  // ---------- fetch ----------

  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    setErrorProducts(null);
    try {
      const res = await fetch("/api/wholesale/catalog");
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setProducts(json.data ?? []);
    } catch (err) {
      setErrorProducts(err instanceof Error ? err.message : "Error al cargar productos");
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    setLoadingOrders(true);
    setErrorOrders(null);
    try {
      const res = await fetch("/api/wholesale/orders");
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setOrders(json.data ?? []);
    } catch (err) {
      setErrorOrders(err instanceof Error ? err.message : "Error al cargar órdenes");
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  const fetchCommissions = useCallback(async () => {
    setLoadingComm(true);
    setErrorComm(null);
    try {
      const res = await fetch("/api/commissions/ledger");
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setCommissions(json.data ?? []);
    } catch (err) {
      setErrorComm(err instanceof Error ? err.message : "Error al cargar comisiones");
    } finally {
      setLoadingComm(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchOrders();
    fetchCommissions();
  }, [fetchProducts, fetchOrders, fetchCommissions]);

  // ---------- acciones ----------

  const toggleProduct = async (product: SupplierProduct) => {
    setUpdatingId(product.id);
    try {
      const res = await fetch(`/api/wholesale/catalog/${product.id}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ isActive: !product.isActive }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, isActive: !p.isActive } : p))
      );
    } catch {
      // silencioso — el toggle vuelve al estado anterior automáticamente
    } finally {
      setUpdatingId(null);
    }
  };

  const updateOrderStatus = async (orderId: string, status: string) => {
    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/wholesale/orders/${orderId}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status } : o))
      );
    } catch {
      // silencioso
    } finally {
      setUpdatingId(null);
    }
  };

  // ---------- KPIs calculados ----------

  const totalPublished  = products.filter((p) => p.isActive).length;
  const totalOrders     = orders.length;
  const totalRevenue    = orders
    .filter((o) => ["approved", "shipped", "delivered"].includes(o.status))
    .reduce((sum, o) => sum + o.total, 0);
  const avgRating       = 4.8; // placeholder — no hay endpoint de rating por proveedor aún

  // ---------- comisiones calculadas ----------

  const totalEarned     = commissions.reduce((s, c) => s + c.amount, 0);
  const platformFee     = commissions.reduce((s, c) => s + c.amount * c.rate, 0);
  const netAmount       = totalEarned - platformFee;

  const fmt = (n: number) =>
    new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

  // ---------- tabs ----------

  const tabs: { id: typeof activeTab; label: string }[] = [
    { id: "products",    label: "Mis Productos" },
    { id: "orders",      label: "Órdenes Mayoristas" },
    { id: "commissions", label: "Comisiones" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* ── HEADER ─────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 border-b border-gray-200 dark:border-gray-800"
        style={{ background: "rgba(15,118,110,0.97)", backdropFilter: "blur(8px)" }}
      >
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white text-sm font-black"
              style={{ background: "rgba(255,255,255,0.2)" }}
            >
              B
            </span>
            <div className="leading-none">
              <p className="text-xs text-white/70">Portal Proveedor</p>
              <p className="text-sm font-bold text-white">Buleje</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {supplierName && (
              <span className="hidden sm:block text-sm text-white/70">
                {supplierName}
              </span>
            )}
            <button
              onClick={onLogout}
              className="min-h-[44px] min-w-[44px] rounded-lg px-4 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* ── KPIs ───────────────────────────────────────────────── */}
        <section aria-label="Resumen" className="mb-8">
          <h1 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">
            Resumen
          </h1>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard
              label="Productos publicados"
              value={String(totalPublished)}
              sub={`de ${products.length} totales`}
              loading={loadingProducts}
            />
            <KpiCard
              label="Órdenes mayoristas"
              value={String(totalOrders)}
              loading={loadingOrders}
            />
            <KpiCard
              label="Ingresos del mes"
              value={fmt(totalRevenue)}
              loading={loadingOrders}
            />
            <KpiCard
              label="Rating promedio"
              value={`${avgRating} ★`}
              loading={false}
            />
          </div>
        </section>

        {/* ── TABS ───────────────────────────────────────────────── */}
        <div
          className="mb-6 flex gap-1 rounded-xl p-1"
          style={{ background: "rgba(15,118,110,0.08)", border: "1px solid rgba(15,118,110,0.12)" }}
          role="tablist"
          aria-label="Secciones del portal"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
              className={`min-h-[44px] flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 ${
                activeTab === t.id
                  ? "bg-[var(--accent-dark)] text-white shadow-sm"
                  : "text-gray-600 hover:bg-white/50 dark:text-gray-400 dark:hover:bg-white/5"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── TAB: PRODUCTOS ─────────────────────────────────────── */}
        {activeTab === "products" && (
          <section aria-label="Mis productos">
            {errorProducts && (
              <div className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-[var(--data-error-700)] dark:bg-red-900/20 dark:text-red-400">
                {errorProducts}{" "}
                <button onClick={fetchProducts} className="underline hover:no-underline">
                  Reintentar
                </button>
              </div>
            )}

            {loadingProducts ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 py-16 dark:border-gray-700">
                <p className="text-gray-500 dark:text-gray-400">No tienes productos en el catálogo mayorista.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
                      <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400">Producto</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-400">P. Mayorista</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-400">Stock</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600 dark:text-gray-400">Estado</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600 dark:text-gray-400">Publicado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {products.map((p) => (
                      <tr
                        key={p.id}
                        className="bg-white transition-colors hover:bg-gray-50 dark:bg-gray-950 dark:hover:bg-gray-900"
                      >
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                          {p.name}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                          {p.wholesalePrice != null ? fmt(p.wholesalePrice) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                          {p.stock}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={p.isActive ? "approved" : "rejected"} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => toggleProduct(p)}
                            disabled={updatingId === p.id}
                            aria-label={p.isActive ? "Despublicar producto" : "Publicar producto"}
                            className={`relative inline-flex h-6 w-11 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:opacity-50 ${
                              p.isActive ? "bg-[var(--accent-dark)]" : "bg-gray-300 dark:bg-gray-600"
                            }`}
                          >
                            <span
                              className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                                p.isActive ? "translate-x-5" : "translate-x-0"
                              }`}
                            />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ── TAB: ÓRDENES ───────────────────────────────────────── */}
        {activeTab === "orders" && (
          <section aria-label="Órdenes mayoristas">
            {errorOrders && (
              <div className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-[var(--data-error-700)] dark:bg-red-900/20 dark:text-red-400">
                {errorOrders}{" "}
                <button onClick={fetchOrders} className="underline hover:no-underline">
                  Reintentar
                </button>
              </div>
            )}

            {loadingOrders ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 py-16 dark:border-gray-700">
                <p className="text-gray-500 dark:text-gray-400">No hay órdenes mayoristas aún.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
                      <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400">ID</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400">Comprador</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-400">Total</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-400">Comisión</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600 dark:text-gray-400">Estado</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600 dark:text-gray-400">Fecha</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600 dark:text-gray-400">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {orders.map((o) => (
                      <tr
                        key={o.id}
                        className="bg-white transition-colors hover:bg-gray-50 dark:bg-gray-950 dark:hover:bg-gray-900"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                          #{o.id.slice(-6).toUpperCase()}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                          {o.buyerTenantId.slice(0, 12)}…
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">
                          {fmt(o.total)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                          {fmt(o.commission)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={o.status} />
                        </td>
                        <td className="px-4 py-3 text-center text-gray-500 dark:text-gray-400">
                          {new Date(o.createdAt).toLocaleDateString("es-PE")}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            {o.status === "pending" && (
                              <>
                                <button
                                  onClick={() => updateOrderStatus(o.id, "approved")}
                                  disabled={updatingId === o.id}
                                  className="min-h-[36px] rounded-lg bg-[var(--accent-dark)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--accent-dark)] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
                                >
                                  Aprobar
                                </button>
                                <button
                                  onClick={() => updateOrderStatus(o.id, "rejected")}
                                  disabled={updatingId === o.id}
                                  className="min-h-[36px] rounded-lg bg-red-100 px-3 py-1.5 text-xs font-semibold text-[var(--data-error-700)] hover:bg-red-200 disabled:opacity-50 dark:bg-red-900/30 dark:text-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500"
                                >
                                  Rechazar
                                </button>
                              </>
                            )}
                            {o.status === "approved" && (
                              <button
                                onClick={() => updateOrderStatus(o.id, "shipped")}
                                disabled={updatingId === o.id}
                                className="min-h-[36px] rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-[var(--data-success-700)] hover:bg-emerald-200 disabled:opacity-50 dark:bg-emerald-900/30 dark:text-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
                              >
                                Marcar enviado
                              </button>
                            )}
                            {!["pending", "approved"].includes(o.status) && (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ── TAB: COMISIONES ────────────────────────────────────── */}
        {activeTab === "commissions" && (
          <section aria-label="Comisiones">
            {/* Resumen */}
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {loadingComm ? (
                [...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)
              ) : (
                <>
                  <div className="rounded-2xl p-5" style={{ background: "rgba(15,118,110,0.06)", border: "1px solid rgba(15,118,110,0.15)" }}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Total ganado</p>
                    <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{fmt(totalEarned)}</p>
                  </div>
                  <div className="rounded-2xl p-5" style={{ background: "rgba(244,162,97,0.06)", border: "1px solid rgba(244,162,97,0.15)" }}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Comisión plataforma</p>
                    <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{fmt(platformFee)}</p>
                  </div>
                  <div className="rounded-2xl p-5" style={{ background: "rgba(15,118,110,0.10)", border: "1px solid rgba(15,118,110,0.20)" }}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Neto a cobrar</p>
                    <p className="mt-1 text-2xl font-bold text-[var(--accent-dark)] dark:text-teal-400">{fmt(netAmount)}</p>
                  </div>
                </>
              )}
            </div>

            {errorComm && (
              <div className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-[var(--data-error-700)] dark:bg-red-900/20 dark:text-red-400">
                {errorComm}{" "}
                <button onClick={fetchCommissions} className="underline hover:no-underline">
                  Reintentar
                </button>
              </div>
            )}

            {loadingComm ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : commissions.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 py-16 dark:border-gray-700">
                <p className="text-gray-500 dark:text-gray-400">No hay registros de comisiones.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
                      <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400">Tipo</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-400">Monto</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-400">Tasa</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600 dark:text-gray-400">Estado</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-600 dark:text-gray-400">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {commissions.map((c) => (
                      <tr
                        key={c.id}
                        className="bg-white transition-colors hover:bg-gray-50 dark:bg-gray-950 dark:hover:bg-gray-900"
                      >
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white capitalize">{c.type}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{fmt(c.amount)}</td>
                        <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                          {(c.rate * 100).toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="px-4 py-3 text-center text-gray-500 dark:text-gray-400">
                          {new Date(c.createdAt).toLocaleDateString("es-PE")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
