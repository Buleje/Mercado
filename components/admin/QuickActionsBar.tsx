"use client";

import { useState, useEffect, useCallback } from "react";
import { History, Users, Package, Loader2, ChevronRight, RefreshCw } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface SaleItem {
  name: string;
  quantity: number;
  price: number;
  unit?: string;
}

interface LastSale {
  id: string;
  createdAt: string;
  total: number;
  payment: string;
  items: SaleItem[];
}

interface PopularProduct {
  id: number;
  name: string;
  price: number;
  unit?: string;
  image?: string;
  stock?: number;
}

interface FrequentCustomer {
  id: string | number;
  name: string;
  phone?: string;
  totalOrders?: number;
}

interface Props {
  /** Repite la última venta: carga sus ítems en el carrito */
  onRepeatSale?: (items: SaleItem[]) => void;
  /** Selecciona un cliente frecuente */
  onSelectCustomer?: (customer: FrequentCustomer) => void;
  /** Agrega un producto popular al carrito */
  onAddProduct?: (product: PopularProduct) => void;
  className?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/${n.toFixed(2)}`;
}

// ── Subcomponente: panel de productos populares ────────────────────────────────

interface PopularPanelProps {
  products: PopularProduct[];
  loading: boolean;
  onAdd: (p: PopularProduct) => void;
  onClose: () => void;
}

function PopularPanel({ products, loading, onAdd, onClose }: PopularPanelProps) {
  return (
    <div className="absolute top-full left-0 mt-2 z-50 bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl w-72 overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 dark:bg-surface border-b border-[var(--rule-soft)] dark:border-card-border flex items-center justify-between">
        <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] dark:text-muted">
          Top 5 productos
        </span>
        <button
          onClick={onClose}
          className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-foreground text-xs transition-colors"
        >
          cerrar
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-6 text-[var(--text-tertiary)] dark:text-muted text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando...
        </div>
      )}

      {!loading && products.length === 0 && (
        <div className="py-6 text-center text-sm text-[var(--text-tertiary)] dark:text-muted">
          Sin datos disponibles
        </div>
      )}

      {!loading && products.length > 0 && (
        <ul className="divide-y divide-gray-50 dark:divide-card-border">
          {products.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => { onAdd(p); onClose(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-surface text-left transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0">
                  <Package className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-foreground truncate">{p.name}</p>
                  <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">
                    {fmt(p.price)}
                    {p.unit ? ` / ${p.unit}` : ""}
                    {p.stock !== undefined && (
                      <span className={cn("ml-2", p.stock <= 0 ? "text-[var(--data-error)]" : "text-[var(--text-tertiary)]")}>
                        stock: {p.stock}
                      </span>
                    )}
                  </p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Subcomponente: panel de cliente frecuente ─────────────────────────────────

interface CustomerPanelProps {
  customers: FrequentCustomer[];
  loading: boolean;
  onSelect: (c: FrequentCustomer) => void;
  onClose: () => void;
}

function CustomerPanel({ customers, loading, onSelect, onClose }: CustomerPanelProps) {
  return (
    <div className="absolute top-full left-0 mt-2 z-50 bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl w-64 overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 dark:bg-surface border-b border-[var(--rule-soft)] dark:border-card-border flex items-center justify-between">
        <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] dark:text-muted">
          Clientes frecuentes
        </span>
        <button
          onClick={onClose}
          className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-foreground text-xs transition-colors"
        >
          cerrar
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-6 text-[var(--text-tertiary)] dark:text-muted text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando...
        </div>
      )}

      {!loading && customers.length === 0 && (
        <div className="py-6 text-center text-sm text-[var(--text-tertiary)] dark:text-muted">
          Sin clientes frecuentes
        </div>
      )}

      {!loading && customers.length > 0 && (
        <ul className="divide-y divide-gray-50 dark:divide-card-border max-h-60 overflow-y-auto">
          {customers.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => { onSelect(c); onClose(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-surface text-left transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-[var(--surface-sunken)] flex items-center justify-center shrink-0 text-[var(--text-secondary)] dark:text-[var(--text-primary)] font-bold text-sm">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-foreground truncate">{c.name}</p>
                  {c.totalOrders !== undefined && (
                    <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">{c.totalOrders} pedidos</p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

type ActivePanel = "products" | "customers" | null;

export default function QuickActionsBar({
  onRepeatSale,
  onSelectCustomer,
  onAddProduct,
  className,
}: Props) {
  const [lastSale, setLastSale]               = useState<LastSale | null>(null);
  const [lastSaleLoading, setLastSaleLoading] = useState(true);
  const [repeatLoading, setRepeatLoading]     = useState(false);

  const [popularProducts, setPopularProducts]     = useState<PopularProduct[]>([]);
  const [popularLoading, setPopularLoading]       = useState(false);
  const [popularFetched, setPopularFetched]       = useState(false);

  const [frequentCustomers, setFrequentCustomers] = useState<FrequentCustomer[]>([]);
  const [customersLoading, setCustomersLoading]   = useState(false);
  const [customersFetched, setCustomersFetched]   = useState(false);

  const [activePanel, setActivePanel] = useState<ActivePanel>(null);

  // Fetch última venta al montar
  useEffect(() => {
    let cancelled = false;

    async function loadLastSale() {
      setLastSaleLoading(true);
      try {
        const res = await fetch("/api/sales?limit=1");
        if (!res.ok) return;
        const data = await res.json();
        const sales: LastSale[] = Array.isArray(data) ? data : (data.sales ?? []);
        if (!cancelled && sales.length > 0) {
          setLastSale(sales[0]);
        }
      } catch {
        // silencioso
      } finally {
        if (!cancelled) setLastSaleLoading(false);
      }
    }

    loadLastSale();
    return () => { cancelled = true; };
  }, []);

  // Fetch productos populares (lazy — solo cuando se abre el panel)
  const fetchPopular = useCallback(async () => {
    if (popularFetched) return;
    setPopularLoading(true);
    setPopularFetched(true);
    try {
      const res = await fetch("/api/products?sort=popular&limit=5");
      if (!res.ok) return;
      const data = await res.json();
      const items: PopularProduct[] = Array.isArray(data)
        ? data
        : (data.products ?? data.items ?? []);
      setPopularProducts(items.slice(0, 5));
    } catch {
      // silencioso
    } finally {
      setPopularLoading(false);
    }
  }, [popularFetched]);

  // Fetch clientes frecuentes (lazy)
  const fetchCustomers = useCallback(async () => {
    if (customersFetched) return;
    setCustomersLoading(true);
    setCustomersFetched(true);
    try {
      const res = await fetch("/api/customers?sort=orders&limit=10");
      if (!res.ok) return;
      const data = await res.json();
      const items: FrequentCustomer[] = Array.isArray(data)
        ? data
        : (data.customers ?? data.items ?? []);
      setFrequentCustomers(items.slice(0, 10));
    } catch {
      // silencioso
    } finally {
      setCustomersLoading(false);
    }
  }, [customersFetched]);

  // Cierra paneles al hacer clic fuera
  useEffect(() => {
    if (!activePanel) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-quick-actions-bar]")) {
        setActivePanel(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [activePanel]);

  // Acción: repetir última venta
  const handleRepeatSale = useCallback(async () => {
    if (!lastSale || !onRepeatSale) return;
    setRepeatLoading(true);
    try {
      // Si los ítems de la última venta ya incluyen price/name/qty, los usamos directo.
      // Si no, hacemos un fetch detallado.
      const items: SaleItem[] = lastSale.items.map((item) => ({
        name:     (item as SaleItem).name ?? "Producto",
        quantity: item.quantity,
        price:    (item as SaleItem).price ?? 0,
        unit:     (item as SaleItem).unit,
      }));
      onRepeatSale(items);
    } finally {
      setRepeatLoading(false);
    }
  }, [lastSale, onRepeatSale]);

  // Abre/cierra panel de productos
  const toggleProducts = useCallback(() => {
    if (activePanel === "products") {
      setActivePanel(null);
    } else {
      fetchPopular();
      setActivePanel("products");
    }
  }, [activePanel, fetchPopular]);

  // Abre/cierra panel de clientes
  const toggleCustomers = useCallback(() => {
    if (activePanel === "customers") {
      setActivePanel(null);
    } else {
      fetchCustomers();
      setActivePanel("customers");
    }
  }, [activePanel, fetchCustomers]);

  // Refresca datos de última venta
  const handleRefreshLastSale = useCallback(async () => {
    setLastSaleLoading(true);
    setLastSale(null);
    try {
      const res = await fetch("/api/sales?limit=1");
      if (!res.ok) return;
      const data = await res.json();
      const sales: LastSale[] = Array.isArray(data) ? data : (data.sales ?? []);
      if (sales.length > 0) setLastSale(sales[0]);
    } catch {
      // silencioso
    } finally {
      setLastSaleLoading(false);
    }
  }, []);

  return (
    <div
      data-quick-actions-bar
      className={cn(
        "flex items-center gap-2 flex-wrap",
        className
      )}
    >
      {/* ── Botón: Ultima venta ── */}
      <div className="relative">
        <div className="flex items-stretch rounded-xl overflow-hidden border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card ">
          <button
            onClick={handleRepeatSale}
            disabled={lastSaleLoading || !lastSale || !onRepeatSale || repeatLoading}
            className={cn(
              "flex items-center gap-2 px-3 py-2 text-sm font-semibold transition-colors",
              lastSale && onRepeatSale
                ? "text-[var(--text-primary)] dark:text-foreground hover:bg-gray-50 dark:hover:bg-surface"
                : "text-[var(--text-tertiary)] dark:text-muted cursor-not-allowed"
            )}
            title={lastSale ? `Repetir: ${fmt(lastSale.total)}` : "Sin venta reciente"}
          >
            {(lastSaleLoading || repeatLoading)
              ? <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />
              : <History className="h-4 w-4 text-[var(--data-warning)] shrink-0" />
            }
            <span className="hidden sm:inline">Ultima venta</span>
            {lastSale && !lastSaleLoading && (
              <span className="text-[length:var(--ts-xs)] font-mono text-[var(--data-warning)] dark:text-[var(--data-warning)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning)]/20 px-1.5 py-0.5 rounded-md">
                {fmt(lastSale.total)}
              </span>
            )}
          </button>
          <button
            onClick={handleRefreshLastSale}
            disabled={lastSaleLoading}
            className="border-l border-[var(--rule-base)] dark:border-card-border px-2 hover:bg-gray-50 dark:hover:bg-surface transition-colors"
            title="Actualizar"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 text-[var(--text-tertiary)]", lastSaleLoading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* ── Botón: Cliente frecuente ── */}
      <div className="relative">
        <button
          onClick={toggleCustomers}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ",
            activePanel === "customers"
              ? "bg-[var(--surface-sunken)] border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]"
              : "bg-white dark:bg-card border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground hover:bg-gray-50 dark:hover:bg-surface"
          )}
        >
          <Users className="h-4 w-4 text-[var(--text-secondary)] shrink-0" />
          <span className="hidden sm:inline">Cliente frecuente</span>
        </button>

        {activePanel === "customers" && (
          <CustomerPanel
            customers={frequentCustomers}
            loading={customersLoading}
            onSelect={(c) => { onSelectCustomer?.(c); }}
            onClose={() => setActivePanel(null)}
          />
        )}
      </div>

      {/* ── Botón: Producto rapido ── */}
      <div className="relative">
        <button
          onClick={toggleProducts}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ",
            activePanel === "products"
              ? "bg-primary/10 dark:bg-primary/20 border-primary/40 dark:border-primary/40 text-primary"
              : "bg-white dark:bg-card border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground hover:bg-gray-50 dark:hover:bg-surface"
          )}
        >
          <Package className="h-4 w-4 text-primary shrink-0" />
          <span className="hidden sm:inline">Producto rapido</span>
        </button>

        {activePanel === "products" && (
          <PopularPanel
            products={popularProducts}
            loading={popularLoading}
            onAdd={(p) => { onAddProduct?.(p); }}
            onClose={() => setActivePanel(null)}
          />
        )}
      </div>
    </div>
  );
}
