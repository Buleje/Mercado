"use client";

import { SectionTitle } from "@buleje/design-system";
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
  Plus,
  X as XIcon,
  Check as CheckIcon,
} from "@buleje/design-system/icons";
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
import { csrfHeaders } from "@/lib/csrf-client";

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
  // ── Modal "Nuevo proveedor" inline ──
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newSupplier, setNewSupplier] = useState<{ name: string; ruc: string; phone: string; email: string; address: string; razonSocial: string }>({ name: "", ruc: "", phone: "", email: "", address: "", razonSocial: "" });
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [rucLookup, setRucLookup] = useState<{ status: "idle" | "loading" | "ok" | "notfound" | "error"; msg?: string }>({ status: "idle" });

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

  // ── Fetch products (stale-while-revalidate via localStorage) ─────────────────
  const fetchProducts = useCallback(async () => {
    const KEY = "poc-products-cache";
    const TTL = 5 * 60 * 1000; // 5 min
    // 1. Hidratar instantaneo desde cache si existe
    try {
      const cached = localStorage.getItem(KEY);
      if (cached) {
        const { data, ts } = JSON.parse(cached) as { data: Product[]; ts: number };
        if (Array.isArray(data) && data.length > 0) {
          setProducts(data);
          setLoading(false);
          if (Date.now() - ts < TTL) return; // cache fresco, no revalidar
        }
      }
    } catch { /* ignore */ }
    // 2. Refrescar de red
    try {
      const res = await fetch("/api/products");
      if (!res.ok) return;
      const json = await res.json();
      const raw: Product[] = Array.isArray(json) ? json : json.products ?? [];
      const filtered = raw.filter((p) => p.active !== false);
      setProducts(filtered);
      try { localStorage.setItem(KEY, JSON.stringify({ data: filtered, ts: Date.now() })); } catch { /* quota */ }
    } catch {
      // Silencioso — keep cache
    }
  }, []);

  // ── Fetch suppliers (stale-while-revalidate, TTL 30min) ──────────────────────
  const fetchSuppliers = useCallback(async () => {
    const KEY = "poc-suppliers-cache";
    const TTL = 30 * 60 * 1000;
    try {
      const cached = localStorage.getItem(KEY);
      if (cached) {
        const { data, ts } = JSON.parse(cached) as { data: Supplier[]; ts: number };
        if (Array.isArray(data) && data.length > 0) {
          setSuppliers(data);
          if (Date.now() - ts < TTL) return;
        }
      }
    } catch { /* ignore */ }
    try {
      const res = await fetch("/api/suppliers");
      if (!res.ok) return;
      const json = await res.json();
      const raw: Supplier[] = json.suppliers ?? (Array.isArray(json) ? json : []);
      setSuppliers(raw);
      try { localStorage.setItem(KEY, JSON.stringify({ data: raw, ts: Date.now() })); } catch { /* quota */ }
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
        headers: csrfHeaders({ "Content-Type": "application/json" }),
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

  // ── Lookup RUC en SUNAT (auto-completar datos) ───────────────────────────────
  const handleRucLookup = useCallback(async (ruc: string) => {
    if (!/^[12]\d{10}$/.test(ruc)) {
      setRucLookup({ status: "idle" });
      return;
    }
    setRucLookup({ status: "loading" });
    try {
      const res = await fetch(`/api/sunat/lookup-ruc?ruc=${encodeURIComponent(ruc)}`, {
        credentials: "include",
      });
      if (res.status === 404) {
        setRucLookup({ status: "notfound", msg: "RUC no existe en SUNAT" });
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRucLookup({ status: "error", msg: data?.error ?? "No se pudo consultar SUNAT" });
        return;
      }
      const data = await res.json() as {
        razonSocial?: string;
        nombreComercial?: string;
        direccion?: string;
        departamento?: string;
        provincia?: string;
        distrito?: string;
        estado?: string;
      };
      const fullAddress = [data.direccion, data.distrito, data.provincia, data.departamento]
        .filter(Boolean).join(", ").replace(/,\s+,/g, ",");
      setNewSupplier((s) => ({
        ...s,
        // Si el usuario aún no escribió un nombre, usar razón social
        name: s.name.trim() ? s.name : (data.nombreComercial || data.razonSocial || s.name),
        razonSocial: data.razonSocial ?? "",
        address: fullAddress,
      }));
      setRucLookup({
        status: "ok",
        msg: data.estado === "ACTIVO" || !data.estado ? "Datos cargados de SUNAT" : `Cuidado: estado ${data.estado}`,
      });
    } catch {
      setRucLookup({ status: "error", msg: "Error de red al consultar SUNAT" });
    }
  }, []);

  // ── Crear proveedor inline ───────────────────────────────────────────────────
  const handleCreateSupplier = async () => {
    const name = newSupplier.name.trim();
    if (!name) {
      setToastMsg("Falta el nombre del proveedor");
      return;
    }
    setCreatingSupplier(true);
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          name,
          ruc: newSupplier.ruc.trim() || undefined,
          phone: newSupplier.phone.trim() || undefined,
          email: newSupplier.email.trim() || undefined,
          address: newSupplier.address.trim() || undefined,
          razonSocial: newSupplier.razonSocial.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ? "Datos invalidos" : `Error ${res.status}`);
      }
      const created: Supplier = await res.json();
      setSuppliers((prev) => {
        const next = [...prev, created];
        // Actualizar cache localStorage para que persista entre sesiones
        try { localStorage.setItem("poc-suppliers-cache", JSON.stringify({ data: next, ts: Date.now() })); } catch { /* quota */ }
        return next;
      });
      setSelectedSupplier(created);
      setShowNewSupplier(false);
      setNewSupplier({ name: "", ruc: "", phone: "", email: "", address: "", razonSocial: "" });
      setRucLookup({ status: "idle" });
      setToastMsg(`Proveedor "${created.name}" creado y seleccionado`);
    } catch (e) {
      setToastMsg(e instanceof Error ? e.message : "No se pudo crear el proveedor");
    } finally {
      setCreatingSupplier(false);
    }
  };

  // calcSuggestedQty viene de @/lib/types/purchases como calculateSuggestedQty

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="print-area">
      {/* Header minimalista — sin subtítulo, el tab indica la función */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="min-w-0">
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] leading-tight">
            Punto de Compra
          </SectionTitle>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-[var(--text-tertiary)] tabular-nums">
            {products.length} productos
          </span>
          {needsReorderCount > 0 && (
            <button
              type="button"
              onClick={() => { setSoloReponer(true); setPage(1); }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--data-error)] bg-[var(--data-error-50)] hover:bg-[var(--data-error-100)] px-2 py-1 rounded-full transition-colors"
              title="Ver solo los productos que necesitan reponerse"
            >
              {needsReorderCount} a reponer
            </button>
          )}
        </div>
      </div>

      {/* Aviso reposición destacado */}
      {needsReorderCount > 5 && !soloReponer && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-[var(--data-warning)]/30 bg-[var(--data-warning-50)] px-3 py-2 text-xs text-[var(--data-warning)]">
          <span className="shrink-0">●</span>
          <p>
            Tenés <strong>{needsReorderCount}</strong> productos por debajo del stock mínimo.{" "}
            <button type="button" onClick={() => { setSoloReponer(true); setPage(1); }} className="underline font-semibold">
              Ver todos
            </button>
          </p>
        </div>
      )}

      {/* Barra de controles */}
      <div className="flex flex-wrap gap-2 mb-3">
        {/* Selector proveedor + botón crear nuevo inline */}
        <div className="flex items-center gap-1">
          <select
            value={selectedSupplier?.id ?? ""}
            onChange={(e) => {
              const found = suppliers.find((s) => s.id === e.target.value);
              setSelectedSupplier(found ?? null);
            }}
            disabled={processing}
            aria-label="Seleccionar proveedor"
            className="px-3 py-1.5 border border-[var(--rule-base)] rounded-lg text-sm bg-white text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed min-w-[160px]"
          >
            <option value="">Todos los proveedores</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowNewSupplier(true)}
            disabled={processing}
            title="Crear nuevo proveedor"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--rule-base)] bg-white text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo
          </button>
        </div>

        {/* Toggle solo reponer */}
        <button
          type="button"
          onClick={() => setSoloReponer((v) => !v)}
          aria-pressed={soloReponer}
          className={cn(
            "px-3 py-1.5 rounded-xl text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
            soloReponer
              ? "bg-[var(--data-error)] text-white"
              : "bg-gray-100 text-[var(--text-secondary)]",
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
          className="flex-1 min-w-36 px-3 py-1.5 border border-[var(--rule-base)] rounded-lg text-sm bg-white text-[var(--text-primary)] placeholder-gray-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />

        {/* Botón escáner de código de barras */}
        <button
          type="button"
          onClick={() => setShowScanner(!showScanner)}
          className={cn("flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors", showScanner ? "bg-primary text-white" : "bg-gray-100 text-[var(--text-secondary)]")}
          title="Buscar por código de barras (F2)"
        >
          <ScanLine className="h-3.5 w-3.5 shrink-0" /> Código
        </button>

        {/* Botón escáner de factura OCR */}
        <button
          type="button"
          onClick={() => setShowInvoiceScanner(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] hover:text-[var(--data-success)] transition-colors"
          title="Escanear factura con cámara"
        >
          <Camera className="h-3.5 w-3.5 shrink-0" /> Factura
        </button>

        {/* Toggle vista */}
        <button
          type="button"
          onClick={() => setViewMode((v) => (v === "grid" ? "list" : "grid"))}
          aria-label={viewMode === "grid" ? "Cambiar a vista lista" : "Cambiar a vista cuadrícula"}
          className="p-1.5 rounded-lg border border-[var(--rule-base)] bg-white text-[var(--text-secondary)] hover:bg-gray-50 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
          className="px-3 py-1.5 border border-[var(--rule-base)] rounded-xl text-sm bg-white text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
                "shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                category === cat
                  ? "bg-primary text-white"
                  : "bg-gray-100 text-[var(--text-secondary)] hover:bg-gray-200",
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
            className="flex-1 px-3 py-2 border border-primary rounded-lg text-sm bg-white text-[var(--text-primary)] focus:ring-2 focus:ring-primary"
          />
          <button
            type="button"
            onClick={() => { setShowScanner(false); setBarcodeInput(""); }}
            className="px-3 py-2 bg-gray-200 rounded-xl text-xs"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Banner offline */}
      {!isOnline && (
        <div className="bg-[var(--data-error-50)] border border-[var(--data-error)] rounded-xl px-3 py-2 text-xs text-[var(--data-error)] flex items-center gap-2 mb-3">
          <span className="h-2 w-2 rounded-full bg-[var(--data-error)] animate-pulse shrink-0" />
          Sin conexion — tu canasta se guardo automaticamente. Se enviara cuando vuelva el internet.
        </div>
      )}

      {/* Banner de promociones activas */}
      {activePromos.length > 0 && (
        <div className="mb-3 p-3 bg-[var(--data-warning-50)] border border-[var(--data-warning)] rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Tag className="h-3.5 w-3.5 text-[var(--data-warning)] shrink-0" />
            <span className="text-xs font-semibold text-[var(--data-warning)]">
              {activePromos.length} promo{activePromos.length > 1 ? "s" : ""} activa{activePromos.length > 1 ? "s" : ""} hoy
            </span>
            {appliedPromo && (
              <button
                onClick={() => { setAppliedPromo(null); setDiscount(0); }}
                className="ml-auto text-xs text-[var(--data-warning)] hover:text-[var(--data-warning)] underline"
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
                  "text-xs px-2 py-1 rounded-lg font-medium border transition-all",
                  appliedPromo?.id === promo.id
                    ? "bg-[var(--data-warning)] text-white border-[var(--data-warning)]"
                    : "bg-white text-[var(--data-warning)] border-[var(--data-warning)] hover:bg-[var(--data-warning-100)]",
                )}
              >
                {promo.tipo === "porcentaje" ? `${promo.valor}% OFF` :
                 promo.tipo === "monto_fijo" ? `S/ ${promo.valor} OFF` :
                 promo.tipo === "2x1" ? "2×1" :
                 promo.tipo === "3x2" ? "3×2" :
                 promo.tipo === "combo" ? `Combo S/ ${promo.valor}` : promo.nombre}
                <span className="ml-1 opacity-70 truncate max-w-[80px] inline-block align-bottom">
                  {promo.nombre}
                </span>
              </button>
            ))}
          </div>
          {appliedPromo && (
            <p className="text-xs text-[var(--data-warning)] mt-1.5">
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
                  className="h-40 rounded-xl bg-gray-100 animate-pulse"
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
                      "rounded-xl transition-all",
                      inCartQty > 0 && "ring-2 ring-primary ring-offset-1",
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
            <div className="border border-[var(--rule-base)] rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3 font-medium text-[var(--text-secondary)]">
                      Producto
                    </th>
                    <th className="text-right p-3 font-medium text-[var(--text-secondary)]">
                      Costo
                    </th>
                    <th className="text-right p-3 font-medium text-[var(--text-secondary)]">
                      Stock
                    </th>
                    <th className="text-right p-3 font-medium text-[var(--text-secondary)]">
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
                        className="border-t border-[var(--rule-soft)] hover:bg-gray-50"
                      >
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {needs && (
                              <span className="text-xs font-bold px-1 py-0.5 rounded bg-[var(--data-error-100)] text-[var(--data-error)]">
                                REPONER
                              </span>
                            )}
                            <span className="font-medium text-[var(--text-primary)]">
                              {p.name}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-right font-mono text-[var(--text-primary)]">
                          <span title={`Costo: S/${(p.costPrice || p.price).toFixed(2)} | Venta: S/${p.price.toFixed(2)} | Margen: ${p.costPrice ? ((1 - p.costPrice / p.price) * 100).toFixed(0) : "—"}%`}>
                            S/{(p.costPrice ?? p.price).toFixed(2)}
                          </span>
                        </td>
                        <td className="p-3 text-right text-[var(--text-secondary)]">
                          {p.stock ?? "—"} {p.unit}
                        </td>
                        <td className="p-3 text-right text-[var(--data-success)] font-medium">
                          {sug}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => addToCart(p, sug)}
                            aria-label={`Agregar ${p.name}`}
                            className="px-3 py-1 bg-primary text-white rounded-lg text-xs hover:bg-primary-dark transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
            <div className="text-center py-12 text-[var(--text-tertiary)]">
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
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-[var(--text-secondary)] disabled:opacity-40 hover:bg-gray-200 transition-colors"
              >
                ← Anterior
              </button>
              <span className="text-xs text-[var(--text-secondary)]">
                Página {page} de {totalPages} · {filtered.length} productos
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-[var(--text-secondary)] disabled:opacity-40 hover:bg-gray-200 transition-colors"
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
          className="fixed bottom-20 right-4 lg:hidden z-40 h-12 w-12 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary-dark transition-colors"
          aria-label="Escanear código de barras"
        >
          <ScanLine className="h-5 w-5" />
        </button>

        {/* FAB carrito mobile */}
        {cart.length > 0 && (
          <button
            type="button"
            onClick={() => document.getElementById("poc-cart")?.scrollIntoView({ behavior: "smooth" })}
            className="fixed bottom-20 left-4 lg:hidden z-40 h-12 px-4 rounded-full bg-primary text-white flex items-center gap-2 hover:bg-primary-dark transition-colors"
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
          <div className="sticky top-4 bg-white border border-[var(--rule-base)] rounded-xl overflow-hidden ">
            {/* Header carrito */}
            <div className="p-4 border-b border-[var(--rule-soft)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBasket
                  aria-hidden="true"
                  className="h-4 w-4 text-primary"
                />
                <span className="font-semibold text-sm text-[var(--text-primary)]">
                  Canasta
                </span>
                {hasDraft && cart.length === 0 && (
                  <span className="text-xs bg-[var(--data-warning-100)] text-[var(--data-warning)] px-1.5 py-0.5 rounded-full font-medium">
                    Borrador
                  </span>
                )}
                {cart.length > 0 && (
                  <span
                    aria-label={`${cartTotalQty} unidades en canasta`}
                    className="h-5 w-5 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold"
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
                  className="text-xs text-[var(--text-tertiary)] hover:text-[var(--data-error)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Limpiar
                </button>
              )}
            </div>

            {/* Tabs: Carrito | Frecuentes | Paquetes */}
            <div className="flex border-b border-[var(--rule-soft)]" role="tablist" aria-label="Secciones del carrito">
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
                    "flex-1 py-2 text-xs font-semibold transition-colors",
                    cartTab === tab.key
                      ? "text-primary border-b-2 border-primary"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
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
              <div className="px-3 pt-2 pb-1 border-b border-[var(--rule-soft)]">
                <p className="text-xs font-semibold text-[var(--text-tertiary)] mb-1.5">Últimas OC a {selectedSupplier.name}</p>
                <div className="space-y-1">
                  {supplierHistory.map(h => (
                    <div key={h.id} className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text-secondary)] truncate">{h.id.slice(0, 15)}...</span>
                      <span className="font-mono font-medium text-[var(--text-primary)]">S/{h.total.toFixed(2)}</span>
                      <span className="text-[var(--text-tertiary)]">{h.date ? new Date(h.date).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }) : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Items del carrito */}
            <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="text-center py-8 text-[var(--text-tertiary)] text-sm">
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
                    className="flex items-center gap-2 p-2 bg-gray-50 rounded-xl animate-in fade-in slide-in-from-left-2 duration-[var(--dur-base)]"
                  >
                    {/* Miniatura */}
                    <div
                      aria-hidden="true"
                      className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-sm overflow-hidden relative"
                    >
                      <span className="absolute inset-0 flex items-center justify-center">
                        {(item.product.name || "?")[0].toUpperCase()}
                      </span>
                      {item.product.image ? (
                        <Image
                          src={item.product.image}
                          alt={item.product.name}
                          fill
                          className="object-cover rounded-lg z-10"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          unoptimized
                        />
                      ) : null}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[var(--text-primary)] truncate">
                        {item.product.name}
                      </p>
                      <p className="text-xs text-[var(--text-tertiary)] flex items-center gap-1 flex-wrap">
                        S/
                        {(
                          item.product.costPrice ?? item.product.price
                        ).toFixed(2)}{" "}
                        / {item.product.unit}
                        {priceHistory[item.product.id] !== undefined && priceHistory[item.product.id] !== (item.product.costPrice ?? item.product.price) && (
                          <span className={cn(
                            "text-xs font-bold px-1 rounded",
                            (item.product.costPrice ?? item.product.price) > priceHistory[item.product.id]
                              ? "bg-[var(--data-error-100)] text-[var(--data-error)]"
                              : "bg-[var(--accent-soft)] text-[var(--data-success)]"
                          )}>
                            {(item.product.costPrice ?? item.product.price) > priceHistory[item.product.id] ? "↑" : "↓"}
                            {Math.abs(((item.product.costPrice ?? item.product.price) - priceHistory[item.product.id]) / priceHistory[item.product.id] * 100).toFixed(0)}%
                          </span>
                        )}
                        {appliedPromo && (appliedPromo.tipo === "2x1" || appliedPromo.tipo === "3x2") &&
                          itemMatchesPromo(item, appliedPromo) &&
                          freeUnits(item.quantity, appliedPromo.tipo) > 0 && (
                          <span className="text-xs bg-[var(--data-warning-100)] text-[var(--data-warning)] px-1 rounded font-bold uppercase tracking-wider">
                            +{freeUnits(item.quantity, appliedPromo.tipo)} gratis
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
                        className="h-6 w-6 rounded-lg bg-gray-200 flex items-center justify-center text-xs hover:bg-gray-300 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        -
                      </button>
                      <span
                        aria-live="polite"
                        className="text-xs font-bold w-6 text-center text-[var(--text-primary)]"
                      >
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQty(item.product.id, 1)}
                        disabled={processing}
                        aria-label={`Aumentar cantidad de ${item.product.name}`}
                        className="h-6 w-6 rounded-lg bg-gray-200 flex items-center justify-center text-xs hover:bg-gray-300 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        +
                      </button>
                    </div>

                    {/* Subtotal ítem */}
                    <div className="text-xs font-mono font-bold text-[var(--text-primary)] w-16 text-right">
                      {appliedPromo && (appliedPromo.tipo === "2x1" || appliedPromo.tipo === "3x2") &&
                       itemMatchesPromo(item, appliedPromo) &&
                       freeUnits(item.quantity, appliedPromo.tipo) > 0 ? (
                        <span className="flex flex-col items-end">
                          <span className="line-through text-[var(--text-tertiary)] text-xs font-normal">
                            S/{((item.product.costPrice ?? item.product.price) * item.quantity).toFixed(2)}
                          </span>
                          <span className="text-[var(--data-warning)]">
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
                      className="h-5 w-5 rounded-full flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--data-error)] hover:bg-[var(--data-error-50)] transition-colors text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed"
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
              <div className="p-4 space-y-3 border-t border-[var(--rule-soft)]">
                {/* Descuento */}
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="poc-discount"
                    className="text-xs text-[var(--text-secondary)] shrink-0"
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
                    className="flex-1 px-2 py-1 border border-[var(--rule-base)] rounded-lg text-sm text-right bg-white text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  />
                </div>

                {/* Totales */}
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-[var(--text-secondary)]">
                    <span>Subtotal</span>
                    <span className="font-mono">S/{subtotal.toFixed(2)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-[var(--data-error)]">
                      <span>Descuento {discount}%</span>
                      <span className="font-mono">
                        -S/{discountAmount.toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-[var(--text-tertiary)]">
                    <button
                      type="button"
                      onClick={() => setShowIGV((v) => !v)}
                      aria-pressed={showIGV}
                      className="text-xs underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary rounded"
                    >
                      IGV 18%
                    </button>
                    {showIGV && (
                      <span className="font-mono ml-auto">
                        +S/{igvAmount.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between font-bold text-base text-[var(--text-primary)] pt-1 border-t border-[var(--rule-soft)]">
                    <span>TOTAL</span>
                    <span className="font-mono text-primary">
                      S/{displayTotal.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Método de pago */}
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  aria-label="Método de pago"
                  className="w-full px-3 py-1.5 border border-[var(--rule-base)] rounded-lg text-sm bg-white text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
                    className="w-full px-3 py-1.5 border border-[var(--rule-base)] rounded-xl text-sm bg-white text-[var(--text-secondary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
                    className="w-full px-3 py-1.5 border border-[var(--rule-base)] rounded-lg text-sm bg-white text-[var(--text-primary)] placeholder-gray-400 resize-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                {lastOC && (
                  <div className="bg-[var(--accent-soft)] rounded-xl p-3 space-y-2">
                    <p className="text-xs font-bold text-[var(--data-success)]">✓ OC Creada</p>
                    <p className="text-xs text-[var(--data-success)]">ID: {lastOC.id}</p>
                    <p className="text-xs text-[var(--data-success)]">{lastOC.items} productos — S/{lastOC.total.toFixed(2)}</p>
                    <button
                      type="button"
                      onClick={() => {
                        // Navegar al tab de Ordenes para ver la OC creada
                        const event = new CustomEvent("compras-navigate-tab", { detail: "ordenes-compra" });
                        window.dispatchEvent(event);
                      }}
                      className="w-full text-center text-xs font-semibold text-[var(--data-success)] bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] rounded-lg py-1.5 transition-colors"
                    >
                      Ver en Órdenes →
                    </button>
                  </div>
                )}
                {/* Plantillas de pedido */}
                <div className="border-t border-[var(--rule-soft)] pt-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-[var(--text-tertiary)]">Plantillas</p>
                    {cart.length > 0 && (
                      <button type="button" onClick={saveAsTemplate} disabled={processing} className="text-xs text-primary hover:underline font-medium">
                        + Guardar actual
                      </button>
                    )}
                  </div>
                  {savedTemplates.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {savedTemplates.map((tpl, idx) => (
                        <div key={idx} className="flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-1">
                          <button type="button" onClick={() => loadTemplate(tpl)} className="text-xs font-medium text-[var(--text-primary)] hover:text-primary">
                            {tpl.name}
                          </button>
                          <button type="button" onClick={() => deleteTemplate(idx)} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--data-error)] ml-0.5">✕</button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--text-tertiary)]">Ninguna guardada</p>
                  )}
                </div>

                {/* Botones de acción */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={generateWhatsApp}
                    disabled={processing}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--data-success)]"
                  >
                    <MessageCircle aria-hidden="true" className="h-3.5 w-3.5" />
                    WhatsApp
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowPrintPreview(true)}
                    disabled={processing}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-[var(--text-primary)] rounded-lg text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <FileDown aria-hidden="true" className="h-3.5 w-3.5" />
                    PDF
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={processing}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-[var(--text-primary)] rounded-lg text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <BookmarkIcon aria-hidden="true" className="h-3.5 w-3.5" />
                    Borrador
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowOrderCreator(true)}
                    disabled={processing}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--data-success)]"
                  >
                    <ShoppingCart aria-hidden="true" className="h-3.5 w-3.5" />
                    Crear pedido
                  </button>

                  <button
                    type="button"
                    onClick={confirmarOC}
                    disabled={processing || cart.length === 0}
                    className="col-span-2 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-4 py-2.5 rounded-lg text-sm font-medium animate-in fade-in slide-in-from-bottom-4 duration-[var(--dur-base)]">
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

      {/* Modal crear nuevo proveedor — mini-form vinculado a /api/suppliers */}
      {showNewSupplier && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={() => !creatingSupplier && setShowNewSupplier(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-extrabold text-[var(--text-primary)]">Nuevo proveedor</h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Se guarda en tu lista de proveedores y se selecciona en esta orden.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !creatingSupplier && setShowNewSupplier(false)}
                aria-label="Cerrar"
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <XIcon className="h-5 w-5 text-[var(--text-tertiary)]" />
              </button>
            </div>

            <div className="space-y-3">
              {/* RUC primero — auto-completa el resto */}
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] mb-1 block" htmlFor="ns-ruc">
                  RUC <span className="text-[var(--text-tertiary)] font-normal">(autocompleta razón social y dirección)</span>
                </label>
                <div className="relative">
                  <input
                    id="ns-ruc"
                    type="text"
                    value={newSupplier.ruc}
                    onChange={(e) => {
                      const next = e.target.value.replace(/\D/g, "").slice(0, 11);
                      setNewSupplier((s) => ({ ...s, ruc: next }));
                      if (next.length === 11) void handleRucLookup(next);
                      else setRucLookup({ status: "idle" });
                    }}
                    inputMode="numeric"
                    autoFocus
                    placeholder="20XXXXXXXXX"
                    className="w-full pl-3 pr-10 py-2.5 text-sm rounded-lg border border-[var(--rule-base)] bg-gray-50 text-[var(--text-primary)] outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all font-mono"
                  />
                  {rucLookup.status === "loading" && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-[var(--text-tertiary)]" />
                  )}
                  {rucLookup.status === "ok" && (
                    <CheckIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--data-success)]" />
                  )}
                </div>
                {rucLookup.status !== "idle" && rucLookup.msg && (
                  <p className={cn(
                    "text-xs mt-1 font-medium",
                    rucLookup.status === "ok"       ? "text-[var(--data-success)]" :
                    rucLookup.status === "notfound" ? "text-[var(--data-warning)]" :
                    rucLookup.status === "loading"  ? "text-[var(--text-tertiary)]" :
                    "text-[var(--data-error)]"
                  )}>
                    {rucLookup.status === "loading" ? "Consultando SUNAT..." : rucLookup.msg}
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] mb-1 block" htmlFor="ns-name">
                  Nombre comercial <span className="text-[var(--data-error)]">*</span>
                </label>
                <input
                  id="ns-name"
                  type="text"
                  value={newSupplier.name}
                  onChange={(e) => setNewSupplier((s) => ({ ...s, name: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && newSupplier.name.trim() && void handleCreateSupplier()}
                  placeholder="ej. Distribuidora ABC"
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-[var(--rule-base)] bg-gray-50 text-[var(--text-primary)] outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                />
              </div>

              {newSupplier.razonSocial && (
                <div>
                  <label className="text-xs font-bold text-[var(--text-secondary)] mb-1 block" htmlFor="ns-razon">
                    Razón social
                  </label>
                  <input
                    id="ns-razon"
                    type="text"
                    value={newSupplier.razonSocial}
                    onChange={(e) => setNewSupplier((s) => ({ ...s, razonSocial: e.target.value }))}
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-[var(--rule-base)] bg-[var(--accent-soft)]/30 text-[var(--text-primary)] outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                  />
                </div>
              )}

              {newSupplier.address && (
                <div>
                  <label className="text-xs font-bold text-[var(--text-secondary)] mb-1 block" htmlFor="ns-address">
                    Dirección
                  </label>
                  <input
                    id="ns-address"
                    type="text"
                    value={newSupplier.address}
                    onChange={(e) => setNewSupplier((s) => ({ ...s, address: e.target.value }))}
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-[var(--rule-base)] bg-[var(--accent-soft)]/30 text-[var(--text-primary)] outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[var(--text-secondary)] mb-1 block" htmlFor="ns-phone">
                    Teléfono
                  </label>
                  <input
                    id="ns-phone"
                    type="tel"
                    value={newSupplier.phone}
                    onChange={(e) => setNewSupplier((s) => ({ ...s, phone: e.target.value }))}
                    placeholder="+51 9XX XXX XXX"
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-[var(--rule-base)] bg-gray-50 text-[var(--text-primary)] outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--text-secondary)] mb-1 block" htmlFor="ns-email">
                    Email
                  </label>
                  <input
                    id="ns-email"
                    type="email"
                    value={newSupplier.email}
                    onChange={(e) => setNewSupplier((s) => ({ ...s, email: e.target.value }))}
                    placeholder="ventas@proveedor.com"
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-[var(--rule-base)] bg-gray-50 text-[var(--text-primary)] outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                  />
                </div>
              </div>
              <p className="text-xs text-[var(--text-tertiary)]">
                Después podés completar persona contacto y banco desde el tab <strong>Proveedores</strong>.
              </p>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => !creatingSupplier && setShowNewSupplier(false)}
                disabled={creatingSupplier}
                className="flex-1 py-2.5 rounded-lg border border-[var(--rule-base)] text-[var(--text-primary)] text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleCreateSupplier()}
                disabled={creatingSupplier || !newSupplier.name.trim()}
                className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
              >
                {creatingSupplier ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckIcon className="h-4 w-4" />
                )}
                {creatingSupplier ? "Creando..." : "Crear y seleccionar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
