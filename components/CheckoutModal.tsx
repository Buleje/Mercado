"use client";

import { useState, useEffect, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { m, AnimatePresence } from "framer-motion";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import {
  X, ShoppingCart, User, MapPin, Home, Navigation,
  Loader2, CheckCircle2, ChevronRight, Phone,
  Award, Hash,
} from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import { useCustomer } from "@/contexts/customer-context";
import { useSettings } from "@/contexts/settings-context";
import { usePromotions } from "@/contexts/promotions-context";
import { cn } from "@/lib/utils";
import { trackPurchase } from "@/lib/analytics";
import type { DbOrderItem } from "@/lib/jsondb";
import type { SavedLocation, Customer } from "@/contexts/customer-context";
import {
  StepBar,
  CheckoutAccountStep, CheckoutSuccessStep, CheckoutDeliverySchedule,
  CheckoutOrderReview, CheckoutPaymentSection, CheckoutNotesField,
  type Step,
} from "@/components/checkout";

const LeafletMap = dynamic(() => import("./LeafletMap"), { ssr: false });
// const Confetti = dynamic(() => import("./Confetti"), { ssr: false });

type PaymentMethod = "yape" | "efectivo";
type DniLookupStatus = "idle" | "loading" | "success" | "error";

function coordsFromLocation(loc: string, fallbackLat?: number | null, fallbackLon?: number | null) {
  const match = loc.match(/GPS:\s*([-\d.]+),\s*([-\d.]+)/);
  if (match) return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
  return { lat: fallbackLat ?? -8.3791, lon: fallbackLon ?? -74.5539 };
}

/* R3: Haversine distance for zone validation (~km) */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
const STORE_LAT = -8.3791;
const STORE_LON = -74.5539;
const MAX_DELIVERY_KM = 5;

/* ── Dynamic delivery ETA helper (kept for fallback) ── */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getDeliveryETA(slotId: string): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
  const h = now.getHours();
  const isOpen = h >= 8 && h < 20;

  switch (slotId) {
    case "lo-antes-posible":
      return isOpen ? "Estimado: ~30-45 min" : "Mañana a primera hora (8:00)";
    case "manana":
      return h < 12 ? "Hoy entre 8:00 - 12:00" : "Mañana entre 8:00 - 12:00";
    case "tarde":
      return h < 17 ? "Hoy entre 12:00 - 17:00" : "Mañana entre 12:00 - 17:00";
    case "noche":
      return h < 20 ? "Hoy entre 17:00 - 20:00" : "Mañana entre 17:00 - 20:00";
    default:
      return "";
  }
}

export default function CheckoutModal() {
  const { items, total, checkoutOpen, closeCheckout, clear, close: closeCart, markOrderPending } = useCart();
  const { customer, register, findByPhone, openOrderStatusModal } = useCustomer();
  const { yape, cashEnabled, businessName, businessLat, businessLon, businessAddress, storeTheme } = useSettings();
  const storeLat = businessLat ?? -8.3791;
  const storeLon = businessLon ?? -74.5539;
  const { getBestPromotion } = usePromotions();

  const [step, setStep] = useState<Step>("datos");
  const [submitting, setSubmitting] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [dataError, setDataError] = useState("");

  // Customer data fields
  const [dni, setDni] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [dniLookupStatus, setDniLookupStatus] = useState<DniLookupStatus>("idle");
  const [dniLookupMessage, setDniLookupMessage] = useState("");
  const [loadingGeo, setLoadingGeo] = useState(false);
  const [geoError, setGeoError] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [mapCoords, setMapCoords] = useState({ lat: -8.3791, lon: -74.5539 });
  
  // Detailed address fields
  const [streetType, setStreetType] = useState("Calle");
  const [streetName, setStreetName] = useState("");
  const [streetNumber, setStreetNumber] = useState("");
  const [useDetailedAddress, setUseDetailedAddress] = useState(false);

  // Compute best promo based on cart total + phone (resolved from state or customer)
  const promo = getBestPromotion(total, phone || customer?.phone);
  const discount = promo ? total * (promo.discountPercent / 100) : 0;

  // Coupons
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponMsg, setCouponMsg] = useState("");
  const [couponApplied, setCouponApplied] = useState(false);
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  // Loyalty points + tier for identified customer
  const [loyaltyPoints, setLoyaltyPoints] = useState<number | null>(null);
  const [loyaltyTier, setLoyaltyTier] = useState<string | null>(null);

  // Tier-based automatic discount: plata=2%, oro=4%, diamante=7%
  const TIER_DISCOUNT: Record<string, number> = { plata: 2, oro: 4, diamante: 7 };
  const tierDiscountPct = loyaltyTier ? (TIER_DISCOUNT[loyaltyTier] ?? 0) : 0;
  const tierDiscount = total * (tierDiscountPct / 100);

  /* R1: Optional tip */
  const [tip, setTip] = useState(0);

  /* W1: Pending orders alert */
  const [_pendingOrdersCount, setPendingOrdersCount] = useState(0);
  useEffect(() => {
    if (step !== "pago" || !phone) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/orders?phone=${encodeURIComponent(phone)}&status=pendiente,confirmado,en_camino`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setPendingOrdersCount(Array.isArray(data) ? data.length : 0);
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [step, phone]);

  /* Stock validation when checkout opens */
  const [_stockWarnings, setStockWarnings] = useState<string[]>([]);
  useEffect(() => {
    if (!checkoutOpen || items.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const ids = items.map(i => i.id).join(",");
        const res = await fetch(`/api/products/stock-check?ids=${ids}`);
        if (res.ok && !cancelled) {
          const data: { id: number; stock: number | null }[] = await res.json();
          const warnings: string[] = [];
          for (const item of items) {
            const info = data.find(d => d.id === item.id);
            if (info && info.stock !== null && item.quantity > info.stock) {
              warnings.push(
                info.stock === 0
                  ? `"${item.name}" está agotado`
                  : `"${item.name}" solo tiene ${info.stock} en stock (tienes ${item.quantity})`
              );
            }
          }
          setStockWarnings(warnings);
        }
      } catch { /* silent — don't block checkout */ }
    })();
    return () => { cancelled = true; };
  }, [checkoutOpen, items]);

  const finalTotal = Math.max(0, total - discount - couponDiscount - tierDiscount + tip);

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
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("");
  const [useCustomDateTime, setUseCustomDateTime] = useState(false);

  // Delivery distance from store (computed when location has GPS)
  const [_deliveryDistance, setDeliveryDistance] = useState<number | undefined>(undefined);

  // Google Maps suggestions
  const [refSuggestions, setRefSuggestions] = useState<string[]>([]);
  const [showRefSuggestions, setShowRefSuggestions] = useState(false);

  const fetchLoyaltyPoints = async (ph: string) => {
    const clean = ph.replace(/\D/g, "").slice(-9);
    if (clean.length < 6) return;
    try {
      const res = await fetch(`/api/loyalty/${encodeURIComponent(clean)}`);
      if (res.ok) {
        const data = await res.json() as { loyaltyPoints?: number; loyaltyTier?: string };
        setLoyaltyPoints(data.loyaltyPoints ?? null);
        setLoyaltyTier(data.loyaltyTier ?? null);
      }
    } catch { /* ignore — non-critical */ }
  };

  // Phone account lookup
  const [phoneQuery, setPhoneQuery] = useState("");
  const [phoneSearching, setPhoneSearching] = useState(false);
  const [foundCustomer, setFoundCustomer] = useState<Customer | null>(null);
  const [phoneNotFound, setPhoneNotFound] = useState(false);
  const [editingCustomerData, setEditingCustomerData] = useState(false);
  const [skippedAccount, setSkippedAccount] = useState(false);

  // Real-time phone validation helper
  const validatePhone = (v: string) => {
    const digits = v.replace(/\D/g, "");
    if (digits.length === 0) return { valid: false, hint: "", color: "" };
    if (digits.length < 9) return { valid: false, hint: `${9 - digits.length} dígitos más`, color: "text-amber-500" };
    if (digits.length === 9 && /^9/.test(digits)) return { valid: true, hint: "✓ Número válido", color: "text-emerald-600" };
    if (digits.length === 9) return { valid: false, hint: "Debe empezar con 9", color: "text-red-500" };
    return { valid: false, hint: "Máximo 9 dígitos", color: "text-red-500" };
  };
  const phoneQueryValidation = validatePhone(phoneQuery);
  const phoneValidation = validatePhone(phone);

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
      setDeliveryDate("");
      setDeliveryTime("");
      setUseCustomDateTime(false);
      setDni(customer?.dni ?? "");
      setDniLookupStatus("idle");
      setDniLookupMessage("");
      setStreetType("Calle");
      setStreetName("");
      setStreetNumber("");
      setUseDetailedAddress(false);
      setLoyaltyPoints(null);
      // Pre-load points for already-identified customers
      if (customer?.phone) fetchLoyaltyPoints(customer.phone);

      // Auto-fill from customer
      setDni(customer?.dni ?? "");
      setName(customer?.name ?? "");
      setPhone(customer?.phone ?? "");

      if (locations.length > 0) {
        const activeId = customer?.activeLocationId ?? locations[0]?.id ?? "default";
        setSelectedLocId(activeId);
        const activeLoc = locations.find((l) => l.id === activeId) ?? locations[0];
        setLocation(activeLoc.location);
        setReference(activeLoc.reference);
        if (activeLoc.location) setMapCoords(coordsFromLocation(activeLoc.location, businessLat, businessLon));
      } else {
        setSelectedLocId(null);
        setLocation(customer?.location ?? "");
        setReference(customer?.reference ?? "");
        if (customer?.location) setMapCoords(coordsFromLocation(customer.location, businessLat, businessLon));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutOpen]);

  const handleSelectLocation = (loc: SavedLocation) => {
    setSelectedLocId(loc.id);
    setUseNewAddress(false);
    setLocation(loc.location);
    setReference(loc.reference);
    setMapCoords(coordsFromLocation(loc.location, businessLat, businessLon));
  };

  const handleNewAddress = () => {
    setUseNewAddress(true);
    setSelectedLocId(null);
    setLocation("");
    setReference("");
  };

  const useGeo = async () => {
    if (!navigator.geolocation) {
      setGeoError("Tu navegador no soporta geolocalización. Ingresa tu dirección manualmente.");
      return;
    }

    // Skip stale permission cache check — let getCurrentPosition handle denials
    // via its error callback (code 1 = PERMISSION_DENIED). The permissions API
    // can return stale "denied" state even after user re-grants, blocking GPS.

    setLoadingGeo(true);
    setGeoError("");
    setGeoSuggested(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setMapCoords({ lat, lon });
        
        // Reverse geocode to get detailed address
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
            { headers: { "Accept-Language": "es" } }
          );
          if (res.ok) {
            const data = await res.json();
            const addr = data.address;
            
            // Extract street details
            if (addr) {
              // Determine street type and name
              if (addr.road) {
                const roadName = addr.road;
                // Try to detect street type
                if (roadName.toLowerCase().includes('avenida') || roadName.toLowerCase().includes('av.')) {
                  setStreetType('Avenida');
                  setStreetName(roadName.replace(/avenida|av\./gi, '').trim());
                } else if (roadName.toLowerCase().includes('jirón') || roadName.toLowerCase().includes('jr.')) {
                  setStreetType('Jirón');
                  setStreetName(roadName.replace(/jirón|jr\./gi, '').trim());
                } else if (roadName.toLowerCase().includes('pasaje') || roadName.toLowerCase().includes('psje.')) {
                  setStreetType('Pasaje');
                  setStreetName(roadName.replace(/pasaje|psje\./gi, '').trim());
                } else {
                  setStreetType('Calle');
                  setStreetName(roadName);
                }
              }
              
              // Set house number if available
              if (addr.house_number) {
                setStreetNumber(addr.house_number);
              }
              
              // Build full location string
              const locationParts = [];
              if (addr.road) locationParts.push(addr.road);
              if (addr.house_number) locationParts.push(addr.house_number);
              if (addr.suburb || addr.neighbourhood) locationParts.push(addr.suburb || addr.neighbourhood);
              locationParts.push(`GPS: ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
              setLocation(locationParts.join(', '));
              
              // Auto-enable detailed address view
              setUseDetailedAddress(true);
              
              // Generate reference suggestions
              const suggestions: string[] = [];
              if (addr.amenity) suggestions.push(`Cerca de ${addr.amenity}`);
              if (addr.shop) suggestions.push(`Frente a tienda: ${addr.shop}`);
              if (addr.building) suggestions.push(`Edificio ${addr.building}`);
              if (addr.neighbourhood) suggestions.push(`Barrio ${addr.neighbourhood}`);
              if (addr.suburb) suggestions.push(`Zona ${addr.suburb}`);
              if (addr.road && addr.house_number) suggestions.push(`${addr.road} ${addr.house_number}`);
              
              // Add nearby landmarks
              const landmarks = [
                `Casa de color visible desde la calle`,
                `Con reja/portón principal`,
                `Esquina de la cuadra`,
                `A media cuadra`,
                `Frente al parque`,
                `Cerca de la bodega`,
                `Al lado del mercado`
              ];
              suggestions.push(...landmarks.slice(0, 3));
              
              setRefSuggestions([...new Set(suggestions)].slice(0, 6));
              setShowRefSuggestions(true);
              
              // Auto-fill reference with first relevant suggestion and use simple address
              if (suggestions.length > 0) {
                setReference(suggestions[0]);
              }
              setUseDetailedAddress(false);
            }
          }
        } catch {
          // Fallback to basic GPS location
          setLocation(`GPS: ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
        }
        
        setLoadingGeo(false);
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
        if (data.address) {
          const a = data.address;
          if (a.amenity) suggestions.push(`Cerca de ${a.amenity}`);
          if (a.shop) suggestions.push(`Frente a tienda: ${a.shop}`);
          if (a.road) suggestions.push(`${a.road}`);
          if (a.neighbourhood) suggestions.push(`Barrio ${a.neighbourhood}`);
          if (a.suburb) suggestions.push(`Zona ${a.suburb}`);
        }
        // Add generic helpful references
        suggestions.push(
          'Casa de color visible',
          'Con reja/portón',
          'Esquina de la cuadra',
          'Frente al parque'
        );
        setRefSuggestions([...new Set(suggestions)].slice(0, 6));
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
      setDni(found.dni ?? "");
      setName(found.name || "");
      setPhone(found.phone ?? q);
      fetchLoyaltyPoints(found.phone ?? q);
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
        setMapCoords(coordsFromLocation(activeLoc.location ?? "", businessLat, businessLon));
      } else {
        setLocation(found.location ?? "");
        setReference(found.reference ?? "");
        if (found.location) setMapCoords(coordsFromLocation(found.location, businessLat, businessLon));
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
    // Double-submit guard
    if (submitting) return;
    setSubmitting(true);
    setSubmitError("");

    // Build effective values first so we can pre-flight validate
    const effectiveName = (name || effectiveCustomer?.name || "").trim();
    const effectiveDni = dni.replace(/\D/g, "").slice(0, 8);
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
    if (effectiveDni && !/^\d{8}$/.test(effectiveDni)) {
      setSubmitError("El DNI debe tener 8 dígitos.");
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
      ...(i.note ? { note: i.note } : {}),
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
      deliveryDate: useCustomDateTime && deliveryDate ? deliveryDate : undefined,
      deliveryTime: useCustomDateTime && deliveryTime ? deliveryTime : undefined,
      paymentMethod: effectivePayment,
      yapeOperationNumber: effectivePayment === "yape" ? yapeOpNumber.trim() : undefined,
      deuda: effectivePayment === "efectivo" ? true : undefined,
      ...(promo && { appliedPromoId: promo.id, discountAmount: discount }),
      ...(couponApplied && couponCode.trim() && { appliedCouponCode: couponCode.trim(), couponDiscount }),
      ...(tip > 0 && { tip }),
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
        // Save order summary for OrderConfirmModal
        try {
          localStorage.setItem("bsm-last-order", JSON.stringify({
            id: data.id,
            items: items.map(i => ({ name: i.name, quantity: i.quantity, price: i.price, unit: i.unit ?? "", image: i.image ?? "" })),
            total: finalTotal,
          }));
        } catch { /* quota exceeded — non-critical */ }
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
            ...(effectiveDni && { dni: effectiveDni }),
            phone: finalPhone,
            location: effectiveLoc || effectiveCustomer?.location || "",
            reference: effectiveRef || effectiveCustomer?.reference || "",
            locations: updatedLocs,
            activeLocationId: activeId !== null ? activeId : undefined,
          });
        }
        // Open order tracking modal and close checkout
        setStep("exito");
        setTimeout(() => {
          openOrderStatusModal();
          closeCheckout();
        }, 2500);
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
  const [geoSuggested, setGeoSuggested] = useState(false);
  const handleDataSubmit = (e: FormEvent) => {
    e.preventDefault();
    setDataError("");
    const effectiveName = (name || effectiveCustomer?.name || "").trim();
    const effectiveDni = dni.replace(/\D/g, "").slice(0, 8);
    const effectiveLoc = (location || effectiveCustomer?.location || "").trim();
    if (!effectiveName) {
      setDataError("Por favor ingresa tu nombre completo.");
      return;
    }
    if (effectiveDni && !/^\d{8}$/.test(effectiveDni)) {
      setDataError("El DNI debe tener 8 dígitos.");
      return;
    }
    if (!effectiveLoc) {
      setDataError("Por favor ingresa tu dirección de entrega.");
      return;
    }
    /* R3: Zone validation */
    const coords = coordsFromLocation(effectiveLoc, businessLat, businessLon);
    const dist = haversineKm(storeLat, storeLon, coords.lat, coords.lon);
    if (effectiveLoc.includes("GPS:")) setDeliveryDistance(dist);
    if (effectiveLoc.includes("GPS:") && dist > MAX_DELIVERY_KM) {
      setDataError(`Tu ubicación está a ${dist.toFixed(1)} km. Solo entregamos hasta ${MAX_DELIVERY_KM} km.`);
      return;
    }
    // Suggest GPS verification for manual addresses (one-time)
    if (!effectiveLoc.includes("GPS:") && !geoSuggested && navigator.geolocation) {
      setGeoSuggested(true);
      setDataError("💡 Tip: Usa \"Ubicación GPS\" para confirmar que estás en zona de entrega. O continúa si tu dirección es correcta.");
      // Allow re-submit to proceed
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

  const canConfirm = paymentMethod === "efectivo" || (paymentMethod === "yape" && /^\d{6,20}$/.test(yapeOpNumber.trim()));

  useEffect(() => {
    const normalizedDni = dni.replace(/\D/g, "").slice(0, 8);

    if (!normalizedDni) {
      setDniLookupStatus("idle");
      setDniLookupMessage("Escribe 8 números y traeremos el nombre desde RENIEC.");
      return;
    }

    if (normalizedDni.length < 8) {
      setDniLookupStatus("idle");
      setDniLookupMessage(`Faltan ${8 - normalizedDni.length} dígitos para consultar RENIEC.`);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        setDniLookupStatus("loading");
        setDniLookupMessage("Buscando nombre en RENIEC...");

        const res = await fetch(`/api/reniec/dni/${normalizedDni}`, {
          method: "GET",
          signal: controller.signal,
        });

        const data = await res.json() as { nombreCompleto?: string; error?: string };

        if (!res.ok || !data.nombreCompleto) {
          setDniLookupStatus("error");
          const fallbackMsg = res.status === 503
            ? "RENIEC no disponible ahora. Escribe el nombre manualmente."
            : res.status === 502
            ? "No pudimos conectar con RENIEC. Escribe el nombre manualmente."
            : data.error || "No encontramos datos para este DNI.";
          setDniLookupMessage(fallbackMsg);
          return;
        }

        setName(data.nombreCompleto);
        setDniLookupStatus("success");
        setDniLookupMessage("Nombre completado automáticamente desde RENIEC.");
      } catch (error) {
        if (controller.signal.aborted) return;
        setDniLookupStatus("error");
        setDniLookupMessage(error instanceof Error ? error.message : "No se pudo consultar RENIEC.");
      }
    }, 450);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [dni]);

  if (!checkoutOpen) return null;

  return (
    <AnimatePresence>
      {checkoutOpen && (
        <>
          <style dangerouslySetInnerHTML={{
            __html: `
              /* Force cursor to always be visible over modal */
              html, body {
                cursor: default !important;
              }
              
              #checkout-modal-overlay {
                cursor: default !important;
                transform: translateZ(0) !important;
                backface-visibility: hidden !important;
                perspective: 1000px !important;
              }
              
              #checkout-modal-container,
              #checkout-modal-container > *,
              #checkout-modal-container * {
                cursor: inherit !important;
                pointer-events: auto !important;
                transform: translateZ(1px) !important;
              }
              
              #checkout-modal-container {
                cursor: default !important;
              }
              
              #checkout-modal-container button,
              #checkout-modal-container a,
              #checkout-modal-container [role="button"],
              #checkout-modal-container [type="button"],
              #checkout-modal-container [type="submit"],
              #checkout-modal-container summary {
                cursor: pointer !important;
              }
              
              #checkout-modal-container input[type="text"],
              #checkout-modal-container input[type="tel"],
              #checkout-modal-container input[type="number"],
              #checkout-modal-container input[type="email"],
              #checkout-modal-container input[type="date"],
              #checkout-modal-container input[type="time"],
              #checkout-modal-container textarea,
              #checkout-modal-container select {
                cursor: text !important;
              }
            `
          }} />
          <m.div
            id="checkout-modal-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 sm:backdrop-blur-md"
            style={{ 
              zIndex: 2147483640,
              pointerEvents: 'auto',
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              transform: 'translateZ(0)',
            }}
            onClick={closeCheckout}
          />
          <m.div
            id="checkout-modal-container"
            initial={{ opacity: 0, y: 48 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 48 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 sm:inset-0 flex items-end sm:items-center justify-center sm:p-6"
            style={{ 
              zIndex: 2147483645,
              pointerEvents: 'auto',
              transform: 'translateZ(1px)',
            }}
          >
            <div role="dialog" aria-modal="true" aria-label="Completar pedido" className={`relative bg-white dark:bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-h-[95svh] flex flex-col overflow-hidden transition-all duration-300 ${step === "pago" ? "sm:max-w-5xl" : "sm:max-w-2xl"}`}>

              <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
                <div className="h-1 w-10 rounded-full bg-gray-200" />
              </div>

              <div className="flex items-center justify-between px-6 py-5 shrink-0 bg-linear-to-r from-primary to-primary-dark">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shadow-lg overflow-hidden">
                    {storeTheme?.logo ? (
                      <img src={storeTheme.logo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ShoppingCart className="h-6 w-6 text-white" />
                    )}
                  </div>
                  <div>
                    <h2 className="font-extrabold text-white text-xl leading-tight">Completar pedido</h2>
                    <p className="text-sm text-white/70">{businessName || "Mi Tienda"} · {items.length} {items.length === 1 ? "producto" : "productos"}</p>
                  </div>
                </div>
                <button onClick={closeCheckout} aria-label="Cerrar checkout" className="p-2.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors">
                  <X className="h-6 w-6 text-white" />
                </button>
              </div>

              <StepBar current={step} />

              {/* Mini cart summary — visible in cuenta and datos steps */}
              {(step === "cuenta" || step === "datos") && items.length > 0 && (
                <details className="mx-5 mt-2 mb-0 group">
                  <summary className="flex items-center justify-between cursor-pointer list-none text-xs font-semibold text-primary py-1.5 px-3 rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors">
                    <span className="flex items-center gap-1.5">
                      <ShoppingCart className="h-3.5 w-3.5" />
                      {items.length} {items.length === 1 ? "producto" : "productos"} · S/{finalTotal.toFixed(2)}
                    </span>
                    <svg className="h-3.5 w-3.5 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                  </summary>
                  <div className="mt-1.5 max-h-32 overflow-y-auto rounded-lg border border-gray-100 dark:border-card-border divide-y divide-gray-50 dark:divide-card-border">
                    {items.map(item => (
                      <div key={item.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                        <span className="text-gray-700 dark:text-foreground truncate flex-1 min-w-0">{item.quantity}× {item.name}</span>
                        <span className="text-gray-500 font-semibold ml-2 shrink-0">S/{(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              <div className="flex-1 overflow-y-auto">
                <AnimatePresence mode="wait">

                  {/* ── Step: Cuenta ──────────────────────── */}
                  {step === "cuenta" && (
                    <CheckoutAccountStep
                      phoneQuery={phoneQuery}
                      onPhoneQueryChange={(v) => { setPhoneQuery(v); setPhoneNotFound(false); }}
                      phoneQueryValidation={phoneQueryValidation}
                      phoneSearching={phoneSearching}
                      phoneNotFound={phoneNotFound}
                      onPhoneSearch={handlePhoneSearch}
                      onSkipAccount={handleSkipAccount}
                    />
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
                              <div className="flex items-center gap-2.5 px-3 py-1.5">
                                <User className="h-3.5 w-3.5 text-primary/60 shrink-0" />
                                <span className="text-xs font-bold text-gray-900 dark:text-foreground">{name}</span>
                              </div>
                              {phone && (
                                <div className="flex items-center gap-2.5 px-3 py-1.5">
                                  <Phone className="h-3.5 w-3.5 text-primary/60 shrink-0" />
                                  <span className="text-xs text-gray-700 dark:text-foreground">{phone}</span>
                                </div>
                              )}
                              {location && (
                                <div className="flex items-start gap-2.5 px-3 py-1.5">
                                  <MapPin className="h-3.5 w-3.5 text-primary/60 shrink-0 mt-0.5" />
                                  <span className="text-xs text-gray-700 dark:text-foreground leading-tight">{location}</span>
                                </div>
                              )}
                              {reference && (
                                <div className="flex items-start gap-2.5 px-3 py-1.5">
                                  <Home className="h-3.5 w-3.5 text-primary/60 shrink-0 mt-0.5" />
                                  <span className="text-xs text-gray-500 leading-tight">{reference}</span>
                                </div>
                              )}
                              {loyaltyPoints !== null && loyaltyPoints > 0 && (
                                <div className="flex items-center gap-2.5 px-3 py-1.5 bg-amber-50/60 dark:bg-amber-900/10">
                                  <Award className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                  <span className="text-xs font-bold text-amber-700 dark:text-amber-400">{loyaltyPoints} pts</span>
                                </div>
                              )}
                            </div>

                            {/* ── Saved addresses selector (within verified card) ── */}
                            {locations.length > 1 && (
                              <div className="mt-3">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">Dirección de entrega</p>
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
                                        <p className={cn("text-sm font-semibold truncate", selectedLocId === loc.id ? "text-primary" : "text-gray-900 dark:text-foreground")}>{loc.location}</p>
                                        {loc.reference && <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1"><Home className="h-3 w-3 shrink-0" />{loc.reference}</p>}
                                      </div>
                                    </button>
                                  ))}
                                  <button type="button" onClick={() => { setEditingCustomerData(true); handleNewAddress(); }}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-sm font-semibold text-gray-400 hover:text-primary hover:border-primary/30 transition-all">
                                    <MapPin className="h-4 w-4" /> Agregar nueva dirección
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          /* ── CASO B: sin cuenta / editando → formulario completo ── */
                          <>
                            {/* DNI, Name and Phone */}
                            <div className="grid md:grid-cols-3 gap-4">
                              <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">DNI</label>
                                <div className="relative">
                                  <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                  <input
                                    value={dni}
                                    onChange={(e) => setDni(e.target.value.replace(/[^\d]/g, "").slice(0, 8))}
                                    placeholder="Ej: 12345678"
                                    inputMode="numeric"
                                    maxLength={8}
                                    className={cn(
                                      "w-full pl-10 pr-10 py-3 rounded-xl border-2 text-gray-900 dark:text-foreground dark:bg-transparent placeholder:text-gray-300 focus:ring-2 outline-none transition-all text-sm",
                                      dniLookupStatus === "success"
                                        ? "border-emerald-400 focus:border-emerald-500 focus:ring-emerald-200"
                                        : dniLookupStatus === "error"
                                        ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                                        : "border-gray-200 focus:border-primary focus:ring-primary/20"
                                    )}
                                  />
                                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                                    {dniLookupStatus === "loading" ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : dniLookupStatus === "success" ? (
                                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                    ) : null}
                                  </div>
                                </div>
                                <p className={cn(
                                  "text-[11px] mt-1 font-semibold",
                                  dniLookupStatus === "error"
                                    ? "text-red-500"
                                    : dniLookupStatus === "success"
                                    ? "text-emerald-600"
                                    : "text-gray-400"
                                )}>{dniLookupMessage}</p>
                              </div>
                              {/* Name */}
                              <div className="md:col-span-1">
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
                                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, ""))} placeholder="Ej: 987654321" maxLength={9}
                                    className={cn("w-full pl-10 pr-4 py-3 rounded-xl border-2 text-gray-900 dark:text-foreground dark:bg-transparent placeholder:text-gray-300 focus:ring-2 outline-none transition-all text-sm",
                                      phone.length === 0 ? "border-gray-200 focus:border-primary focus:ring-primary/20"
                                      : phoneValidation.valid ? "border-emerald-400 focus:border-emerald-500 focus:ring-emerald-200"
                                      : "border-gray-200 focus:border-primary focus:ring-primary/20"
                                    )} />
                                </div>
                                {phone.length > 0 && phoneValidation.hint && (
                                  <p className={`text-[11px] mt-1 font-semibold ${phoneValidation.color}`}>{phoneValidation.hint}</p>
                                )}
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
                                <div className="lg:grid lg:grid-cols-2 lg:gap-4 space-y-4 lg:space-y-0">
                                  {/* Columna izquierda: Dirección */}
                                  <div className="space-y-3">
                                    <div>
                                      <div className="flex items-center justify-between mb-2">
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Dirección *</label>
                                        <button type="button" onClick={() => { setUseDetailedAddress(!useDetailedAddress); if (!useDetailedAddress && streetName && streetType) { setLocation(`${streetType} ${streetName}${streetNumber ? ' ' + streetNumber : ''}`); } }}
                                          className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
                                          {useDetailedAddress ? "Dirección simple" : "Dirección detallada"}
                                        </button>
                                      </div>
                                      
                                      {useDetailedAddress ? (
                                        <div className="space-y-3">
                                          <div className="grid grid-cols-2 gap-2">
                                            <div>
                                              <select value={streetType} onChange={(e) => { setStreetType(e.target.value); if (streetName) setLocation(`${e.target.value} ${streetName}${streetNumber ? ' ' + streetNumber : ''}`); }}
                                                className="w-full px-3 py-3 rounded-xl border-2 border-gray-200 text-gray-900 dark:text-foreground dark:bg-transparent focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm">
                                                <option value="Calle">Calle</option>
                                                <option value="Avenida">Avenida</option>
                                                <option value="Jirón">Jirón</option>
                                                <option value="Pasaje">Pasaje</option>
                                                <option value="Jr.">Jr.</option>
                                                <option value="Av.">Av.</option>
                                                <option value="Psje.">Psje.</option>
                                                <option value="Mz.">Manzana</option>
                                                <option value="Lote">Lote</option>
                                              </select>
                                            </div>
                                            <div>
                                              <input required value={streetNumber} onChange={(e) => { setStreetNumber(e.target.value); if (streetName) setLocation(`${streetType} ${streetName} ${e.target.value}`); }}
                                                placeholder="N° / Lote"
                                                className="w-full px-3 py-3 rounded-xl border-2 border-gray-200 text-gray-900 dark:text-foreground dark:bg-transparent placeholder:text-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm" />
                                            </div>
                                          </div>
                                          <div>
                                            <input required value={streetName} onChange={(e) => { setStreetName(e.target.value); setLocation(`${streetType} ${e.target.value}${streetNumber ? ' ' + streetNumber : ''}`); setMapCoords(coordsFromLocation(`${streetType} ${e.target.value}${streetNumber ? ' ' + streetNumber : ''}`, businessLat, businessLon)); }}
                                              placeholder="Nombre de la vía (ej: Ucayali, San Martín)"
                                              className="w-full px-3 py-3 rounded-xl border-2 border-gray-200 text-gray-900 dark:text-foreground dark:bg-transparent placeholder:text-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm" />
                                          </div>
                                          {location && (
                                            <div className="px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
                                              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Vista previa:</p>
                                              <p className="text-sm font-semibold text-primary">{location}</p>
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="relative">
                                          <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                          <input required value={location} onChange={(e) => { setLocation(e.target.value); setMapCoords(coordsFromLocation(e.target.value, businessLat, businessLon)); }}
                                            placeholder="Ej: Jr. Ucayali 450"
                                            className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 text-gray-900 dark:text-foreground dark:bg-transparent placeholder:text-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm" />
                                        </div>
                                      )}
                                      
                                      <button type="button" onClick={useGeo} disabled={loadingGeo}
                                        className="group relative mt-2 w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl border-2 border-primary bg-linear-to-r from-primary to-primary-dark text-white text-sm font-bold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 active:scale-[0.97] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden">
                                        {/* Animated background pulse */}
                                        {!loadingGeo && (
                                          <span className="absolute inset-0 bg-white/20 animate-[pulse_2s_ease-in-out_infinite]" />
                                        )}
                                        {/* Animated shine effect */}
                                        {!loadingGeo && (
                                          <span className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/30 to-transparent group-hover:translate-x-full transition-transform duration-700" />
                                        )}
                                        {/* Icon with animation */}
                                        <span className={cn("relative z-10", !loadingGeo && "animate-bounce")}>
                                          {loadingGeo ? <Loader2 className="h-5 w-5 animate-spin" /> : <Navigation className="h-5 w-5" />}
                                        </span>
                                        {/* Text */}
                                        <span className="relative z-10 flex flex-col items-start">
                                          <span className="text-base font-extrabold">
                                            {loadingGeo ? "Obteniendo ubicación..." : "📍 Usar mi ubicación GPS"}
                                          </span>
                                          {!loadingGeo && (
                                            <span className="text-[10px] font-medium text-white/80 uppercase tracking-wide">Preciso y rápido</span>
                                          )}
                                        </span>
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
                                        <div className="rounded-xl overflow-hidden" style={{ height: 200 }}>
                                          <LeafletMap lat={mapCoords.lat} lon={mapCoords.lon} zoom={15} height={200}
                                            onPick={(lt, lg, addr) => { setMapCoords({ lat: lt, lon: lg }); setLocation(addr); fetchReferenceSuggestion(lt, lg); }} />
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  
                                  {/* Columna derecha: Referencia y Notas */}
                                  <div className="space-y-3">
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
                                    
                                    {/* Mensaje personalizado */}
                                    <CheckoutNotesField notes={notes} onNotesChange={setNotes} rows={3} />
                                  </div>
                                </div>
                              </>
                            )}
                          </>
                        )}

                        {/* Notas mejoradas si hay dirección guardada */}
                        {((foundCustomer !== null || (customer !== null && !skippedAccount)) && !editingCustomerData) && (
                          <CheckoutNotesField notes={notes} onNotesChange={setNotes} rows={2} />
                        )}

                        {/* ── Horario de entrega ────────────── */}
                        <CheckoutDeliverySchedule
                          deliverySlot={deliverySlot}
                          onDeliverySlotChange={setDeliverySlot}
                          deliveryDate={deliveryDate}
                          onDeliveryDateChange={setDeliveryDate}
                          deliveryTime={deliveryTime}
                          onDeliveryTimeChange={setDeliveryTime}
                          useCustomDateTime={useCustomDateTime}
                          onUseCustomDateTimeChange={setUseCustomDateTime}
                        />

                        {/* datos validation error */}
                        {dataError && (
                          <p className="text-red-600 dark:text-red-400 text-sm text-center flex items-center justify-center gap-1.5">
                            <span aria-hidden>⚠</span>{dataError}
                          </p>
                        )}

                        {/* datos → continue to pago */}
                        <div className="flex gap-3 pt-1">
                          <m.button type="button" onClick={() => setStep("cuenta")}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.96 }}
                            className="flex-1 py-3 rounded-xl border-2 border-gray-200 dark:border-zinc-700 text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                            ← Volver
                          </m.button>
                          <m.button type="submit"
                            whileHover={{ scale: 1.03, y: -1 }}
                            whileTap={{ scale: 0.96 }}
                            className="flex-1 py-3.5 rounded-xl bg-linear-to-r from-primary to-primary-dark text-white font-extrabold text-sm transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2">
                            Continuar al pago <ChevronRight className="h-4 w-4" />
                          </m.button>
                        </div>
                      </form>
                    </m.div>
                  )}

                  {/* ── Step: Pago ───────────────────────── */}
                  {step === "pago" && (
                    <m.div key="pago" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
                      <form onSubmit={handlePaymentSubmit} className="px-6 py-5">
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_360px] divide-y sm:divide-y-0 sm:divide-x divide-gray-100 dark:divide-card-border gap-0">

                          {/* ─── Columna izquierda: detalle del pedido ─── */}
                          <CheckoutOrderReview
                            items={items}
                            finalTotal={finalTotal}
                            discount={discount}
                            location={location}
                            reference={reference}
                            effectiveCustomerLocation={effectiveCustomer?.location}
                            effectiveCustomerReference={effectiveCustomer?.reference}
                            onEditAddress={() => setStep("datos")}
                          />

                          {/* ─── Columna derecha: pago y resumen ─── */}
                          <CheckoutPaymentSection
                            tip={tip}
                            onTipChange={setTip}
                            couponCode={couponCode}
                            onCouponCodeChange={setCouponCode}
                            couponApplied={couponApplied}
                            couponDiscount={couponDiscount}
                            couponMsg={couponMsg}
                            validatingCoupon={validatingCoupon}
                            onValidateCoupon={validateCoupon}
                            onRemoveCoupon={() => { setCouponApplied(false); setCouponDiscount(0); setCouponCode(""); setCouponMsg(""); }}
                            total={total}
                            finalTotal={finalTotal}
                            discount={discount}
                            promo={promo}
                            tierDiscount={tierDiscount}
                            tierDiscountPct={tierDiscountPct}
                            loyaltyTier={loyaltyTier}
                            paymentMethod={paymentMethod}
                            onPaymentMethodChange={(method) => { setPaymentMethod(method); setShowPaymentHint(false); }}
                            yapeEnabled={yape.enabled}
                            cashEnabled={cashEnabled}
                            yape={yape}
                            yapeOpNumber={yapeOpNumber}
                            onYapeOpNumberChange={setYapeOpNumber}
                            showPaymentHint={showPaymentHint}
                            submitting={submitting}
                            submitError={submitError}
                            onBack={() => setStep("datos")}
                          />

                        </div>
                      </form>
                    </m.div>
                  )}

                  {/* ── Step: Éxito ──────────────────────── */}
                  {step === "exito" && (
                    <CheckoutSuccessStep orderId={orderId} onClose={closeCheckout} />
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

/* Sub-components extracted to components/checkout/ */
