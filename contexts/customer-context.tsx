"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  startTransition,
  type ReactNode,
} from "react";
import { tenantKey } from "@/contexts/tenant-context";

export type SavedLocation = {
  id: string;
  location: string;
  reference: string;
};

export type Customer = {
  name: string;
  dni?: string;
  phone?: string;
  email?: string;
  location: string;
  reference: string;
  locations?: SavedLocation[];
  activeLocationId?: string;
  birthday?: string; // MM-DD
  /** Direccion calle + numero (ej. "Jr. Las Magnolias 254"). */
  addressLine?: string;
  /** Codigo INEI 2 digitos del departamento (ej. "25" = Ucayali). */
  departmentCode?: string;
  departmentName?: string;
  /** Codigo INEI 2 digitos de la provincia (ej. "01" = Coronel Portillo). */
  provinceCode?: string;
  provinceName?: string;
  /** Codigo INEI 2 digitos del distrito (ej. "01" = Calleria). */
  districtCode?: string;
  districtName?: string;
};

/** True si el customer tiene perfil COMPLETO listo para fast-track al checkout. */
export function isCustomerProfileComplete(c: Customer | null): boolean {
  if (!c) return false;
  return Boolean(
    c.name &&
      c.phone &&
      c.addressLine &&
      c.departmentCode &&
      c.provinceCode &&
      c.districtCode,
  );
}

type CustomerCtx = {
  customer: Customer | null;
  /** false hasta que terminó la hidratación de auth (localStorage o cookie /me).
   *  El navbar muestra un skeleton mientras sea false, para no parpadear
   *  "Ingresar" → avatar en usuarios ya logueados. */
  hydrated: boolean;
  /** Lista de todas las cuentas guardadas en este dispositivo (multi-account). */
  accounts: Customer[];
  showModal: boolean;
  openMode: "order" | "profile";
  accountModalOpen: boolean;
  orderStatusModalOpen: boolean;
  register: (data: Customer) => void;
  /** Cambia el customer activo entre las accounts guardadas. Devuelve true si se encontró. */
  switchAccount: (phone: string) => boolean;
  /** Elimina una cuenta de la lista (si es la activa, deja null). */
  removeAccount: (phone: string) => void;
  openModal: (mode?: "order" | "profile") => void;
  closeModal: () => void;
  openAccountModal: () => void;
  closeAccountModal: () => void;
  openOrderStatusModal: () => void;
  closeOrderStatusModal: () => void;
  clear: () => void;
  findByPhone: (phone: string) => Promise<Customer | null>;
};

const CustomerContext = createContext<CustomerCtx | null>(null);

/**
 * Resolve el tenant slug del cliente actual.
 *
 * FIX 2026-05-07: antes solo leía la cookie active-tenant. Si el cliente
 * entraba directo a /t/mi-pollo/tienda SIN haber abierto el admin antes
 * (no hay cookie), retornaba "main" y la cuenta del cliente se guardaba/
 * leía en el tenant equivocado. Resultado: la tienda parecía "redirigida
 * a main" porque todos los datos del customer venían del tenant default.
 *
 * Orden de resolución (mismo patrón que settings-context.tsx, commit d8cbef10):
 *   1. URL path /t/[slug]/... — fuente de verdad cuando navegas explícito.
 *   2. Cookie active-tenant — set por el admin al loguearse.
 *   3. "main" como default.
 */
function getTenantSlug(): string {
  if (typeof window === "undefined") return "main";
  // 1. Path
  const pathMatch = window.location.pathname.match(/^\/t\/([^/]+)/);
  if (pathMatch) return decodeURIComponent(pathMatch[1]);
  // 2. Cookie
  const cookieMatch = document.cookie.match(/(?:^|;\s*)active-tenant=([^;]+)/);
  if (cookieMatch) return decodeURIComponent(cookieMatch[1]);
  // 3. Default
  return "main";
}

function getStorageKey(): string {
  return tenantKey(getTenantSlug(), "customer");
}

/** Key donde guardamos el ARRAY de todas las cuentas (multi-account). */
function getAccountsStorageKey(): string {
  return tenantKey(getTenantSlug(), "accounts-list");
}

/** Dedupe accounts by phone, preservando orden (primero = más reciente). */
function upsertAccount(list: Customer[], next: Customer): Customer[] {
  if (!next.phone) return [next, ...list.filter(() => false)]; // sin phone no se agrega a la lista
  const normalized = next.phone.replace(/\D/g, "");
  const cleaned = list.filter((c) => c.phone?.replace(/\D/g, "") !== normalized);
  return [next, ...cleaned].slice(0, 8); // max 8 cuentas guardadas
}

export function CustomerProvider({
  children,
  // Audit #9 (SSR-auth, Brandon 2026-07-06): estado inicial resuelto en el SERVER
  // desde la cookie buleje-customer-sess. `undefined` = el server no lo proveyó
  // (comportamiento viejo con skeleton). Con valor (Customer o null) arrancamos
  // HIDRATADOS → el navbar pinta el estado real en el primer byte, sin skeleton
  // ni CLS. El cliente arranca con el mismo prop → sin hydration mismatch; el
  // useEffect de abajo reconcilia con localStorage / /me después.
  initialCustomer,
}: {
  children: ReactNode;
  initialCustomer?: Customer | null;
}) {
  const [customer, setCustomer] = useState<Customer | null>(initialCustomer ?? null);
  const [accounts, setAccounts] = useState<Customer[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [openMode, setOpenMode] = useState<"order" | "profile">("order");
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [orderStatusModalOpen, setOrderStatusModalOpen] = useState(false);
  // Brandon 2026-06-04 (auditoría /negocios): true cuando terminó la hidratación
  // de auth (localStorage o /api/auth/customer/me). El navbar lo usa para mostrar
  // un skeleton estable en vez de parpadear "Ingresar" → avatar.
  // Audit #9: si el server proveyó initialCustomer (aunque sea null = logout),
  // ya conocemos el estado de auth → arrancamos hidratados (sin skeleton).
  const [hydrated, setHydrated] = useState(initialCustomer !== undefined);

  // Hydrate from localStorage after mount — null during SSR to avoid mismatch.
  // Si no hay localStorage (primera visita en este dispositivo) pero SÍ existe
  // la cookie `buleje-customer-sess` (creada tras OTP/OAuth), preguntamos al
  // endpoint `/api/auth/customer/me` y rehidratamos. Esta es la "llave
  // maestra": el user queda logueado 30 días sin hacer nada.
  useEffect(() => {
    let cancelled = false;

    const hydrateFromServer = async () => {
      try {
        const res = await fetch("/api/auth/customer/me", {
          credentials: "include",
          cache: "no-store",
        });
        if (cancelled) return;
        if (!res.ok) return;
        const data = (await res.json()) as {
          authenticated?: boolean;
          customer?: { name: string; phone?: string };
        };
        if (!data.authenticated || !data.customer?.name) return;

        const next: Customer = {
          name: data.customer.name,
          ...(data.customer.phone ? { phone: data.customer.phone } : {}),
          location: "",
          reference: "",
        };
        startTransition(() => setCustomer(next));
        try {
          localStorage.setItem(getStorageKey(), JSON.stringify(next));
        } catch {}
      } catch {
        /* fire-and-forget — si falla, queda null */
      } finally {
        if (!cancelled) setHydrated(true);
      }
    };

    // Hidratar la lista de accounts (independiente del customer activo)
    try {
      const savedList = localStorage.getItem(getAccountsStorageKey());
      if (savedList) {
        const parsedList = JSON.parse(savedList);
        if (Array.isArray(parsedList)) {
          startTransition(() => setAccounts(parsedList));
        }
      }
    } catch {}

    try {
      const key = getStorageKey();
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.name) {
          startTransition(() => setCustomer(parsed));
          setHydrated(true);
          return; // localStorage suficiente
        }
      }
    } catch {}

    // localStorage vacío → probamos con la cookie del server
    void hydrateFromServer();

    return () => {
      cancelled = true;
    };
  }, []);

  const register = useCallback((data: Customer) => {
    setCustomer(data);
    localStorage.setItem(getStorageKey(), JSON.stringify(data));
    // FIX 2026-05-07: limpiar flag de session expirada al hacer login fresco.
    // Header.tsx setea sessionStorage["customer-notifs-401:${phone}"] cuando
    // recibe 401, para evitar spam de polling. Al re-loguearse hay cookie nueva.
    if (data.phone) {
      try { sessionStorage.removeItem(`customer-notifs-401:${data.phone}`); } catch { /* ignore */ }
    }
    // Upsert en la lista de accounts (multi-account support)
    setAccounts((prev) => {
      const next = upsertAccount(prev, data);
      try {
        localStorage.setItem(getAccountsStorageKey(), JSON.stringify(next));
      } catch {}
      return next;
    });
    setShowModal(false);
    // El POST a /api/customers requiere sesión admin (CRM). Desde el checkout
    // del marketplace los clientes no son admin → siempre 403. Sólo intentamos
    // el sync si detectamos cookie de sesión admin presente. El registro local
    // (localStorage + context) ya quedó hecho.
    const hasAdminSession =
      typeof document !== "undefined" &&
      /(?:^|;\s*)buleje-sess=/.test(document.cookie);
    if (data.phone && hasAdminSession) {
      fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: data.phone,
          name: data.name,
          dni: data.dni ?? null,
          location: data.location,
          reference: data.reference,
          locations: data.locations ?? [],
          activeLocationId: data.activeLocationId ?? null,
          birthday: data.birthday ?? null,
        }),
      }).catch(() => {});
    }
  }, []);

  const findByPhone = useCallback(async (phone: string): Promise<Customer | null> => {
    try {
      const normalized = phone.replace(/\D/g, "").slice(-9);
      const res = await fetch(`/api/customers/${normalized}`);
      if (!res.ok) return null;
      const data = await res.json() as {
        name: string; dni?: string | null; phone: string; location: string; reference: string;
        locations: SavedLocation[]; activeLocationId: string | null;
      };
      return {
        name: data.name,
        ...(data.dni ? { dni: data.dni } : {}),
        phone: data.phone,
        location: data.location,
        reference: data.reference,
        locations: data.locations,
        activeLocationId: data.activeLocationId ?? undefined,
      };
    } catch {
      return null;
    }
  }, []);

  const openModal = useCallback((mode: "order" | "profile" = "order") => {
    setOpenMode(mode);
    setShowModal(true);
  }, []);
  const closeModal = useCallback(() => setShowModal(false), []);
  const openAccountModal = useCallback(() => setAccountModalOpen(true), []);
  const closeAccountModal = useCallback(() => setAccountModalOpen(false), []);
  const openOrderStatusModal = useCallback(() => setOrderStatusModalOpen(true), []);
  const closeOrderStatusModal = useCallback(() => setOrderStatusModalOpen(false), []);
  const clear = useCallback(() => {
    setCustomer(null);
    localStorage.removeItem(getStorageKey());
  }, []);

  const switchAccount = useCallback(
    (phone: string) => {
      const normalized = phone.replace(/\D/g, "");
      const found = accounts.find((c) => c.phone?.replace(/\D/g, "") === normalized);
      if (!found) return false;
      setCustomer(found);
      try {
        localStorage.setItem(getStorageKey(), JSON.stringify(found));
        // Mover la seleccionada al tope de la lista (más reciente)
        const next = upsertAccount(accounts, found);
        setAccounts(next);
        localStorage.setItem(getAccountsStorageKey(), JSON.stringify(next));
      } catch {}
      return true;
    },
    [accounts],
  );

  const removeAccount = useCallback((phone: string) => {
    const normalized = phone.replace(/\D/g, "");
    setAccounts((prev) => {
      const next = prev.filter((c) => c.phone?.replace(/\D/g, "") !== normalized);
      try {
        localStorage.setItem(getAccountsStorageKey(), JSON.stringify(next));
      } catch {}
      return next;
    });
    setCustomer((curr) =>
      curr?.phone?.replace(/\D/g, "") === normalized ? null : curr,
    );
  }, []);

  return (
    <CustomerContext.Provider
      value={{
        customer, hydrated, accounts, showModal, openMode, accountModalOpen, orderStatusModalOpen,
        register, switchAccount, removeAccount,
        openModal, closeModal, openAccountModal, closeAccountModal,
        openOrderStatusModal, closeOrderStatusModal, clear, findByPhone,
      }}
    >
      {children}
    </CustomerContext.Provider>
  );
}

export function useCustomer() {
  const ctx = useContext(CustomerContext);
  if (!ctx) throw new Error("useCustomer must be inside CustomerProvider");
  return ctx;
}
