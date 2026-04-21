"use client";

/**
 * use-saved-addresses.ts
 *
 * Hook para gestionar direcciones guardadas en localStorage por tenant.
 * Se guardan automáticamente al completar un pedido (desde /checkout/confirmar)
 * y se ofrecen como picker en /checkout/entrega para futuros pedidos.
 */

import { useCallback, useEffect, useState } from "react";
import { tenantKey } from "@/contexts/tenant-context";

export interface SavedAddress {
  id: string; // nanoid-like: `${districtCode}-${Date.now()}`
  /** Campo calle/número — display principal. */
  address: string;
  notes: string;
  departmentCode: string;
  departmentName: string;
  provinceCode: string;
  provinceName: string;
  districtCode: string;
  districtName: string;
  zone: string;
  /** ISO timestamp de cuándo se agregó — sort desc = más reciente arriba. */
  savedAt: string;
}

function getTenantSlug(): string {
  if (typeof document === "undefined") return "main";
  const match = document.cookie.match(/(?:^|;\s*)active-tenant=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "main";
}

function getStorageKey(): string {
  return tenantKey(getTenantSlug(), "addresses-list");
}

const MAX_ADDRESSES = 6;

function sameAddress(a: SavedAddress, b: Omit<SavedAddress, "id" | "savedAt">): boolean {
  return (
    a.address.trim().toLowerCase() === b.address.trim().toLowerCase() &&
    a.districtCode === b.districtCode
  );
}

export function useSavedAddresses() {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);

  // Hydrate al montar
  useEffect(() => {
    try {
      const raw = localStorage.getItem(getStorageKey());
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setAddresses(parsed);
    } catch {}
  }, []);

  const persist = useCallback((next: SavedAddress[]) => {
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(next));
    } catch {}
  }, []);

  /**
   * Guarda la dirección actual en la lista. Si ya existe una con misma
   * calle + distrito, sube al tope (más reciente) sin duplicar.
   */
  const saveAddress = useCallback(
    (input: Omit<SavedAddress, "id" | "savedAt">) => {
      if (!input.address?.trim()) return;
      setAddresses((prev) => {
        const existing = prev.find((a) => sameAddress(a, input));
        const now = new Date().toISOString();
        const entry: SavedAddress = existing
          ? { ...existing, ...input, savedAt: now }
          : {
              ...input,
              id: `${input.districtCode || "x"}-${Date.now()}`,
              savedAt: now,
            };
        const rest = prev.filter((a) => !sameAddress(a, input));
        const next = [entry, ...rest].slice(0, MAX_ADDRESSES);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const removeAddress = useCallback(
    (id: string) => {
      setAddresses((prev) => {
        const next = prev.filter((a) => a.id !== id);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  return { addresses, saveAddress, removeAddress };
}
