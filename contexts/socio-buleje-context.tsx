"use client";

/**
 * contexts/socio-buleje-context.tsx — Estado cliente de Socio Buleje.
 *
 * Provee:
 *   - `isSocio: boolean` — membership activa (o trial).
 *   - `plan` — monthly | yearly.
 *   - `membershipEnd` — fecha de vencimiento ISO.
 *   - `cashbackBalance` — saldo disponible.
 *   - `totalSaved` — ahorro acumulado histórico (S/).
 *   - `subscribe(plan)` / `cancel()` / `resume()`.
 *
 * Persistencia: localStorage key `socio-buleje-{tenantSlug}` (regla tenant-scoped).
 * En prod: se hidrata desde GET /api/socio-buleje/status en cada mount.
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
import { useTenantSlug, tenantKey } from "@/contexts/tenant-context";
import type { SocioPlan } from "@/lib/validators/socio-buleje";

export type SocioBulejeState = {
  isSocio: boolean;
  plan: SocioPlan | null;
  status: "active" | "canceled" | "trial" | null;
  membershipEnd: string | null;
  cashbackBalance: number;
  totalSaved: number;
  totalOrdersWithFreeShipping: number;
  daysAsSocio: number;
};

type SocioBulejeCtx = SocioBulejeState & {
  isLoading: boolean;
  subscribe: (plan: SocioPlan) => Promise<void>;
  cancel: () => Promise<void>;
  resume: () => Promise<void>;
  /** Preview: ¿cuánto ahorraría el usuario con una compra de monto X? */
  computeSavings: (monthlySpend: number) => {
    deliverySavings: number;
    cashbackSavings: number;
    total: number;
  };
};

const EMPTY_STATE: SocioBulejeState = {
  isSocio: false,
  plan: null,
  status: null,
  membershipEnd: null,
  cashbackBalance: 0,
  totalSaved: 0,
  totalOrdersWithFreeShipping: 0,
  daysAsSocio: 0,
};

const SocioBulejeContext = createContext<SocioBulejeCtx | null>(null);

// Asumimos S/6 delivery promedio por pedido — en prod vendría de la zona.
const AVG_DELIVERY_COST = 6;
const ASSUMED_ORDERS_PER_MONTH = 4;
const CASHBACK_RATE = 0.05;

function loadState(storageKey: string): SocioBulejeState {
  if (typeof window === "undefined") return EMPTY_STATE;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<SocioBulejeState>;
    return { ...EMPTY_STATE, ...parsed };
  } catch {
    return EMPTY_STATE;
  }
}

function saveState(storageKey: string, state: SocioBulejeState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // quota exceeded o similar — silent
  }
}

export function SocioBulejeProvider({ children }: { children: ReactNode }) {
  const slug = useTenantSlug();
  const storageKey = tenantKey(slug, "socio-buleje");
  const [state, setState] = useState<SocioBulejeState>(EMPTY_STATE);
  const [isLoading, setIsLoading] = useState(true);

  // Hidrata desde localStorage después del mount (evita SSR mismatch)
  useEffect(() => {
    setState(loadState(storageKey));
    setIsLoading(false);
  }, [storageKey]);

  const persist = useCallback(
    (next: SocioBulejeState) => {
      setState(next);
      saveState(storageKey, next);
    },
    [storageKey],
  );

  const subscribe = useCallback(
    async (plan: SocioPlan) => {
      const duration = plan === "yearly" ? 365 : 30;
      const end = new Date();
      end.setDate(end.getDate() + duration);
      const next: SocioBulejeState = {
        ...state,
        isSocio: true,
        plan,
        status: state.status === "canceled" ? "active" : "trial",
        membershipEnd: end.toISOString(),
        cashbackBalance: state.cashbackBalance || 0,
        totalSaved: state.totalSaved || 0,
      };
      persist(next);
      // Fire-and-forget API call — no bloquea UI (CLAUDE.md #7)
      fetch("/api/socio-buleje/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, userId: "user_demo_01" }),
      }).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("[socio-buleje] subscribe sync failed", String(err));
      });
    },
    [state, persist],
  );

  const cancel = useCallback(async () => {
    const next: SocioBulejeState = { ...state, status: "canceled" };
    persist(next);
    fetch("/api/socio-buleje/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "user_demo_01" }),
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("[socio-buleje] cancel sync failed", String(err));
    });
  }, [state, persist]);

  const resume = useCallback(async () => {
    const next: SocioBulejeState = { ...state, status: "active" };
    persist(next);
  }, [state, persist]);

  const computeSavings = useCallback((monthlySpend: number) => {
    const deliverySavings = AVG_DELIVERY_COST * ASSUMED_ORDERS_PER_MONTH * 12;
    const cashbackSavings = monthlySpend * CASHBACK_RATE * 12;
    return {
      deliverySavings: Math.round(deliverySavings),
      cashbackSavings: Math.round(cashbackSavings),
      total: Math.round(deliverySavings + cashbackSavings),
    };
  }, []);

  const value = useMemo<SocioBulejeCtx>(
    () => ({
      ...state,
      isLoading,
      subscribe,
      cancel,
      resume,
      computeSavings,
    }),
    [state, isLoading, subscribe, cancel, resume, computeSavings],
  );

  return (
    <SocioBulejeContext.Provider value={value}>
      {children}
    </SocioBulejeContext.Provider>
  );
}

export function useSocioBuleje(): SocioBulejeCtx {
  const ctx = useContext(SocioBulejeContext);
  if (!ctx) {
    // Graceful fallback: si no hay provider, devolvemos estado vacío.
    // Evita crashes cuando un componente se renderiza fuera del árbol store.
    return {
      ...EMPTY_STATE,
      isLoading: false,
      subscribe: async () => {},
      cancel: async () => {},
      resume: async () => {},
      computeSavings: () => ({ deliverySavings: 0, cashbackSavings: 0, total: 0 }),
    };
  }
  return ctx;
}
