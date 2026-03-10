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

export type SavedLocation = {
  id: string;
  location: string;
  reference: string;
};

export type Customer = {
  name: string;
  phone?: string;
  location: string;
  reference: string;
  locations?: SavedLocation[];
  activeLocationId?: string;
};

type CustomerCtx = {
  customer: Customer | null;
  showModal: boolean;
  openMode: "order" | "profile";
  accountModalOpen: boolean;
  orderStatusModalOpen: boolean;
  register: (data: Customer) => void;
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

const STORAGE_KEY = "bsm-customer";

export function CustomerProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [openMode, setOpenMode] = useState<"order" | "profile">("order");
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [orderStatusModalOpen, setOrderStatusModalOpen] = useState(false);

  // Hydrate from localStorage after mount — null during SSR and first render to avoid mismatch
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.name) startTransition(() => setCustomer(parsed));
      }
    } catch {}
  }, []);

  const register = useCallback((data: Customer) => {
    setCustomer(data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setShowModal(false);
    // Sync to backend if phone is present (fire-and-forget)
    if (data.phone) {
      fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: data.phone,
          name: data.name,
          location: data.location,
          reference: data.reference,
          locations: data.locations ?? [],
          activeLocationId: data.activeLocationId ?? null,
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
        name: string; phone: string; location: string; reference: string;
        locations: SavedLocation[]; activeLocationId: string | null;
      };
      return {
        name: data.name,
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
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <CustomerContext.Provider
      value={{ 
        customer, showModal, openMode, accountModalOpen, orderStatusModalOpen,
        register, openModal, closeModal, openAccountModal, closeAccountModal,
        openOrderStatusModal, closeOrderStatusModal, clear, findByPhone 
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
