"use client";

/**
 * contexts/socio-buleje-context.tsx — Estado cliente de Socio Buleje (ADR-078).
 *
 * Fuente única de verdad = servidor. El localStorage es **cache optimista**
 * que se reconcilia con `GET /api/socio-buleje/status` al mount.
 *
 * Provee:
 *   - `isSocio: boolean` — membership activa (o trial).
 *   - `plan` — monthly | yearly | annual (alias compatible).
 *   - `membershipEnd` — fecha de vencimiento ISO.
 *   - `cashbackBalance` — saldo disponible (hidratado del ledger).
 *   - `totalSaved` — acumulado histórico aprox. (se deriva de totalEarned).
 *   - `subscribe(plan)` / `cancel()` / `resume()` — optimistic + server sync.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTenantSlug, tenantKey } from "@/contexts/tenant-context";
import type { SocioPlan } from "@/lib/validators/socio-buleje";

export type SocioBulejeState = {
  isSocio: boolean;
  plan: SocioPlan | null;
  status: "active" | "canceled" | "trial" | "past_due" | "paused" | "cancelled" | null;
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
  refresh: () => Promise<void>;
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

// Dev-demo user id — en prod saldrá de la session / customer auth.
const DEMO_USER_ID = "user_demo_01";
/** userId del socio actual (dev-demo). En prod vendrá de la sesión del cliente. */
export const SOCIO_CURRENT_USER_ID = DEMO_USER_ID;

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

type ServerMembership = {
  userId: string;
  plan: "monthly" | "annual";
  status: "trial" | "active" | "past_due" | "paused" | "cancelled";
  startedAt: string;
  currentPeriodEnd: string;
  cashbackBalance: number;
  totalEarned: number;
  totalRedeemed: number;
};

function daysBetween(a: string, b: string): number {
  const d1 = new Date(a).getTime();
  const d2 = new Date(b).getTime();
  return Math.max(0, Math.floor((d2 - d1) / (24 * 60 * 60 * 1000)));
}

function serverToState(m: ServerMembership | null): SocioBulejeState {
  if (!m) return EMPTY_STATE;
  return {
    isSocio: m.status === "active" || m.status === "trial",
    plan: m.plan,
    status: m.status,
    membershipEnd: m.currentPeriodEnd,
    cashbackBalance: m.cashbackBalance,
    totalSaved: m.totalEarned,
    totalOrdersWithFreeShipping: 0, // no lo trackea ADR-078 v1
    daysAsSocio: daysBetween(m.startedAt, new Date().toISOString()),
  };
}

export function SocioBulejeProvider({ children }: { children: ReactNode }) {
  const slug = useTenantSlug();
  const storageKey = tenantKey(slug, "socio-buleje");
  const [state, setState] = useState<SocioBulejeState>(EMPTY_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const hasHydrated = useRef(false);

  const persist = useCallback(
    (next: SocioBulejeState) => {
      setState(next);
      saveState(storageKey, next);
    },
    [storageKey],
  );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/socio-buleje/status?userId=${encodeURIComponent(DEMO_USER_ID)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        ok: boolean;
        membership: ServerMembership | null;
      };
      if (data.ok) {
        persist(serverToState(data.membership));
      }
    } catch {
      // offline / SSR — dejamos el optimistic state.
    }
  }, [persist]);

  // Hidrata desde localStorage primero (instant UI), luego reconcilia con server.
  // Usamos functional updater para evitar lint de set-state-in-effect.
  useEffect(() => {
    if (hasHydrated.current) return;
    hasHydrated.current = true;
    setState((prev) => {
      const loaded = loadState(storageKey);
      return loaded.isSocio || loaded.status ? loaded : prev;
    });
    setIsLoading((prev) => (prev ? false : prev));
    // Perf: la UI ya está hidratada desde localStorage. La reconciliación con el
    // server se difiere a tiempo idle para NO competir con los fetches críticos
    // del primer pintado (medición 2026-06-02: era 1 de 20 requests al cargar).
    const run = () =>
      refresh().catch((err) => {
        console.warn("[socio-buleje] server hydrate failed", String(err));
      });
    let idleId: number | undefined;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(run, { timeout: 3000 });
    } else {
      timerId = setTimeout(run, 1200);
    }
    return () => {
      if (idleId !== undefined && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timerId !== undefined) clearTimeout(timerId);
    };
  }, [storageKey, refresh]);

  const subscribe = useCallback(
    async (plan: SocioPlan) => {
      const duration = plan === "annual" || plan === "yearly" ? 365 : 30;
      const end = new Date();
      end.setDate(end.getDate() + duration);
      const optimistic: SocioBulejeState = {
        ...state,
        isSocio: true,
        plan,
        status: state.status === "cancelled" || state.status === "canceled" ? "active" : "trial",
        membershipEnd: end.toISOString(),
        cashbackBalance: state.cashbackBalance || 0,
        totalSaved: state.totalSaved || 0,
      };
      persist(optimistic);

      try {
        // Referido: si el link trae ?ref=<code>, lo pasamos para acreditar al referrer.
        const ref =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("ref")
            : null;
        const res = await fetch("/api/socio-buleje/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan, userId: DEMO_USER_ID, ...(ref ? { ref } : {}) }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            ok: boolean;
            membership: ServerMembership | null;
          };
          if (data.ok && data.membership) {
            persist(serverToState(data.membership));
          }
        }
      } catch (err) {
        console.warn("[socio-buleje] subscribe sync failed", String(err));
      }
    },
    [state, persist],
  );

  const cancel = useCallback(async () => {
    const optimistic: SocioBulejeState = { ...state, status: "cancelled" };
    persist(optimistic);
    try {
      const res = await fetch("/api/socio-buleje/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: DEMO_USER_ID }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          ok: boolean;
          membership: ServerMembership | null;
        };
        if (data.ok && data.membership) {
          persist(serverToState(data.membership));
        }
      }
    } catch (err) {
      console.warn("[socio-buleje] cancel sync failed", String(err));
    }
  }, [state, persist]);

  const resume = useCallback(async () => {
    const optimistic: SocioBulejeState = { ...state, status: "active" };
    persist(optimistic);
    await refresh();
  }, [state, persist, refresh]);

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
      refresh,
      computeSavings,
    }),
    [state, isLoading, subscribe, cancel, resume, refresh, computeSavings],
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
    return {
      ...EMPTY_STATE,
      isLoading: false,
      subscribe: async () => {},
      cancel: async () => {},
      resume: async () => {},
      refresh: async () => {},
      computeSavings: () => ({ deliverySavings: 0, cashbackSavings: 0, total: 0 }),
    };
  }
  return ctx;
}
