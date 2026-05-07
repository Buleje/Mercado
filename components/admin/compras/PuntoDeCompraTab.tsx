"use client";

import { CardTitle, DataTable } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useState, useEffect, useCallback, useMemo, useRef, type FormEvent } from "react";
import Image from "next/image";
import {
  Search, Plus, Minus, Trash2, ShoppingCart, Package,
  Users, ChevronDown, ChevronUp, X, Send, ScanBarcode,
  FileText, History, Filter,
  Check, AlertTriangle, Repeat, RotateCcw, Loader2, Hash, Building2, Phone, Percent, Clock } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { m, AnimatePresence } from "@/components/admin/providers";
import dynamic from "next/dynamic";

const BarcodeScanner = dynamic(() => import("../BarcodeScanner"), { ssr: false });

/* ═══════════════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════════════ */

type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  costPrice?: number;
  image: string;
  unit: string;
  barcode?: string;
  stock?: number;
  stockMin?: number;
  active?: boolean;
};

type Supplier = {
  id: string;
  name: string;
  ruc?: string;
  phone?: string;
  email?: string;
  address?: string;
  categoria?: string;
  condicionPago?: string;
  diasCredito?: number;
};

type CartItem = {
  productId: number;
  name: string;
  unit: string;
  quantity: number;
  unitCost: number;
  image: string;
  category: string;
  lastCost?: number;
  stock?: number;
};

type PurchaseHistory = {
  id: string;
  supplierName: string;
  supplierId: string;
  total: number;
  status: string;
  createdAt: string;
  items: { productId: number; name: string; quantity: number; unitCost: number; unit: string }[];
};

/* ═══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════════ */

const CATEGORIES_ALL = "Todas";

const SORT_OPTIONS = [
  { value: "name-asc", label: "Nombre A-Z" },
  { value: "name-desc", label: "Nombre Z-A" },
  { value: "cost-asc", label: "Costo menor" },
  { value: "cost-desc", label: "Costo mayor" },
  { value: "stock-asc", label: "Stock menor" },
  { value: "stock-desc", label: "Stock mayor" },
  { value: "category", label: "Categoría" },
] as const;

const PAYMENT_CONDITIONS = [
  { value: "contado", label: "Contado" },
  { value: "credito_7", label: "Crédito 7 días" },
  { value: "credito_15", label: "Crédito 15 días" },
  { value: "credito_30", label: "Crédito 30 días" },
  { value: "credito_60", label: "Crédito 60 días" },
] as const;

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

function fmtCurrency(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

/* ═══════════════════════════════════════════════════════════════════════════
   SUBCOMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */

function ProductCard({
  product,
  inCart,
  onAdd,
  lowStock,
}: {
  product: Product;
  inCart: boolean;
  onAdd: () => void;
  lowStock: boolean;
}) {
  return (
    <button
      onClick={onAdd}
      className={cn(
        "group relative bg-white dark:bg-card border rounded-xl p-3 text-left transition-all hover:shadow-sm hover:border-primary/40",
        inCart
          ? "border-primary/60 ring-1 ring-primary/20 bg-primary/5 dark:bg-primary/10"
          : "border-[var(--rule-base)] dark:border-card-border",
      )}
    >
      {/* Image */}
      <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-[var(--surface-sunken)] mb-2">
        {product.image ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 33vw, 120px"
            className="object-cover group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="h-8 w-8 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]" />
          </div>
        )}
        {inCart && (
          <div className="absolute top-1.5 right-1.5 bg-primary text-white rounded-full p-1">
            <Check className="h-3 w-3" />
          </div>
        )}
        {lowStock && (
          <div className="absolute top-1.5 left-1.5 bg-[var(--data-warning-500)] text-white rounded-full p-1" title="Stock bajo">
            <AlertTriangle className="h-3 w-3" />
          </div>
        )}
      </div>

      {/* Info */}
      <p className="text-xs font-semibold text-[var(--text-primary)] truncate leading-tight">
        {product.name}
      </p>
      <p className="text-xs text-[var(--text-tertiary)] truncate">{product.category}</p>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-xs font-bold text-primary">
          {product.costPrice ? fmtCurrency(product.costPrice) : "—"}
        </span>
        <span className="text-xs text-[var(--text-tertiary)]">
          Stock: {product.stock ?? "—"}
        </span>
      </div>
    </button>
  );
}

function QuantityStepper({
  value,
  onChange,
  min = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <div className="flex items-center gap-0 border border-[var(--rule-base)] rounded-lg overflow-hidden">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className="p-1.5 hover:bg-[var(--surface-sunken)] transition-colors"
      >
        <Minus className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
      </button>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (!isNaN(n) && n >= min) onChange(n);
        }}
        className="w-12 text-center text-sm font-medium bg-transparent border-x border-[var(--rule-base)] focus:outline-none"
      />
      <button
        onClick={() => onChange(value + 1)}
        className="p-1.5 hover:bg-[var(--surface-sunken)] transition-colors"
      >
        <Plus className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

export default function PuntoDeCompraTab() {
  /* ── State: Data ── */
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [history, setHistory] = useState<PurchaseHistory[]>([]);
  const [loading, setLoading] = useState(true);

  /* ── State: Filters ── */
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(CATEGORIES_ALL);
  const [sortBy, setSortBy] = useState<string>("name-asc");
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  /* ── State: Cart ── */
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [orderNotes, setOrderNotes] = useState("");
  const [paymentCondition, setPaymentCondition] = useState("contado");
  const [globalDiscount, setGlobalDiscount] = useState(0);

  /* ── State: UI ── */
  const [submitting, setSubmitting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showBarcode, setShowBarcode] = useState(false);
  const [showCartMobile, setShowCartMobile] = useState(false);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [_reorderMode, _setReorderMode] = useState(false);

  /* ── State: New supplier form ── */
  const [newSupName, setNewSupName] = useState("");
  const [newSupRuc, setNewSupRuc] = useState("");
  const [newSupPhone, setNewSupPhone] = useState("");
  const [newSupEmail, setNewSupEmail] = useState("");
  const [newSupAddress, setNewSupAddress] = useState("");
  const [newSupCategoria, setNewSupCategoria] = useState("distribuidor");
  const [creatingSup, setCreatingSup] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const supplierInputRef = useRef<HTMLInputElement>(null);

  /* ── Data Loading ── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prodRes, supRes, histRes] = await Promise.all([
        fetch("/api/products?active=true"),
        fetch("/api/suppliers"),
        fetch("/api/purchases"),
      ]);
      if (prodRes.ok) {
        const data = await prodRes.json();
        setProducts(Array.isArray(data) ? data : data.products || []);
      }
      if (supRes.ok) {
        const data = await supRes.json();
        setSuppliers(Array.isArray(data) ? data : data.suppliers || []);
      }
      if (histRes.ok) {
        const data = await histRes.json();
        setHistory(Array.isArray(data) ? data : data.purchases || []);
      }
    } catch {
      /* silently fail */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* ── Categories ── */
  const categories = useMemo(() => {
    const cats = new Set(products.map((p) => p.category));
    return [CATEGORIES_ALL, ...Array.from(cats).sort()];
  }, [products]);

  /* ── Filtered & Sorted Products ── */
  const filteredProducts = useMemo(() => {
    let list = [...products];

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.barcode?.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q),
      );
    }

    // Category
    if (categoryFilter !== CATEGORIES_ALL) {
      list = list.filter((p) => p.category === categoryFilter);
    }

    // Low stock only
    if (showLowStockOnly) {
      list = list.filter((p) => p.stockMin != null && (p.stock ?? 0) <= p.stockMin);
    }

    // Sort
    const [field, dir] = sortBy.split("-") as [string, string];
    list.sort((a, b) => {
      let cmp = 0;
      switch (field) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "cost":
          cmp = (a.costPrice ?? 0) - (b.costPrice ?? 0);
          break;
        case "stock":
          cmp = (a.stock ?? 0) - (b.stock ?? 0);
          break;
        case "category":
          cmp = a.category.localeCompare(b.category);
          break;
      }
      return dir === "desc" ? -cmp : cmp;
    });

    return list;
  }, [products, searchQuery, categoryFilter, sortBy, showLowStockOnly]);

  /* ── Cart helpers ── */
  const cartProductIds = useMemo(() => new Set(cart.map((c) => c.productId)), [cart]);

  const addToCart = useCallback(
    (product: Product) => {
      setCart((prev) => {
        const existing = prev.find((c) => c.productId === product.id);
        if (existing) {
          return prev.map((c) =>
            c.productId === product.id ? { ...c, quantity: c.quantity + 1 } : c,
          );
        }
        // Find last cost from history for this product
        let lastCost = product.costPrice ?? 0;
        for (const h of history) {
          const item = h.items.find((i) => i.productId === product.id);
          if (item) {
            lastCost = item.unitCost;
            break;
          }
        }
        return [
          ...prev,
          {
            productId: product.id,
            name: product.name,
            unit: product.unit || "unidad",
            quantity: 1,
            unitCost: lastCost,
            image: product.image,
            category: product.category,
            lastCost,
            stock: product.stock,
          },
        ];
      });
    },
    [history],
  );

  const updateCartItem = useCallback((productId: number, patch: Partial<CartItem>) => {
    setCart((prev) => prev.map((c) => (c.productId === productId ? { ...c, ...patch } : c)));
  }, []);

  const removeFromCart = useCallback((productId: number) => {
    setCart((prev) => prev.filter((c) => c.productId !== productId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setSelectedSupplier(null);
    setSupplierSearch("");
    setOrderNotes("");
    setPaymentCondition("contado");
    setGlobalDiscount(0);
  }, []);

  /* ── Totals ── */
  const subtotal = useMemo(() => cart.reduce((s, c) => s + c.quantity * c.unitCost, 0), [cart]);
  const discountAmount = useMemo(() => subtotal * (globalDiscount / 100), [subtotal, globalDiscount]);
  const total = useMemo(() => subtotal - discountAmount, [subtotal, discountAmount]);
  const totalItems = useMemo(() => cart.reduce((s, c) => s + c.quantity, 0), [cart]);

  /* ── Supplier Filter ── */
  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch) return suppliers;
    const q = supplierSearch.toLowerCase();
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.ruc?.toLowerCase().includes(q) ||
        s.phone?.includes(q),
    );
  }, [suppliers, supplierSearch]);

  /* ── Barcode scan ── */
  const handleBarcodeScan = useCallback(
    (code: string) => {
      const product = products.find(
        (p) => p.barcode === code || String(p.id) === code,
      );
      if (product) {
        addToCart(product);
        setShowBarcode(false);
      }
    },
    [products, addToCart],
  );

  /* ── Reorder from History ── */
  const handleReorder = useCallback(
    (order: PurchaseHistory) => {
      const supplier = suppliers.find((s) => s.id === order.supplierId);
      if (supplier) {
        setSelectedSupplier(supplier);
        setSupplierSearch(supplier.name);
      }
      const newCart: CartItem[] = [];
      for (const item of order.items) {
        const product = products.find((p) => p.id === item.productId);
        newCart.push({
          productId: item.productId,
          name: item.name,
          unit: item.unit || "unidad",
          quantity: item.quantity,
          unitCost: item.unitCost,
          image: product?.image || "",
          category: product?.category || "",
          lastCost: item.unitCost,
          stock: product?.stock,
        });
      }
      setCart(newCart);
      setShowHistory(false);
    },
    [suppliers, products],
  );

  /* ── Create Supplier ── */
  const handleCreateSupplier = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!newSupName.trim()) return;
      setCreatingSup(true);
      try {
        const res = await fetch("/api/suppliers", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            name: newSupName.trim(),
            ruc: newSupRuc.trim() || undefined,
            phone: newSupPhone.trim() || undefined,
            email: newSupEmail.trim() || undefined,
            address: newSupAddress.trim() || undefined,
            categoria: newSupCategoria,
          }),
        });
        if (res.ok) {
          const created = await res.json();
          setSuppliers((prev) => [created, ...prev]);
          setSelectedSupplier(created);
          setSupplierSearch(created.name);
          setShowSupplierForm(false);
          setNewSupName("");
          setNewSupRuc("");
          setNewSupPhone("");
          setNewSupEmail("");
          setNewSupAddress("");
        }
      } catch {
        /* silently fail */
      }
      setCreatingSup(false);
    },
    [newSupName, newSupRuc, newSupPhone, newSupEmail, newSupAddress, newSupCategoria],
  );

  /* ── Submit Order ── */
  const handleSubmitOrder = useCallback(async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          supplierId: selectedSupplier?.id || "",
          supplierName: selectedSupplier?.name || "Sin proveedor",
          items: cart.map((c) => ({
            productId: c.productId,
            name: c.name,
            quantity: c.quantity,
            unitCost: c.unitCost,
            unit: c.unit,
          })),
          notes: [
            orderNotes,
            paymentCondition !== "contado" ? `Condición: ${paymentCondition}` : "",
            globalDiscount > 0 ? `Desc. global: ${globalDiscount}%` : "",
          ]
            .filter(Boolean)
            .join(" | "),
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setLastOrderId(created.id);
        setShowConfirm(false);
        setShowSuccess(true);
        clearCart();
        // Refresh history
        const histRes = await fetch("/api/purchases");
        if (histRes.ok) {
          const data = await histRes.json();
          setHistory(Array.isArray(data) ? data : []);
        }
      }
    } catch {
      /* silently fail */
    }
    setSubmitting(false);
  }, [cart, selectedSupplier, orderNotes, paymentCondition, globalDiscount, clearCart]);

  /* ── Keyboard shortcut ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+K → focus search
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  /* ── Supplier history for selected ── */
  const supplierHistory = useMemo(() => {
    if (!selectedSupplier) return [];
    return history
      .filter((h) => h.supplierId === selectedSupplier.id)
      .slice(0, 10);
  }, [history, selectedSupplier]);

  /* ══════════════════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════════════════ */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-220px)] min-h-[500px]">
      {/* ════════════════════════════════════════════════════════════════════
         LEFT PANEL — Product Catalog
         ════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border overflow-hidden">
        {/* Toolbar */}
        <div className="p-3 border-b border-[var(--rule-base)] space-y-2">
          {/* Search + Actions row */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Buscar producto, código de barras... (Ctrl+K)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 dark:bg-white/5 border border-[var(--rule-base)] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full"
                >
                  <X className="h-3 w-3 text-[var(--text-tertiary)]" />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowBarcode(true)}
              className="p-2.5 rounded-lg border border-[var(--rule-base)] hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
              title="Escanear código de barras"
            >
              <ScanBarcode className="h-4 w-4 text-[var(--text-secondary)]" />
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "p-2.5 rounded-xl border transition-colors",
                showFilters
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-[var(--rule-base)] hover:bg-gray-50 dark:hover:bg-white/5 text-[var(--text-secondary)]",
              )}
              title="Filtros"
            >
              <Filter className="h-4 w-4" />
            </button>
            <button
              onClick={() => setShowHistory(true)}
              className="p-2.5 rounded-lg border border-[var(--rule-base)] hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
              title="Historial de compras"
            >
              <History className="h-4 w-4 text-[var(--text-secondary)]" />
            </button>
          </div>

          {/* Filters bar */}
          <AnimatePresence>
            {showFilters && (
              <m.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {/* Category pills */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin">
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setCategoryFilter(cat)}
                        className={cn(
                          "px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors",
                          categoryFilter === cat
                            ? "bg-primary text-white"
                            : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-gray-200 dark:hover:bg-gray-700",
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 ml-auto">
                    {/* Low stock toggle */}
                    <button
                      onClick={() => setShowLowStockOnly(!showLowStockOnly)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors",
                        showLowStockOnly
                          ? "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]"
                          : "border-[var(--rule-base)] text-[var(--text-secondary)]",
                      )}
                    >
                      <AlertTriangle className="h-3 w-3" />
                      Stock bajo
                    </button>

                    {/* Sort dropdown */}
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="text-xs px-2 py-1.5 bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-lg focus:outline-none"
                    >
                      {SORT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </m.div>
            )}
          </AnimatePresence>

          {/* Result count */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--text-tertiary)]">
              {filteredProducts.length} producto{filteredProducts.length !== 1 ? "s" : ""}
              {searchQuery && ` para "${searchQuery}"`}
            </p>
            {/* Mobile cart toggle */}
            <button
              onClick={() => setShowCartMobile(true)}
              className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              {cart.length > 0 && <span className="bg-white/20 rounded-full px-1.5">{totalItems}</span>}
            </button>
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--text-tertiary)]">
              <Package className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-sm font-medium">No se encontraron productos</p>
              <p className="text-xs mt-1">Intenta con otro término de búsqueda</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  inCart={cartProductIds.has(product.id)}
                  onAdd={() => addToCart(product)}
                  lowStock={
                    product.stockMin != null && (product.stock ?? 0) <= product.stockMin
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
         RIGHT PANEL — Cart / Order Builder
         ════════════════════════════════════════════════════════════════════ */}
      <div
        className={cn(
          "w-full lg:w-[420px] xl:w-[460px] flex flex-col bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border overflow-hidden",
          "max-lg:fixed max-lg:inset-0 max-lg:z-50 max-lg:rounded-none",
          !showCartMobile && "max-lg:hidden",
        )}
      >
        {/* Cart Header */}
        <div className="p-3 border-b border-[var(--rule-base)]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-xl">
                <ShoppingCart className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Orden de Compra</CardTitle>
                <p className="text-xs text-[var(--text-tertiary)]">
                  {cart.length} producto{cart.length !== 1 ? "s" : ""} · {totalItems} unidades
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="p-2 rounded-lg hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/20 transition-colors"
                  title="Limpiar todo"
                >
                  <RotateCcw className="h-4 w-4 text-[var(--data-error-500)]" />
                </button>
              )}
              <button
                onClick={() => setShowCartMobile(false)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 lg:hidden transition-colors"
              >
                <X className="h-4 w-4 text-[var(--text-secondary)]" />
              </button>
            </div>
          </div>

          {/* Supplier Selector */}
          <div className="relative">
            <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1 block">
              Proveedor
            </label>
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                <input
                  ref={supplierInputRef}
                  type="text"
                  placeholder="Buscar proveedor..."
                  value={supplierSearch}
                  onChange={(e) => {
                    setSupplierSearch(e.target.value);
                    setShowSupplierDropdown(true);
                    if (!e.target.value) setSelectedSupplier(null);
                  }}
                  onFocus={() => setShowSupplierDropdown(true)}
                  onBlur={() => setTimeout(() => setShowSupplierDropdown(false), 200)}
                  className={cn(
                    "w-full pl-8 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30",
                    selectedSupplier
                      ? "border-primary/40 bg-primary/5 dark:bg-primary/10"
                      : "border-[var(--rule-base)] bg-gray-50 dark:bg-white/5",
                  )}
                />
                {selectedSupplier && (
                  <button
                    onClick={() => {
                      setSelectedSupplier(null);
                      setSupplierSearch("");
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                  >
                    <X className="h-3 w-3 text-[var(--text-tertiary)]" />
                  </button>
                )}

                {/* Supplier Dropdown */}
                <AnimatePresence>
                  {showSupplierDropdown && !selectedSupplier && (
                    <m.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="absolute top-full left-0 right-0 mt-1 z-30 bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl max-h-48 overflow-y-auto"
                    >
                      {filteredSuppliers.length === 0 ? (
                        <div className="p-3 text-center text-xs text-[var(--text-tertiary)]">
                          No se encontraron proveedores
                        </div>
                      ) : (
                        filteredSuppliers.slice(0, 8).map((sup) => (
                          <button
                            key={sup.id}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setSelectedSupplier(sup);
                              setSupplierSearch(sup.name);
                              setShowSupplierDropdown(false);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-left"
                          >
                            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                              {getInitials(sup.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-[var(--text-primary)] truncate">
                                {sup.name}
                              </p>
                              <p className="text-xs text-[var(--text-tertiary)] truncate">
                                {sup.ruc ? `RUC: ${sup.ruc}` : sup.phone || "Sin datos"}
                              </p>
                            </div>
                          </button>
                        ))
                      )}
                    </m.div>
                  )}
                </AnimatePresence>
              </div>

              {/* New supplier button */}
              <button
                onClick={() => setShowSupplierForm(true)}
                className="px-3 py-2 rounded-lg border border-dashed border-[var(--rule-base)] dark:border-gray-600 hover:border-primary hover:bg-primary/5 transition-colors"
                title="Nuevo proveedor"
              >
                <Plus className="h-4 w-4 text-[var(--text-tertiary)]" />
              </button>
            </div>

            {/* Supplier info chip */}
            {selectedSupplier && (
              <div className="mt-1.5 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                {selectedSupplier.ruc && (
                  <span className="flex items-center gap-0.5">
                    <Hash className="h-2.5 w-2.5" /> {selectedSupplier.ruc}
                  </span>
                )}
                {selectedSupplier.phone && (
                  <span className="flex items-center gap-0.5">
                    <Phone className="h-2.5 w-2.5" /> {selectedSupplier.phone}
                  </span>
                )}
                {selectedSupplier.condicionPago && (
                  <span className="flex items-center gap-0.5">
                    <Clock className="h-2.5 w-2.5" /> {selectedSupplier.condicionPago.replace("_", " ")}
                  </span>
                )}
                {supplierHistory.length > 0 && (
                  <span className="text-primary font-medium">
                    {supplierHistory.length} compras previas
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--text-tertiary)]">
              <ShoppingCart className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Carrito vacío</p>
              <p className="text-xs mt-1 text-center">
                Haz clic en los productos de la izquierda para agregarlos
              </p>
            </div>
          ) : (
            cart.map((item) => (
              <m.div
                key={item.productId}
                layout
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 border border-[var(--rule-base)]"
              >
                <div className="flex gap-2.5">
                  {/* Image */}
                  <div className="relative h-12 w-12 rounded-lg overflow-hidden bg-[var(--surface-sunken)] shrink-0">
                    {item.image ? (
                      <Image src={item.image} alt={item.name} fill className="object-cover" sizes="48px" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <Package className="h-5 w-5 text-[var(--text-tertiary)]" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                        {item.name}
                      </p>
                      <button
                        onClick={() => removeFromCart(item.productId)}
                        className="p-1 rounded-lg hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/20 transition-colors shrink-0"
                      >
                        <Trash2 className="h-3 w-3 text-[var(--data-error-500)]" />
                      </button>
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)]">
                      {item.category} · {item.unit}
                      {item.stock != null && ` · Stock: ${item.stock}`}
                    </p>

                    {/* Quantity + Cost */}
                    <div className="flex items-center gap-2 mt-2">
                      <QuantityStepper
                        value={item.quantity}
                        onChange={(v) => updateCartItem(item.productId, { quantity: v })}
                      />
                      <div className="flex-1">
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[var(--text-tertiary)]">
                            S/
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            value={item.unitCost}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              if (!isNaN(v) && v >= 0) updateCartItem(item.productId, { unitCost: v });
                            }}
                            className="w-full pl-6 pr-2 py-1.5 text-xs bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 font-mono"
                          />
                        </div>
                        {item.lastCost != null && item.unitCost !== item.lastCost && (
                          <p className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] mt-0.5">
                            Antes: {fmtCurrency(item.lastCost)}
                          </p>
                        )}
                      </div>
                      <p className="text-xs font-bold text-[var(--text-primary)] whitespace-nowrap min-w-16 text-right">
                        {fmtCurrency(item.quantity * item.unitCost)}
                      </p>
                    </div>
                  </div>
                </div>
              </m.div>
            ))
          )}
        </div>

        {/* Cart Footer */}
        {cart.length > 0 && (
          <div className="border-t border-[var(--rule-base)] p-3 space-y-3">
            {/* Notes + Payment + Discount */}
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <input
                  type="text"
                  placeholder="Notas de la orden..."
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-gray-50 dark:bg-white/5 border border-[var(--rule-base)] rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
              <select
                value={paymentCondition}
                onChange={(e) => setPaymentCondition(e.target.value)}
                className="px-2 py-1.5 text-xs bg-gray-50 dark:bg-white/5 border border-[var(--rule-base)] rounded-lg focus:outline-none"
              >
                {PAYMENT_CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <div className="relative">
                <Percent className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--text-tertiary)]" />
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  placeholder="Desc. %"
                  value={globalDiscount || ""}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setGlobalDiscount(isNaN(v) ? 0 : Math.min(100, Math.max(0, v)));
                  }}
                  className="w-full pl-7 pr-2 py-1.5 text-xs bg-gray-50 dark:bg-white/5 border border-[var(--rule-base)] rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>
            </div>

            {/* Totals */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-[var(--text-secondary)]">
                <span>Subtotal ({totalItems} items)</span>
                <span className="font-mono">{fmtCurrency(subtotal)}</span>
              </div>
              {globalDiscount > 0 && (
                <div className="flex justify-between text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">
                  <span>Descuento ({globalDiscount}%)</span>
                  <span className="font-mono">-{fmtCurrency(discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-[var(--text-primary)] pt-1 border-t border-[var(--rule-base)]">
                <span>Total</span>
                <span className="font-mono text-primary">{fmtCurrency(total)}</span>
              </div>
            </div>

            {/* Submit */}
            <button
              onClick={() => setShowConfirm(true)}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Generar Orden de Compra
            </button>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
         MODALS
         ════════════════════════════════════════════════════════════════════ */}

      {/* ── Barcode Scanner ── */}
      <AnimatePresence>
        {showBarcode && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-backdrop flex items-center justify-center p-4"
            onClick={() => setShowBarcode(false)}
          >
            <m.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-card rounded-xl p-6 w-full max-w-md"
            >
              <div className="flex items-center justify-between mb-4">
                <CardTitle className="text-sm font-bold">Escanear Código</CardTitle>
                <button onClick={() => setShowBarcode(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <BarcodeScanner onDetected={handleBarcodeScan} onClose={() => setShowBarcode(false)} />
            </m.div>
          </m.div>
        )}
      </AnimatePresence>

      {/* ── Order History ── */}
      <AnimatePresence>
        {showHistory && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-backdrop flex items-center justify-center p-4"
            onClick={() => setShowHistory(false)}
          >
            <m.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-card rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between p-4 border-b border-[var(--rule-base)]">
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5 text-primary" />
                  <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Historial de Compras</CardTitle>
                </div>
                <button onClick={() => setShowHistory(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5">
                  <X className="h-4 w-4 text-[var(--text-secondary)]" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {history.length === 0 ? (
                  <p className="text-center text-sm text-[var(--text-tertiary)] py-8">Sin compras registradas</p>
                ) : (
                  history.slice(0, 30).map((order) => (
                    <div
                      key={order.id}
                      className="bg-gray-50 dark:bg-white/5 rounded-xl border border-[var(--rule-base)] overflow-hidden"
                    >
                      <button
                        onClick={() =>
                          setExpandedHistoryId(expandedHistoryId === order.id ? null : order.id)
                        }
                        className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-100/50 dark:hover:bg-white/5 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                            {getInitials(order.supplierName || "?")}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                              {order.supplierName || "Sin proveedor"}
                            </p>
                            <p className="text-xs text-[var(--text-tertiary)]">
                              {fmtDate(order.createdAt)} · {order.items.length} items ·{" "}
                              <span
                                className={cn(
                                  "font-medium",
                                  order.status === "recibido"
                                    ? "text-[var(--data-success-500)]"
                                    : order.status === "cancelado"
                                      ? "text-[var(--data-error-500)]"
                                      : "text-[var(--data-warning-500)]",
                                )}
                              >
                                {order.status}
                              </span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-bold text-[var(--text-primary)] font-mono">
                            {fmtCurrency(order.total)}
                          </span>
                          {expandedHistoryId === order.id ? (
                            <ChevronUp className="h-4 w-4 text-[var(--text-tertiary)]" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)]" />
                          )}
                        </div>
                      </button>

                      <AnimatePresence>
                        {expandedHistoryId === order.id && (
                          <m.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="px-3 pb-3 space-y-2">
                              <DataTable>
                                <thead>
                                  <tr>
                                    <th>Producto</th>
                                    <th className="text-right">Cant.</th>
                                    <th className="text-right">Costo</th>
                                    <th className="text-right">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {order.items.map((item, idx) => (
                                    <tr key={idx}>
                                      <td className="text-[var(--text-secondary)]">{item.name}</td>
                                      <td className="text-right font-mono text-[var(--text-secondary)]">{item.quantity}</td>
                                      <td className="text-right font-mono text-[var(--text-secondary)]">{fmtCurrency(item.unitCost)}</td>
                                      <td className="text-right font-mono font-medium text-[var(--text-primary)]">{fmtCurrency(item.quantity * item.unitCost)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </DataTable>
                              <div className="flex justify-end">
                                <button
                                  onClick={() => handleReorder(order)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
                                >
                                  <Repeat className="h-3 w-3" />
                                  Repetir esta compra
                                </button>
                              </div>
                            </div>
                          </m.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))
                )}
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>

      {/* ── New Supplier Modal ── */}
      <AnimatePresence>
        {showSupplierForm && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-backdrop flex items-center justify-center p-4"
            onClick={() => setShowSupplierForm(false)}
          >
            <m.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-card rounded-xl w-full max-w-md p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-primary/10 rounded-xl">
                    <Users className="h-4 w-4 text-primary" />
                  </div>
                  <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Nuevo Proveedor</CardTitle>
                </div>
                <button
                  onClick={() => setShowSupplierForm(false)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5"
                >
                  <X className="h-4 w-4 text-[var(--text-secondary)]" />
                </button>
              </div>

              <form onSubmit={handleCreateSupplier} className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase">
                    Nombre / Razón Social *
                  </label>
                  <input
                    type="text"
                    required
                    value={newSupName}
                    onChange={(e) => setNewSupName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[var(--rule-base)] rounded-lg bg-gray-50 dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Distribuidora Lima SAC"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase">RUC</label>
                    <input
                      type="text"
                      value={newSupRuc}
                      onChange={(e) => setNewSupRuc(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-[var(--rule-base)] rounded-lg bg-gray-50 dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="20123456789"
                      maxLength={11}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase">Teléfono</label>
                    <input
                      type="tel"
                      value={newSupPhone}
                      onChange={(e) => setNewSupPhone(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-[var(--rule-base)] rounded-lg bg-gray-50 dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="961234567"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase">Email</label>
                  <input
                    type="email"
                    value={newSupEmail}
                    onChange={(e) => setNewSupEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[var(--rule-base)] rounded-lg bg-gray-50 dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="ventas@proveedor.com"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase">Dirección</label>
                  <input
                    type="text"
                    value={newSupAddress}
                    onChange={(e) => setNewSupAddress(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[var(--rule-base)] rounded-lg bg-gray-50 dark:bg-white/5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Av. Industrial 456, Lima"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase">Categoría</label>
                  <select
                    value={newSupCategoria}
                    onChange={(e) => setNewSupCategoria(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[var(--rule-base)] rounded-lg bg-gray-50 dark:bg-white/5 focus:outline-none"
                  >
                    <option value="mayorista">Mayorista</option>
                    <option value="fabricante">Fabricante</option>
                    <option value="distribuidor">Distribuidor</option>
                    <option value="importador">Importador</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={creatingSup || !newSupName.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-white font-bold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {creatingSup ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Crear Proveedor
                </button>
              </form>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>

      {/* ── Confirm Order Modal ── */}
      <AnimatePresence>
        {showConfirm && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-backdrop flex items-center justify-center p-4"
            onClick={() => !submitting && setShowConfirm(false)}
          >
            <m.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-card rounded-xl w-full max-w-md p-5"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-primary/10 rounded-xl">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-[var(--text-primary)]">
                    Confirmar Orden de Compra
                  </CardTitle>
                  <p className="text-xs text-[var(--text-tertiary)]">Revisa los datos antes de generar</p>
                </div>
              </div>

              <div className="space-y-3 mb-4">
                <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--text-secondary)]">Proveedor</span>
                    <span className="font-medium text-[var(--text-primary)]">
                      {selectedSupplier?.name || "Sin proveedor"}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--text-secondary)]">Productos</span>
                    <span className="font-medium">{cart.length}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--text-secondary)]">Unidades totales</span>
                    <span className="font-medium">{totalItems}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--text-secondary)]">Condición de pago</span>
                    <span className="font-medium">
                      {PAYMENT_CONDITIONS.find((c) => c.value === paymentCondition)?.label}
                    </span>
                  </div>
                  {globalDiscount > 0 && (
                    <div className="flex justify-between text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">
                      <span>Descuento</span>
                      <span className="font-medium">{globalDiscount}% (-{fmtCurrency(discountAmount)})</span>
                    </div>
                  )}
                </div>

                {/* Items summary */}
                <div className="bg-gray-50 dark:bg-white/5 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[var(--surface-sunken)]">
                        <th className="text-left px-2.5 py-1.5 text-[var(--text-secondary)]">Producto</th>
                        <th className="text-right px-2.5 py-1.5 text-[var(--text-secondary)]">Cant.</th>
                        <th className="text-right px-2.5 py-1.5 text-[var(--text-secondary)]">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cart.map((item) => (
                        <tr key={item.productId} className="border-t border-[var(--rule-base)]">
                          <td className="px-2.5 py-1.5 text-[var(--text-secondary)] truncate max-w-40">
                            {item.name}
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-mono text-[var(--text-secondary)]">
                            {item.quantity}
                          </td>
                          <td className="px-2.5 py-1.5 text-right font-mono font-medium text-[var(--text-primary)]">
                            {fmtCurrency(item.quantity * item.unitCost)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[var(--rule-base)]">
                  <span className="text-sm font-bold text-[var(--text-primary)]">Total</span>
                  <span className="text-lg font-bold text-primary font-mono">{fmtCurrency(total)}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowConfirm(false)}
                  disabled={submitting}
                  className="flex-1 py-2.5 text-sm font-medium text-[var(--text-secondary)] bg-[var(--surface-sunken)] hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSubmitOrder}
                  disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Confirmar
                </button>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>

      {/* ── Success Modal ── */}
      <AnimatePresence>
        {showSuccess && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-backdrop flex items-center justify-center p-4"
            onClick={() => setShowSuccess(false)}
          >
            <m.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-card rounded-xl w-full max-w-sm p-6 text-center"
            >
              <m.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", damping: 12, delay: 0.1 }}
                className="mx-auto mb-4 h-16 w-16 rounded-full bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] flex items-center justify-center"
              >
                <Check className="h-8 w-8 text-[var(--data-success-500)]" />
              </m.div>
              <CardTitle className="text-lg font-bold text-[var(--text-primary)] mb-1">
                ¡Orden Generada!
              </CardTitle>
              <p className="text-sm text-[var(--text-secondary)] mb-1">
                La orden de compra fue creada exitosamente
              </p>
              {lastOrderId && (
                <p className="text-xs text-[var(--text-tertiary)] font-mono mb-4">
                  ID: {lastOrderId.slice(-8)}
                </p>
              )}
              <button
                onClick={() => setShowSuccess(false)}
                className="w-full py-2.5 text-sm font-bold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors"
              >
                Continuar
              </button>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
