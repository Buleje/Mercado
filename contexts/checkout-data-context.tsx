"use client";

/**
 * CheckoutDataContext — provee los datos del checkout (customer / address /
 * payment / coupons / loyalty) compartidos entre las páginas
 * /marketplace/carrito → /checkout/datos → /checkout/entrega → /checkout/confirmar.
 *
 * Por qué un Context y no `useState` por página:
 *   - El `<CheckoutLayout>` no se desmonta al cambiar de ruta cliente-side, así
 *     que el estado del Provider sobrevive las navegaciones.
 *   - Evita la "race de hidratación" donde una página recién montada disparaba
 *     `router.replace` antes de leer localStorage, mandando al usuario de
 *     vuelta a `/checkout/datos`.
 *
 * Persistencia:
 *   - Lectura inicial desde `localStorage` (sólo client-side).
 *   - Cada `setX` escribe al `localStorage` (idempotente, sync).
 *   - Sync entre pestañas vía `storage` event.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────

export type CheckoutCustomer = {
  name: string;
  phone: string;
  email: string;
};
export type CheckoutAddress = {
  address: string;
  zone: string;
  notes: string;
  departmentCode: string;
  departmentName: string;
  provinceCode: string;
  provinceName: string;
  districtCode: string;
  districtName: string;
};
// "" = sin método seleccionado (Brandon mayo 15 v4: ya no se preselecciona
// efectivo por defecto — el cliente debe elegir explícitamente).
export type CheckoutPaymentMethod = "" | "efectivo" | "yape" | "plin" | "transfer";
export type CheckoutPayment = {
  method: CheckoutPaymentMethod;
  cashAmount: string;
};
/**
 * Comprobante de pago por tienda (multi-vendor). El cliente elige UN método
 * global, pero sube un comprobante por cada tienda del carrito. La Order se
 * crea con `paymentApprovalId` apuntando al PaymentApproval que tendrá
 * `imageUrl` = proofUrl. El `proofToken` se valida server-side en
 * /api/marketplace/checkout/payment-proof + endpoint de creación de Order.
 */
export type CheckoutStoreProof = {
  method: "yape" | "plin" | "transfer";
  proofUrl: string;
  proofToken: string;
  reference?: string;
};
export type CheckoutPaymentProofs = Record<string, CheckoutStoreProof>;

export type CheckoutCouponEntry = {
  code: string;
  discount: number;
  description?: string;
};
export type CheckoutCoupons = Record<string, CheckoutCouponEntry>;
export type CheckoutLoyalty = { redeemPoints: number };

interface CheckoutDataValue {
  customer: CheckoutCustomer;
  address: CheckoutAddress;
  payment: CheckoutPayment;
  coupons: CheckoutCoupons;
  loyalty: CheckoutLoyalty;
  paymentProofs: CheckoutPaymentProofs;
  setCustomer: (next: Partial<CheckoutCustomer>) => void;
  setAddress: (next: Partial<CheckoutAddress>) => void;
  setPayment: (next: Partial<CheckoutPayment>) => void;
  setCouponForStore: (storeSlug: string, entry: CheckoutCouponEntry | null) => void;
  setLoyalty: (next: Partial<CheckoutLoyalty>) => void;
  setStoreProof: (storeSlug: string, proof: CheckoutStoreProof | null) => void;
  reset: () => void;
  isCustomerValid: boolean;
  isAddressValid: boolean;
  isPaymentValid: boolean;
  couponDiscountTotal: number;
  loyaltyDiscountTotal: number;
  /** True una vez que el provider terminó de leer localStorage. Útil para
   *  bloquear redirects prematuros en effects de las páginas. */
  hydrated: boolean;
}

const KEY_CUSTOMER = "marketplace-checkout-customer";
const KEY_ADDRESS = "marketplace-checkout-address";
const KEY_PAYMENT = "marketplace-checkout-payment";
const KEY_COUPONS = "marketplace-checkout-coupons";
const KEY_LOYALTY = "marketplace-checkout-loyalty";
const KEY_PROOFS = "marketplace-checkout-proofs";

const DEFAULT_CUSTOMER: CheckoutCustomer = { name: "", phone: "", email: "" };
const DEFAULT_ADDRESS: CheckoutAddress = {
  address: "",
  zone: "",
  notes: "",
  departmentCode: "",
  departmentName: "",
  provinceCode: "",
  provinceName: "",
  districtCode: "",
  districtName: "",
};
const DEFAULT_PAYMENT: CheckoutPayment = { method: "", cashAmount: "" };
const DEFAULT_COUPONS: CheckoutCoupons = {};
const DEFAULT_LOYALTY: CheckoutLoyalty = { redeemPoints: 0 };
const DEFAULT_PROOFS: CheckoutPaymentProofs = {};

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* silent */
  }
}

const CheckoutDataContext = createContext<CheckoutDataValue | null>(null);

export function CheckoutDataProvider({ children }: { children: ReactNode }) {
  // SSR-safe: arranca con defaults; lee localStorage en el primer effect.
  const [customer, setCustomerState] = useState<CheckoutCustomer>(DEFAULT_CUSTOMER);
  const [address, setAddressState] = useState<CheckoutAddress>(DEFAULT_ADDRESS);
  const [payment, setPaymentState] = useState<CheckoutPayment>(DEFAULT_PAYMENT);
  const [coupons, setCouponsState] = useState<CheckoutCoupons>(DEFAULT_COUPONS);
  const [loyalty, setLoyaltyState] = useState<CheckoutLoyalty>(DEFAULT_LOYALTY);
  const [paymentProofs, setPaymentProofsState] =
    useState<CheckoutPaymentProofs>(DEFAULT_PROOFS);
  const [hydrated, setHydrated] = useState(false);

  // Hidratación inicial — un único pase tras montar. setState sync acá es
  // legítimo: SSR arranca con defaults y leemos localStorage al hidratar.
  /* eslint-disable react-hooks/set-state-in-effect -- hidratación SSR-safe */
  useEffect(() => {
    setCustomerState(read(KEY_CUSTOMER, DEFAULT_CUSTOMER));
    setAddressState(read(KEY_ADDRESS, DEFAULT_ADDRESS));
    setPaymentState(read(KEY_PAYMENT, DEFAULT_PAYMENT));
    setCouponsState(read(KEY_COUPONS, DEFAULT_COUPONS));
    setLoyaltyState(read(KEY_LOYALTY, DEFAULT_LOYALTY));
    setPaymentProofsState(read(KEY_PROOFS, DEFAULT_PROOFS));
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Sync entre pestañas
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY_CUSTOMER) setCustomerState(read(KEY_CUSTOMER, DEFAULT_CUSTOMER));
      else if (e.key === KEY_ADDRESS) setAddressState(read(KEY_ADDRESS, DEFAULT_ADDRESS));
      else if (e.key === KEY_PAYMENT) setPaymentState(read(KEY_PAYMENT, DEFAULT_PAYMENT));
      else if (e.key === KEY_COUPONS) setCouponsState(read(KEY_COUPONS, DEFAULT_COUPONS));
      else if (e.key === KEY_LOYALTY) setLoyaltyState(read(KEY_LOYALTY, DEFAULT_LOYALTY));
      else if (e.key === KEY_PROOFS) setPaymentProofsState(read(KEY_PROOFS, DEFAULT_PROOFS));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setCustomer = useCallback((next: Partial<CheckoutCustomer>) => {
    setCustomerState((prev) => {
      const merged = { ...prev, ...next };
      write(KEY_CUSTOMER, merged);
      return merged;
    });
  }, []);

  const setAddress = useCallback((next: Partial<CheckoutAddress>) => {
    setAddressState((prev) => {
      const merged = { ...prev, ...next };
      write(KEY_ADDRESS, merged);
      return merged;
    });
  }, []);

  const setPayment = useCallback((next: Partial<CheckoutPayment>) => {
    setPaymentState((prev) => {
      const merged = { ...prev, ...next };
      write(KEY_PAYMENT, merged);
      return merged;
    });
  }, []);

  const setCouponForStore = useCallback(
    (storeSlug: string, entry: CheckoutCouponEntry | null) => {
      setCouponsState((prev) => {
        const next = { ...prev };
        if (entry) next[storeSlug] = entry;
        else delete next[storeSlug];
        write(KEY_COUPONS, next);
        return next;
      });
    },
    [],
  );

  const setLoyalty = useCallback((next: Partial<CheckoutLoyalty>) => {
    setLoyaltyState((prev) => {
      const merged = { ...prev, ...next };
      write(KEY_LOYALTY, merged);
      return merged;
    });
  }, []);

  const setStoreProof = useCallback(
    (storeSlug: string, proof: CheckoutStoreProof | null) => {
      setPaymentProofsState((prev) => {
        const next = { ...prev };
        if (proof) next[storeSlug] = proof;
        else delete next[storeSlug];
        write(KEY_PROOFS, next);
        return next;
      });
    },
    [],
  );

  const reset = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(KEY_CUSTOMER);
      localStorage.removeItem(KEY_ADDRESS);
      localStorage.removeItem(KEY_PAYMENT);
      localStorage.removeItem(KEY_COUPONS);
      localStorage.removeItem(KEY_LOYALTY);
      localStorage.removeItem(KEY_PROOFS);
    } catch {
      /* silent */
    }
    setCustomerState(DEFAULT_CUSTOMER);
    setAddressState(DEFAULT_ADDRESS);
    setPaymentState(DEFAULT_PAYMENT);
    setCouponsState(DEFAULT_COUPONS);
    setLoyaltyState(DEFAULT_LOYALTY);
    setPaymentProofsState(DEFAULT_PROOFS);
  }, []);

  const value = useMemo<CheckoutDataValue>(() => {
    const isCustomerValid =
      customer.name.trim().length >= 2 &&
      customer.phone.trim().replace(/\D/g, "").length >= 6;
    const isAddressValid = address.address.trim().length >= 5;
    // Método "" (sin elegir) = inválido. Brandon mayo 15 v4: el cliente debe
    // elegir un método explícitamente. Efectivo con cashAmount truthy debe
    // ser > 0 para ser válido.
    const isPaymentValid =
      payment.method !== "" &&
      (payment.method !== "efectivo" ||
        !payment.cashAmount ||
        Number(payment.cashAmount) > 0);
    const couponDiscountTotal = Object.values(coupons).reduce(
      (acc, c) => acc + (c.discount || 0),
      0,
    );
    const loyaltyDiscountTotal = (loyalty.redeemPoints || 0) / 100;
    return {
      customer,
      address,
      payment,
      coupons,
      loyalty,
      paymentProofs,
      setCustomer,
      setAddress,
      setPayment,
      setCouponForStore,
      setLoyalty,
      setStoreProof,
      reset,
      isCustomerValid,
      isAddressValid,
      isPaymentValid,
      couponDiscountTotal,
      loyaltyDiscountTotal,
      hydrated,
    };
  }, [
    customer,
    address,
    payment,
    coupons,
    loyalty,
    paymentProofs,
    hydrated,
    setCustomer,
    setAddress,
    setPayment,
    setCouponForStore,
    setLoyalty,
    setStoreProof,
    reset,
  ]);

  return (
    <CheckoutDataContext.Provider value={value}>
      {children}
    </CheckoutDataContext.Provider>
  );
}

export function useCheckoutData(): CheckoutDataValue {
  const ctx = useContext(CheckoutDataContext);
  if (!ctx) {
    throw new Error("useCheckoutData debe usarse dentro de <CheckoutDataProvider>");
  }
  return ctx;
}
