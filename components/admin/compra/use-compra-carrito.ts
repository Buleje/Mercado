"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalStorageDraft } from "@/hooks/use-local-storage-draft";
import type { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import type { PaymentMethod, PurchaseProduct as Product, PurchaseSupplier as Supplier } from "@/lib/types/purchases";
import type { TipoComprobante } from "@/lib/compras/estados-oc";
import { costoDe, historialConCompra, historialDesdeOrdenes, itemsSinCosto, type CompraItem, type HistorialCostos } from "./costo-compra";
import {
  computeEffectiveQty, esPromoDeUnidades, itemMatchesPromo, promoMeetsCondition, type ActivePromo,
} from "./promos";

const DRAFT_KEY = "poc-draft";
const PRICE_CACHE_KEY = "poc-price-history";

type Borrador = {
  cart: CompraItem[];
  selectedSupplier: Supplier | null;
  discount: number;
  paymentMethod: PaymentMethod;
  deliveryDate: string;
  notes: string;
  invoiceType?: TipoComprobante;
  invoiceNumber?: string;
};

type Opciones = { playDing: () => void; confirm: ReturnType<typeof useConfirm>["confirm"] };

/** La canasta de compra: ítems con su costo, proveedor, comprobante, promos y totales (preview). */
export function useCompraCarrito({ playDing, confirm }: Opciones) {
  const { save: saveDraft, load: loadDraft, clear: clearDraft, hasDraft } = useLocalStorageDraft<Borrador>(DRAFT_KEY);

  const [cart, setCart] = useState<CompraItem[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("contado");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [invoiceType, setInvoiceType] = useState<TipoComprobante>("ninguno");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [activePromos, setActivePromos] = useState<ActivePromo[]>([]);
  const [appliedPromo, setAppliedPromo] = useState<ActivePromo | null>(null);
  const [priceHistory, setPriceHistory] = useState<HistorialCostos>({});
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [lastOC, setLastOC] = useState<{ id: string; total: number; items: number } | null>(null);
  const [supplierHistory, setSupplierHistory] = useState<Array<{ id: string; total: number; date: string }>>([]);

  // ── Carga inicial: borrador, promos del día y último costo pagado ──────────
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      if (draft.cart?.length) setCart(draft.cart);
      if (draft.selectedSupplier) setSelectedSupplier(draft.selectedSupplier);
      if (typeof draft.discount === "number") setDiscount(draft.discount);
      if (draft.paymentMethod) setPaymentMethod(draft.paymentMethod);
      if (draft.deliveryDate) setDeliveryDate(draft.deliveryDate);
      if (draft.notes) setNotes(draft.notes);
      if (draft.invoiceType) setInvoiceType(draft.invoiceType);
      if (draft.invoiceNumber) setInvoiceNumber(draft.invoiceNumber);
    }

    fetch("/api/discount-rules").then((r) => (r.ok ? r.json() : [])).then((rules: ActivePromo[]) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      setActivePromos((Array.isArray(rules) ? rules : []).filter((r) => {
        const start = new Date(r.fechaInicio);
        const end = new Date(r.fechaFin);
        end.setHours(23, 59, 59, 999);
        return r.activa && today >= start && today <= end;
      }));
    }).catch((err) => console.warn("[PuntoCompraView] promos fetch failed:", err));

    // Último costo pagado por producto (cache 1 h en el navegador).
    try {
      const cached = localStorage.getItem(PRICE_CACHE_KEY);
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < 3600000) { setPriceHistory(data); return; }
      }
    } catch { /* cache roto: se pide de nuevo */ }
    fetch("/api/purchases")
      .then((r) => (r.ok ? r.json() : { purchases: [] }))
      .then((json) => {
        const history = historialDesdeOrdenes(Array.isArray(json) ? json : (json?.purchases ?? []));
        setPriceHistory(history);
        try { localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify({ data: history, ts: Date.now() })); } catch { /* quota */ }
      })
      .catch((err) => console.warn("[PuntoCompraView] price history fetch failed:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Últimas OC del proveedor elegido
  useEffect(() => {
    if (!selectedSupplier) { setSupplierHistory([]); return; }
    fetch("/api/purchases")
      .then((r) => (r.ok ? r.json() : { purchases: [] }))
      .then((json) => {
        const all = Array.isArray(json) ? json : (json?.purchases ?? json?.data ?? []);
        setSupplierHistory(all
          .filter((p: Record<string, unknown>) => p.supplierId === selectedSupplier.id || p.supplierName === selectedSupplier.name)
          .slice(0, 3)
          .map((p: Record<string, unknown>) => ({ id: String(p.id ?? ""), total: Number(p.total ?? 0), date: String(p.createdAt ?? p.date ?? "") })));
      })
      .catch(() => setSupplierHistory([]));
  }, [selectedSupplier]);

  const borrador = useMemo<Borrador>(
    () => ({ cart, selectedSupplier, discount, paymentMethod, deliveryDate, notes, invoiceType, invoiceNumber }),
    [cart, selectedSupplier, discount, paymentMethod, deliveryDate, notes, invoiceType, invoiceNumber],
  );

  // Online/offline + guardar borrador al cerrar pestaña
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => { setIsOnline(false); if (borrador.cart.length > 0) saveDraft(borrador); };
    const handleBeforeUnload = () => { if (borrador.cart.length > 0) saveDraft(borrador); };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [borrador, saveDraft]);

  // Autosave ante cualquier cambio (cambiar de pestaña admin desmonta la vista
  // sin `beforeunload`). Solo con ítems: no pisa con vacío.
  useEffect(() => {
    if (borrador.cart.length === 0) return;
    saveDraft(borrador);
  }, [borrador, saveDraft]);

  // ── Lógica del carrito ───────────────────────────────────────────────────────
  /** `unitCost` viene de la factura escaneada: pisa el sugerido. */
  const addToCart = useCallback((product: Product, qty: number, unitCost?: number) => {
    playDing();
    setLastOC(null);
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) => i.product.id === product.id
          ? { ...i, quantity: i.quantity + qty, ...(unitCost !== undefined && { unitCost }) }
          : i);
      }
      return [...prev, { product, quantity: qty, ...(unitCost !== undefined && { unitCost }) }];
    });
  }, [playDing]);

  const updateQty = useCallback((productId: number, delta: number) => {
    setCart((prev) => prev.map((i) => (i.product.id === productId ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i)));
  }, []);

  const setCosto = useCallback((productId: number, unitCost: number | null) => {
    setCart((prev) => prev.map((i) => (i.product.id === productId ? { ...i, unitCost } : i)));
  }, []);

  const removeItem = useCallback((productId: number) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  }, []);

  const clearCart = useCallback(async () => {
    if (cart.length === 0) return;
    if (!(await confirm({
      title: "¿Limpiar toda la canasta?",
      description: "Se perderán los items agregados.",
      intent: "warning",
      confirmLabel: "Sí, limpiar",
    }))) return;
    setCart([]);
  }, [cart.length, confirm]);

  // ── Totales (preview: el servidor recalcula al crear la orden) ───────────────
  const costo = useCallback((i: CompraItem) => costoDe(i, priceHistory), [priceHistory]);
  const sinCosto = useMemo(() => itemsSinCosto(cart, priceHistory), [cart, priceHistory]);
  const baseSubtotal = useMemo(() => cart.reduce((s, i) => s + (costo(i) ?? 0) * i.quantity, 0), [cart, costo]);
  const promoQty = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);
  const promoActive = useMemo(
    () => appliedPromo != null && promoMeetsCondition(appliedPromo, baseSubtotal, promoQty),
    [appliedPromo, baseSubtotal, promoQty],
  );
  const subtotal = useMemo(() => {
    const promoUnidades = promoActive && esPromoDeUnidades(appliedPromo) ? appliedPromo : null;
    return cart.reduce((s, i) => {
      const qtyPaid = promoUnidades && itemMatchesPromo(i, promoUnidades) ? computeEffectiveQty(i.quantity, promoUnidades.tipo) : i.quantity;
      return s + (costo(i) ?? 0) * qtyPaid;
    }, 0);
  }, [cart, appliedPromo, promoActive, costo]);
  const discountAmount = useMemo(() => {
    if (appliedPromo && !promoActive) return 0;
    if (appliedPromo?.tipo === "monto_fijo") return Math.min(appliedPromo.valor, subtotal);
    if (appliedPromo?.tipo === "combo") return Math.max(0, subtotal - appliedPromo.valor);
    return subtotal * (discount / 100);
  }, [subtotal, discount, appliedPromo, promoActive]);
  const total = useMemo(() => Math.max(0, subtotal - discountAmount), [subtotal, discountAmount]);
  // El IGV va CONTENIDO en el costo (ADR-377, `igvIncluded` true): se desglosa, no se suma.
  const igvAmount = useMemo(() => total - total / 1.18, [total]);
  const cartTotalQty = promoQty;
  const cartMap = useMemo(() => new Map(cart.map((i) => [i.product.id, i.quantity])), [cart]);

  /** Tras crear la orden: canasta y comprobante en blanco; el costo sugerido pasa a ser el que enviaste. */
  const vaciarTrasOrden = useCallback((enviados: ReadonlyArray<{ productId: number; unitCost: number }> = []) => {
    setPriceHistory((prev) => historialConCompra(prev, enviados));
    setCart([]);
    setNotes("");
    setDiscount(0);
    setInvoiceNumber("");
    setInvoiceType("ninguno");
    try { localStorage.removeItem(PRICE_CACHE_KEY); } catch { /* quota */ }
    clearDraft();
  }, [clearDraft]);

  return {
    cart, setCart, selectedSupplier, setSelectedSupplier, discount, setDiscount, paymentMethod, setPaymentMethod,
    deliveryDate, setDeliveryDate, notes, setNotes, invoiceType, setInvoiceType, invoiceNumber, setInvoiceNumber,
    activePromos, appliedPromo, setAppliedPromo, priceHistory, isOnline, lastOC, setLastOC, supplierHistory,
    hasDraft, borrador, saveDraft, vaciarTrasOrden,
    addToCart, updateQty, setCosto, removeItem, clearCart, costo, sinCosto,
    baseSubtotal, promoQty, promoActive, subtotal, discountAmount, total, igvAmount, cartTotalQty, cartMap,
  };
}

export type CompraCarrito = ReturnType<typeof useCompraCarrito>;
