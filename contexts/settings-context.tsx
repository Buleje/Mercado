"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

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
  { id: "productos", visible: true },
  { id: "beneficios", visible: true },
  { id: "contacto", visible: true },
];

type SettingsCtx = {
  mode: StoreMode;
  modeLoading: boolean;
  yape: YapeConfig;
  cashEnabled: boolean;
  navLinks: NavLinkItem[];
  setMode: (m: StoreMode) => Promise<void>;
};

const SettingsContext = createContext<SettingsCtx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<StoreMode>("whatsapp");
  const [modeLoading, setModeLoading] = useState(true);
  const [yape, setYape] = useState<YapeConfig>({ enabled: false, image: "", name: "", phone: "" });
  const [cashEnabled, setCashEnabled] = useState(true);
  const [navLinks, setNavLinks] = useState<NavLinkItem[]>(DEFAULT_NAV_LINKS);

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
    <SettingsContext.Provider value={{ mode, modeLoading, yape, cashEnabled, navLinks, setMode }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be inside SettingsProvider");
  return ctx;
}
