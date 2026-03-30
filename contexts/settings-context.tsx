"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { type HomepageContent, DEFAULT_HOMEPAGE } from "@/lib/homepage-content";

export type StoreMode = "whatsapp" | "checkout";

export type YapeConfig = {
  enabled: boolean;
  image: string;
  name: string;
  phone: string;
};

export type NavLinkItem = { id: string; visible: boolean };

export const DEFAULT_NAV_LINKS: NavLinkItem[] = [
  { id: "inicio", visible: true },
  { id: "tienda", visible: true },
  { id: "recetas", visible: true },
  { id: "categorias", visible: true },
  { id: "beneficios", visible: true },
  { id: "contacto", visible: true },
];

type SettingsCtx = {
  mode: StoreMode;
  modeLoading: boolean;
  yape: YapeConfig;
  cashEnabled: boolean;
  navLinks: NavLinkItem[];
  homepage: HomepageContent;
  deliveryConfig: DeliveryConfig;
  setMode: (m: StoreMode) => Promise<void>;
};

export type DeliveryConfig = {
  hours: { day: string; open: string; close: string; enabled: boolean }[];
  zones: { name: string; radius: number; price: number; enabled: boolean }[];
  freeDeliveryMin: number;
};

const DEFAULT_DELIVERY: DeliveryConfig = {
  hours: [
    { day: "Lunes", open: "07:00", close: "21:00", enabled: true },
    { day: "Martes", open: "07:00", close: "21:00", enabled: true },
    { day: "Miércoles", open: "07:00", close: "21:00", enabled: true },
    { day: "Jueves", open: "07:00", close: "21:00", enabled: true },
    { day: "Viernes", open: "07:00", close: "21:00", enabled: true },
    { day: "Sábado", open: "07:00", close: "21:00", enabled: true },
    { day: "Domingo", open: "00:00", close: "00:00", enabled: false },
  ],
  zones: [
    { name: "Centro - Callería", radius: 3, price: 0, enabled: true },
    { name: "Yarinacocha", radius: 6, price: 3, enabled: true },
    { name: "Manantay", radius: 8, price: 5, enabled: true },
  ],
  freeDeliveryMin: 50,
};

const SettingsContext = createContext<SettingsCtx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<StoreMode>("whatsapp");
  const [modeLoading, setModeLoading] = useState(true);
  const [yape, setYape] = useState<YapeConfig>({ enabled: false, image: "", name: "", phone: "" });
  const [cashEnabled, setCashEnabled] = useState(true);
  const [navLinks, setNavLinks] = useState<NavLinkItem[]>(DEFAULT_NAV_LINKS);
  const [homepage, setHomepage] = useState<HomepageContent>(DEFAULT_HOMEPAGE);
  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryConfig>(DEFAULT_DELIVERY);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Record<string, unknown> | null) => {
        if (data) {
          if (data.mode) setModeState(data.mode as StoreMode);
          setYape({
            enabled: !!data.yapeEnabled,
            image: (data.yapeImage as string) || "",
            name: (data.yapeName as string) || "",
            phone: (data.yapePhone as string) || "",
          });
          if (data.cashEnabled !== undefined) setCashEnabled(!!data.cashEnabled);
          if (Array.isArray(data.navLinks) && data.navLinks.length > 0) setNavLinks(data.navLinks as NavLinkItem[]);
          if (data.homepageContent && typeof data.homepageContent === "object") {
            setHomepage({ ...DEFAULT_HOMEPAGE, ...(data.homepageContent as Partial<HomepageContent>) });
          }
          if (data.deliveryConfig && typeof data.deliveryConfig === "object") {
            setDeliveryConfig({ ...DEFAULT_DELIVERY, ...(data.deliveryConfig as Partial<DeliveryConfig>) });
          }
        }
      })
      .catch(() => {})
      .finally(() => setModeLoading(false));
  }, []);

  const setMode = useCallback(async (m: StoreMode) => {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: m }),
    });
    setModeState(m);
  }, []);

  return (
    <SettingsContext.Provider value={{ mode, modeLoading, yape, cashEnabled, navLinks, homepage, deliveryConfig, setMode }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be inside SettingsProvider");
  return ctx;
}
