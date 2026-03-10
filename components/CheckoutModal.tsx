"use client";

import { useState, useEffect, type FormEvent } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { m, AnimatePresence } from "framer-motion";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import {
  X, ShoppingCart, User, MapPin, Home, Navigation,
  Loader2, CheckCircle2, ChevronRight, Phone,
  Banknote, Hash, ExternalLink, Copy, Check, Clock, MessageCircle, Share2,
} from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import { useCustomer } from "@/contexts/customer-context";
import { useSettings } from "@/contexts/settings-context";
import { usePromotions } from "@/contexts/promotions-context";
import { cn } from "@/lib/utils";
import type { DbOrderItem } from "@/lib/jsondb";
import type { SavedLocation } from "@/contexts/customer-context";

const LeafletMap = dynamic(() => import("./LeafletMap"), { ssr: false });
const Confetti = dynamic(() => import("./Confetti"), { ssr: false });

type Step = "resumen" | "datos" | "exito";
type PaymentMethod = "yape" | "efectivo";

const STEPS: { id: Step; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "datos", label: "Tus datos" },
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
  const { items, total, checkoutOpen, closeCheckout, clear, close: closeCart, openConfirmModal, markOrderPending } = useCart();
  const { customer, register } = useCustomer();
  const { yape, cashEnabled } = useSettings();
  const { getBestPromotion } = usePromotions();

  const [step, setStep] = useState<Step>("resumen");
  const [submitting, setSubmitting] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [copied, setCopied] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Customer data fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [loadingGeo, setLoadingGeo] = useState(false);
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

  useScrollLock(checkoutOpen);

  // Saved locations from customer
  const locations: SavedLocation[] = customer?.locations?.length
    ? customer.locations
    : customer?.location
    ? [{ id: "default", location: customer.location, reference: customer.reference }]
    : [];

  useEffect(() => {
    if (checkoutOpen) {
      setStep("resumen");
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
    if (!navigator.geolocation) return;
    setLoadingGeo(true);
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
      () => setLoadingGeo(false),
      { enableHighAccuracy: true, timeout: 10000 }
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

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError("");
    const orderItems: DbOrderItem[] = items.map((i) => ({
      id: i.id, name: i.name, price: i.price,
      quantity: i.quantity, unit: i.unit, image: i.image,
    }));
    const payload = JSON.stringify({
      customer: { name: name.trim(), phone: phone.trim() || undefined, location: location.trim(), reference: reference.trim() },
      items: orderItems,
      total: finalTotal,
      notes: notes.trim() || undefined,
      deliverySlot: deliverySlot !== "lo-antes-posible" ? deliverySlot : undefined,
      paymentMethod: paymentMethod,
      yapeOperationNumber: paymentMethod === "yape" ? yapeOpNumber.trim() : undefined,
      deuda: paymentMethod === "efectivo" ? true : undefined,
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
        setStep("exito");
        clear();
        closeCart();
        markOrderPending();
        window.dispatchEvent(new CustomEvent("bsm:orderCreated", { detail: { orderId: data.id } }));
        // Auto-save address so it auto-fills next time
        if (location.trim() && reference.trim()) {
          const existingLocs: SavedLocation[] = customer?.locations ?? (
            customer?.location ? [{ id: "default", location: customer.location, reference: customer.reference ?? "" }] : []
          );
          const alreadyExists = existingLocs.some(l => l.location.trim() === location.trim());
          if (!alreadyExists) {
            const newLocId = Date.now().toString();
            const newLoc: SavedLocation = { id: newLocId, location: location.trim(), reference: reference.trim() };
            const finalPhone = phone.trim() || customer?.phone;
            if (finalPhone) {
              register({
                name: name.trim() || customer?.name || "",
                phone: finalPhone,
                location: location.trim(),
                reference: reference.trim(),
                locations: [...existingLocs, newLoc],
                activeLocationId: newLocId,
              });
            }
          }
        }
      } else {
        setSubmitError("No se pudo procesar tu pedido. Por favor intenta de nuevo.");
      }
    } catch {
      setSubmitError("Error de conexión. Verifica tu internet e intenta de nuevo.");
    }
    setSubmitting(false);
  };

  const handleDataSubmit = (e: FormEvent) => {
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
            onClick={step !== "exito" ? closeCheckout : undefined}
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
                    <h2 className="font-extrabold text-gray-900 leading-tight">
                      {step === "exito" ? "¡Pedido confirmado!" : "Completar pedido"}
                    </h2>
                    <p className="text-xs text-gray-400">
                      {step === "exito" ? `Nº ${orderId}` : "Bodega San Martín"}
                    </p>
                  </div>
                </div>
                {step !== "exito" && (
                  <button onClick={closeCheckout} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                    <X className="h-5 w-5 text-gray-400" />
                  </button>
                )}
              </div>

              {step !== "exito" && <StepBar current={step} />}

              <div className="flex-1 overflow-y-auto">
                <AnimatePresence mode="wait">

                  {/* ── Step: Resumen ─────────────────────── */}
                  {step === "resumen" && (
                    <m.div key="resumen" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
                      <div className="px-5 py-4 space-y-3">
                        {items.length === 0 ? (
                          <p className="text-center text-gray-400 py-10">Tu carrito está vacío</p>
                        ) : (
                          <>
                            {items.map((item) => (
                              <div key={item.id} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                                <div className="relative h-14 w-14 rounded-lg overflow-hidden bg-white shrink-0 border border-gray-100">
                                  <Image src={item.image} alt={item.name} fill className="object-cover" sizes="56px" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-sm text-gray-900 line-clamp-1">{item.name}</p>
                                  <p className="text-xs text-gray-400">S/{item.price.toFixed(2)} / {item.unit} · x{item.quantity}</p>
                                </div>
                                <p className="font-bold text-primary shrink-0">S/{(item.price * item.quantity).toFixed(2)}</p>
                              </div>
                            ))}
                            <div className="flex items-center justify-between pt-2 border-t">
                              <span className="text-sm font-semibold text-gray-500">Total</span>
                              <div className="text-right">
                                {(promo || couponApplied) && (
                                  <p className="text-xs text-gray-400 line-through leading-none">S/{total.toFixed(2)}</p>
                                )}
                                <span className="text-2xl font-extrabold text-primary">S/{finalTotal.toFixed(2)}</span>
                              </div>
                            </div>
                            {promo && (
                              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                                <span className="text-emerald-600 font-bold text-sm">🏷️ {promo.name}</span>
                                <span className="ml-auto text-emerald-700 font-bold text-sm">-{promo.discountPercent}%</span>
                              </div>
                            )}
                            {couponApplied && couponDiscount > 0 && (
                              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                                <span className="text-blue-600 font-bold text-sm">🎟️ Cupón: {couponCode}</span>
                                <span className="ml-auto text-blue-700 font-bold text-sm">-S/{couponDiscount.toFixed(2)}</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      <div className="px-5 pb-5">
                        <button
                          onClick={() => setStep("datos")}
                          disabled={items.length === 0}
                          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary-dark active:scale-[0.98] transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                        >
                          Continuar con mis datos <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </m.div>
                  )}

                  {/* ── Step: Datos ───────────────────────── */}
                  {step === "datos" && (
                    <m.div key="datos" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
                      <form onSubmit={handleDataSubmit} className="px-5 py-4 space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Nombre completo *</label>
                          <div className="relative">
                            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: María García"
                              className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 text-gray-900 placeholder:text-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Teléfono</label>
                          <div className="relative">
                            <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Ej: 987654321" maxLength={15}
                              className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 text-gray-900 placeholder:text-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm" />
                          </div>
                        </div>

                        {/* Saved addresses selector */}
                        {locations.length > 0 && !useNewAddress && (
                          <div>
                            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Dirección de entrega</label>
                            <div className="space-y-2">
                              {locations.map((loc) => (
                                <button
                                  type="button"
                                  key={loc.id}
                                  onClick={() => handleSelectLocation(loc)}
                                  className={cn(
                                    "w-full text-left flex items-start gap-3 p-3 rounded-xl border-2 transition-all",
                                    selectedLocId === loc.id
                                      ? "border-primary bg-primary/5"
                                      : "border-gray-100 hover:border-primary/30"
                                  )}
                                >
                                  <div className={cn(
                                    "mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0",
                                    selectedLocId === loc.id ? "border-primary bg-primary" : "border-gray-300"
                                  )}>
                                    {selectedLocId === loc.id && <CheckCircle2 className="h-3.5 w-3.5 text-white fill-white" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className={cn("text-sm font-semibold truncate", selectedLocId === loc.id ? "text-primary" : "text-gray-900")}>{loc.location}</p>
                                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                                      <Home className="h-3 w-3 shrink-0" />{loc.reference}
                                    </p>
                                  </div>
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={handleNewAddress}
                                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-sm font-semibold text-gray-400 hover:text-primary hover:border-primary/30 transition-all"
                              >
                                <MapPin className="h-4 w-4" /> Usar otra dirección
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Manual address input (shown if no saved locations or "use new") */}
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
                            </div>
                            <div>
                              <button type="button" onClick={() => setShowMap((v) => !v)}
                                className="text-xs font-semibold text-primary hover:underline mb-2 flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> {showMap ? "Ocultar mapa" : "Ver / ajustar en mapa"}
                              </button>
                              {showMap && (
                                <div className="rounded-xl overflow-hidden" style={{ height: 160 }}>
                                  <LeafletMap lat={mapCoords.lat} lon={mapCoords.lon} zoom={15} height={160}
                                    onPick={(lt, lg, addr) => {
                                      setMapCoords({ lat: lt, lon: lg });
                                      setLocation(addr);
                                      fetchReferenceSuggestion(lt, lg);
                                    }} />
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
                              {/* Reference suggestions from geocoding */}
                              {showRefSuggestions && refSuggestions.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Sugerencias de referencia:</p>
                                  {refSuggestions.map((s, i) => (
                                    <button
                                      key={i}
                                      type="button"
                                      onClick={() => { setReference(s); setShowRefSuggestions(false); }}
                                      className="w-full text-left text-xs px-3 py-2 rounded-lg bg-primary/5 text-primary font-medium hover:bg-primary/10 transition-colors"
                                    >
                                      📍 {s}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
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

                        {/* ── Cupón de descuento ─────────────── */}
                        <div>
                          <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Cupón de descuento</label>
                          <div className="flex gap-2">
                            <input value={couponCode} onChange={e => { setCouponCode(e.target.value.toUpperCase()); if (couponApplied) { setCouponApplied(false); setCouponDiscount(0); setCouponMsg(""); } }} placeholder="Ej: DESCUENTO10" disabled={couponApplied}
                              className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 text-gray-900 placeholder:text-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm disabled:opacity-50 uppercase" />
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

                        {/* ── Método de pago ────────────────── */}
                        <div className="space-y-3">
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Método de pago</p>
                          <div className="grid grid-cols-2 gap-3">
                            {yape.enabled && (
                              <button
                                type="button"
                                onClick={() => { setPaymentMethod("yape"); setShowPaymentHint(false); }}
                                className={cn(
                                  "flex flex-col items-center gap-2 py-4 px-3 rounded-xl border-2 transition-all",
                                  paymentMethod === "yape"
                                    ? "border-purple-400 bg-purple-50 shadow-sm"
                                    : "border-gray-200 hover:border-purple-300"
                                )}
                              >
                                <div className="h-10 w-10 rounded-xl bg-purple-600 flex items-center justify-center text-white font-extrabold text-lg">Y</div>
                                <span className={cn("text-sm font-bold", paymentMethod === "yape" ? "text-purple-700" : "text-gray-500")}>Yape</span>
                              </button>
                            )}
                            {cashEnabled && (
                              <button
                                type="button"
                                onClick={() => { setPaymentMethod("efectivo"); setShowPaymentHint(false); }}
                                className={cn(
                                  "flex flex-col items-center gap-2 py-4 px-3 rounded-xl border-2 transition-all",
                                  paymentMethod === "efectivo"
                                    ? "border-emerald-400 bg-emerald-50 shadow-sm"
                                    : "border-gray-200 hover:border-emerald-300"
                                )}
                              >
                                <Banknote className={cn("h-10 w-10", paymentMethod === "efectivo" ? "text-emerald-600" : "text-gray-400")} />
                                <span className={cn("text-sm font-bold", paymentMethod === "efectivo" ? "text-emerald-700" : "text-gray-500")}>Efectivo</span>
                              </button>
                            )}
                          </div>
                          {paymentMethod === "yape" && yape.enabled && (
                            <div className="bg-purple-50 rounded-2xl border border-purple-200 p-4 space-y-4">
                              <p className="text-xs font-bold text-purple-600 uppercase tracking-wider">Realizar pago con Yape</p>
                              <div className="flex flex-col items-center gap-3">
                                {yape.image && (
                                  <div className="relative w-48 h-48 rounded-xl overflow-hidden border-2 border-purple-200 bg-white">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={yape.image} alt="Yape QR" className="w-full h-full object-contain" />
                                  </div>
                                )}
                                <div className="text-center">
                                  {yape.name && <p className="font-bold text-gray-900">{yape.name}</p>}
                                  {yape.phone && <p className="text-sm font-mono text-purple-700">{yape.phone}</p>}
                                </div>
                                <div className="bg-purple-100 rounded-xl px-4 py-2.5 text-center">
                                  <p className="text-xs text-purple-600 font-semibold">Monto a yapear</p>
                                  <p className="text-2xl font-extrabold text-purple-800">S/{finalTotal.toFixed(2)}</p>
                                </div>
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-purple-600 mb-1.5 uppercase tracking-wider">
                                  Número de operación *
                                </label>
                                <div className="relative">
                                  <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-400" />
                                  <input
                                    value={yapeOpNumber}
                                    onChange={(e) => setYapeOpNumber(e.target.value)}
                                    placeholder="Ej: 123456789"
                                    maxLength={20}
                                    className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-purple-200 text-gray-900 placeholder:text-purple-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none transition-all text-sm font-mono"
                                  />
                                </div>
                                <p className="text-[10px] text-purple-500 mt-1">Ingresa el número de operación que aparece en tu Yape después de realizar el pago</p>
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
                              {!paymentMethod
                                ? "Selecciona un método de pago para continuar"
                                : "Ingresa el número de operación de Yape para continuar"}
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
                          <button type="button" onClick={() => setStep("resumen")}
                            className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                            ← Volver
                          </button>
                          <button type="submit" disabled={submitting}
                            className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary-dark active:scale-[0.98] transition-all shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2">
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {submitting ? "Enviando…" : "Realizar pedido"}
                          </button>
                        </div>
                      </form>
                    </m.div>
                  )}

                  {/* ── Step: Éxito ───────────────────────── */}
                  {step === "exito" && (
                    <m.div key="exito" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", damping: 20, stiffness: 280 }}
                      className="px-6 py-8 flex flex-col items-center text-center gap-4">
                      <Confetti active={step === "exito"} />
                      <m.div
                        initial={{ scale: 0 }} animate={{ scale: 1 }}
                        transition={{ type: "spring", delay: 0.1, damping: 14, stiffness: 260 }}
                        className="h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center"
                      >
                        <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                      </m.div>
                      <div>
                        <h3 className="text-2xl font-extrabold text-foreground mb-1">¡Pedido recibido!</h3>
                        <p className="text-muted text-sm">Pronto nos comunicaremos contigo para coordinar la entrega.</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-surface rounded-xl px-5 py-3 w-full text-left space-y-1">
                        <p className="text-xs text-muted font-semibold uppercase tracking-wider">Número de pedido</p>
                        <p className="font-mono text-sm font-bold text-primary">{orderId}</p>
                      </div>
                      {paymentMethod && (
                        <div className="bg-gray-50 dark:bg-surface rounded-xl px-5 py-3 w-full text-left space-y-1">
                          <p className="text-xs text-muted font-semibold uppercase tracking-wider">Método de pago</p>
                          <p className="text-sm font-bold text-foreground">
                            {paymentMethod === "yape" ? `Yape — Nº Op. ${yapeOpNumber}` : "Efectivo contra entrega"}
                          </p>
                        </div>
                      )}

                      {/* ── Tracking link ──────────────────── */}
                      {orderId && (
                        <div className="w-full rounded-2xl border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <p className="text-xs font-bold text-primary uppercase tracking-wider">Seguimiento en vivo</p>
                          </div>
                          <p className="text-xs text-gray-500 text-left">Guarda este enlace para ver el estado de tu pedido en tiempo real.</p>
                          <a
                            href={`/pedido/${orderId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary-dark transition-colors shadow shadow-primary/20"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Ver mi pedido en vivo
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              const url = `${window.location.origin}/pedido/${orderId}`;
                              navigator.clipboard.writeText(url).then(() => {
                                setCopied(true);
                                setTimeout(() => setCopied(false), 2000);
                              }).catch(() => {});
                            }}
                            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-primary/30 text-primary font-semibold text-sm hover:bg-primary/10 transition-colors"
                          >
                            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            {copied ? "¡Enlace copiado!" : "Copiar enlace"}
                          </button>
                        </div>
                      )}

                      {/* ── Delivery estimate ─────────────── */}
                      <div className="w-full rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 p-3 flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                          <Clock className="h-5 w-5 text-amber-600" />
                        </div>
                        <div className="text-left">
                          <p className="text-xs font-bold text-amber-800 dark:text-amber-300">Tiempo estimado de entrega</p>
                          <p className="text-sm font-extrabold text-amber-900 dark:text-amber-200">30 — 45 minutos</p>
                        </div>
                      </div>

                      {/* ── WhatsApp share ────────────────── */}
                      {orderId && (
                        <div className="w-full flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const url = `${window.location.origin}/pedido/${orderId}`;
                              const text = `¡Hice mi pedido en Bodega San Martín! 🛒\nPuedes rastrear el estado aquí:\n${url}`;
                              window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
                            }}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#25D366] text-white font-bold text-sm hover:bg-[#1fb85a] transition-colors shadow-sm"
                          >
                            <MessageCircle className="h-4 w-4" />
                            Compartir por WhatsApp
                          </button>
                          {typeof navigator !== "undefined" && navigator.share && (
                            <button
                              type="button"
                              onClick={() => {
                                const url = `${window.location.origin}/pedido/${orderId}`;
                                navigator.share({ title: "Mi pedido - Bodega San Martín", text: "¡Mira mi pedido!", url }).catch(() => {});
                              }}
                              className="flex items-center justify-center w-11 rounded-xl border border-gray-200 text-muted hover:text-foreground hover:border-gray-300 transition-colors"
                              aria-label="Compartir"
                            >
                              <Share2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      )}

                      <button onClick={() => { closeCheckout(); setTimeout(() => openConfirmModal(true), 400); }}
                        className="w-full py-3.5 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 transition-colors text-sm">
                        Continuar comprando
                      </button>
                      <a href="/cuenta" className="text-xs text-emerald-600 font-semibold hover:underline">
                        Ver todos mis pedidos →
                      </a>
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
