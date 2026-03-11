"use client";

import { useState, useEffect, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { m, AnimatePresence } from "framer-motion";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import {
  X, ShoppingCart, User, MapPin, Home, Navigation,
  Loader2, CheckCircle2, ChevronRight, Phone,
  Banknote, Hash, Clock,
} from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import { useCustomer } from "@/contexts/customer-context";
import { useSettings } from "@/contexts/settings-context";
import { usePromotions } from "@/contexts/promotions-context";
import { cn } from "@/lib/utils";
import { trackPurchase } from "@/lib/analytics";
import type { DbOrderItem } from "@/lib/jsondb";
import type { SavedLocation, Customer } from "@/contexts/customer-context";

const LeafletMap = dynamic(() => import("./LeafletMap"), { ssr: false });

type Step = "cuenta" | "datos" | "pago" | "exito";
type PaymentMethod = "yape" | "efectivo";

const STEPS: { id: Step; label: string }[] = [
  { id: "cuenta", label: "Tu cuenta" },
  { id: "datos", label: "Tus datos" },
  { id: "pago", label: "Pago" },
];

function coordsFromLocation(loc: string) {
  const match = loc.match(/GPS:\s*([-\d.]+),\s*([-\d.]+)/);
  if (match) return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
  return { lat: -8.3791, lon: -74.5539 };
}

function StepBar({ current }: { current: Step }) {
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <div className="flex items-center gap-0 px-6 py-3 bg-gray-50 dark:bg-card border-b dark:border-card-border">
      {STEPS.map((s, i) => (
        <div key={s.id} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center">
            <div className={cn(
              "h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-all",
              i < idx ? "bg-primary text-white" :
              i === idx ? "bg-primary text-white ring-4 ring-primary/20" :
              "bg-gray-200 text-gray-400"
            )}>
              {i < idx ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </div>
            <span className={cn("text-[10px] font-semibold mt-1 whitespace-nowrap",
              i <= idx ? "text-primary" : "text-gray-400"
            )}>{s.label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={cn("h-0.5 flex-1 mx-2 mb-4 transition-colors",
              i < idx ? "bg-primary" : "bg-gray-200"
            )} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function CheckoutModal() {
  const { items, total, checkoutOpen, closeCheckout, clear, close: closeCart, markOrderPending } = useCart();
  const { customer, register, findByPhone, openOrderStatusModal } = useCustomer();
  const { yape, cashEnabled } = useSettings();
  const { getBestPromotion } = usePromotions();

  const [step, setStep] = useState<Step>("datos");
  const [submitting, setSubmitting] = useState(false);
  const [, setOrderId] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [dataError, setDataError] = useState("");

  // Customer data fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [loadingGeo, setLoadingGeo] = useState(false);
  const [geoError, setGeoError] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [mapCoords, setMapCoords] = useState({ lat: -8.3791, lon: -74.5539 });

  // Compute best promo based on cart total + phone (resolved from state or customer)
  const promo = getBestPromotion(total, phone || customer?.phone);
  const discount = promo ? total * (promo.discountPercent / 100) : 0;

  // Coupons
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponMsg, setCouponMsg] = useState("");
  const [couponApplied, setCouponApplied] = useState(false);
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  const finalTotal = total - discount - couponDiscount;

  const validateCoupon = async () => {
    if (!couponCode.trim()) return;
    setValidatingCoupon(true); setCouponMsg("");
    try {
      const res = await fetch("/api/coupons/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: couponCode.trim(), cartTotal: total }) });
      const data = await res.json();
      if (res.ok && data.discount !== undefined) {
        setCouponDiscount(data.discount);
        setCouponApplied(true);
        setCouponMsg(`¡Cupón aplicado! -S/${data.discount.toFixed(2)}`);
      } else {
        setCouponDiscount(0); setCouponApplied(false);
        setCouponMsg(data.error || "Cupón inválido");
      }
    } catch { setCouponMsg("Error al validar"); }
    setValidatingCoupon(false);
  };

  // Saved address selection
  const [selectedLocId, setSelectedLocId] = useState<string | null>(null);
  const [useNewAddress, setUseNewAddress] = useState(false);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [yapeOpNumber, setYapeOpNumber] = useState("");
  const [showPaymentHint, setShowPaymentHint] = useState(false);

  // Delivery time slot
  const [deliverySlot, setDeliverySlot] = useState<string>("lo-antes-posible");

  // Google Maps suggestions
  const [refSuggestions, setRefSuggestions] = useState<string[]>([]);
  const [showRefSuggestions, setShowRefSuggestions] = useState(false);

  // Phone account lookup
  const [phoneQuery, setPhoneQuery] = useState("");
  const [phoneSearching, setPhoneSearching] = useState(false);
  const [foundCustomer, setFoundCustomer] = useState<Customer | null>(null);
  const [phoneNotFound, setPhoneNotFound] = useState(false);
  const [editingCustomerData, setEditingCustomerData] = useState(false);
  const [skippedAccount, setSkippedAccount] = useState(false);

  useScrollLock(checkoutOpen);

  const effectiveCustomer = foundCustomer ?? customer;
  const locations: SavedLocation[] = effectiveCustomer?.locations?.length
    ? effectiveCustomer.locations
    : effectiveCustomer?.location
    ? [{ id: "default", location: effectiveCustomer.location, reference: effectiveCustomer.reference ?? "" }]
    : [];

  useEffect(() => {
    if (checkoutOpen) {
      setStep("cuenta");
      setPhoneQuery(customer?.phone ?? "");
      setFoundCustomer(null);
      setPhoneNotFound(false);
      setEditingCustomerData(false);
      setSkippedAccount(false);
      setSubmitting(false);
      setOrderId("");
      setNotes("");
      setYapeOpNumber("");
      setPaymentMethod(null);
      setShowPaymentHint(false);
      setUseNewAddress(false);
      setRefSuggestions([]);
      setShowRefSuggestions(false);
      setDeliverySlot("lo-antes-posible");

      // Auto-fill from customer
      setName(customer?.name ?? "");
      setPhone(customer?.phone ?? "");

      if (locations.length > 0) {
        const activeId = customer?.activeLocationId ?? locations[0]?.id ?? "default";
        setSelectedLocId(activeId);
        const activeLoc = locations.find((l) => l.id === activeId) ?? locations[0];
        setLocation(activeLoc.location);
        setReference(activeLoc.reference);
        if (activeLoc.location) setMapCoords(coordsFromLocation(activeLoc.location));
      } else {
        setSelectedLocId(null);
        setLocation(customer?.location ?? "");
        setReference(customer?.reference ?? "");
        if (customer?.location) setMapCoords(coordsFromLocation(customer.location));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutOpen]);

  const handleSelectLocation = (loc: SavedLocation) => {
    setSelectedLocId(loc.id);
    setUseNewAddress(false);
    setLocation(loc.location);
    setReference(loc.reference);
    setMapCoords(coordsFromLocation(loc.location));
  };

  const handleNewAddress = () => {
    setUseNewAddress(true);
    setSelectedLocId(null);
    setLocation("");
    setReference("");
  };

  const useGeo = () => {
    if (!navigator.geolocation) {
      setGeoError("Tu navegador no soporta geolocalización. Ingresa tu dirección manualmente.");
      return;
    }
    setLoadingGeo(true);
    setGeoError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setLocation(`Pucallpa — GPS: ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
        setMapCoords({ lat, lon });
        setLoadingGeo(false);
        // Reverse geocode for reference suggestion
        fetchReferenceSuggestion(lat, lon);
      },
      (err) => {
        setLoadingGeo(false);
        setGeoError(
          err.code === 1
            ? "Permiso denegado. Habilita el GPS en tu navegador e intenta de nuevo."
            : err.code === 3
              ? "GPS tardó demasiado. Ingresa tu dirección manualmente."
              : "No se pudo obtener tu ubicación. Ingresa tu dirección manualmente."
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const fetchReferenceSuggestion = async (lat: number, lon: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
        { headers: { "Accept-Language": "es" } }
      );
      if (res.ok) {
        const data = await res.json();
        const suggestions: string[] = [];
        if (data.display_name) {
          const parts = data.display_name.split(",").map((s: string) => s.trim());
          if (parts.length >= 2) suggestions.push(parts.slice(0, 3).join(", "));
        }
        if (data.address) {
          const a = data.address;
          if (a.road) suggestions.push(`Cerca de ${a.road}`);
          if (a.neighbourhood) suggestions.push(`Zona ${a.neighbourhood}`);
          if (a.suburb) suggestions.push(`Barrio ${a.suburb}`);
        }
        setRefSuggestions([...new Set(suggestions)]);
        if (suggestions.length > 0) setShowRefSuggestions(true);
      }
    } catch { /* ignore */ }
  };

  const handlePhoneSearch = async () => {
    const q = phoneQuery.trim();
    if (!q) return;
    setPhoneSearching(true);
    setPhoneNotFound(false);
    const found = await findByPhone(q);
    if (found) {
      setFoundCustomer(found);
      setName(found.name || "");
      setPhone(found.phone ?? q);
      const foundLocs: SavedLocation[] = found.locations?.length
        ? found.locations
        : found.location
        ? [{ id: "default", location: found.location, reference: found.reference ?? "" }]
        : [];
      if (foundLocs.length > 0) {
        const activeId = found.activeLocationId ?? foundLocs[0].id;
        setSelectedLocId(activeId);
        const activeLoc = foundLocs.find((l) => l.id === activeId) ?? foundLocs[0];
        setLocation(activeLoc.location ?? "");
        setReference(activeLoc.reference ?? "");
        setMapCoords(coordsFromLocation(activeLoc.location ?? ""));
      } else {
        setLocation(found.location ?? "");
        setReference(found.reference ?? "");
        if (found.location) setMapCoords(coordsFromLocation(found.location));
      }
      setStep("datos");
    } else {
      setPhoneNotFound(true);
    }
    setPhoneSearching(false);
  };

  const handleSkipAccount = () => {
    setFoundCustomer(null);
    setSkippedAccount(true);
    setEditingCustomerData(false);
    setStep("datos");
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError("");

    // Build effective values first so we can pre-flight validate
    const effectiveName = (name || effectiveCustomer?.name || "").trim();
    const effectivePhone = (phone || effectiveCustomer?.phone || "").replace(/\D/g, "").slice(-9);
    const effectiveLoc = (location || effectiveCustomer?.location || "").trim();
    const effectiveRef = (reference || effectiveCustomer?.reference || "").trim();
    const effectivePayment = paymentMethod ?? "efectivo";

    // Pre-flight guard — should rarely trigger thanks to UI validation
    if (!effectiveName) {
      setSubmitError("Por favor ingresa tu nombre completo.");
      setSubmitting(false);
      return;
    }
    if (!effectiveLoc) {
      setSubmitError("Por favor ingresa tu dirección de entrega.");
      setSubmitting(false);
      return;
    }

    // Defensive: strip data-URIs and truncate long image URLs (API max 500 chars)
    const orderItems: DbOrderItem[] = items.map((i) => ({
      id: i.id, name: i.name, price: i.price,
      quantity: i.quantity, unit: i.unit,
      image: (i.image && !i.image.startsWith("data:")) ? i.image.slice(0, 499) : "",
    }));

    const payload = JSON.stringify({
      customer: {
        name: effectiveName,
        phone: effectivePhone.length >= 6 ? effectivePhone : undefined,
        location: effectiveLoc || undefined,
        reference: effectiveRef || undefined,
      },
      items: orderItems,
      total: finalTotal,
      notes: (notes ?? "").trim() || undefined,
      deliverySlot: deliverySlot !== "lo-antes-posible" ? deliverySlot : undefined,
      paymentMethod: effectivePayment,
      yapeOperationNumber: effectivePayment === "yape" ? yapeOpNumber.trim() : undefined,
      deuda: effectivePayment === "efectivo" ? true : undefined,
      ...(promo && { appliedPromoId: promo.id, discountAmount: discount }),
      ...(couponApplied && couponCode.trim() && { appliedCouponCode: couponCode.trim(), couponDiscount }),
    });
    // Retry up to 3 times on transient server errors (5xx)
    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
        });
        if (res.ok || res.status < 500) break;
      } catch { /* network error, retry */ }
      if (attempt < 2) await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); // 2s, 4s
    }
    try {
      if (res?.ok) {
        const data = await res.json() as { id: string };
        setOrderId(data.id);
        clear();
        closeCart();
        markOrderPending();
        window.dispatchEvent(new CustomEvent("bsm:orderCreated", { detail: { orderId: data.id } }));
        // Track purchase conversion
        trackPurchase({
          orderId: data.id,
          total: finalTotal,
          items: items.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity })),
        });
        // Auto-save customer so next checkout skips straight to datos
        const finalPhone = effectivePhone.length >= 6 ? effectivePhone : (effectiveCustomer?.phone ?? "");
        if (effectiveName && finalPhone) {
          const existingLocs: SavedLocation[] = effectiveCustomer?.locations ?? (
            effectiveCustomer?.location
              ? [{ id: "default", location: effectiveCustomer.location, reference: effectiveCustomer.reference ?? "" }]
              : []
          );
          let updatedLocs = existingLocs;
          let activeId = effectiveCustomer?.activeLocationId ?? existingLocs[0]?.id ?? null;
          if (effectiveLoc && !existingLocs.some(l => l.location.trim() === effectiveLoc)) {
            const newLocId = Date.now().toString();
            updatedLocs = [...existingLocs, { id: newLocId, location: effectiveLoc, reference: effectiveRef }];
            activeId = newLocId;
          }
          register({
            name: effectiveName,
            phone: finalPhone,
            location: effectiveLoc || effectiveCustomer?.location || "",
            reference: effectiveRef || effectiveCustomer?.reference || "",
            locations: updatedLocs,
            activeLocationId: activeId !== null ? activeId : undefined,
          });
        }
        // Open order tracking modal and close checkout
        openOrderStatusModal();
        closeCheckout();
      } else {
        // Log the actual Zod issues so we can diagnose validation failures
        try {
          const errBody = await res!.json() as { error?: string; issues?: { path: (string | number)[]; message: string }[] };
          if (errBody?.issues?.length) {
            console.error("[orders] Validation issues:", errBody.issues);
          } else {
            console.error("[orders] Error response:", errBody);
          }
        } catch { /* response wasn't JSON */ }
        setSubmitError("No se pudo procesar tu pedido. Por favor intenta de nuevo.");
      }
    } catch {
      setSubmitError("Error de conexión. Verifica tu internet e intenta de nuevo.");
    }
    setSubmitting(false);
  };

  // datos step: validate required fields then advance to pago
  const handleDataSubmit = (e: FormEvent) => {
    e.preventDefault();
    setDataError("");
    const effectiveName = (name || effectiveCustomer?.name || "").trim();
    const effectiveLoc = (location || effectiveCustomer?.location || "").trim();
    if (!effectiveName) {
      setDataError("Por favor ingresa tu nombre completo.");
      return;
    }
    if (!effectiveLoc) {
      setDataError("Por favor ingresa tu dirección de entrega.");
      return;
    }
    setStep("pago");
  };

  // pago step: validate payment then submit
  const handlePaymentSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canConfirm) {
      setShowPaymentHint(true);
      return;
    }
    handleSubmit();
  };

  const canConfirm = paymentMethod === "efectivo" || (paymentMethod === "yape" && yapeOpNumber.trim().length > 0);

  if (!checkoutOpen) return null;

  return (
    <AnimatePresence>
      {checkoutOpen && (
        <>
          <m.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-7500 bg-black/60 backdrop-blur-sm"
            onClick={closeCheckout}
          />
          <m.div
            initial={{ opacity: 0, y: 48 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 48 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 sm:inset-0 z-7501 flex items-end sm:items-center justify-center sm:p-6"
          >
            <div className="relative bg-white dark:bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[95svh] flex flex-col overflow-hidden">

              <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
                <div className="h-1 w-10 rounded-full bg-gray-200" />
              </div>

              <div className="flex items-center justify-between px-5 py-4 border-b bg-primary/5 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center">
                    <ShoppingCart className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-extrabold text-gray-900 leading-tight">Completar pedido</h2>
                    <p className="text-xs text-gray-400">Bodega San Martín</p>
                  </div>
                </div>
                <button onClick={closeCheckout} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                  <X className="h-5 w-5 text-gray-400" />
                </button>
              </div>

              <StepBar current={step} />

              <div className="flex-1 overflow-y-auto">
                <AnimatePresence mode="wait">

                  {/* ── Step: Cuenta ──────────────────────── */}
                  {step === "cuenta" && (
                    <m.div key="cuenta" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }}>
                      <div className="px-5 py-6 space-y-5">
                        <div className="text-center space-y-2">
                          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                            <User className="h-8 w-8 text-primary" />
                          </div>
                          <h3 className="text-lg font-extrabold text-gray-900 dark:text-foreground">¿Ya tienes cuenta?</h3>
                          <p className="text-sm text-gray-400">
                            Ingresa tu celular para cargar tus datos guardados automáticamente.
                          </p>
                        </div>

                        {/* Quick-continue card if customer already in context */}
                        {customer && (
                          <>
                            <div className="bg-primary/5 border-2 border-primary/20 rounded-2xl p-4">
                              <p className="text-[10px] font-bold text-primary/70 uppercase tracking-wider mb-3">Cuenta guardada</p>
                              <div className="flex items-center gap-3 mb-3">
                                <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                                  <User className="h-5 w-5 text-primary" />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-bold text-gray-900 dark:text-foreground text-sm leading-tight">{customer.name}</p>
                                  {customer.phone && (
                                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                      <Phone className="h-3 w-3" />{customer.phone}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                setFoundCustomer(customer);
                                setName(customer.name);
                                setPhone(customer.phone ?? "");
                                const cLocs: SavedLocation[] = customer.locations?.length
                                  ? customer.locations
                                  : customer.location
                                  ? [{ id: "default", location: customer.location, reference: customer.reference ?? "" }]
                                  : [];
                                if (cLocs.length > 0) {
                                  const aId = customer.activeLocationId ?? cLocs[0].id;
                                  const aLoc = cLocs.find((l) => l.id === aId) ?? cLocs[0];
                                  setSelectedLocId(aId);
                                  setLocation(aLoc.location ?? "");
                                  setReference(aLoc.reference ?? "");
                                  setMapCoords(coordsFromLocation(aLoc.location ?? ""));
                                }
                                setStep("datos");
                              }}
                                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary-dark active:scale-[0.98] transition-all shadow-lg shadow-primary/20"
                              >
                                Continuar como {customer.name?.split(" ")[0] ?? "tí"} <ChevronRight className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                              <span className="text-xs text-gray-400 font-medium">o buscar otro número</span>
                              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                            </div>
                          </>
                        )}

                        {/* Phone search */}
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
                              Número de celular
                            </label>
                            <div className="relative">
                              <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                              <input
                                type="tel"
                                value={phoneQuery}
                                onChange={(e) => { setPhoneQuery(e.target.value); setPhoneNotFound(false); }}
                                placeholder="Ej: 987654321"
                                maxLength={15}
                                onKeyDown={(e) => e.key === "Enter" && handlePhoneSearch()}
                                className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-foreground placeholder:text-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
                              />
                            </div>
                          </div>

                          {phoneNotFound && (
                            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30">
                              <X className="h-4 w-4 text-red-500 shrink-0" />
                              <p className="text-xs text-red-600 dark:text-red-400 font-semibold">
                                No encontramos una cuenta con ese número.
                              </p>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={handlePhoneSearch}
                            disabled={!phoneQuery.trim() || phoneSearching}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary-dark active:scale-[0.98] transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                          >
                            {phoneSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
                            {phoneSearching ? "Buscando cuenta…" : "Buscar mi cuenta"}
                          </button>

                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                            <span className="text-xs text-gray-400 font-medium">o</span>
                            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                          </div>

                          <button
                            type="button"
                            onClick={handleSkipAccount}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-gray-200 dark:border-zinc-700 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:border-primary/30 hover:text-primary transition-all"
                          >
                            Continuar sin cuenta <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </m.div>
                  )}

                  {/* ── Step: Datos ───────────────────────── */}
                  {step === "datos" && (
                    <m.div key="datos" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
                      <form onSubmit={handleDataSubmit} className="px-5 py-4 space-y-4">

                        {/* ── CASO A: cuenta cargada → card de sólo lectura ── */}
                        {(foundCustomer !== null || (customer !== null && !skippedAccount)) && !editingCustomerData ? (
                          <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 overflow-hidden">
                            {/* header */}
                            <div className="flex items-center justify-between px-4 py-2.5 border-b border-primary/10 bg-white/60 dark:bg-black/10">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                                  {foundCustomer ? "Cuenta verificada" : "Datos guardados"}
                                </span>
                              </div>
                              <button type="button" onClick={() => setEditingCustomerData(true)}
                                className="text-xs font-semibold text-primary hover:underline">
                                Cambiar datos
                              </button>
                            </div>
                            {/* rows */}
                            <div className="divide-y divide-primary/10">
                              <div className="flex items-center gap-3 px-4 py-3">
                                <User className="h-4 w-4 text-primary/60 shrink-0" />
                                <div>
                                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider leading-none mb-0.5">Nombre</p>
                                  <p className="text-sm font-bold text-gray-900 dark:text-foreground">{name}</p>
                                </div>
                              </div>
                              {phone && (
                                <div className="flex items-center gap-3 px-4 py-3">
                                  <Phone className="h-4 w-4 text-primary/60 shrink-0" />
                                  <div>
                                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider leading-none mb-0.5">Teléfono</p>
                                    <p className="text-sm font-semibold text-gray-800 dark:text-foreground">{phone}</p>
                                  </div>
                                </div>
                              )}
                              {location && (
                                <div className="flex items-start gap-3 px-4 py-3">
                                  <MapPin className="h-4 w-4 text-primary/60 shrink-0 mt-0.5" />
                                  <div>
                                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider leading-none mb-0.5">Dirección</p>
                                    <p className="text-sm font-semibold text-gray-800 dark:text-foreground">{location}</p>
                                  </div>
                                </div>
                              )}
                              {reference && (
                                <div className="flex items-start gap-3 px-4 py-3">
                                  <Home className="h-4 w-4 text-primary/60 shrink-0 mt-0.5" />
                                  <div>
                                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider leading-none mb-0.5">Referencia</p>
                                    <p className="text-sm font-semibold text-gray-800 dark:text-foreground">{reference}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          /* ── CASO B: sin cuenta / editando → formulario completo ── */
                          <>
                            {/* Name */}
                            <div>
                              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Nombre completo *</label>
                              <div className="relative">
                                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: María García"
                                  className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 text-gray-900 dark:text-foreground dark:bg-transparent placeholder:text-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm" />
                              </div>
                            </div>
                            {/* Phone */}
                            <div>
                              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Teléfono</label>
                              <div className="relative">
                                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Ej: 987654321" maxLength={15}
                                  className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 text-gray-900 dark:text-foreground dark:bg-transparent placeholder:text-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm" />
                              </div>
                            </div>
                            {/* Saved addresses selector */}
                            {locations.length > 0 && !useNewAddress && (
                              <div>
                                <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Dirección de entrega</label>
                                <div className="space-y-2">
                                  {locations.map((loc) => (
                                    <button type="button" key={loc.id} onClick={() => handleSelectLocation(loc)}
                                      className={cn("w-full text-left flex items-start gap-3 p-3 rounded-xl border-2 transition-all",
                                        selectedLocId === loc.id ? "border-primary bg-primary/5" : "border-gray-100 hover:border-primary/30")}>
                                      <div className={cn("mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0",
                                        selectedLocId === loc.id ? "border-primary bg-primary" : "border-gray-300")}>
                                        {selectedLocId === loc.id && <CheckCircle2 className="h-3.5 w-3.5 text-white fill-white" />}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className={cn("text-sm font-semibold truncate", selectedLocId === loc.id ? "text-primary" : "text-gray-900")}>{loc.location}</p>
                                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1"><Home className="h-3 w-3 shrink-0" />{loc.reference}</p>
                                      </div>
                                    </button>
                                  ))}
                                  <button type="button" onClick={handleNewAddress}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-sm font-semibold text-gray-400 hover:text-primary hover:border-primary/30 transition-all">
                                    <MapPin className="h-4 w-4" /> Usar otra dirección
                                  </button>
                                </div>
                              </div>
                            )}
                            {/* Manual address input */}
                            {(locations.length === 0 || useNewAddress) && (
                              <>
                                <div>
                                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Dirección *</label>
                                  <div className="relative">
                                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <input required value={location} onChange={(e) => { setLocation(e.target.value); setMapCoords(coordsFromLocation(e.target.value)); }}
                                      placeholder="Ej: Jr. Ucayali 450, Pucallpa"
                                      className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 text-gray-900 placeholder:text-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm" />
                                  </div>
                                  <button type="button" onClick={useGeo} disabled={loadingGeo}
                                    className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-primary/25 bg-primary/5 text-primary text-sm font-semibold hover:bg-primary hover:text-white hover:border-primary transition-all disabled:opacity-50">
                                    {loadingGeo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
                                    {loadingGeo ? "Obteniendo ubicación…" : "Usar mi ubicación GPS"}
                                  </button>
                                  {geoError && (
                                    <p className="mt-1.5 text-xs text-red-500 flex items-start gap-1.5">
                                      <span className="shrink-0 mt-0.5">⚠️</span>
                                      {geoError}
                                    </p>
                                  )}
                                </div>
                                <div>
                                  <button type="button" onClick={() => setShowMap((v) => !v)}
                                    className="text-xs font-semibold text-primary hover:underline mb-2 flex items-center gap-1">
                                    <MapPin className="h-3 w-3" /> {showMap ? "Ocultar mapa" : "Ver / ajustar en mapa"}
                                  </button>
                                  {showMap && (
                                    <div className="rounded-xl overflow-hidden" style={{ height: 160 }}>
                                      <LeafletMap lat={mapCoords.lat} lon={mapCoords.lon} zoom={15} height={160}
                                        onPick={(lt, lg, addr) => { setMapCoords({ lat: lt, lon: lg }); setLocation(addr); fetchReferenceSuggestion(lt, lg); }} />
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Referencia *</label>
                                  <div className="relative">
                                    <Home className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                    <input required value={reference} onChange={(e) => { setReference(e.target.value); setShowRefSuggestions(false); }}
                                      placeholder="Ej: Casa azul frente al parque"
                                      className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 text-gray-900 placeholder:text-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm" />
                                  </div>
                                  {showRefSuggestions && refSuggestions.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Sugerencias de referencia:</p>
                                      {refSuggestions.map((s, i) => (
                                        <button key={i} type="button" onClick={() => { setReference(s); setShowRefSuggestions(false); }}
                                          className="w-full text-left text-xs px-3 py-2 rounded-lg bg-primary/5 text-primary font-medium hover:bg-primary/10 transition-colors">
                                          📍 {s}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </>
                        )}

                        <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Notas adicionales</label>
                          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                            placeholder="Instrucciones especiales, hora preferida…"
                            className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-gray-900 placeholder:text-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm resize-none" />
                        </div>

                        {/* ── Horario de entrega ────────────── */}
                        <div>
                          <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">
                            <Clock className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
                            Horario de entrega
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { id: "lo-antes-posible", label: "Lo antes posible", emoji: "⚡" },
                              { id: "manana", label: "Mañana (8-12h)", emoji: "🌅" },
                              { id: "tarde", label: "Tarde (12-17h)", emoji: "☀️" },
                              { id: "noche", label: "Noche (17-20h)", emoji: "🌙" },
                            ].map((slot) => (
                              <button
                                key={slot.id}
                                type="button"
                                onClick={() => setDeliverySlot(slot.id)}
                                className={cn(
                                  "flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all",
                                  deliverySlot === slot.id
                                    ? "border-primary bg-primary/5 text-primary"
                                    : "border-gray-200 text-gray-600 hover:border-primary/30"
                                )}
                              >
                                <span>{slot.emoji}</span>
                                <span className="text-xs">{slot.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* datos validation error */}
                        {dataError && (
                          <p className="text-red-600 dark:text-red-400 text-sm text-center flex items-center justify-center gap-1.5">
                            <span aria-hidden>⚠</span>{dataError}
                          </p>
                        )}

                        {/* datos → continue to pago */}
                        <div className="flex gap-3 pt-1">
                          <button type="button" onClick={() => setStep("cuenta")}
                            className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                            ← Volver
                          </button>
                          <button type="submit"
                            className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary-dark active:scale-[0.98] transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2">
                            Continuar al pago <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                      </form>
                    </m.div>
                  )}

                  {/* ── Step: Pago ───────────────────────── */}
                  {step === "pago" && (
                    <m.div key="pago" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
                      <form onSubmit={handlePaymentSubmit} className="px-5 py-4 space-y-4">

                        {/* ── Items list ───────────────────── */}
                        <div>
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Tu pedido ({items.length} {items.length === 1 ? "producto" : "productos"})</p>
                          <div className="rounded-xl border border-gray-100 dark:border-card-border divide-y divide-gray-50 dark:divide-card-border max-h-50 overflow-y-auto">
                            {items.map((item) => (
                              <div key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                                {item.image && (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img src={item.image} alt={item.name} className="h-9 w-9 rounded-lg object-cover shrink-0 bg-gray-100" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-gray-800 dark:text-foreground truncate">{item.name}</p>
                                  <p className="text-[10px] text-gray-400">{item.unit} × {item.quantity}</p>
                                </div>
                                <p className="text-sm font-bold text-gray-900 dark:text-foreground shrink-0">S/{(item.price * item.quantity).toFixed(2)}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* ── Totals ───────────────────────── */}
                        <div className="rounded-xl border border-gray-100 dark:border-card-border divide-y divide-gray-50 dark:divide-card-border overflow-hidden">
                          <div className="flex justify-between px-4 py-2.5 text-sm bg-gray-50/50 dark:bg-surface/50">
                            <span className="text-gray-500">Subtotal</span>
                            <span className="font-semibold text-gray-800 dark:text-foreground">S/{total.toFixed(2)}</span>
                          </div>
                          {discount > 0 && promo && (
                            <div className="flex justify-between px-4 py-2.5 text-sm bg-emerald-50/50 dark:bg-emerald-900/10">
                              <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Promo {promo.discountPercent}% off</span>
                              <span className="font-bold text-emerald-600">−S/{discount.toFixed(2)}</span>
                            </div>
                          )}
                          {couponApplied && couponDiscount > 0 && (
                            <div className="flex justify-between px-4 py-2.5 text-sm bg-emerald-50/50 dark:bg-emerald-900/10">
                              <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Cupón {couponCode}</span>
                              <span className="font-bold text-emerald-600">−S/{couponDiscount.toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center px-4 py-3 bg-primary/5 dark:bg-primary/10">
                            <span className="font-extrabold text-gray-900 dark:text-foreground">Total a pagar</span>
                            <span className="text-xl font-extrabold text-primary">S/{finalTotal.toFixed(2)}</span>
                          </div>
                        </div>

                        {/* ── Cupón ───────────────────────── */}
                        <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Cupón de descuento</label>
                          <div className="flex gap-2">
                            <input value={couponCode} onChange={e => { setCouponCode(e.target.value.toUpperCase()); if (couponApplied) { setCouponApplied(false); setCouponDiscount(0); setCouponMsg(""); } }} placeholder="Ej: DESCUENTO10" disabled={couponApplied}
                              className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-foreground placeholder:text-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm disabled:opacity-50 uppercase" />
                            {couponApplied ? (
                              <button type="button" onClick={() => { setCouponApplied(false); setCouponDiscount(0); setCouponCode(""); setCouponMsg(""); }} className="px-4 py-2 rounded-xl bg-red-100 text-red-600 font-bold text-sm hover:bg-red-200 transition">Quitar</button>
                            ) : (
                              <button type="button" onClick={validateCoupon} disabled={!couponCode.trim() || validatingCoupon} className="px-4 py-2 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition disabled:opacity-50">
                                {validatingCoupon ? "..." : "Aplicar"}
                              </button>
                            )}
                          </div>
                          {couponMsg && <p className={`text-xs mt-1 font-bold ${couponApplied ? "text-emerald-600" : "text-red-500"}`}>{couponMsg}</p>}
                        </div>

                        {/* ── Método de pago ───────────────── */}
                        <div className="space-y-3">
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Método de pago</p>
                          <div className="grid grid-cols-2 gap-3">
                            {yape.enabled && (
                              <button type="button" onClick={() => { setPaymentMethod("yape"); setShowPaymentHint(false); }}
                                className={cn("flex flex-col items-center gap-2 py-4 px-3 rounded-xl border-2 transition-all",
                                  paymentMethod === "yape" ? "border-purple-400 bg-purple-50 shadow-sm" : "border-gray-200 hover:border-purple-300")}>
                                <div className="h-10 w-10 rounded-xl bg-purple-600 flex items-center justify-center text-white font-extrabold text-lg">Y</div>
                                <span className={cn("text-sm font-bold", paymentMethod === "yape" ? "text-purple-700" : "text-gray-500")}>Yape</span>
                              </button>
                            )}
                            {cashEnabled && (
                              <button type="button" onClick={() => { setPaymentMethod("efectivo"); setShowPaymentHint(false); }}
                                className={cn("flex flex-col items-center gap-2 py-4 px-3 rounded-xl border-2 transition-all",
                                  paymentMethod === "efectivo" ? "border-emerald-400 bg-emerald-50 shadow-sm" : "border-gray-200 hover:border-emerald-300")}>
                                <Banknote className={cn("h-10 w-10", paymentMethod === "efectivo" ? "text-emerald-600" : "text-gray-400")} />
                                <span className={cn("text-sm font-bold", paymentMethod === "efectivo" ? "text-emerald-700" : "text-gray-500")}>Efectivo</span>
                              </button>
                            )}
                          </div>
                          {paymentMethod === "yape" && yape.enabled && (
                            <div className="bg-purple-50 rounded-2xl border border-purple-200 p-4 space-y-4">
                              <p className="text-xs font-bold text-purple-600 uppercase tracking-wider">Pago con Yape</p>
                              <div className="flex flex-col items-center gap-3">
                                {yape.image && (
                                  <div className="relative w-40 h-40 rounded-xl overflow-hidden border-2 border-purple-200 bg-white">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={yape.image} alt="Yape QR" className="w-full h-full object-contain" />
                                  </div>
                                )}
                                <div className="text-center">
                                  {yape.name && <p className="font-bold text-gray-900">{yape.name}</p>}
                                  {yape.phone && <p className="text-sm font-mono text-purple-700">{yape.phone}</p>}
                                </div>
                                <div className="bg-purple-100 rounded-xl px-4 py-2 text-center">
                                  <p className="text-xs text-purple-600 font-semibold">Monto a yapear</p>
                                  <p className="text-2xl font-extrabold text-purple-800">S/{finalTotal.toFixed(2)}</p>
                                </div>
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-purple-600 mb-1.5 uppercase tracking-wider">Número de operación *</label>
                                <div className="relative">
                                  <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-400" />
                                  <input value={yapeOpNumber} onChange={(e) => setYapeOpNumber(e.target.value)} placeholder="Ej: 123456789" maxLength={20}
                                    className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-purple-200 text-gray-900 placeholder:text-purple-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all text-sm font-mono" />
                                </div>
                                <p className="text-[10px] text-purple-500 mt-1">Número de operación de tu app Yape</p>
                              </div>
                            </div>
                          )}
                          {paymentMethod === "efectivo" && (
                            <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-4">
                              <div className="flex items-center gap-3">
                                <Banknote className="h-8 w-8 text-emerald-600 shrink-0" />
                                <div>
                                  <p className="font-bold text-sm text-emerald-800">Pago contra entrega</p>
                                  <p className="text-xs text-emerald-600">Pagarás S/{finalTotal.toFixed(2)} en efectivo al recibir tu pedido</p>
                                </div>
                              </div>
                            </div>
                          )}
                          {showPaymentHint && (
                            <p className="text-xs text-red-500 font-semibold">
                              {!paymentMethod ? "Selecciona un método de pago para continuar" : "Ingresa el número de operación de Yape para continuar"}
                            </p>
                          )}
                        </div>

                        {submitError && (
                          <div className="flex items-center gap-3 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30 animate-[fadeUp_0.2s_ease-out]">
                            <div className="h-9 w-9 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                              <X className="h-4 w-4 text-red-500" />
                            </div>
                            <p className="text-red-700 dark:text-red-300 text-sm font-medium">{submitError}</p>
                          </div>
                        )}

                        <div className="flex gap-3 pt-1">
                          <button type="button" onClick={() => setStep("datos")}
                            className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                            ← Volver
                          </button>
                          <button type="submit" disabled={submitting}
                            className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary-dark active:scale-[0.98] transition-all shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2">
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            {submitting ? "Enviando…" : "Finalizar pedido"}
                          </button>
                        </div>
                      </form>
                    </m.div>
                  )}

                </AnimatePresence>
              </div>

            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  );
}
