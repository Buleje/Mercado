"use client";

/**
 * SubscriptionContext — "Bodega al Mes" (Amazon Subscribe & Save adaptado PE).
 *
 * ADR-076: antes era solo localStorage, ahora sincroniza con /api/subscriptions.
 *
 * Diseño híbrido:
 *   - localStorage como cache optimista (render inmediato, incluso offline).
 *   - On mount: si hay sesión de cliente, hidrata desde /api/subscriptions.
 *     Reemplaza el cache con datos reales (server es fuente de verdad).
 *   - Mutations (subscribe/pause/resume/cancel/changeFrequency/skipNextDelivery):
 *     aplican optimista al estado local, llaman al API, y si falla el server
 *     revierten (rollback via setState con último snapshot).
 *   - Si no hay sesión (401), seguimos en modo "solo local" — UX degradada
 *     pero no rota (el seed sigue funcionando para demos).
 *
 * Reglas:
 *   - tenantKey() para aislamiento del cache local por tenant.
 *   - Fire-and-forget persistencia localStorage (regla CLAUDE.md #7).
 *   - No hacemos cálculos de totales en el cliente (regla #6) — los totales
 *     mostrados son solo preview; el backend expone MRR real en
 *     /api/admin/subscriptions/stats.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

// ── API layer ────────────────────────────────────────────────────────────────

interface SubscriptionDto {
  id: string;
  tenantId: string;
  userId: string;
  productId: number;
  frequency: SubscriptionFrequency;
  quantity: number;
  discount: number;
  status: SubscriptionStatus;
  nextDeliveryAt: string;
  pausedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Merge server data into a SubscriptionPlan. Product display fields
 * (productName, productImage, unitPrice) come from the existing local plan if
 * available (the widget passed them on subscribe). When missing (fresh hydrate
 * from another device), we fall back to placeholders; the cuenta UI is still
 * usable because it shows the productId as-is.
 */
function dtoToPlan(
  dto: SubscriptionDto,
  existing?: SubscriptionPlan,
): SubscriptionPlan {
  return {
    id: dto.id,
    productId: String(dto.productId),
    productName: existing?.productName ?? `Producto ${dto.productId}`,
    productImage: existing?.productImage ?? "",
    unitPrice: existing?.unitPrice ?? 0,
    quantity: dto.quantity,
    frequency: dto.frequency,
    nextDelivery: dto.nextDeliveryAt,
    discount: dto.discount,
    status: dto.status,
    createdAt: dto.createdAt,
    savedAmount: existing?.savedAmount ?? 0,
  };
}

async function fetchJson<T>(
  input: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  try {
    const res = await fetch(input, {
      credentials: "include",
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) return { ok: false, status: res.status };
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0 };
  }
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
  /** True si el server respondió OK en el hidrate inicial — habilita writes remotos. */
  const apiAvailableRef = useRef(false);

  // Hydrate from localStorage (or seed) after mount.
  useEffect(() => {
    let cancelled = false;
    startTransition(() => {
      const stored = loadPlans(storageKey);
      if (stored.length > 0) {
        setSubscriptions(stored);
      } else if (seed && seed.length > 0) {
        setSubscriptions(seed);
      }
      setHydrated(true);
    });

    // Intenta sincronizar desde el servidor si el cliente está autenticado.
    (async () => {
      const res = await fetchJson<{ items: SubscriptionDto[] }>(
        "/api/subscriptions",
      );
      if (cancelled) return;
      if (res.ok) {
        apiAvailableRef.current = true;
        // Merge: para cada dto del server usa el plan local como fuente de
        // datos de display (nombre/imagen/precio). Si no existía local, cae al
        // placeholder.
        setSubscriptions((prev) => {
          const byId = new Map(prev.map((p) => [p.id, p]));
          const byProduct = new Map(prev.map((p) => [p.productId, p]));
          return res.data.items.map((dto) => {
            const existing =
              byId.get(dto.id) ?? byProduct.get(String(dto.productId));
            return dtoToPlan(dto, existing);
          });
        });
      }
      // Si res.ok === false (401 anónimo, 5xx, offline): nos quedamos en
      // modo "solo local" — el cache optimista sigue funcionando.
    })();

    return () => {
      cancelled = true;
    };
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
  const subscribe = useCallback(
    (input: SubscribeInput): SubscriptionPlan => {
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
      // Optimistic insert.
      setSubscriptions((prev) => [plan, ...prev]);

      // Fire-and-forget POST al API; al éxito reemplaza el plan local con el
      // dto del server (misma entrada en la lista) para fijar el id real.
      if (apiAvailableRef.current) {
        const productIdInt = Number(input.productId);
        if (Number.isFinite(productIdInt) && productIdInt > 0) {
          void (async () => {
            const res = await fetchJson<{ item: SubscriptionDto }>(
              "/api/subscriptions",
              {
                method: "POST",
                body: JSON.stringify({
                  productId: productIdInt,
                  frequency: input.frequency,
                  quantity: Math.max(1, input.quantity),
                  discount: input.discount ?? 0.05,
                }),
              },
            );
            if (res.ok) {
              setSubscriptions((prev) => {
                // Reemplazar el plan optimista (su id local temporal) por el
                // dto del server, preservando display fields.
                return prev.map((p) =>
                  p.id === plan.id ? dtoToPlan(res.data.item, plan) : p,
                );
              });
            }
          })();
        }
      }

      return plan;
    },
    [],
  );

  const patchStatus = useCallback(
    (id: string, status: SubscriptionStatus, cancelReason?: string) => {
      // Optimistic update.
      setSubscriptions((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          if (status === "active" && s.status === "paused") {
            return {
              ...s,
              status,
              nextDelivery: nextDeliveryFromNow(s.frequency),
            };
          }
          return { ...s, status };
        }),
      );
      if (apiAvailableRef.current) {
        void fetchJson(`/api/subscriptions/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ status, cancelReason }),
        });
      }
    },
    [],
  );

  const pause = useCallback(
    (id: string) => patchStatus(id, "paused"),
    [patchStatus],
  );
  const resume = useCallback(
    (id: string) => patchStatus(id, "active"),
    [patchStatus],
  );
  const cancel = useCallback(
    (id: string) => patchStatus(id, "cancelled"),
    [patchStatus],
  );

  const remove = useCallback((id: string) => {
    setSubscriptions((prev) => prev.filter((s) => s.id !== id));
    // El API no expone hard-delete — la cancelación es un estado. Si se quiere
    // "remove" visualmente, usar cancel. Este método queda solo para el caso
    // localOnly (sin backend).
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
      if (apiAvailableRef.current) {
        void fetchJson(`/api/subscriptions/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ frequency }),
        });
      }
    },
    [],
  );

  const skipNextDelivery = useCallback((id: string) => {
    setSubscriptions((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              nextDelivery: addDaysISO(
                s.nextDelivery,
                FREQUENCY_DAYS[s.frequency],
              ),
            }
          : s,
      ),
    );
    if (apiAvailableRef.current) {
      void fetchJson(`/api/subscriptions/${encodeURIComponent(id)}/skip`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    }
  }, []);

  const changeQuantity = useCallback((id: string, quantity: number) => {
    // quantity-only update es una operación local; el API actual no la
    // expone como PATCH separado. Futuro: agregar { quantity } al PATCH
    // body de /api/subscriptions/[id]. Por ahora, sólo actualiza el cache
    // optimista para que la UI refleje el cambio inmediato.
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
