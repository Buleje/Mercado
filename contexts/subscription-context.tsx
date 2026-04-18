"use client";

/**
 * SubscriptionContext — "Bodega al Mes" (Amazon Subscribe & Save adaptado PE).
 *
 * Estado local persistido en localStorage por tenant. NO toca el backend ni
 * la state-machine de pedidos. La suscripcion genera pedidos "virtuales" que
 * quedan programados y se muestran en /cuenta/suscripciones.
 *
 * Regla 3: tenantKey() para aislamiento multi-tenant.
 * Regla 7: fire-and-forget para persistencia localStorage.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  startTransition,
  type ReactNode,
} from "react";
import { useTenantSlug, tenantKey } from "@/contexts/tenant-context";

// ── Types ────────────────────────────────────────────────────────────────────

export type SubscriptionFrequency =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "bimonthly";

export type SubscriptionStatus = "active" | "paused" | "cancelled";

export interface SubscriptionPlan {
  id: string;
  productId: string;
  productName: string;
  productImage: string;
  /** Precio base antes del 5 %. */
  unitPrice: number;
  frequency: SubscriptionFrequency;
  quantity: number;
  /** Fecha ISO de proxima entrega. */
  nextDelivery: string;
  /** Descuento decimal. Default 0.05 (5 %). */
  discount: number;
  status: SubscriptionStatus;
  createdAt: string;
  /** Total ahorrado acumulado por entregas pasadas. */
  savedAmount?: number;
}

export interface SubscribeInput {
  productId: string;
  productName: string;
  productImage: string;
  unitPrice: number;
  frequency: SubscriptionFrequency;
  quantity: number;
  discount?: number;
}

interface SubscriptionContextValue {
  subscriptions: SubscriptionPlan[];
  hydrated: boolean;
  subscribe: (input: SubscribeInput) => SubscriptionPlan;
  pause: (id: string) => void;
  resume: (id: string) => void;
  cancel: (id: string) => void;
  remove: (id: string) => void;
  changeFrequency: (id: string, frequency: SubscriptionFrequency) => void;
  skipNextDelivery: (id: string) => void;
  changeQuantity: (id: string, quantity: number) => void;
  /** Total ahorrado (historico + futuras entregas activas estimadas a 12 meses). */
  totalSaved: number;
  /** Ahorro proyectado a 12 meses si mantiene todas las activas. */
  projectedYearlySavings: number;
  /** Proxima entrega (fecha ISO o null). */
  upcomingDelivery: SubscriptionPlan | null;
  /** Cantidad de suscripciones activas. */
  activeCount: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const FREQUENCY_DAYS: Record<SubscriptionFrequency, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  bimonthly: 60,
};

/** Entregas anuales estimadas por frecuencia (365 / days). */
const FREQUENCY_PER_YEAR: Record<SubscriptionFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  bimonthly: 6,
};

function addDaysISO(baseIso: string, days: number): string {
  const d = new Date(baseIso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function nextDeliveryFromNow(frequency: SubscriptionFrequency): string {
  return addDaysISO(new Date().toISOString(), FREQUENCY_DAYS[frequency]);
}

function loadPlans(key: string): SubscriptionPlan[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SubscriptionPlan[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function genId(): string {
  return `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Context ──────────────────────────────────────────────────────────────────

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({
  children,
  seed,
}: {
  children: ReactNode;
  /** Mock/seed inyectable para demos. */
  seed?: SubscriptionPlan[];
}) {
  const slug = useTenantSlug();
  const storageKey = tenantKey(slug, "subscriptions");

  const [subscriptions, setSubscriptions] = useState<SubscriptionPlan[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage (or seed) after mount.
  useEffect(() => {
    startTransition(() => {
      const stored = loadPlans(storageKey);
      if (stored.length > 0) {
        setSubscriptions(stored);
      } else if (seed && seed.length > 0) {
        setSubscriptions(seed);
      }
      setHydrated(true);
    });
  }, [storageKey, seed]);

  // Persist (fire-and-forget).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(subscriptions));
    } catch {
      /* ignore quota errors */
    }
  }, [subscriptions, hydrated, storageKey]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const subscribe = useCallback((input: SubscribeInput): SubscriptionPlan => {
    const plan: SubscriptionPlan = {
      id: genId(),
      productId: input.productId,
      productName: input.productName,
      productImage: input.productImage,
      unitPrice: input.unitPrice,
      frequency: input.frequency,
      quantity: Math.max(1, input.quantity),
      discount: input.discount ?? 0.05,
      status: "active",
      createdAt: new Date().toISOString(),
      nextDelivery: nextDeliveryFromNow(input.frequency),
      savedAmount: 0,
    };
    setSubscriptions((prev) => [plan, ...prev]);
    return plan;
  }, []);

  const pause = useCallback((id: string) => {
    setSubscriptions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "paused" } : s)),
    );
  }, []);

  const resume = useCallback((id: string) => {
    setSubscriptions((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              status: "active",
              nextDelivery: nextDeliveryFromNow(s.frequency),
            }
          : s,
      ),
    );
  }, []);

  const cancel = useCallback((id: string) => {
    setSubscriptions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "cancelled" } : s)),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setSubscriptions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const changeFrequency = useCallback(
    (id: string, frequency: SubscriptionFrequency) => {
      setSubscriptions((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                frequency,
                nextDelivery: nextDeliveryFromNow(frequency),
              }
            : s,
        ),
      );
    },
    [],
  );

  const skipNextDelivery = useCallback((id: string) => {
    setSubscriptions((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              nextDelivery: addDaysISO(s.nextDelivery, FREQUENCY_DAYS[s.frequency]),
            }
          : s,
      ),
    );
  }, []);

  const changeQuantity = useCallback((id: string, quantity: number) => {
    setSubscriptions((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, quantity: Math.max(1, quantity) } : s,
      ),
    );
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────
  const { totalSaved, projectedYearlySavings, upcomingDelivery, activeCount } =
    useMemo(() => {
      const active = subscriptions.filter((s) => s.status === "active");
      const totalSavedAcc = subscriptions.reduce(
        (acc, s) => acc + (s.savedAmount ?? 0),
        0,
      );
      const projected = active.reduce((acc, s) => {
        const perDelivery = s.unitPrice * s.quantity * s.discount;
        return acc + perDelivery * FREQUENCY_PER_YEAR[s.frequency];
      }, 0);
      const upcoming = active
        .slice()
        .sort(
          (a, b) =>
            new Date(a.nextDelivery).getTime() -
            new Date(b.nextDelivery).getTime(),
        )[0] ?? null;
      return {
        totalSaved: totalSavedAcc + projected, // preview: historico + proyeccion
        projectedYearlySavings: projected,
        upcomingDelivery: upcoming,
        activeCount: active.length,
      };
    }, [subscriptions]);

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      subscriptions,
      hydrated,
      subscribe,
      pause,
      resume,
      cancel,
      remove,
      changeFrequency,
      skipNextDelivery,
      changeQuantity,
      totalSaved,
      projectedYearlySavings,
      upcomingDelivery,
      activeCount,
    }),
    [
      subscriptions,
      hydrated,
      subscribe,
      pause,
      resume,
      cancel,
      remove,
      changeFrequency,
      skipNextDelivery,
      changeQuantity,
      totalSaved,
      projectedYearlySavings,
      upcomingDelivery,
      activeCount,
    ],
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscriptions(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error("useSubscriptions must be used inside <SubscriptionProvider>");
  }
  return ctx;
}

// ── Label helpers for UI ─────────────────────────────────────────────────────

export const FREQUENCY_LABEL: Record<SubscriptionFrequency, string> = {
  weekly: "Cada 1 semana",
  biweekly: "Cada 2 semanas",
  monthly: "Cada mes",
  bimonthly: "Cada 2 meses",
};

export const FREQUENCY_SHORT: Record<SubscriptionFrequency, string> = {
  weekly: "Semanal",
  biweekly: "Quincenal",
  monthly: "Mensual",
  bimonthly: "Bimestral",
};

export { FREQUENCY_DAYS, FREQUENCY_PER_YEAR };
