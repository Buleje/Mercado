"use client";

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import dynamic from "next/dynamic";
import { useLocalStorageDraft } from "@/hooks/use-local-storage-draft";
import {
  ShoppingBasket,
  Package,
  MessageCircle,
  FileDown,
  Bookmark as BookmarkIcon,
  ClipboardList,
  Loader2,
  LayoutGrid,
  List,
  ScanLine,
  Tag,
  Camera,
  ShoppingCart,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { usePOSSound } from "./usePOSSound";
import PuntoCompraProductCard from "./PuntoCompraProductCard";
import {
  PurchaseProduct as Product,
  PurchaseSupplier as Supplier,
  PurchaseCartItem as CartItem,
  PaymentMethod,
  PurchaseSortBy as SortBy,
  PurchaseViewMode as ViewMode,
  calculateSuggestedQty,
} from "@/lib/types/purchases";
import { buildPurchaseWhatsAppUrl } from "@/lib/whatsapp-client";

const OCPrintPreviewModal = dynamic(() => import("./OCPrintPreviewModal"), { ssr: false });
const InvoiceScannerModal = dynamic(() => import("./InvoiceScannerModal"), { ssr: false });
const PuntoCompraFrequentItems = dynamic(() => import("./PuntoCompraFrequentItems"), { ssr: false });
const PuntoCompraBundles = dynamic(() => import("./PuntoCompraBundles"), { ssr: false });
const PuntoCompraOrderCreator = dynamic(() => import("./PuntoCompraOrderCreator"), { ssr: false });
const PuntoCompraLotSelector = dynamic(() => import("./PuntoCompraLotSelector"), { ssr: false });

const DRAFT_KEY = "poc-draft";

interface ActivePromo {
  id: string;
  nombre: string;
  tipo: string;
  valor: number;
  categorias: string[];
  fechaInicio: string;
  fechaFin: string;
  activa: boolean;
}

// ─── Helpers para promos 2×1 y 3×2 ──────────────────────────────────────────

function computeEffectiveQty(qty: number, tipo: string): number {
  if (tipo === "2x1") return Math.ceil(qty / 2);           // paga 1 por cada 2
  if (tipo === "3x2") return Math.floor(qty / 3) * 2 + Math.min(qty % 3, 2); // paga 2 por cada 3
  return qty;
}

function freeUnits(qty: number, tipo: string): number {
  return qty - computeEffectiveQty(qty, tipo);
}

function itemMatchesPromo(item: CartItem, promo: ActivePromo): boolean {
  if (!promo.categorias.length) return true;
  return promo.categorias.includes(item.product.category ?? "");
}

// ─── Componente principal ─────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 24;

export default function PuntoCompraView() {
  // ── Hooks de contexto y sonido ───────────────────────────────────────────────
  const { playDing } = usePOSSound();
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // ── Draft (localStorage) ─────────────────────────────────────────────────────
  const { save: saveDraftHook, load: loadDraft, clear: clearDraft, hasDraft } = useLocalStorageDraft<{
    cart: CartItem[];
    selectedSupplier: Supplier | null;
    discount: number;
    paymentMethod: PaymentMethod;
    deliveryDate: string;
    notes: string;
  }>(DRAFT_KEY);

  // ── Estado ──────────────────────────────────────────────────────────────────
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortBy, setSortBy] = useState<SortBy>("stock");
  const [soloReponer, setSoloReponer] = useState(false);
  const [showIGV, setShowIGV] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("contado");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [lastOC, setLastOC] = useState<{ id: string; total: number; items: number } | null>(null);
  const [page, setPage] = useState(1);
  const [supplierHistory, setSupplierHistory] = useState<Array<{ id: string; total: number; date: string }>>([]);
  const [priceHistory, setPriceHistory] = useState<Record<number, number>>({});
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [showScanner, setShowScanner] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<Array<{ name: string; items: Array<{ productId: number; name: string; quantity: number }> }>>([]);
  const [activePromos, setActivePromos] = useState<ActivePromo[]>([]);
  const [appliedPromo, setAppliedPromo] = useState<ActivePromo | null>(null);
  const [showInvoiceScanner, setShowInvoiceScanner] = useState(false);
  const [showOrderCreator, setShowOrderCreator] = useState(false);
  const [lotSelectorProduct, setLotSelectorProduct] = useState<Product | null>(null);
  const [cartTab, setCartTab] = useState<"carrito" | "frecuentes" | "paquetes">("carrito");

  // ── Fetch inicial + cargar borrador ─────────────────────────────────────────
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        await Promise.all([
      fetchProducts(),
      fetchSuppliers(),
      // Cargar promociones activas del día
      fetch("/api/discount-rules").then(r => r.ok ? r.json() : []).then((rules: ActivePromo[]) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const activas = rules.filter(r => {
          const start = new Date(r.fechaInicio);
          const end = new Date(r.fechaFin);
          end.setHours(23, 59, 59, 999);
          return r.activa && today >= start && today <= end;
        });
        setActivePromos(activas);
      }).catch(() => {}),
    ]);
      } finally {
        setLoading(false);
      }
    };

    // Cargar plantillas de pedido frecuente
    try {
      const tpl = localStorage.getItem("poc-templates");
      if (tpl) setSavedTemplates(JSON.parse(tpl));
    } catch {}

    // Cargar borrador de localStorage si existe
    const draft = loadDraft();
    if (draft) {
      if (draft.cart?.length) setCart(draft.cart);
      if (draft.selectedSupplier) setSelectedSupplier(draft.selectedSupplier);
      if (typeof draft.discount === "number") setDiscount(draft.discount);
      if (draft.paymentMethod) setPaymentMethod(draft.paymentMethod);
      if (draft.deliveryDate) setDeliveryDate(draft.deliveryDate);
      if (draft.notes) setNotes(draft.notes);
    }

    fetchData();

    // Cargar historial de precios de compra (con cache en localStorage TTL 1h)
    const PRICE_CACHE_KEY = "poc-price-history";
    const cached = localStorage.getItem(PRICE_CACHE_KEY);
    if (cached) {
      try {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < 3600000) { // 1 hora
          setPriceHistory(data);
          return; // No hacer fetch
        }
      } catch {}
    }

    fetch("/api/purchases")
      .then(r => r.ok ? r.json() : { purchases: [] })
      .then(json => {
        const all = Array.isArray(json) ? json : (json?.purchases ?? []);
        const history: Record<number, number> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        all.forEach((po: any) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (po.items || []).forEach((item: any) => {
            if (!history[item.productId]) history[item.productId] = item.unitCost;
          });
        });
        setPriceHistory(history);
        localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify({ data: history, ts: Date.now() }));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Debounce búsqueda ────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // ── Fetch products ───────────────────────────────────────────────────────────
  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/products");
      if (!res.ok) return;
      const json = await res.json();
      const raw: Product[] = Array.isArray(json) ? json : json.products ?? [];
      setProducts(raw.filter((p) => p.active !== false));
    } catch {
      // Silencioso
    }
  }, []);

  // ── Fetch suppliers ──────────────────────────────────────────────────────────
  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await fetch("/api/suppliers");
      if (!res.ok) return;
      const json = await res.json();
      const raw: Supplier[] = json.suppliers ?? (Array.isArray(json) ? json : []);
      setSuppliers(raw);
    } catch {
      // Silencioso
    }
  }, []);

  // ── Lógica del carrito ───────────────────────────────────────────────────────
  const addToCart = useCallback((product: Product, qty: number) => {
    playDing();
    setLastOC(null); // Limpiar resumen de OC anterior al agregar producto nuevo
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id
            ? { ...i, quantity: i.quantity + qty }
            : i,
        );
      }
      return [...prev, { product, quantity: qty }];
    });
  }, [playDing]);

  const updateQty = useCallback((productId: number, delta: number) => {
    setCart((prev) =>
      prev.map((i) =>
        i.product.id === productId
          ? { ...i, quantity: Math.max(1, i.quantity + delta) }
          : i,
      ),
    );
  }, []);

  const removeItem = useCallback((productId: number) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  }, []);

  const clearCart = useCallback(() => {
    if (cart.length === 0) return;
    if (!window.confirm("¿Limpiar toda la canasta? Se perderán los items agregados.")) return;
    setCart([]);
  }, [cart.length]);

  // ── Cálculos derivados ───────────────────────────────────────────────────────
  const categories = useMemo(
    () => [
      "Todos",
      ...Array.from(
        new Set(products.map((p) => p.category).filter(Boolean)),
      ),
    ],
    [products],
  );

  const filtered = useMemo(() => {
    let list = [...products];
    if (soloReponer)
      list = list.filter((p) => (p.stock ?? 0) <= (p.stockMin ?? 0));
    if (category !== "Todos")
      list = list.filter((p) => p.category === category);
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.barcode?.includes(debouncedSearch),
      );
    }
    list.sort((a, b) => {
      if (sortBy === "stock") return (a.stock ?? 0) - (b.stock ?? 0);
      if (sortBy === "price")
        return (
          (a.costPrice ?? a.price) - (b.costPrice ?? b.price)
        );
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [products, soloReponer, category, debouncedSearch, sortBy]);

  // ── Paginación ───────────────────────────────────────────────────────────────
  useEffect(() => { setPage(1); }, [category, debouncedSearch, sortBy, soloReponer]);

  // Auto-limpiar toast después de 4 segundos
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 4000);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // Cargar historial de OC del proveedor seleccionado
  useEffect(() => {
    if (!selectedSupplier) { setSupplierHistory([]); return; }
    fetch("/api/purchases")
      .then(r => r.ok ? r.json() : { purchases: [] })
      .then(json => {
        const all = Array.isArray(json) ? json : (json?.purchases ?? json?.data ?? []);
        const filtered = all
          .filter((p: Record<string, unknown>) => p.supplierId === selectedSupplier.id || p.supplierName === selectedSupplier.name)
          .slice(0, 3)
          .map((p: Record<string, unknown>) => ({
            id: String(p.id ?? ""),
            total: Number(p.total ?? 0),
            date: String(p.createdAt ?? p.date ?? ""),
          }));
        setSupplierHistory(filtered);
      })
      .catch(() => setSupplierHistory([]));
  }, [selectedSupplier]);

  // ── Detección online/offline + guardar borrador al cerrar pestaña ───────────
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => {
      setIsOnline(false);
      if (cart.length > 0) {
        saveDraftHook({ cart, selectedSupplier, discount, paymentMethod, deliveryDate, notes });
      }
    };
    const handleBeforeUnload = () => {
      if (cart.length > 0) {
        saveDraftHook({ cart, selectedSupplier, discount, paymentMethod, deliveryDate, notes });
      }
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [cart, selectedSupplier, discount, paymentMethod, deliveryDate, notes, saveDraftHook]);

  // ── Atajo F2 para toggle escáner ─────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); setShowScanner(s => !s); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const paginatedProducts = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, page]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);

  const subtotal = useMemo(() => {
    const isBundle = appliedPromo && (appliedPromo.tipo === "2x1" || appliedPromo.tipo === "3x2");
    return cart.reduce((s, i) => {
      const price = i.product.costPrice ?? i.product.price;
      const applies = isBundle && itemMatchesPromo(i, appliedPromo!);
      const qtyPaid = applies ? computeEffectiveQty(i.quantity, appliedPromo!.tipo) : i.quantity;
      return s + price * qtyPaid;
    }, 0);
  }, [cart, appliedPromo]);

  const discountAmount = useMemo(() => {
    if (appliedPromo?.tipo === "monto_fijo") return Math.min(appliedPromo.valor, subtotal);
    if (appliedPromo?.tipo === "combo") return Math.max(0, subtotal - appliedPromo.valor);
    return subtotal * (discount / 100);
  }, [subtotal, discount, appliedPromo]);

  const total = useMemo(
    () => Math.max(0, subtotal - discountAmount),
    [subtotal, discountAmount],
  );

  const igvAmount = useMemo(() => total * 0.18, [total]);

  const totalWithIGV = useMemo(() => total + igvAmount, [total, igvAmount]);

  const needsReorderCount = useMemo(
    () => products.filter((p) => (p.stock ?? 0) <= (p.stockMin ?? 0)).length,
    [products],
  );

  const cartTotalQty = useMemo(
    () => cart.reduce((s, i) => s + i.quantity, 0),
    [cart],
  );

  const displayTotal = showIGV ? totalWithIGV : total;

  // Mapa de carrito para lookup O(1) en vez de O(n) por producto
  const cartMap = useMemo(
    () => new Map(cart.map(i => [i.product.id, i.quantity])),
    [cart],
  );

  // Conteo por categoría para evitar O(n*m) en los pills
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { Todos: products.length };
    products.forEach(p => { counts[p.category] = (counts[p.category] || 0) + 1; });
    return counts;
  }, [products]);

  // Fecha mínima para deliveryDate (evitar recalcular en cada render)
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  // ── Plantillas de pedido frecuente ───────────────────────────────────────────
  const saveAsTemplate = useCallback(() => {
    if (cart.length === 0) return;
    const name = window.prompt("Nombre para esta plantilla (ej: Pedido semanal):");
    if (!name?.trim()) return;
    const template = { name: name.trim(), items: cart.map(i => ({ productId: i.product.id, name: i.product.name, quantity: i.quantity })) };
    const updated = [...savedTemplates, template];
    setSavedTemplates(updated);
    try { localStorage.setItem("poc-templates", JSON.stringify(updated)); } catch {}
    setToastMsg(`Plantilla "${name}" guardada`);
  }, [cart, savedTemplates]);

  const loadTemplate = useCallback((template: typeof savedTemplates[number]) => {
    template.items.forEach(item => {
      const product = products.find(p => p.id === item.productId);
      if (product) addToCart(product, item.quantity);
    });
    setToastMsg(`Plantilla "${template.name}" cargada`);
  }, [products, addToCart]);

  const deleteTemplate = useCallback((idx: number) => {
    const updated = savedTemplates.filter((_, i) => i !== idx);
    setSavedTemplates(updated);
    try { localStorage.setItem("poc-templates", JSON.stringify(updated)); } catch {}
  }, [savedTemplates]);

  // ── Acciones ─────────────────────────────────────────────────────────────────
  const confirmarOC = async () => {
    if (cart.length === 0) return;
    if (!navigator.onLine) {
      setToastMsg("Sin conexión — guarda como borrador e intenta después");
      return;
    }
    if (!selectedSupplier) {
      setToastMsg("Selecciona un proveedor antes de crear la orden");
      return;
    }
    setProcessing(true);
    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: selectedSupplier?.id ?? "",
          supplierName: selectedSupplier?.name ?? "",
          items: cart.map((i) => ({
            productId: i.product.id,
            name: i.product.name,
            quantity: i.quantity,
            unitCost: i.product.costPrice ?? i.product.price,
            unit: i.product.unit,
          })),
          notes: notes || undefined,
          paymentMethod,
          deliveryDate: deliveryDate || undefined,
          discount,
        }),
      });
      if (!res.ok) throw new Error("Error al crear OC");
      const oc = await res.json() as { id: string | number };
      const ocId = String(oc.id);
      setToastMsg(`Orden de Compra creada — ID: ${ocId}`);
      setLastOC({ id: ocId, total, items: cart.length });
      setCart([]);
      setNotes("");
      setDiscount(0);
      // Invalidar cache de precios para que se recargue con los nuevos costos
      try { localStorage.removeItem("poc-price-history"); } catch {}
      // Limpiar borrador al confirmar
      clearDraft();
    } catch {
      setToastMsg("No se pudo crear la Orden de Compra");
    } finally {
      setProcessing(false);
    }
  };

  const generateWhatsApp = () => {
    if (cart.length === 0) return;
    const url = buildPurchaseWhatsAppUrl({
      phone: selectedSupplier?.phone,
      items: cart.map(i => ({ name: i.product.name, quantity: i.quantity, unit: i.product.unit })),
      total: displayTotal,
      deliveryDate,
      paymentMethod,
    });
    window.open(url, "_blank");
  };

  const handleSaveDraft = () => {
    saveDraftHook({ cart, selectedSupplier, discount, paymentMethod, deliveryDate, notes });
    setToastMsg("Borrador guardado");
  };

  // calcSuggestedQty viene de @/lib/types/purchases como calculateSuggestedQty

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="print-area">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div
          aria-hidden="true"
          className="h-10 w-10 rounded-xl bg-[#00B4A6] text-white flex items-center justify-center shrink-0"
        >
          <ShoppingBasket className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
            Punto de Compra
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Arma tu canasta y genera órdenes de compra
          </p>
        </div>
        <span className="ml-auto shrink-0 text-xs text-gray-400">
          {products.length} productos{needsReorderCount > 0 ? ` · ${needsReorderCount} a reponer` : ""}
        </span>
        {needsReorderCount > 0 && (
          <span className="shrink-0 text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-1 rounded-full font-medium">
            {needsReorderCount} a reponer
          </span>
        )}
        {needsReorderCount > 5 && (
          <div className="w-full mt-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            Tienes <strong>{needsReorderCount}</strong> productos por debajo del stock mínimo.{" "}
            <button type="button" onClick={() => { setSoloReponer(true); setPage(1); }} className="ml-1 underline font-semibold hover:text-amber-900 dark:hover:text-amber-300">
              Ver todos →
            </button>
          </div>
        )}
      </div>

      {/* Barra de controles */}
      <div className="flex flex-wrap gap-2 mb-3">
        {/* Selector proveedor */}
        <select
          value={selectedSupplier?.id ?? ""}
          onChange={(e) => {
            const found = suppliers.find((s) => s.id === e.target.value);
            setSelectedSupplier(found ?? null);
          }}
          disabled={processing}
          aria-label="Seleccionar proveedor"
          className="px-3 py-1.5 border border-gray-200 dark:border-card-border rounded-xl text-xs bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="">Todos los proveedores</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        {/* Toggle solo reponer */}
        <button
          type="button"
          onClick={() => setSoloReponer((v) => !v)}
          aria-pressed={soloReponer}
          className={cn(
            "px-3 py-1.5 rounded-xl text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6]",
            soloReponer
              ? "bg-red-500 text-white"
              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
          )}
        >
          Solo reponer
        </button>

        {/* Búsqueda */}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar producto..."
          aria-label="Buscar producto por nombre o código"
          className="flex-1 min-w-36 px-3 py-1.5 border border-gray-200 dark:border-card-border rounded-xl text-xs bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6]"
        />

        {/* Botón escáner de código de barras */}
        <button
          type="button"
          onClick={() => setShowScanner(!showScanner)}
          className={cn("flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors", showScanner ? "bg-[#00B4A6] text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400")}
          title="Buscar por código de barras (F2)"
        >
          <ScanLine className="h-3.5 w-3.5 shrink-0" /> Código
        </button>

        {/* Botón escáner de factura OCR */}
        <button
          type="button"
          onClick={() => setShowInvoiceScanner(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:text-emerald-600 transition-colors"
          title="Escanear factura con cámara"
        >
          <Camera className="h-3.5 w-3.5 shrink-0" /> Factura
        </button>

        {/* Toggle vista */}
        <button
          type="button"
          onClick={() => setViewMode((v) => (v === "grid" ? "list" : "grid"))}
          aria-label={viewMode === "grid" ? "Cambiar a vista lista" : "Cambiar a vista cuadrícula"}
          className="p-1.5 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6]"
        >
          {viewMode === "grid" ? (
            <List className="h-4 w-4" />
          ) : (
            <LayoutGrid className="h-4 w-4" />
          )}
        </button>

        {/* Ordenar por */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          aria-label="Ordenar por"
          className="px-3 py-1.5 border border-gray-200 dark:border-card-border rounded-xl text-xs bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6]"
        >
          <option value="stock">Stock ↑</option>
          <option value="price">Precio</option>
          <option value="name">Nombre</option>
        </select>
      </div>

      {/* Pills de categorías */}
      <div
        className="flex gap-1.5 overflow-x-auto scrollbar-none mb-3 pb-1"
        role="tablist"
        aria-label="Filtrar por categoría"
      >
        {categories.map((cat) => {
          const count = categoryCounts[cat] ?? 0;
          return (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={category === cat}
              onClick={() => setCategory(cat)}
              className={cn(
                "shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6]",
                category === cat
                  ? "bg-[#00B4A6] text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700",
              )}
            >
              {cat} <span className="opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Input de código de barras */}
      {showScanner && (
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={barcodeInput}
            onChange={e => setBarcodeInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && barcodeInput.trim()) {
                const found = products.find(p => p.barcode === barcodeInput.trim());
                if (found) {
                  addToCart(found, calculateSuggestedQty(found));
                  setBarcodeInput("");
                  setToastMsg(found.name + " agregado");
                } else {
                  setToastMsg("Producto no encontrado: " + barcodeInput);
                }
              }
            }}
            placeholder="Escanea o escribe el código de barras..."
            autoFocus
            className="flex-1 px-3 py-2 border border-[#00B4A6] rounded-xl text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#00B4A6]"
          />
          <button
            type="button"
            onClick={() => { setShowScanner(false); setBarcodeInput(""); }}
            className="px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded-xl text-xs"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Banner offline */}
      {!isOnline && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-center gap-2 mb-3">
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse shrink-0" />
          Sin conexion — tu canasta se guardo automaticamente. Se enviara cuando vuelva el internet.
        </div>
      )}

      {/* Banner de promociones activas */}
      {activePromos.length > 0 && (
        <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Tag className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
              {activePromos.length} promo{activePromos.length > 1 ? "s" : ""} activa{activePromos.length > 1 ? "s" : ""} hoy
            </span>
            {appliedPromo && (
              <button
                onClick={() => { setAppliedPromo(null); setDiscount(0); }}
                className="ml-auto text-[10px] text-amber-600 hover:text-amber-800 dark:text-amber-400 underline"
              >
                Quitar aplicada
              </button>
            )}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {activePromos.map(promo => (
              <button
                key={promo.id}
                onClick={() => {
                  if (appliedPromo?.id === promo.id) {
                    setAppliedPromo(null);
                    setDiscount(0);
                  } else {
                    setAppliedPromo(promo);
                    if (promo.tipo === "porcentaje") setDiscount(promo.valor);
                  }
                }}
                className={cn(
                  "text-[10px] px-2 py-1 rounded-lg font-medium border transition-all",
                  appliedPromo?.id === promo.id
                    ? "bg-amber-500 text-white border-amber-500"
                    : "bg-white dark:bg-gray-900 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40",
                )}
              >
                {promo.tipo === "porcentaje" ? `🏷️ ${promo.valor}% OFF` :
                 promo.tipo === "monto_fijo" ? `💰 S/ ${promo.valor} OFF` :
                 promo.tipo === "2x1" ? "🎁 2×1" :
                 promo.tipo === "3x2" ? "📦 3×2" :
                 promo.tipo === "combo" ? `🛒 Combo S/ ${promo.valor}` : `🏷️ ${promo.nombre}`}
                <span className="ml-1 opacity-70 truncate max-w-[80px] inline-block align-bottom">
                  {promo.nombre}
                </span>
              </button>
            ))}
          </div>
          {appliedPromo && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1.5">
              ✓ Aplicando: <strong>{appliedPromo.nombre}</strong>
              {appliedPromo.tipo === "porcentaje" && ` — ${appliedPromo.valor}% de descuento en esta OC`}
              {appliedPromo.tipo === "2x1" && " — compra 2, paga 1 (por cada 2 unidades, 1 es gratis)"}
              {appliedPromo.tipo === "3x2" && " — compra 3, paga 2 (por cada 3 unidades, 1 es gratis)"}
              {appliedPromo.tipo === "monto_fijo" && ` — S/ ${appliedPromo.valor} de descuento en esta OC`}
              {appliedPromo.tipo === "combo" && ` — precio combo S/ ${appliedPromo.valor} (ahorro S/ ${Math.max(0, subtotal - appliedPromo.valor).toFixed(2)})`}
            </p>
          )}
        </div>
      )}

      {/* Layout principal */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* ── Columna productos ── */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  aria-hidden="true"
                  className="h-40 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse"
                />
              ))}
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {paginatedProducts.map((p) => {
                const inCartQty = cartMap.get(p.id) ?? 0;
                return (
                  <div
                    key={p.id}
                    className={cn(
                      "rounded-2xl transition-all",
                      inCartQty > 0 && "ring-2 ring-[#00B4A6] ring-offset-1 dark:ring-offset-gray-900",
                    )}
                  >
                    <PuntoCompraProductCard
                      product={p}
                      inCart={inCartQty}
                      onAdd={addToCart}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            /* Vista lista */
            <div className="overflow-x-auto -mx-1">
            <div className="border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400">
                      Producto
                    </th>
                    <th className="text-right p-3 font-medium text-gray-600 dark:text-gray-400">
                      Costo
                    </th>
                    <th className="text-right p-3 font-medium text-gray-600 dark:text-gray-400">
                      Stock
                    </th>
                    <th className="text-right p-3 font-medium text-gray-600 dark:text-gray-400">
                      Sugerido
                    </th>
                    <th className="p-3" aria-label="Acción" />
                  </tr>
                </thead>
                <tbody>
                  {paginatedProducts.map((p) => {
                    const needs = (p.stock ?? 0) <= (p.stockMin ?? 0);
                    const sug = calculateSuggestedQty(p);
                    return (
                      <tr
                        key={p.id}
                        className="border-t border-gray-100 dark:border-card-border hover:bg-gray-50 dark:hover:bg-white/5"
                      >
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {needs && (
                              <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                                REPONER
                              </span>
                            )}
                            <span className="font-medium text-gray-900 dark:text-white">
                              {p.name}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-right font-mono text-gray-900 dark:text-white">
                          <span title={`Costo: S/${(p.costPrice || p.price).toFixed(2)} | Venta: S/${p.price.toFixed(2)} | Margen: ${p.costPrice ? ((1 - p.costPrice / p.price) * 100).toFixed(0) : "—"}%`}>
                            S/{(p.costPrice ?? p.price).toFixed(2)}
                          </span>
                        </td>
                        <td className="p-3 text-right text-gray-500 dark:text-gray-400">
                          {p.stock ?? "—"} {p.unit}
                        </td>
                        <td className="p-3 text-right text-emerald-600 dark:text-emerald-400 font-medium">
                          {sug}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => addToCart(p, sug)}
                            aria-label={`Agregar ${p.name}`}
                            className="px-3 py-1 bg-[#00B4A6] text-white rounded-lg text-xs hover:bg-[#009690] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6]"
                          >
                            + Agregar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </div>
          )}

          {/* Estado vacío */}
          {filtered.length === 0 && !loading && (
            <div className="text-center py-12 text-gray-400">
              <Package
                aria-hidden="true"
                className="h-12 w-12 mx-auto mb-3 opacity-30"
              />
              <p className="text-sm">No se encontraron productos</p>
            </div>
          )}

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-xl text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                ← Anterior
              </button>
              <span className="text-xs text-gray-500">
                Página {page} de {totalPages} · {filtered.length} productos
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-xl text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Siguiente →
              </button>
            </div>
          )}
        </div>

        {/* FAB scanner mobile */}
        <button
          type="button"
          onClick={() => setShowScanner(s => !s)}
          className="fixed bottom-20 right-4 lg:hidden z-40 h-12 w-12 rounded-full bg-[#00B4A6] text-white shadow-lg flex items-center justify-center hover:bg-[#009690] transition-colors"
          aria-label="Escanear código de barras"
        >
          <ScanLine className="h-5 w-5" />
        </button>

        {/* FAB carrito mobile */}
        {cart.length > 0 && (
          <button
            type="button"
            onClick={() => document.getElementById("poc-cart")?.scrollIntoView({ behavior: "smooth" })}
            className="fixed bottom-20 left-4 lg:hidden z-40 h-12 px-4 rounded-full bg-[#00B4A6] text-white shadow-lg flex items-center gap-2 hover:bg-[#009690] transition-colors"
            aria-label="Ver carrito"
          >
            <ShoppingBasket className="h-4 w-4" />
            <span className="text-sm font-bold">{cartTotalQty}</span>
            <span className="text-xs opacity-80">S/{displayTotal.toFixed(2)}</span>
          </button>
        )}

        {/* ── Sidebar carrito ── */}
        <aside
          id="poc-cart"
          aria-label="Canasta de compra"
          className="w-full lg:w-80 xl:w-96 shrink-0"
        >
          <div className="sticky top-4 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden shadow-sm">
            {/* Header carrito */}
            <div className="p-4 border-b border-gray-100 dark:border-card-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBasket
                  aria-hidden="true"
                  className="h-4 w-4 text-[#00B4A6]"
                />
                <span className="font-semibold text-sm text-gray-900 dark:text-white">
                  Canasta
                </span>
                {hasDraft && cart.length === 0 && (
                  <span className="text-[9px] bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-medium">
                    Borrador
                  </span>
                )}
                {cart.length > 0 && (
                  <span
                    aria-label={`${cartTotalQty} unidades en canasta`}
                    className="h-5 w-5 rounded-full bg-[#00B4A6] text-white text-xs flex items-center justify-center font-bold"
                  >
                    {cartTotalQty > 99 ? "99+" : cartTotalQty}
                  </span>
                )}
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={clearCart}
                  disabled={processing}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6] rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Limpiar
                </button>
              )}
            </div>

            {/* Tabs: Carrito | Frecuentes | Paquetes */}
            <div className="flex border-b border-gray-100 dark:border-card-border" role="tablist" aria-label="Secciones del carrito">
              {([
                { key: "carrito" as const, label: "Carrito" },
                { key: "frecuentes" as const, label: "Frecuentes" },
                { key: "paquetes" as const, label: "Paquetes" },
              ]).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={cartTab === tab.key}
                  onClick={() => setCartTab(tab.key)}
                  className={cn(
                    "flex-1 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                    cartTab === tab.key
                      ? "text-[#00B4A6] border-b-2 border-[#00B4A6]"
                      : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab: Frecuentes */}
            {cartTab === "frecuentes" && (
              <PuntoCompraFrequentItems
                onAddToCart={(productId, quantity) => {
                  const product = products.find((p) => p.id === productId);
                  if (product) {
                    addToCart(product, quantity);
                    setCartTab("carrito");
                  }
                }}
              />
            )}

            {/* Tab: Paquetes */}
            {cartTab === "paquetes" && (
              <PuntoCompraBundles
                onAddBundle={(items) => {
                  items.forEach((item) => {
                    const product = products.find((p) => p.id === item.productId);
                    if (product) addToCart(product, item.quantity);
                  });
                  setCartTab("carrito");
                }}
              />
            )}

            {/* Tab: Carrito (default) */}
            {cartTab === "carrito" && (
            <>
            {/* Historial del proveedor */}
            {selectedSupplier && supplierHistory.length > 0 && (
              <div className="px-3 pt-2 pb-1 border-b border-gray-100 dark:border-card-border">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Últimas OC a {selectedSupplier.name}</p>
                <div className="space-y-1">
                  {supplierHistory.map(h => (
                    <div key={h.id} className="flex items-center justify-between text-[10px]">
                      <span className="text-gray-500 truncate">{h.id.slice(0, 15)}...</span>
                      <span className="font-mono font-medium text-gray-700 dark:text-gray-300">S/{h.total.toFixed(2)}</span>
                      <span className="text-gray-400">{h.date ? new Date(h.date).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }) : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Items del carrito */}
            <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  <Package
                    aria-hidden="true"
                    className="h-8 w-8 mx-auto mb-2 opacity-30"
                  />
                  <p>Selecciona productos del catálogo</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={item.product.id}
                    className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-white/5 rounded-xl animate-in fade-in slide-in-from-left-2 duration-200"
                  >
                    {/* Miniatura */}
                    <div
                      aria-hidden="true"
                      className="h-8 w-8 rounded-lg bg-[#00B4A6]/10 flex items-center justify-center shrink-0 text-[#00B4A6] font-bold text-sm overflow-hidden relative"
                    >
                      <span className="absolute inset-0 flex items-center justify-center">
                        {(item.product.name || "?")[0].toUpperCase()}
                      </span>
                      {item.product.image ? (
                        <Image
                          src={item.product.image}
                          alt=""
                          fill
                          className="object-cover rounded-lg z-10"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          unoptimized
                        />
                      ) : null}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                        {item.product.name}
                      </p>
                      <p className="text-[10px] text-gray-400 flex items-center gap-1 flex-wrap">
                        S/
                        {(
                          item.product.costPrice ?? item.product.price
                        ).toFixed(2)}{" "}
                        / {item.product.unit}
                        {priceHistory[item.product.id] !== undefined && priceHistory[item.product.id] !== (item.product.costPrice ?? item.product.price) && (
                          <span className={cn(
                            "text-[9px] font-bold px-1 rounded",
                            (item.product.costPrice ?? item.product.price) > priceHistory[item.product.id]
                              ? "bg-red-100 text-red-600"
                              : "bg-green-100 text-green-600"
                          )}>
                            {(item.product.costPrice ?? item.product.price) > priceHistory[item.product.id] ? "↑" : "↓"}
                            {Math.abs(((item.product.costPrice ?? item.product.price) - priceHistory[item.product.id]) / priceHistory[item.product.id] * 100).toFixed(0)}%
                          </span>
                        )}
                        {appliedPromo && (appliedPromo.tipo === "2x1" || appliedPromo.tipo === "3x2") &&
                          itemMatchesPromo(item, appliedPromo) &&
                          freeUnits(item.quantity, appliedPromo.tipo) > 0 && (
                          <span className="text-[9px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1 rounded font-bold">
                            🎁 {freeUnits(item.quantity, appliedPromo.tipo)} gratis
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Controles cantidad */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateQty(item.product.id, -1)}
                        disabled={processing}
                        aria-label={`Reducir cantidad de ${item.product.name}`}
                        className="h-6 w-6 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        -
                      </button>
                      <span
                        aria-live="polite"
                        className="text-xs font-bold w-6 text-center text-gray-900 dark:text-white"
                      >
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQty(item.product.id, 1)}
                        disabled={processing}
                        aria-label={`Aumentar cantidad de ${item.product.name}`}
                        className="h-6 w-6 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        +
                      </button>
                    </div>

                    {/* Subtotal ítem */}
                    <div className="text-xs font-mono font-bold text-gray-900 dark:text-white w-16 text-right">
                      {appliedPromo && (appliedPromo.tipo === "2x1" || appliedPromo.tipo === "3x2") &&
                       itemMatchesPromo(item, appliedPromo) &&
                       freeUnits(item.quantity, appliedPromo.tipo) > 0 ? (
                        <span className="flex flex-col items-end">
                          <span className="line-through text-gray-400 text-[9px] font-normal">
                            S/{((item.product.costPrice ?? item.product.price) * item.quantity).toFixed(2)}
                          </span>
                          <span className="text-amber-600 dark:text-amber-400">
                            S/{((item.product.costPrice ?? item.product.price) * computeEffectiveQty(item.quantity, appliedPromo.tipo)).toFixed(2)}
                          </span>
                        </span>
                      ) : (
                        <>S/{((item.product.costPrice ?? item.product.price) * item.quantity).toFixed(2)}</>
                      )}
                    </div>

                    {/* Eliminar */}
                    <button
                      type="button"
                      onClick={() => removeItem(item.product.id)}
                      disabled={processing}
                      aria-label={`Eliminar ${item.product.name} de la canasta`}
                      className="h-5 w-5 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
            </>
            )}

            {/* Panel de totales y acciones */}
            {cart.length > 0 && (
              <div className="p-4 space-y-3 border-t border-gray-100 dark:border-card-border">
                {/* Descuento */}
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="poc-discount"
                    className="text-xs text-gray-500 dark:text-gray-400 shrink-0"
                  >
                    Descuento %
                  </label>
                  <input
                    id="poc-discount"
                    type="number"
                    min="0"
                    max="100"
                    value={discount}
                    onChange={(e) =>
                      setDiscount(
                        Math.min(100, Math.max(0, Number(e.target.value))),
                      )
                    }
                    className="flex-1 px-2 py-1 border border-gray-200 dark:border-card-border rounded-lg text-xs text-right bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6]"
                  />
                </div>

                {/* Totales */}
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-gray-500 dark:text-gray-400">
                    <span>Subtotal</span>
                    <span className="font-mono">S/{subtotal.toFixed(2)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-red-500 dark:text-red-400">
                      <span>Descuento {discount}%</span>
                      <span className="font-mono">
                        -S/{discountAmount.toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-gray-400">
                    <button
                      type="button"
                      onClick={() => setShowIGV((v) => !v)}
                      aria-pressed={showIGV}
                      className="text-[10px] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6] rounded"
                    >
                      IGV 18%
                    </button>
                    {showIGV && (
                      <span className="font-mono ml-auto">
                        +S/{igvAmount.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between font-bold text-base text-gray-900 dark:text-white pt-1 border-t border-gray-100 dark:border-card-border">
                    <span>TOTAL</span>
                    <span className="font-mono text-[#00B4A6]">
                      S/{displayTotal.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Método de pago */}
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  aria-label="Método de pago"
                  className="w-full px-3 py-1.5 border border-gray-200 dark:border-card-border rounded-xl text-xs bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6]"
                >
                  <option value="contado">Contado</option>
                  <option value="credito_7">Crédito 7 días</option>
                  <option value="credito_15">Crédito 15 días</option>
                  <option value="credito_30">Crédito 30 días</option>
                  <option value="transferencia">Transferencia</option>
                </select>

                {/* Fecha de entrega */}
                <div>
                  <label htmlFor="poc-delivery" className="sr-only">
                    Fecha de entrega
                  </label>
                  <input
                    id="poc-delivery"
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    min={todayStr}
                    className="w-full px-3 py-1.5 border border-gray-200 dark:border-card-border rounded-xl text-xs bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6]"
                  />
                </div>

                {/* Notas */}
                <div>
                  <label htmlFor="poc-notes" className="sr-only">
                    Notas al proveedor
                  </label>
                  <textarea
                    id="poc-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={processing}
                    rows={2}
                    placeholder="Notas al proveedor..."
                    className="w-full px-3 py-1.5 border border-gray-200 dark:border-card-border rounded-xl text-xs bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 resize-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6] disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                {lastOC && (
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 space-y-2">
                    <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">✓ OC Creada</p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-500">ID: {lastOC.id}</p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-500">{lastOC.items} productos — S/{lastOC.total.toFixed(2)}</p>
                    <button
                      type="button"
                      onClick={() => {
                        // Navegar al tab de Ordenes para ver la OC creada
                        const event = new CustomEvent("compras-navigate-tab", { detail: "ordenes-compra" });
                        window.dispatchEvent(event);
                      }}
                      className="w-full text-center text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-800/30 hover:bg-emerald-200 dark:hover:bg-emerald-800/50 rounded-lg py-1.5 transition-colors"
                    >
                      Ver en Órdenes →
                    </button>
                  </div>
                )}
                {/* Plantillas de pedido */}
                <div className="border-t border-gray-100 dark:border-card-border pt-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Plantillas</p>
                    {cart.length > 0 && (
                      <button type="button" onClick={saveAsTemplate} disabled={processing} className="text-[10px] text-[#00B4A6] hover:underline font-medium">
                        + Guardar actual
                      </button>
                    )}
                  </div>
                  {savedTemplates.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {savedTemplates.map((tpl, idx) => (
                        <div key={idx} className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg px-2 py-1">
                          <button type="button" onClick={() => loadTemplate(tpl)} className="text-[10px] font-medium text-gray-700 dark:text-gray-300 hover:text-[#00B4A6]">
                            {tpl.name}
                          </button>
                          <button type="button" onClick={() => deleteTemplate(idx)} className="text-[9px] text-gray-400 hover:text-red-500 ml-0.5">✕</button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-gray-400">Ninguna guardada</p>
                  )}
                </div>

                {/* Botones de acción */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={generateWhatsApp}
                    disabled={processing}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600"
                  >
                    <MessageCircle aria-hidden="true" className="h-3.5 w-3.5" />
                    WhatsApp
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowPrintPreview(true)}
                    disabled={processing}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 rounded-xl text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6]"
                  >
                    <FileDown aria-hidden="true" className="h-3.5 w-3.5" />
                    PDF
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={processing}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 rounded-xl text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6]"
                  >
                    <BookmarkIcon aria-hidden="true" className="h-3.5 w-3.5" />
                    Borrador
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowOrderCreator(true)}
                    disabled={processing}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  >
                    <ShoppingCart aria-hidden="true" className="h-3.5 w-3.5" />
                    Crear pedido
                  </button>

                  <button
                    type="button"
                    onClick={confirmarOC}
                    disabled={processing || cart.length === 0}
                    className="col-span-2 flex items-center justify-center gap-1.5 px-3 py-2 bg-[#00B4A6] hover:bg-[#009690] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6]"
                  >
                    {processing ? (
                      <Loader2
                        aria-hidden="true"
                        className="h-3.5 w-3.5 animate-spin"
                      />
                    ) : (
                      <ClipboardList aria-hidden="true" className="h-3.5 w-3.5" />
                    )}
                    {processing ? "Creando..." : "Orden Compra"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Estilos de impresión */}
      <style jsx global>{`
        @media print {
          body > *:not(.print-area) {
            display: none !important;
          }
          .print-area {
            display: block !important;
          }
        }
      `}</style>

      {/* Modal preview de impresión / PDF */}
      {/* Toast flotante */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium animate-in fade-in slide-in-from-bottom-4 duration-300">
          {toastMsg}
        </div>
      )}

      {showPrintPreview && (
        <OCPrintPreviewModal
          cart={cart}
          subtotal={subtotal}
          discount={discount}
          discountAmount={discountAmount}
          total={total}
          selectedSupplier={selectedSupplier}
          deliveryDate={deliveryDate}
          paymentMethod={paymentMethod}
          notes={notes}
          lastOCId={lastOC?.id}
          onClose={() => setShowPrintPreview(false)}
        />
      )}

      {showInvoiceScanner && (
        <InvoiceScannerModal
          open={showInvoiceScanner}
          onClose={() => setShowInvoiceScanner(false)}
          onConfirm={(data) => {
            // Fuzzy match items to products and add to cart
            for (const item of data.items) {
              const match = products.find(
                (p) =>
                  p.name.toLowerCase().includes(item.nombre.toLowerCase()) ||
                  item.nombre.toLowerCase().includes(p.name.toLowerCase()),
              );
              if (match) {
                addToCart(match, item.cantidad);
              }
            }
            // Try to auto-select supplier
            if (data.proveedor?.nombre) {
              const supplierMatch = suppliers.find((s) =>
                s.name.toLowerCase().includes(data.proveedor.nombre.toLowerCase()),
              );
              if (supplierMatch) setSelectedSupplier(supplierMatch);
            }
            setShowInvoiceScanner(false);
          }}
        />
      )}

      {showOrderCreator && (
        <PuntoCompraOrderCreator
          open={showOrderCreator}
          onClose={() => setShowOrderCreator(false)}
          cartItems={cart}
        />
      )}

      {lotSelectorProduct && (
        <PuntoCompraLotSelector
          product={lotSelectorProduct}
          open={!!lotSelectorProduct}
          onClose={() => setLotSelectorProduct(null)}
          onSelect={(units) => {
            addToCart(lotSelectorProduct, units);
            setLotSelectorProduct(null);
          }}
        />
      )}
    </div>
  );
}
