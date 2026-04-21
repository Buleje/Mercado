"use client";

/**
 * useCheckoutData — persiste los datos del checkout entre las paginas
 * /marketplace/carrito -> /datos -> /entrega -> /confirmar.
 *
 * Almacena en localStorage tres bloques:
 *   - customer: { name, phone, email }
 *   - address:  { address, zone, notes }
 *   - payment:  { method: "efectivo" | "yape" | "plin", cashAmount }
 *
 * Cada setX es debounced en localStorage write — no necesario aqui (writes
 * son baratos y poco frecuentes). Sync entre pestanas via storage event.
 */

import { useCallback, useEffect, useState } from "react";

export type CheckoutCustomer = {
  name: string;
  phone: string;
  email: string;
};
export type CheckoutAddress = {
  address: string;
  /** Texto libre opcional (ej. "Yarinacocha"). Se mantiene por back-compat. */
  zone: string;
  notes: string;
  /** Codigos del INEI Peru (rellenados via select cascade o reverse-geocode). */
  departmentCode: string;
  departmentName: string;
  provinceCode: string;
  provinceName: string;
  districtCode: string;
  districtName: string;
};
export type CheckoutPayment = {
  method: "efectivo" | "yape" | "plin";
  cashAmount: string;
};
/** Cupones aplicados por storeSlug. */
export type CheckoutCouponEntry = {
  code: string;
  discount: number;
  description?: string;
};
export type CheckoutCoupons = Record<string, CheckoutCouponEntry>;
/** Estado de canje de puntos de loyalty (100 pts = S/1). */
export type CheckoutLoyalty = {
  redeemPoints: number;
};

const KEY_CUSTOMER = "marketplace-checkout-customer";
const KEY_ADDRESS = "marketplace-checkout-address";
const KEY_PAYMENT = "marketplace-checkout-payment";
const KEY_COUPONS = "marketplace-checkout-coupons";
const KEY_LOYALTY = "marketplace-checkout-loyalty";

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
const DEFAULT_PAYMENT: CheckoutPayment = { method: "efectivo", cashAmount: "" };
const DEFAULT_COUPONS: CheckoutCoupons = {};
const DEFAULT_LOYALTY: CheckoutLoyalty = { redeemPoints: 0 };

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

export function useCheckoutData() {
  const [customer, setCustomerState] = useState<CheckoutCustomer>(() => read(KEY_CUSTOMER, DEFAULT_CUSTOMER));
  const [address, setAddressState] = useState<CheckoutAddress>(() => read(KEY_ADDRESS, DEFAULT_ADDRESS));
  const [payment, setPaymentState] = useState<CheckoutPayment>(() => read(KEY_PAYMENT, DEFAULT_PAYMENT));
  const [coupons, setCouponsState] = useState<CheckoutCoupons>(() => read(KEY_COUPONS, DEFAULT_COUPONS));
  const [loyalty, setLoyaltyState] = useState<CheckoutLoyalty>(() => read(KEY_LOYALTY, DEFAULT_LOYALTY));

  // Sync entre pestanas
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY_CUSTOMER) setCustomerState(read(KEY_CUSTOMER, DEFAULT_CUSTOMER));
      else if (e.key === KEY_ADDRESS) setAddressState(read(KEY_ADDRESS, DEFAULT_ADDRESS));
      else if (e.key === KEY_PAYMENT) setPaymentState(read(KEY_PAYMENT, DEFAULT_PAYMENT));
      else if (e.key === KEY_COUPONS) setCouponsState(read(KEY_COUPONS, DEFAULT_COUPONS));
      else if (e.key === KEY_LOYALTY) setLoyaltyState(read(KEY_LOYALTY, DEFAULT_LOYALTY));
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

  const setCouponForStore = useCallback((storeSlug: string, entry: CheckoutCouponEntry | null) => {
    setCouponsState((prev) => {
      const next = { ...prev };
      if (entry) next[storeSlug] = entry;
      else delete next[storeSlug];
      write(KEY_COUPONS, next);
      return next;
    });
  }, []);

  const setLoyalty = useCallback((next: Partial<CheckoutLoyalty>) => {
    setLoyaltyState((prev) => {
      const merged = { ...prev, ...next };
      write(KEY_LOYALTY, merged);
      return merged;
    });
  }, []);

  const reset = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(KEY_CUSTOMER);
      localStorage.removeItem(KEY_ADDRESS);
      localStorage.removeItem(KEY_PAYMENT);
      localStorage.removeItem(KEY_COUPONS);
      localStorage.removeItem(KEY_LOYALTY);
    } catch {
      /* silent */
    }
    setCustomerState(DEFAULT_CUSTOMER);
    setAddressState(DEFAULT_ADDRESS);
    setPaymentState(DEFAULT_PAYMENT);
    setCouponsState(DEFAULT_COUPONS);
    setLoyaltyState(DEFAULT_LOYALTY);
  }, []);

  // Validators
  const isCustomerValid =
    customer.name.trim().length >= 2 && customer.phone.trim().replace(/\D/g, "").length >= 6;
  const isAddressValid = address.address.trim().length >= 5;
  const isPaymentValid =
    payment.method !== "efectivo" ||
    !payment.cashAmount ||
    Number(payment.cashAmount) > 0;

  // Totales derivados
  const couponDiscountTotal = Object.values(coupons).reduce((acc, c) => acc + (c.discount || 0), 0);
  const loyaltyDiscountTotal = (loyalty.redeemPoints || 0) / 100;

  return {
    customer,
    address,
    payment,
    coupons,
    loyalty,
    setCustomer,
    setAddress,
    setPayment,
    setCouponForStore,
    setLoyalty,
    reset,
    isCustomerValid,
    isAddressValid,
    isPaymentValid,
    couponDiscountTotal,
    loyaltyDiscountTotal,
  };
}
