"use client";

/**
 * useSmartDefaults — Memoriza preferencias del user para pre-completar.
 *
 * Al checkout, delivery, addresses, metodo de pago, etc — guardamos la
 * ultima eleccion exitosa y la proponemos como default en la proxima
 * sesion. El user puede cambiar siempre.
 *
 * Storage: localStorage con namespace "buleje-defaults-v1".
 *
 * API:
 *   const { get, set } = useSmartDefaults();
 *   const lastPayment = get("paymentMethod", "yape");
 *   set("paymentMethod", "cash"); // al confirmar pedido exitoso
 */

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "buleje-defaults-v1";

// Tipo extensible — cada feature declara sus propios keys
type DefaultsRecord = {
  paymentMethod?: "yape" | "plin" | "cash" | "card";
  deliverySlot?: "asap" | "morning" | "afternoon" | "evening";
  deliveryAddressId?: string;
  phoneNumber?: string;
  preferredStore?: string;
  tipAmount?: number;
  ticketType?: "boleta" | "factura" | "ticket";
  notificationChannel?: "whatsapp" | "push" | "email";
  locale?: "es-PE" | "en-US";
  lastCategory?: string;
  sortBy?: "relevancia" | "precio-asc" | "precio-desc" | "nuevo";
};

function readDefaults(): DefaultsRecord {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as DefaultsRecord;
  } catch {
    return {};
  }
}

function writeDefaults(d: DefaultsRecord) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  } catch {
    /* silent — quota full */
  }
}

export function useSmartDefaults() {
  const [defaults, setDefaults] = useState<DefaultsRecord>({});

  // Cargar al mount
  useEffect(() => {
    setDefaults(readDefaults());
  }, []);

  // Cross-tab sync
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setDefaults(readDefaults());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const get = useCallback(
    <K extends keyof DefaultsRecord>(key: K, fallback: NonNullable<DefaultsRecord[K]>): NonNullable<DefaultsRecord[K]> => {
      return (defaults[key] ?? fallback) as NonNullable<DefaultsRecord[K]>;
    },
    [defaults],
  );

  const set = useCallback(<K extends keyof DefaultsRecord>(key: K, value: DefaultsRecord[K]) => {
    setDefaults((prev) => {
      const next = { ...prev, [key]: value };
      writeDefaults(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    writeDefaults({});
    setDefaults({});
  }, []);

  return { defaults, get, set, reset };
}

/**
 * Helper standalone sin hook — util desde handlers fuera de React.
 */
export const smartDefaults = {
  get<K extends keyof DefaultsRecord>(
    key: K,
    fallback: NonNullable<DefaultsRecord[K]>,
  ): NonNullable<DefaultsRecord[K]> {
    const d = readDefaults();
    return (d[key] ?? fallback) as NonNullable<DefaultsRecord[K]>;
  },
  set<K extends keyof DefaultsRecord>(key: K, value: DefaultsRecord[K]) {
    const d = readDefaults();
    writeDefaults({ ...d, [key]: value });
  },
  clear() {
    writeDefaults({});
  },
};
