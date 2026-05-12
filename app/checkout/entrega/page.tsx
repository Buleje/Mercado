"use client";

/**
 * /checkout/entrega — Step 3: direccion + metodo de pago.
 *
 * Sección editorial con 3 bloques:
 *   - Dirección (con geolocation + selects cascade Perú)
 *   - Método de pago (3 PaymentMethodCards: Efectivo / Yape / Plin)
 *   - Cupón por tienda + Puntos Buleje (si disponible)
 *
 * Auto-redirect a /carrito si esta vacio o /datos si faltan datos cliente.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  StickyNote,
  Wallet,
  Smartphone,
  CheckCircle2,
  Tag,
  Sparkles,
  AlertCircle,
  Navigation,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { useCheckoutData } from "@/hooks/use-checkout-data";
import { useCustomer } from "@/contexts/customer-context";
import CheckoutSummary from "@/components/marketplace/checkout/CheckoutSummary";
import PaymentMethodCard from "@/components/marketplace/checkout/PaymentMethodCard";
import AddressPicker from "@/components/marketplace/checkout/AddressPicker";
import { LocationConfirmModal } from "@/components/checkout/parts/LocationConfirmModal";
import {
  CheckoutTransitionOverlay,
  useCheckoutTransition,
} from "@/components/marketplace/checkout/CheckoutTransitionOverlay";
import { useSavedAddresses, type SavedAddress } from "@/hooks/use-saved-addresses";
import { csrfHeaders } from "@/lib/csrf-client";
// Round 23 (Performance): ubigeo dataset (~350KB) ya NO se importa en
// cliente. Se consume via fetch /api/marketplace/ubigeo y reverse-geocode
// server-side. Resultado: -350KB en el bundle de checkout (mayor ruta de
// conversión del marketplace).
type UbigeoEntry = { code: string; nombre: string };

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

type PaymentMethod = "efectivo" | "yape" | "plin";

const PAYMENT_METHODS: Array<{
  key: PaymentMethod;
  label: string;
  hint: string;
  Icon: typeof Wallet;
  brandColor?: string;
}> = [
  {
    key: "efectivo",
    label: "Efectivo",
    hint: "Pagás al recibir · sin tarjeta",
    Icon: Wallet,
  },
  {
    key: "yape",
    label: "Yape",
    hint: "Instantáneo · desde tu celular",
    Icon: Smartphone,
    brandColor: "#8a1bd4",
  },
  {
    key: "plin",
    label: "Plin",
    hint: "Instantáneo · desde tu banco",
    Icon: Smartphone,
    brandColor: "#1f86c7",
  },
];

// ── Labels y pills compartidos ─────────────────────────────────────────────
function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-2 block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]"
    >
      {children}
    </label>
  );
}

function pillCls(error?: boolean) {
  return cn(
    "w-full rounded-full border bg-[var(--surface-raised)] px-4 h-12",
    "text-[length:var(--ts-sm)] text-[var(--text-primary)]",
    "placeholder:text-[var(--text-tertiary)]",
    "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--surface-raised)]",
    error
      ? "border-[var(--data-error-500)] focus:ring-[var(--data-error-500)]/30"
      : "border-[var(--rule-base)] focus:border-[var(--accent)] focus:ring-[var(--accent-soft)]",
  );
}

function selectCls(error?: boolean) {
  return cn(pillCls(error), "appearance-none pr-10 bg-no-repeat bg-[right_1rem_center]");
}

// ── Section wrapper con kicker editorial ──────────────────────────────────
function SectionBox({
  kicker,
  title,
  icon: Icon,
  action,
  children,
}: {
  kicker: string;
  title: string;
  icon: typeof Wallet;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-6 sm:p-7 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="inline-flex items-center gap-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1.5">
            <span
              aria-hidden
              className="inline-flex h-[3px] w-6 rounded-full bg-[var(--accent)]"
            />
            <Icon className="h-3 w-3" strokeWidth={2} aria-hidden />
            {kicker}
          </p>
          <h2 className="text-lg sm:text-xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
            {title}
          </h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function CheckoutEntregaPage() {
  const router = useRouter();
  const { itemCount, grandTotal, byStore, totalByStore } = useMarketplaceCart();
  const {
    customer,
    address,
    payment,
    coupons,
    loyalty,
    setAddress,
    setPayment,
    setCouponForStore,
    setLoyalty,
    isAddressValid,
    isCustomerValid,
    couponDiscountTotal,
    loyaltyDiscountTotal,
  } = useCheckoutData();
  const [touched, setTouched] = useState(false);

  const [couponInputs, setCouponInputs] = useState<Record<string, string>>({});
  const [couponLoading, setCouponLoading] = useState<Record<string, boolean>>({});
  const [couponErrors, setCouponErrors] = useState<Record<string, string>>({});
  const [couponsUserOpened, setCouponsUserOpened] = useState(false);
  const hasAppliedCoupons = Object.keys(coupons).length > 0;
  const showCouponFields = couponsUserOpened || hasAppliedCoupons;

  const [loyaltyAvailable, setLoyaltyAvailable] = useState(0);
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);

  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoSuccess, setGeoSuccess] = useState(false);

  // Modal de confirmación con mapa: el cliente puede ajustar el pin GPS
  // antes de que se rellenen los campos del form. Mejora la precisión
  // sin obligar al cliente a editar lat/lon manualmente.
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [mapInitial, setMapInitial] = useState<{ lat: number; lon: number; address: string } | null>(null);
  const [mapLoading, setMapLoading] = useState(false);

  // Round 23: ubigeo cargado desde server (no más bundle de 350KB).
  const [departamentos, setDepartamentos] = useState<UbigeoEntry[]>([]);
  const [provincias, setProvincias] = useState<UbigeoEntry[]>([]);
  const [distritos, setDistritos] = useState<UbigeoEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/marketplace/ubigeo")
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: { items: UbigeoEntry[] }) => {
        if (!cancelled) setDepartamentos(data.items ?? []);
      })
      .catch(() => {
        /* fire-and-forget per CLAUDE.md rule #7 */
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!address.departmentCode) {
      setProvincias([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/marketplace/ubigeo?dep=${encodeURIComponent(address.departmentCode)}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: { items: UbigeoEntry[] }) => {
        if (!cancelled) setProvincias(data.items ?? []);
      })
      .catch(() => {
        /* fire-and-forget per CLAUDE.md rule #7 */
      });
    return () => { cancelled = true; };
  }, [address.departmentCode]);

  useEffect(() => {
    if (!address.departmentCode || !address.provinceCode) {
      setDistritos([]);
      return;
    }
    let cancelled = false;
    fetch(
      `/api/marketplace/ubigeo?dep=${encodeURIComponent(address.departmentCode)}&prov=${encodeURIComponent(address.provinceCode)}`,
    )
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: { items: UbigeoEntry[] }) => {
        if (!cancelled) setDistritos(data.items ?? []);
      })
      .catch(() => {
        /* fire-and-forget per CLAUDE.md rule #7 */
      });
    return () => { cancelled = true; };
  }, [address.departmentCode, address.provinceCode]);

  // Multi-address picker: direcciones guardadas de compras anteriores
  const { addresses: savedAddresses, removeAddress } = useSavedAddresses();
  const [activeAddressId, setActiveAddressId] = useState<string | null>(null);
  const [useNewAddress, setUseNewAddress] = useState(false);

  // Auto-selecciona la más reciente al montar (una sola vez)
  useEffect(() => {
    if (useNewAddress) return;
    if (activeAddressId) return;
    if (savedAddresses.length === 0) return;
    const newest = [...savedAddresses].sort((a, b) =>
      a.savedAt < b.savedAt ? 1 : -1,
    )[0];
    setActiveAddressId(newest.id);
    // Llena los campos del form con la seleccionada
    setAddress({
      address: newest.address,
      notes: newest.notes,
      departmentCode: newest.departmentCode,
      departmentName: newest.departmentName,
      provinceCode: newest.provinceCode,
      provinceName: newest.provinceName,
      districtCode: newest.districtCode,
      districtName: newest.districtName,
      zone: newest.zone,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedAddresses.length]);

  const handlePickAddress = useCallback(
    (addr: SavedAddress) => {
      setActiveAddressId(addr.id);
      setUseNewAddress(false);
      setAddress({
        address: addr.address,
        notes: addr.notes,
        departmentCode: addr.departmentCode,
        departmentName: addr.departmentName,
        provinceCode: addr.provinceCode,
        provinceName: addr.provinceName,
        districtCode: addr.districtCode,
        districtName: addr.districtName,
        zone: addr.zone,
      });
    },
    [setAddress],
  );

  const handleUseNewAddress = useCallback(() => {
    setActiveAddressId(null);
    setUseNewAddress(true);
    setAddress({
      address: "",
      notes: "",
      departmentCode: "",
      departmentName: "",
      provinceCode: "",
      provinceName: "",
      districtCode: "",
      districtName: "",
      zone: "",
    });
  }, [setAddress]);

  const handleDepartmentChange = useCallback(
    (depCode: string) => {
      const dep = departamentos.find((d) => d.code === depCode);
      setAddress({
        departmentCode: dep?.code ?? "",
        departmentName: dep?.nombre ?? "",
        provinceCode: "",
        provinceName: "",
        districtCode: "",
        districtName: "",
      });
    },
    [setAddress],
  );

  const handleProvinceChange = useCallback(
    (provCode: string) => {
      const prov = provincias.find((p) => p.code === provCode);
      setAddress({
        provinceCode: prov?.code ?? "",
        provinceName: prov?.nombre ?? "",
        districtCode: "",
        districtName: "",
      });
    },
    [setAddress, provincias],
  );

  const handleDistrictChange = useCallback(
    (distCode: string) => {
      const dist = distritos.find((d) => d.code === distCode);
      setAddress({
        districtCode: dist?.code ?? "",
        districtName: dist?.nombre ?? "",
        zone: dist
          ? `${dist.nombre}, ${address.provinceName}, ${address.departmentName}`
          : "",
      });
    },
    [setAddress, distritos, address.provinceName, address.departmentName],
  );

  const handleUseCurrentLocation = useCallback(async () => {
    if (!("geolocation" in navigator)) {
      setGeoError("Tu navegador no soporta ubicación.");
      return;
    }

    setGeoLoading(true);
    setGeoError(null);
    setGeoSuccess(false);

    // Bug conocido: getCurrentPosition devuelve PERMISSION_DENIED aunque el
    // usuario SÍ dio permiso cuando el estado del navegador está cacheado
    // como 'denied' o cuando la página no es HTTPS. Consultamos el Permissions
    // API primero para dar un mensaje preciso.
    let permissionState: PermissionState | "unknown" = "unknown";
    if ("permissions" in navigator) {
      try {
        const result = await navigator.permissions.query({
          name: "geolocation" as PermissionName,
        });
        permissionState = result.state;
      } catch {
        permissionState = "unknown";
      }
    }

    if (permissionState === "denied") {
      setGeoLoading(false);
      setGeoError(
        "El permiso está bloqueado en tu navegador. Tocá el candado 🔒 en la barra de direcciones → Permisos → permití ubicación → recargá.",
      );
      return;
    }

    // Marcamos si el permiso no estaba bloqueado a nivel navegador —
    // usamos un booleano en vez de comparar el estado dentro del closure
    // para evitar el narrowing de TS tras el guard previo.
    const wasExplicitlyDenied = false; // (si llega aquí, no era "denied")
    const geoOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 60000,
    };

    // Promesa wrapper con reintento — algunos browsers fallan el primer
    // getCurrentPosition después de conceder permiso (bug conocido de Chrome).
    const getPositionWithRetry = (attempt = 0): Promise<GeolocationPosition> =>
      new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          (err) => {
            // Si el primer intento falla con PERMISSION_DENIED pero el estado
            // NO era 'denied' (era 'prompt' o 'granted' o 'unknown'),
            // reintentamos una vez (~400ms espera).
            if (
              attempt === 0 &&
              err.code === err.PERMISSION_DENIED &&
              !wasExplicitlyDenied
            ) {
              setTimeout(() => {
                getPositionWithRetry(1).then(resolve).catch(reject);
              }, 400);
              return;
            }
            reject(err);
          },
          geoOptions,
        );
      });

    try {
      const pos = await getPositionWithRetry();
      const { latitude, longitude } = pos.coords;

      // Pre-fetch de la dirección con los coords iniciales del GPS para
      // mostrarla como hint en el modal mientras el cliente ajusta el pin.
      // Si falla, el modal igual se abre — sólo perdemos el preview textual.
      let initialAddress = "";
      try {
        const r = await fetch(
          `/api/marketplace/reverse-geocode?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`,
        );
        if (r.ok) {
          const data = await r.json();
          initialAddress = (data.displayName as string | undefined) ?? "";
        }
      } catch {
        /* fire-and-forget per CLAUDE.md rule #7 */
      }

      // Abrir el modal de confirmación. El reverse-geocode definitivo
      // (con coords posiblemente ajustadas por drag del pin) ocurre en
      // handleMapConfirm() tras "Confirmar ubicación".
      setMapInitial({ lat: latitude, lon: longitude, address: initialAddress });
      setMapModalOpen(true);
    } catch (err) {
      const ge = err as GeolocationPositionError;
      if (ge?.code === 1) {
        setGeoError(
          "Bloqueaste la ubicación. Tocá el candado 🔒 en la barra de direcciones → Permisos → permití ubicación → recargá.",
        );
      } else if (ge?.code === 2) {
        setGeoError("Ubicación no disponible. Revisa tu GPS o conexión.");
      } else if (ge?.code === 3) {
        setGeoError("Tiempo agotado. Intentá de nuevo.");
      } else {
        setGeoError("No pudimos identificar tu dirección. Llená los campos manualmente.");
      }
    } finally {
      setGeoLoading(false);
    }
  }, []);

  // Confirma la ubicación tras el ajuste del mapa. Aquí re-fetchamos el
  // reverse-geocode con las coords FINALES (post-drag) y poblamos todos
  // los campos del form: departamento, provincia, distrito + dirección.
  const handleMapConfirm = useCallback(
    async (lat: number, lon: number, displayAddr: string) => {
      setMapLoading(true);
      try {
        const r = await fetch(
          `/api/marketplace/reverse-geocode?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lon)}`,
        );
        if (!r.ok) throw new Error("reverse-geocode failed");
        const data = await r.json();
        const street = (data.street as string | null) ?? "";
        const match = (data.match ?? {}) as {
          departamento?: { code: string; nombre: string } | null;
          provincia?: { code: string; nombre: string } | null;
          distrito?: { code: string; nombre: string } | null;
        };

        setAddress({
          address: street || displayAddr || address.address,
          departmentCode: match.departamento?.code ?? "",
          departmentName: match.departamento?.nombre ?? "",
          provinceCode: match.provincia?.code ?? "",
          provinceName: match.provincia?.nombre ?? "",
          districtCode: match.distrito?.code ?? "",
          districtName: match.distrito?.nombre ?? "",
          zone:
            match.distrito && match.provincia && match.departamento
              ? `${match.distrito.nombre}, ${match.provincia.nombre}, ${match.departamento.nombre}`
              : (data.displayName as string | undefined) ?? displayAddr ?? "",
        });

        setGeoSuccess(true);
        setTimeout(() => setGeoSuccess(false), 3500);
        setUseNewAddress(true); // marcar que el cliente está usando una dirección nueva
        setActiveAddressId(null);
      } catch {
        setGeoError("No pudimos identificar tu dirección. Llená los campos manualmente.");
      } finally {
        setMapLoading(false);
        setMapModalOpen(false);
      }
    },
    [setAddress, address.address],
  );

  const { isPending, pendingLabel, navigateTo } = useCheckoutTransition();
  const { hydrated } = useCheckoutData();

  // Espera a que el carrito y los datos del checkout estén hidratados antes
  // de decidir si redirige (fix de la race que mandaba a /datos).
  const [cartReady, setCartReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setCartReady(true), 250);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!cartReady || !hydrated) return;
    if (itemCount === 0) router.replace("/marketplace/carrito");
    else if (!isCustomerValid) router.replace("/checkout/datos");
  }, [cartReady, hydrated, itemCount, isCustomerValid, router]);

  // Prefetch del próximo paso (acelera la navegación a /confirmar)
  useEffect(() => {
    router.prefetch("/checkout/confirmar");
  }, [router]);

  const { customer: savedCustomer } = useCustomer();
  useEffect(() => {
    if (!savedCustomer) return;
    const next: Partial<typeof address> = {};
    if (!address.address && savedCustomer.addressLine) next.address = savedCustomer.addressLine;
    if (!address.notes && savedCustomer.reference) next.notes = savedCustomer.reference;
    if (!address.departmentCode && savedCustomer.departmentCode) {
      next.departmentCode = savedCustomer.departmentCode;
      next.departmentName = savedCustomer.departmentName;
    }
    if (!address.provinceCode && savedCustomer.provinceCode) {
      next.provinceCode = savedCustomer.provinceCode;
      next.provinceName = savedCustomer.provinceName;
    }
    if (!address.districtCode && savedCustomer.districtCode) {
      next.districtCode = savedCustomer.districtCode;
      next.districtName = savedCustomer.districtName;
      next.zone = [savedCustomer.districtName, savedCustomer.provinceName, savedCustomer.departmentName]
        .filter(Boolean)
        .join(", ");
    }
    if (Object.keys(next).length > 0) setAddress(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedCustomer]);

  useEffect(() => {
    const phone = customer.phone.trim().replace(/\D/g, "");
    if (phone.length < 6) {
      setLoyaltyAvailable(0);
      return;
    }
    const ctrl = new AbortController();
    setLoyaltyLoading(true);
    fetch(`/api/marketplace/loyalty?phone=${encodeURIComponent(phone)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const pts = d?.data?.points ?? 0;
        setLoyaltyAvailable(typeof pts === "number" ? pts : 0);
      })
      .catch(() => {})
      .finally(() => setLoyaltyLoading(false));
    return () => ctrl.abort();
  }, [customer.phone]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setTouched(true);
      if (!isAddressValid) return;
      navigateTo("/checkout/confirmar", "Preparando tu resumen");
    },
    [isAddressValid, navigateTo],
  );

  const validateCoupon = useCallback(
    async (storeSlug: string) => {
      const code = (couponInputs[storeSlug] || "").trim();
      if (!code) return;
      const cartTotal = totalByStore[storeSlug]?.total ?? 0;
      setCouponLoading((p) => ({ ...p, [storeSlug]: true }));
      setCouponErrors((p) => ({ ...p, [storeSlug]: "" }));
      try {
        const res = await fetch("/api/marketplace/coupons/validate", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ code, storeSlug, cartTotal }),
        });
        const data = await res.json();
        if (data.valid) {
          setCouponForStore(storeSlug, {
            code: data.code || code,
            discount: Number(data.discount) || 0,
            description: data.description,
          });
          setCouponInputs((p) => ({ ...p, [storeSlug]: "" }));
        } else {
          setCouponErrors((p) => ({ ...p, [storeSlug]: data.reason || "Cupón inválido" }));
        }
      } catch {
        setCouponErrors((p) => ({ ...p, [storeSlug]: "Error de conexión" }));
      } finally {
        setCouponLoading((p) => ({ ...p, [storeSlug]: false }));
      }
    },
    [couponInputs, totalByStore, setCouponForStore],
  );

  const removeCoupon = useCallback(
    (storeSlug: string) => setCouponForStore(storeSlug, null),
    [setCouponForStore],
  );

  const totalAfterCoupons = Math.max(0, grandTotal - couponDiscountTotal);
  const maxRedeemByCart = totalAfterCoupons * 100;
  const maxRedeem = Math.min(loyaltyAvailable, Math.floor(maxRedeemByCart / 100) * 100);

  const showAddressError = touched && !isAddressValid;
  const cashAmount = Number(payment.cashAmount || 0);
  const cashChange = cashAmount - grandTotal;
  const cashShort = cashAmount > 0 && cashAmount < grandTotal;

  if (itemCount === 0) return null;

  return (
    <>
      <div className="pt-6 sm:pt-8 pb-6">
        <Link
          href="/checkout/datos"
          className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          Volver a tus datos
        </Link>
        <h1 className="text-2xl sm:text-3xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
          Entrega y pago
        </h1>
        <p className="mt-1 text-[length:var(--ts-sm)] text-[var(--text-tertiary)]">
          Elige dónde recibes y cómo pagás.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 sm:gap-8 items-start pb-16">
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          {/* ── Direcciones guardadas (si hay) ─────────────────────── */}
          {savedAddresses.length > 0 && !useNewAddress && (
            <AddressPicker
              addresses={savedAddresses}
              activeId={activeAddressId}
              onSelect={handlePickAddress}
              onNew={handleUseNewAddress}
              onRemove={(id) => {
                removeAddress(id);
                if (id === activeAddressId) setActiveAddressId(null);
              }}
            />
          )}

          {/* ── DIRECCIÓN ─────────────────────────────────────────── */}
          <SectionBox
            kicker="Dirección"
            title="¿A dónde te lo llevamos?"
            icon={MapPin}
          >
            {/* ── Botón GRANDE animado de ubicación actual ───────── */}
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={geoLoading}
              aria-label="Poner mi ubicación actual"
              className={cn(
                "geo-cta group relative w-full overflow-hidden rounded-2xl px-6 py-5",
                "flex items-center gap-4 text-left",
                "transition-all duration-300",
                "disabled:cursor-wait",
                geoSuccess
                  ? "border-2 border-[var(--accent)] bg-[var(--accent-600,var(--accent))] text-white"
                  : "border-2 border-[var(--accent)]/40 bg-linear-to-br from-[var(--accent-soft)] via-[var(--accent-soft)] to-[var(--surface-raised)] text-[var(--accent)] hover:border-[var(--accent)] hover:shadow-[0_12px_36px_-12px_var(--accent)] hover:-translate-y-0.5",
              )}
            >
              {/* Shimmer animado (se mueve horizontalmente) */}
              {!geoLoading && !geoSuccess && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-linear-to-r from-transparent via-white/40 to-transparent animate-[geoShimmer_2.2s_linear_infinite]"
                />
              )}

              {/* Icono con halo pulse */}
              <span className="relative flex-shrink-0">
                {!geoLoading && !geoSuccess && (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-[var(--accent)]/40 animate-ping"
                  />
                )}
                <span
                  className={cn(
                    "relative inline-flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-colors",
                    geoSuccess
                      ? "bg-white text-[var(--accent)]"
                      : "bg-[var(--accent-600,var(--accent))] text-white",
                  )}
                >
                  {geoSuccess ? (
                    <CheckCircle2 className="h-7 w-7" strokeWidth={2.25} aria-hidden />
                  ) : (
                    <Navigation
                      className={cn(
                        "h-6 w-6 transition-transform",
                        geoLoading ? "animate-spin" : "group-hover:scale-110 group-hover:rotate-12",
                      )}
                      strokeWidth={2}
                      aria-hidden
                    />
                  )}
                </span>
              </span>

              {/* Texto */}
              <span className="relative flex-1 min-w-0">
                <span className="block text-xs font-bold uppercase tracking-[var(--ls-wider)] opacity-80 mb-0.5">
                  {geoSuccess
                    ? "¡Listo!"
                    : geoLoading
                      ? "Buscando tu zona..."
                      : "1 toque · Autollenar"}
                </span>
                <span className="block text-lg sm:text-xl font-black tracking-[var(--ls-tight)]">
                  {geoSuccess
                    ? "Dirección autollenada"
                    : geoLoading
                      ? "Obteniendo GPS"
                      : "Poner Mi Ubicación Actual"}
                </span>
                {!geoLoading && !geoSuccess && (
                  <span className="block mt-1 text-[length:var(--ts-xs)] font-medium opacity-80">
                    Departamento, provincia, distrito y dirección — todo de un saque
                  </span>
                )}
              </span>

              {/* Arrow indicator */}
              {!geoLoading && !geoSuccess && (
                <span
                  aria-hidden
                  className="relative hidden sm:inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)]/10 text-[var(--accent)] group-hover:bg-[var(--accent)] group-hover:text-white group-hover:translate-x-1 transition-all"
                >
                  <ArrowRight className="h-5 w-5" strokeWidth={2.25} />
                </span>
              )}
            </button>

            {geoError && (
              <div className="mt-1 flex items-start gap-2 rounded-2xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-50)] px-4 py-3 text-[length:var(--ts-xs)] text-[var(--data-error-500)]">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={2} aria-hidden />
                <p className="leading-relaxed font-semibold">{geoError}</p>
              </div>
            )}

            <div>
              <Label htmlFor="ck-address">Calle y número</Label>
              <input
                id="ck-address"
                type="text"
                value={address.address}
                onChange={(e) => setAddress({ address: e.target.value })}
                onBlur={() => setTouched(true)}
                placeholder="Ej: Jr. Los Olivos 123"
                maxLength={300}
                autoComplete="street-address"
                required
                className={pillCls(showAddressError)}
              />
              {showAddressError && (
                <p className="mt-2 ml-4 text-[length:var(--ts-2xs)] text-[var(--data-error-500)]">
                  Ingresá una dirección válida (mínimo 5 caracteres).
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="ck-dept">Departamento</Label>
                <select
                  id="ck-dept"
                  value={address.departmentCode}
                  onChange={(e) => handleDepartmentChange(e.target.value)}
                  className={selectCls(false)}
                >
                  <option value="">Seleccioná</option>
                  {departamentos.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="ck-prov">Provincia</Label>
                <select
                  id="ck-prov"
                  value={address.provinceCode}
                  onChange={(e) => handleProvinceChange(e.target.value)}
                  disabled={!address.departmentCode}
                  className={cn(selectCls(false), "disabled:opacity-50 disabled:cursor-not-allowed")}
                >
                  <option value="">Seleccioná</option>
                  {/* Option fantasma: si vino del GPS o dirección guardada y
                      el fetch de provincias aún no llegó, mostramos el nombre
                      ya cargado para evitar que el select aparezca vacío. */}
                  {address.provinceCode &&
                    !provincias.find((p) => p.code === address.provinceCode) && (
                      <option value={address.provinceCode}>
                        {address.provinceName || "Cargando…"}
                      </option>
                    )}
                  {provincias.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="ck-dist">Distrito</Label>
                <select
                  id="ck-dist"
                  value={address.districtCode}
                  onChange={(e) => handleDistrictChange(e.target.value)}
                  disabled={!address.provinceCode}
                  className={cn(selectCls(false), "disabled:opacity-50 disabled:cursor-not-allowed")}
                >
                  <option value="">Seleccioná</option>
                  {address.districtCode &&
                    !distritos.find((d) => d.code === address.districtCode) && (
                      <option value={address.districtCode}>
                        {address.districtName || "Cargando…"}
                      </option>
                    )}
                  {distritos.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label htmlFor="ck-notes">Referencia o instrucciones</Label>
              <div className="relative">
                <StickyNote
                  className="absolute left-4 top-4 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <textarea
                  id="ck-notes"
                  value={address.notes}
                  onChange={(e) => setAddress({ notes: e.target.value })}
                  placeholder="Tocar el timbre · casa azul · cerca de la esquina..."
                  rows={3}
                  maxLength={500}
                  className={cn(
                    "w-full rounded-2xl border bg-[var(--surface-raised)] pl-11 pr-4 py-3",
                    "text-[length:var(--ts-sm)] text-[var(--text-primary)]",
                    "placeholder:text-[var(--text-tertiary)]",
                    "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--surface-raised)]",
                    "border-[var(--rule-base)] focus:border-[var(--accent)] focus:ring-[var(--accent-soft)]",
                    "resize-none",
                  )}
                />
              </div>
            </div>
          </SectionBox>

          {/* ── PAGO ──────────────────────────────────────────────── */}
          <SectionBox kicker="Método de pago" title="¿Cómo te queda más cómodo?" icon={Wallet}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {PAYMENT_METHODS.map(({ key, label, hint, Icon, brandColor }) => (
                <PaymentMethodCard
                  key={key}
                  id={key}
                  name={label}
                  subtitle={hint}
                  icon={Icon}
                  brandColor={brandColor}
                  selected={payment.method === key}
                  onSelect={() => setPayment({ method: key })}
                />
              ))}
            </div>

            {payment.method === "efectivo" && (
              <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5 space-y-3">
                <div>
                  <Label htmlFor="ck-cash">Calculadora de vuelto (opcional)</Label>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center rounded-full bg-[var(--surface-raised)] border border-[var(--rule-base)] h-12 px-4 text-[length:var(--ts-sm)] font-bold text-[var(--text-secondary)]">
                      S/
                    </span>
                    <input
                      id="ck-cash"
                      type="number"
                      min={0}
                      step="0.10"
                      value={payment.cashAmount}
                      onChange={(e) => setPayment({ cashAmount: e.target.value })}
                      placeholder={grandTotal.toFixed(2)}
                      className={cn(pillCls(false), "pl-4")}
                    />
                  </div>
                </div>
                {cashAmount >= grandTotal && cashAmount > 0 && (
                  <p className="text-[length:var(--ts-xs)] text-[var(--accent)] font-bold">
                    Tu vuelto será {fmt(cashChange)}
                  </p>
                )}
                {cashShort && (
                  <p className="text-[length:var(--ts-xs)] text-[var(--data-error-500)] font-semibold">
                    Faltan {fmt(grandTotal - cashAmount)} para cubrir el total.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {[10, 20, 50, 100, 200].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setPayment({ cashAmount: String(v) })}
                      className="rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 h-8 text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] hover:border-[var(--accent)]/40 transition-colors"
                    >
                      S/{v}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(payment.method === "yape" || payment.method === "plin") && (
              <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5 text-[length:var(--ts-xs)] text-[var(--text-secondary)] leading-relaxed">
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
                  ¿Cómo funciona?
                </p>
                <ol className="list-decimal pl-5 space-y-1 marker:text-[var(--accent)] marker:font-bold">
                  <li>Confirmá tu pedido en la siguiente página.</li>
                  <li>El vendedor te enviará su número de {payment.method === "yape" ? "Yape" : "Plin"} por WhatsApp.</li>
                  <li>Transferí el monto exacto y manda el comprobante.</li>
                </ol>
              </div>
            )}
          </SectionBox>

          {/* ── CUPONES (colapsable por default) ──────────────────── */}
          <SectionBox
            kicker="Cupones"
            title="¿Tienes un código?"
            icon={Tag}
            action={
              showCouponFields && !hasAppliedCoupons ? (
                <button
                  type="button"
                  onClick={() => setCouponsUserOpened(false)}
                  className="text-[length:var(--ts-xs)] font-bold text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
                >
                  Ocultar
                </button>
              ) : null
            }
          >
            {!showCouponFields ? (
              <button
                type="button"
                onClick={() => setCouponsUserOpened(true)}
                className="w-full rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3 text-left text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors inline-flex items-center justify-between gap-2"
              >
                <span className="inline-flex items-center gap-2">
                  <Tag className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  Agregá tu código de cupón
                </span>
                <span aria-hidden>+</span>
              </button>
            ) : (
              <>
            <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] -mt-2">
              Un cupón por cada tienda. El descuento se refleja en el total.
            </p>

            <div className="space-y-3">
              {Object.keys(byStore).map((sid) => {
                const g = byStore[sid];
                const slug = g.storeSlug;
                const applied = coupons[slug];
                const inputVal = couponInputs[slug] ?? "";
                const isLoading = !!couponLoading[slug];
                const err = couponErrors[slug];
                return (
                  <div key={sid} className="space-y-2">
                    <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                      {g.storeName}
                    </p>
                    {applied ? (
                      <div className="flex items-center justify-between rounded-full border-2 border-[var(--accent)]/30 bg-[var(--accent-soft)] pl-4 pr-2 py-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2
                            className="h-4 w-4 text-[var(--accent)] shrink-0"
                            strokeWidth={2.5}
                            aria-hidden
                          />
                          <span className="text-[length:var(--ts-xs)] font-bold text-[var(--text-primary)] truncate">
                            {applied.code}
                          </span>
                          <span className="text-[length:var(--ts-xs)] text-[var(--accent)] tabular-nums font-bold shrink-0">
                            −{fmt(applied.discount)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeCoupon(slug)}
                          className="inline-flex items-center justify-center rounded-full bg-[var(--surface-raised)] px-3 h-7 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors"
                        >
                          Quitar
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={inputVal}
                          onChange={(e) =>
                            setCouponInputs((p) => ({ ...p, [slug]: e.target.value.toUpperCase() }))
                          }
                          placeholder="Código de cupón"
                          maxLength={30}
                          aria-label={`Cupón para ${g.storeName}`}
                          className={cn(pillCls(!!err), "uppercase tracking-wider font-semibold")}
                        />
                        <button
                          type="button"
                          onClick={() => validateCoupon(slug)}
                          disabled={isLoading || !inputVal.trim()}
                          className={cn(
                            "shrink-0 inline-flex items-center justify-center rounded-full px-5 h-12",
                            "text-[length:var(--ts-xs)] font-bold transition-colors",
                            "bg-[var(--surface-sunken)] text-[var(--text-primary)] border border-[var(--rule-base)]",
                            "hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] hover:border-[var(--accent)]/40",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                          )}
                        >
                          {isLoading ? "..." : "Aplicar"}
                        </button>
                      </div>
                    )}
                    {err && !applied && (
                      <p className="text-[length:var(--ts-2xs)] text-[var(--data-error-500)] inline-flex items-center gap-1 ml-4">
                        <AlertCircle className="h-3 w-3" strokeWidth={2} aria-hidden />
                        {err}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
              </>
            )}
          </SectionBox>

          {/* ── LOYALTY POINTS ─────────────────────────────────────── */}
          {loyaltyAvailable > 0 && (
            <SectionBox kicker="Puntos Buleje" title="Canjeá lo que tengas" icon={Sparkles}>
              <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] -mt-2">
                Tienes{" "}
                <strong className="text-[var(--text-primary)] tabular-nums font-black">
                  {loyaltyAvailable}
                </strong>{" "}
                puntos · 100 pts = S/1
              </p>

              <div>
                <Label htmlFor="ck-loyalty">¿Cuántos canjeás?</Label>
                <div className="flex gap-2">
                  <input
                    id="ck-loyalty"
                    type="number"
                    min={0}
                    max={maxRedeem}
                    step={100}
                    value={loyalty.redeemPoints || ""}
                    onChange={(e) => {
                      const next = Math.max(0, Math.min(Number(e.target.value) || 0, maxRedeem));
                      setLoyalty({ redeemPoints: next });
                    }}
                    placeholder="0"
                    className={pillCls(false)}
                  />
                  <span className="self-center text-[length:var(--ts-xs)] text-[var(--text-tertiary)] whitespace-nowrap tabular-nums font-bold">
                    = −{fmt((loyalty.redeemPoints || 0) / 100)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setLoyalty({ redeemPoints: 0 })}
                    className="rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 h-8 text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
                  >
                    Limpiar
                  </button>
                  {[100, 500, 1000].filter((v) => v <= maxRedeem).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setLoyalty({ redeemPoints: v })}
                      className="rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 h-8 text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] transition-colors"
                    >
                      {v} pts
                    </button>
                  ))}
                  {maxRedeem > 0 && (
                    <button
                      type="button"
                      onClick={() => setLoyalty({ redeemPoints: maxRedeem })}
                      className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-4 h-8 text-[length:var(--ts-xs)] font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors"
                    >
                      Máximo ({maxRedeem})
                    </button>
                  )}
                </div>
              </div>
            </SectionBox>
          )}
          {loyaltyLoading && (
            <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] -mt-3 ml-4">
              Consultando puntos disponibles...
            </p>
          )}

          {/* ── Datos del comprador (read-only) ───────────────────── */}
          <SectionBox
            kicker="Datos"
            title="Tus datos"
            icon={Wallet}
            action={
              <Link
                href="/checkout/datos"
                className="inline-flex items-center rounded-full bg-[var(--surface-sunken)] px-4 h-9 text-[length:var(--ts-xs)] font-bold text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors"
              >
                Editar
              </Link>
            }
          >
            <dl className="space-y-2 text-[length:var(--ts-sm)]">
              <div className="flex justify-between gap-3 py-2 border-b border-[var(--rule-soft)]">
                <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] self-center">
                  Nombre
                </dt>
                <dd className="font-semibold text-[var(--text-primary)] truncate">
                  {customer.name || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3 py-2 border-b border-[var(--rule-soft)]">
                <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] self-center">
                  Teléfono
                </dt>
                <dd className="font-semibold text-[var(--text-primary)] tabular-nums">
                  {customer.phone || "—"}
                </dd>
              </div>
              {customer.email && (
                <div className="flex justify-between gap-3 py-2">
                  <dt className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] self-center">
                    Email
                  </dt>
                  <dd className="font-semibold text-[var(--text-primary)] truncate">
                    {customer.email}
                  </dd>
                </div>
              )}
            </dl>
          </SectionBox>

          {/* CTA mobile (desktop usa el summary sticky) */}
          <div className="lg:hidden pt-2">
            <button
              type="submit"
              disabled={!isAddressValid}
              className={cn(
                "group inline-flex w-full items-center justify-center gap-2 rounded-full px-6 h-12",
                "text-[length:var(--ts-sm)] font-bold tracking-[var(--ls-tight)] transition-all duration-200",
                "bg-[var(--accent-600,var(--accent))] text-white hover:bg-[var(--accent)]/90 hover:gap-3",
                "shadow-[0_6px_20px_-10px_var(--accent)]",
                "disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none",
              )}
            >
              Revisar pedido
              <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          </div>
        </form>

        <CheckoutSummary
          ctaLabel="Revisar pedido"
          onCtaClick={() => {
            setTouched(true);
            if (isAddressValid) navigateTo("/checkout/confirmar", "Preparando tu resumen");
          }}
          ctaDisabled={!isAddressValid}
          couponDiscount={couponDiscountTotal}
          loyaltyDiscount={loyaltyDiscountTotal}
          showItems
          helperText="Un paso más para confirmar"
        />
      </div>
      <CheckoutTransitionOverlay show={isPending} label={pendingLabel} />
      {mapInitial && (
        <LocationConfirmModal
          open={mapModalOpen}
          onClose={() => setMapModalOpen(false)}
          initialLat={mapInitial.lat}
          initialLon={mapInitial.lon}
          initialAddress={mapInitial.address}
          loading={mapLoading}
          onConfirm={handleMapConfirm}
        />
      )}
    </>
  );
}
