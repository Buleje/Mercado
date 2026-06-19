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

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  MapPin,
  StickyNote,
  Wallet,
  Smartphone,
  Landmark,
  CheckCircle2,
  Tag,
  Sparkles,
  AlertCircle,
  Navigation,
  Edit3,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { useCheckoutData } from "@/hooks/use-checkout-data";
import { useCustomer } from "@/contexts/customer-context";
import CheckoutSummary from "@/components/marketplace/checkout/CheckoutSummary";
import CheckoutMobileCtaBar from "@/components/marketplace/checkout/CheckoutMobileCtaBar";
import PaymentMethodCard from "@/components/marketplace/checkout/PaymentMethodCard";
import CheckoutStepHeader from "@/components/marketplace/checkout/CheckoutStepHeader";
import CheckoutCouponFields from "@/components/marketplace/checkout/CheckoutCouponFields";
import AddressPicker from "@/components/marketplace/checkout/AddressPicker";
import AddAddressFlowModal from "@/components/marketplace/checkout/AddAddressFlowModal";
import CashChangeModal from "@/components/marketplace/checkout/CashChangeModal";
import { LocationConfirmModal } from "@/components/checkout/parts/LocationConfirmModal";
import {
  PaymentProofModal,
  type PaymentProofMethod,
  type PaymentProofModalConfig,
} from "@/components/checkout/PaymentProofModal";
import {
  CheckoutTransitionOverlay,
  useCheckoutTransition,
} from "@/components/marketplace/checkout/CheckoutTransitionOverlay";
import { useSavedAddresses, type SavedAddress } from "@/hooks/use-saved-addresses";
// Round 23 (Performance): ubigeo dataset (~350KB) ya NO se importa en
// cliente. Se consume via fetch /api/marketplace/ubigeo y reverse-geocode
// server-side. Resultado: -350KB en el bundle de checkout (mayor ruta de
// conversión del marketplace).
type UbigeoEntry = { code: string; nombre: string };

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

type PaymentMethod = "efectivo" | "yape" | "plin" | "transfer";

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
  {
    key: "transfer",
    label: "Transferencia",
    hint: "Bancaria · sube tu voucher",
    Icon: Landmark,
    brandColor: "#059669",
  },
];

// ── Config pública de pagos por tienda ─────────────────────────────────────
// Devuelto por GET /api/marketplace/storefront/payment-config?stores=...
type StorePaymentMethodEntry = {
  key: PaymentMethod;
  enabled: boolean;
  yape?: { image?: string; name?: string; phone?: string };
  plin?: { image?: string; name?: string; phone?: string };
  transfer?: {
    bankName?: string;
    accountNumber?: string;
    accountHolder?: string;
  };
};
type StorePaymentConfig = {
  storeSlug: string;
  storeName?: string;
  methods: StorePaymentMethodEntry[];
};

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
  // Brandon, mayo 14 2026: padding mas compacto en mobile (p-4) para reducir
  // scroll, kicker oculto en mobile, titulo mas chico, icono inline al titulo.
  return (
    <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="hidden sm:flex items-center gap-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1.5">
            <span
              aria-hidden
              className="inline-flex h-[3px] w-6 rounded-full bg-[var(--accent)]"
            />
            <Icon className="h-3 w-3" strokeWidth={2} aria-hidden />
            {kicker}
          </p>
          <h2 className="inline-flex items-center gap-2 text-base sm:text-xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
            <span
              aria-hidden
              className="sm:hidden inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]"
            >
              <Icon className="h-4 w-4" strokeWidth={2.25} />
            </span>
            <span className="truncate">{title}</span>
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
  const { itemCount, grandTotal, byStore, totalByStore, hydrated: cartHydrated } = useMarketplaceCart();
  const {
    customer,
    address,
    payment,
    coupons,
    loyalty,
    paymentProofs,
    setAddress,
    setPayment,
    setCouponForStore,
    setLoyalty,
    setStoreProof,
    isAddressValid,
    isCustomerValid,
    couponDiscountTotal,
    loyaltyDiscountTotal,
  } = useCheckoutData();
  const [touched, setTouched] = useState(false);

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

  // ── Config de pagos por tienda (multi-vendor) ──────────────────────
  // Cargada al montar desde /api/marketplace/storefront/payment-config.
  // Cada tienda del carrito tiene sus propios métodos habilitados +
  // datos públicos (QR/cuenta). El cliente elige UN método global; el
  // modal de comprobante se abre por cada tienda no-efectivo.
  const [paymentConfigs, setPaymentConfigs] = useState<Record<string, StorePaymentConfig>>({});
  const [paymentConfigsLoading, setPaymentConfigsLoading] = useState(false);
  const [activeProofModal, setActiveProofModal] = useState<{
    storeSlug: string;
    method: PaymentProofMethod;
  } | null>(null);

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

  // Fetch de config de pago por tienda. Se dispara al hidratar el carrito.
  const storeSlugsCsv = Object.values(byStore)
    .map((g) => g.storeSlug)
    .filter(Boolean)
    .sort()
    .join(",");

  useEffect(() => {
    if (!storeSlugsCsv) {
      setPaymentConfigs({});
      return;
    }
    let cancelled = false;
    setPaymentConfigsLoading(true);
    fetch(
      `/api/marketplace/storefront/payment-config?stores=${encodeURIComponent(storeSlugsCsv)}`,
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { stores: StorePaymentConfig[] }) => {
        if (cancelled) return;
        const map: Record<string, StorePaymentConfig> = {};
        for (const s of data.stores ?? []) map[s.storeSlug] = s;
        setPaymentConfigs(map);
      })
      .catch(() => {
        if (!cancelled) setPaymentConfigs({});
      })
      .finally(() => {
        if (!cancelled) setPaymentConfigsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeSlugsCsv]);

  // Multi-address picker: direcciones guardadas de compras anteriores
  const { addresses: savedAddresses, removeAddress } = useSavedAddresses();
  const [activeAddressId, setActiveAddressId] = useState<string | null>(null);
  const [useNewAddress, setUseNewAddress] = useState(false);
  // Modo "ingresar manualmente" — opt-in para clientes que no quieren GPS.
  // Brandon, mayo 14 2026: cuando hay direccion guardada, el form de calle/
  // departamento/provincia/distrito queda oculto por default. "Usar otra
  // dirección" dispara el GPS modal en lugar de mostrar el form. Solo si el
  // cliente toca explicitamente "Llenar manualmente" aparece el form.
  const [manualAddressEntry, setManualAddressEntry] = useState(false);
  // Modal explicito "Agregar otra dirección" — flujo idle → GPS → mapa →
  // guardar. Aislado del flow legacy del geo-CTA del form para que ambos
  // caminos coexistan (cliente puede agregar desde el picker o desde el
  // boton grande inline).
  const [addAddressModalOpen, setAddAddressModalOpen] = useState(false);
  // Modal calculadora de vuelto — se abre automaticamente al seleccionar
  // "Efectivo" como metodo de pago (Brandon, mayo 14 2026). El cliente
  // tambien puede reabrirlo tocando el chip "Configurar vuelto" del card
  // de efectivo si quiere modificar el monto despues.
  const [cashModalOpen, setCashModalOpen] = useState(false);

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

  // Decide visibilidad de los campos manuales (calle, dep, prov, dist).
  // Brandon mayo 15 v4: por DEFAULT los campos están ocultos siempre. Solo
  // aparecen cuando:
  //  a) el cliente toca "Ingresar Dirección Manualmente" → manualAddressEntry
  //  b) el GPS+mapa rellenó los campos → address.address tiene valor
  //  c) se está editando una dirección guardada con datos → useNewAddress
  const showManualAddressFields =
    manualAddressEntry || useNewAddress || address.address.trim().length > 0;

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

  // Brandon mayo 15 v4 (audit QA #1): flags reales `hydrated` en lugar de
  // setTimeout(250). En redes lentas el guard antiguo expulsaba al cliente.
  const cartReady = cartHydrated && hydrated;
  useEffect(() => {
    if (!cartReady) return;
    if (itemCount === 0) router.replace("/marketplace/carrito");
    else if (!isCustomerValid) router.replace("/checkout/datos");
  }, [cartReady, itemCount, isCustomerValid, router]);

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
    // Brandon 2026-06-01: flag `cancelled` en vez de AbortController. Abortar el
    // fetch mientras `r.json()` lee el body produce un rejection del stream que
    // escapa al `.catch` → "Uncaught (in promise) AbortError: signal is aborted
    // without reason" al desmontar (StrictMode dev double-mount lo dispara
    // siempre). Es una carga de bajo costo: dejamos terminar el fetch y solo
    // ignoramos el resultado si el componente ya se desmontó.
    let cancelled = false;
    setLoyaltyLoading(true);
    (async () => {
      try {
        const r = await fetch(`/api/marketplace/loyalty?phone=${encodeURIComponent(phone)}`);
        if (cancelled) return;
        const d = r.ok ? await r.json() : null;
        if (cancelled) return;
        const pts = d?.data?.points ?? 0;
        setLoyaltyAvailable(typeof pts === "number" ? pts : 0);
      } catch {
        /* red caída / JSON inválido → loyalty queda en su valor previo */
      } finally {
        if (!cancelled) setLoyaltyLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customer.phone]);

  // ── Métodos de pago disponibles (intersección de tiendas) ──────────
  // Un método aparece como "elegible" si AL MENOS una tienda del carrito
  // lo tiene habilitado. Si el cliente elige un método que solo está
  // disponible en N de las M tiendas, las M-N restantes deberán pagar
  // contra-entrega (efectivo) — esto se visualiza en un aviso por tienda.
  const availableMethods = useMemo<PaymentMethod[]>(() => {
    if (Object.keys(paymentConfigs).length === 0) {
      // Fallback: si aún no se cargó la config, mostramos todos.
      return PAYMENT_METHODS.map((m) => m.key);
    }
    const set = new Set<PaymentMethod>();
    for (const cfg of Object.values(paymentConfigs)) {
      for (const m of cfg.methods) {
        if (m.enabled) set.add(m.key);
      }
    }
    // Efectivo siempre disponible como fallback
    set.add("efectivo");
    return PAYMENT_METHODS.filter((m) => set.has(m.key)).map((m) => m.key);
  }, [paymentConfigs]);

  // Tiendas que requieren comprobante para el método elegido (no efectivo).
  const storesNeedingProof = useMemo(() => {
    if (payment.method === "efectivo") return [] as Array<{
      storeSlug: string;
      storeName: string;
      amount: number;
      methodAvailable: boolean;
    }>;
    return Object.entries(byStore).map(([sid, g]) => {
      const cfg = paymentConfigs[g.storeSlug];
      const methodEntry = cfg?.methods.find(
        (m) => m.key === payment.method && m.enabled,
      );
      return {
        storeSlug: g.storeSlug,
        storeName: g.storeName,
        amount: totalByStore[sid]?.total ?? 0,
        methodAvailable: Boolean(methodEntry),
      };
    });
  }, [byStore, totalByStore, paymentConfigs, payment.method]);

  // Invitado (sin sesión) paga AL RECIBIR — no puede subir comprobante (eso
  // requiere login). Pago efectivo tampoco necesita comprobante. Brandon
  // 2026-05-30: el invitado yapea/paga cuando llega el repartidor.
  const allProofsReady =
    !savedCustomer ||
    payment.method === "efectivo" ||
    storesNeedingProof.every((s) =>
      !s.methodAvailable ? true : Boolean(paymentProofs[s.storeSlug]),
    );

  const handleProofConfirmed = useCallback(
    (
      storeSlug: string,
      method: PaymentProofMethod,
      data: { proofUrl: string; proofToken: string; reference?: string },
    ) => {
      setStoreProof(storeSlug, {
        method,
        proofUrl: data.proofUrl,
        proofToken: data.proofToken,
        reference: data.reference,
      });
      setActiveProofModal(null);
    },
    [setStoreProof],
  );

  // Si el cliente cambia el método global, los proofs subidos para el
  // método anterior dejan de ser válidos. Los limpiamos para evitar
  // confusiones (el token del proof está atado al método).
  useEffect(() => {
    for (const [slug, p] of Object.entries(paymentProofs)) {
      if (p.method !== payment.method) {
        setStoreProof(slug, null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment.method]);

  // Auto-abrir el modal de calculadora de vuelto SOLO cuando el cliente
  // CAMBIA explicitamente a efectivo (no en el mount inicial). Brandon mayo
  // 14 2026: el efecto anterior se disparaba al hidratar el state, asi que
  // entrar a /entrega con method=efectivo abria el modal sin pedirlo. Ahora
  // trackeamos el metodo previo y solo abrimos si paso de !efectivo →
  // efectivo via interaccion del cliente.
  const prevPaymentMethodRef = useRef(payment.method);
  useEffect(() => {
    const prev = prevPaymentMethodRef.current;
    if (prev !== "efectivo" && payment.method === "efectivo") {
      setCashModalOpen(true);
    }
    prevPaymentMethodRef.current = payment.method;
  }, [payment.method]);

  const buildProofModalConfig = useCallback(
    (storeSlug: string): PaymentProofModalConfig => {
      const cfg = paymentConfigs[storeSlug];
      const entry = cfg?.methods.find((m) => m.key === payment.method);
      if (!entry) return {};
      return {
        yape: entry.yape,
        plin: entry.plin,
        transfer: entry.transfer,
      };
    },
    [paymentConfigs, payment.method],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setTouched(true);
      if (!isAddressValid) return;
      // Brandon mayo 15 v4: bloqueo submit si no eligió método de pago.
      if (payment.method === "") return;
      if (!allProofsReady) return;
      navigateTo("/checkout/confirmar", "Preparando tu resumen");
    },
    [isAddressValid, allProofsReady, navigateTo, payment.method],
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
      {/* Header compartido (Brandon 2026-06-01): mismo formato que datos y
          confirmar — back link + h1 + subtítulo, tamaños y padding unificados. */}
      <CheckoutStepHeader
        backHref="/checkout/datos"
        backLabel="Volver a tus datos"
        title="Entrega y pago"
        lead="Paso 2 de 3."
        subtitle="Elegí a dónde te lo llevamos y cómo pagás."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 sm:gap-6 items-start pb-28 lg:pb-16">
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5" noValidate>
          {/* ── Direcciones guardadas (si hay) ───────────────────────
                Brandon, mayo 14 2026: el boton "Usar otra direccion" del
                picker abre AddAddressFlowModal (paso 1: CTA "Poner ubicacion
                actual", paso 2: mapa). La direccion confirmada se persiste
                en handleMapConfirm — la proxima visita aparece como otra
                tarjeta para marcar con check. */}
          {savedAddresses.length > 0 && !useNewAddress && (
            <>
              <AddressPicker
                addresses={savedAddresses}
                activeId={activeAddressId}
                onSelect={handlePickAddress}
                onNew={() => setAddAddressModalOpen(true)}
                onRemove={(id) => {
                  removeAddress(id);
                  if (id === activeAddressId) setActiveAddressId(null);
                }}
              />
              {!manualAddressEntry && (
                <button
                  type="button"
                  onClick={() => {
                    setManualAddressEntry(true);
                    handleUseNewAddress();
                  }}
                  className="text-[length:var(--ts-xs)] font-bold text-[var(--text-tertiary)] hover:text-[var(--accent)] underline underline-offset-2 transition-colors"
                >
                  ¿Sin GPS? Ingresar dirección manualmente
                </button>
              )}
            </>
          )}

          {/* ── DIRECCIÓN — solo aparece si NO hay direcciones guardadas
                o el cliente eligió "llenar manualmente". Cuando hay
                savedAddresses, el flujo principal es AddressPicker arriba
                + modal "Agregar otra dirección" para registrar nuevas. */}
          {(savedAddresses.length === 0 || manualAddressEntry) && (
          <SectionBox
            kicker="Dirección"
            title={
              savedAddresses.length > 0 && !manualAddressEntry
                ? "Agregar otra ubicación"
                : "¿A dónde te lo llevamos?"
            }
            icon={MapPin}
            action={
              savedAddresses.length > 0 && manualAddressEntry ? (
                <button
                  type="button"
                  onClick={() => setManualAddressEntry(false)}
                  className="text-[length:var(--ts-xs)] font-bold text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
                >
                  Ocultar campos
                </button>
              ) : null
            }
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
                  : "border border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)] hover:border-[var(--accent)]",
              )}
            >
              {/* Icono */}
              <span className="relative flex-shrink-0">
                <span
                  className={cn(
                    "relative inline-flex h-14 w-14 items-center justify-center rounded-full shadow-sm transition-colors",
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

            {/* Brandon mayo 15 v4: cuando los fields están ocultos (default),
                mostramos un divider "o" + botón secundario "Ingresar dirección
                manualmente". Una vez visible (por GPS o por click manual)
                queda oculto. */}
            {!showManualAddressFields && (
              <div className="space-y-3">
                <div className="relative flex items-center gap-3">
                  <span className="flex-1 h-px bg-[var(--rule-base)]" aria-hidden />
                  <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                    o
                  </span>
                  <span className="flex-1 h-px bg-[var(--rule-base)]" aria-hidden />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setManualAddressEntry(true);
                    setUseNewAddress(true);
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] h-12 sm:h-13 px-5 text-[length:var(--ts-sm)] sm:text-base font-extrabold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:-translate-y-0.5 active:scale-[0.98] transition-all shadow-sm"
                >
                  <Edit3 className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  Ingresar Dirección Manualmente
                </button>
              </div>
            )}

            {showManualAddressFields && (
            <>
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

            {/* Brandon 2026-06-01: ubigeo compacto. Mobile: Departamento +
                Provincia en una fila, Distrito a fila completa (entran los
                nombres sin truncar). Desktop: 3 columnas. Antes: 3 filas
                apiladas. Son campos que el geo autollena. */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
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
              <div className="col-span-2 sm:col-span-1">
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
            </>
            )}
          </SectionBox>
          )}

          {/* ── PAGO ──────────────────────────────────────────────── */}
          <SectionBox kicker="Método de pago" title="¿Cómo te queda más cómodo?" icon={Wallet}>
            {paymentConfigsLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-20 sm:h-24 rounded-2xl bg-[var(--surface-sunken)] animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <div
                className={cn(
                  // Brandon 2026-06-01: 2 columnas en mobile (antes apiladas) —
                  // el caso típico (efectivo + Yape) entra en 1 fila.
                  "grid gap-2.5 sm:gap-3",
                  availableMethods.length === 1 ? "grid-cols-1" : "grid-cols-2",
                  availableMethods.length === 1 && "sm:grid-cols-1",
                  availableMethods.length === 2 && "sm:grid-cols-2",
                  availableMethods.length === 3 && "sm:grid-cols-3",
                  availableMethods.length >= 4 && "sm:grid-cols-2 lg:grid-cols-4",
                )}
              >
                {PAYMENT_METHODS.filter((m) => availableMethods.includes(m.key)).map(
                  ({ key, label, hint, Icon, brandColor }) => (
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
                  ),
                )}
              </div>
            )}

            {!paymentConfigsLoading && availableMethods.length === 1 && (
              <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                Las tiendas de tu carrito solo aceptan efectivo contra-entrega
                por ahora.
              </p>
            )}

            {/* Brandon mayo 15 v4 (audit QA #6): feedback visible si el cliente
                intenta avanzar sin elegir método. Aparece SOLO tras submit. */}
            {touched && payment.method === "" && (
              <div
                role="alert"
                aria-live="polite"
                className="flex items-start gap-2 rounded-2xl border-2 border-[var(--data-error-500)]/30 bg-[var(--data-error-50)] dark:bg-[var(--data-error-950,#450a0a)]/30 px-4 py-3"
              >
                <AlertCircle
                  className="h-4 w-4 text-[var(--data-error-500)] shrink-0 mt-0.5"
                  strokeWidth={2.25}
                  aria-hidden
                />
                <p className="text-[length:var(--ts-sm)] font-semibold text-[var(--data-error-600,#dc2626)] leading-snug">
                  Elegí cómo querés pagar para continuar.
                </p>
              </div>
            )}

            {payment.method === "efectivo" && (
              // Brandon, mayo 14 2026: el panel inline con calculadora se
              // movio al CashChangeModal que se abre al seleccionar efectivo.
              // Aca solo dejamos un resumen del monto/vuelto elegido + boton
              // para reabrir el modal y modificar.
              <div className="rounded-2xl border-2 border-[var(--accent)]/25 bg-[var(--accent-soft)]/50 p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-0.5">
                    Pago en efectivo
                  </p>
                  {cashAmount >= grandTotal && cashAmount > grandTotal ? (
                    <p className="text-sm font-extrabold text-[var(--text-primary)] tabular-nums">
                      Pagas con {fmt(cashAmount)} · vuelto {fmt(cashChange)}
                    </p>
                  ) : (
                    <p className="text-sm font-bold text-[var(--text-primary)]">
                      Pagás el monto exacto · {fmt(grandTotal)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setCashModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-canvas)] border border-[var(--accent)]/30 px-3.5 h-9 text-[length:var(--ts-xs)] font-extrabold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors shrink-0"
                >
                  Cambiar vuelto
                </button>
              </div>
            )}

            {payment.method !== "" && payment.method !== "efectivo" && storesNeedingProof.length > 0 && (
              <div className="space-y-3">
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  Comprobante por tienda
                </p>
                {storesNeedingProof.map((s) => {
                  const proof = paymentProofs[s.storeSlug];
                  const cfg = paymentConfigs[s.storeSlug];
                  const methodLabel =
                    payment.method === "yape"
                      ? "Yape"
                      : payment.method === "plin"
                        ? "Plin"
                        : "Transferencia";
                  if (!s.methodAvailable) {
                    return (
                      <div
                        key={s.storeSlug}
                        className="flex items-start gap-3 rounded-2xl border-2 border-[var(--data-warn-500)]/30 bg-[var(--data-warn-500)]/10 p-4"
                      >
                        <AlertCircle
                          className="h-5 w-5 text-[var(--data-warn-500)] shrink-0 mt-0.5"
                          strokeWidth={2}
                        />
                        <div className="text-sm text-[var(--text-primary)]">
                          <p className="font-bold">{s.storeName}</p>
                          <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] mt-1">
                            Esta tienda no acepta {methodLabel}. Va a quedar
                            como efectivo contra-entrega.
                          </p>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <button
                      key={s.storeSlug}
                      type="button"
                      onClick={() =>
                        setActiveProofModal({
                          storeSlug: s.storeSlug,
                          method: payment.method as PaymentProofMethod,
                        })
                      }
                      className={cn(
                        "w-full flex items-center justify-between gap-3 rounded-2xl border-2 p-4 text-left transition-all",
                        proof
                          ? "border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/5 hover:border-[var(--data-success-500)]"
                          : "border-[var(--rule-base)] bg-[var(--surface-sunken)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]",
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={cn(
                            "shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl",
                            proof
                              ? "bg-[var(--data-success-500)] text-white"
                              : "bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] text-[var(--text-tertiary)]",
                          )}
                        >
                          {proof ? (
                            <CheckCircle2 className="h-5 w-5" strokeWidth={2.5} />
                          ) : payment.method === "transfer" ? (
                            <Landmark className="h-5 w-5" strokeWidth={2} />
                          ) : (
                            <Smartphone className="h-5 w-5" strokeWidth={2} />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="text-base font-bold text-[var(--text-primary)] truncate">
                            {s.storeName}
                          </p>
                          <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
                            {proof
                              ? `Pagado · ${methodLabel} · ${fmt(s.amount)}`
                              : `${methodLabel} · ${fmt(s.amount)} — subir comprobante`}
                          </p>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 text-[length:var(--ts-xs)] font-bold px-3 py-1.5 rounded-full",
                          proof
                            ? "bg-[var(--data-success-500)] text-white"
                            : "bg-[var(--accent)] text-white",
                        )}
                      >
                        {proof ? "Cambiar" : "Pagar ahora"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </SectionBox>

          {/* ── CUPONES — oculto por default ──────────────────────────
                Brandon, mayo 14 2026: si no hay cupones aplicados y el
                cliente no toco "Agregar cupon", la seccion entera se rendera
                como un link minimalista inline (no SectionBox completo). El
                SectionBox aparece solo cuando es relevante.                */}
          {!showCouponFields ? (
            <button
              type="button"
              onClick={() => setCouponsUserOpened(true)}
              className="inline-flex items-center gap-2 self-start rounded-full border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 h-11 text-base font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            >
              <Tag className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              <span>¿Tienes un cupón? Agrégalo</span>
              <span className="text-[var(--accent)] font-extrabold" aria-hidden>+</span>
            </button>
          ) : (
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
            <>
            <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] -mt-2">
              Un cupón por cada tienda. El descuento se refleja en el total.
            </p>

            <CheckoutCouponFields
              byStore={byStore}
              coupons={coupons}
              setCouponForStore={setCouponForStore}
              totalByStore={totalByStore}
            />
              </>
          </SectionBox>
          )}

          {/* LOYALTY POINTS */}
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

          {/* CTA mobile duplicado removido (Brandon, mayo 14 2026):
              CheckoutMobileCtaBar sticky bottom cubre el rol sin duplicar
              el "Revisar pedido" que ya aparece en el CheckoutSummary. */}
        </form>

        {/* CheckoutSummary oculto en mobile — CheckoutMobileCtaBar sticky
            bottom ya cubre total + CTA revisar pedido (Brandon, mayo 14 2026) */}
        <div className="hidden lg:block">
          <CheckoutSummary
            ctaLabel={!allProofsReady ? "Subí los comprobantes" : "Revisar pedido"}
            onCtaClick={() => {
              setTouched(true);
              if (isAddressValid && allProofsReady)
                navigateTo("/checkout/confirmar", "Preparando tu resumen");
            }}
            ctaDisabled={!isAddressValid || !allProofsReady}
            couponDiscount={couponDiscountTotal}
            loyaltyDiscount={loyaltyDiscountTotal}
            showItems
            helperText={
              !allProofsReady
                ? "Falta subir el comprobante de pago"
                : "Un paso más para confirmar"
            }
          />
        </div>
      </div>

      <CheckoutMobileCtaBar
        primaryLabel="Total"
        total={Math.max(0, grandTotal - couponDiscountTotal - loyaltyDiscountTotal)}
        ctaLabel={!allProofsReady ? "Falta comprobante" : "Revisar pedido"}
        ctaOnClick={() => {
          setTouched(true);
          if (isAddressValid && allProofsReady)
            navigateTo("/checkout/confirmar", "Preparando tu resumen");
        }}
        ctaDisabled={!isAddressValid || !allProofsReady}
        disabledReason={
          !isAddressValid
            ? "Completá tu dirección"
            : !allProofsReady
              ? "Subí los comprobantes"
              : undefined
        }
        helperText={
          isAddressValid && allProofsReady
            ? "¡Todo listo! Solo falta confirmar."
            : "Un paso más para confirmar"
        }
      />

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

      {/* Modal "Agregar otra dirección" — abre desde AddressPicker.onNew.
          Reusa handleMapConfirm para persistir + auto-seleccionar la nueva
          dirección en el picker. */}
      <AddAddressFlowModal
        open={addAddressModalOpen}
        onClose={() => setAddAddressModalOpen(false)}
        onConfirm={async (lat, lon, addr) => {
          // handleMapConfirm pobla los campos del checkout state (calle,
          // dep, prov, dist, zone) usando reverse-geocode. useSavedAddresses
          // hook detecta el address.address con coords y lo persiste con
          // savedAt actualizado, asi la proxima visita aparece como nueva
          // tarjeta en el AddressPicker.
          await handleMapConfirm(lat, lon, addr);
          setAddAddressModalOpen(false);
        }}
      />

      {/* Modal "Calculadora de vuelto" — abre auto al seleccionar Efectivo
          o via boton "Cambiar vuelto" en el resumen inline. */}
      <CashChangeModal
        open={cashModalOpen}
        onClose={() => setCashModalOpen(false)}
        total={grandTotal}
        initialAmount={payment.cashAmount}
        onConfirm={(amount) => setPayment({ cashAmount: amount })}
      />
      {activeProofModal && (
        <PaymentProofModal
          open
          storeSlug={activeProofModal.storeSlug}
          storeName={
            byStore[
              Object.keys(byStore).find(
                (id) => byStore[id]?.storeSlug === activeProofModal.storeSlug,
              ) ?? ""
            ]?.storeName ?? activeProofModal.storeSlug
          }
          method={activeProofModal.method}
          amount={
            storesNeedingProof.find(
              (s) => s.storeSlug === activeProofModal.storeSlug,
            )?.amount ?? 0
          }
          config={buildProofModalConfig(activeProofModal.storeSlug)}
          initialProofUrl={paymentProofs[activeProofModal.storeSlug]?.proofUrl}
          initialReference={paymentProofs[activeProofModal.storeSlug]?.reference}
          onConfirm={(data) =>
            handleProofConfirmed(
              activeProofModal.storeSlug,
              activeProofModal.method,
              data,
            )
          }
          onClose={() => setActiveProofModal(null)}
        />
      )}
    </>
  );
}
