"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface ModuleSubTab {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

/** Metadatos del módulo activo para el header del sub-sidebar. */
export interface ModuleMeta {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface ModuleTabsContextValue {
  /** Sub-tabs registered by the active module */
  subTabs: ModuleSubTab[];
  /** Currently active sub-tab ID */
  activeSubTab: string;
  /** Label + icono del módulo activo (header del sub-sidebar) */
  moduleMeta: ModuleMeta | null;
  /** Register sub-tabs (called by module on mount) */
  registerSubTabs: (tabs: ModuleSubTab[], activeId: string, meta?: ModuleMeta) => void;
  /** Change active sub-tab (called by sidebar click) */
  setActiveSubTab: (id: string) => void;
  /** Callback that modules register to handle sub-tab changes from sidebar */
  onSubTabChange: ((id: string) => void) | null;
  /** Register the module's tab change handler */
  registerOnChange: (handler: (id: string) => void) => void;
  /** Clear all (called when navigating away from module) */
  clearSubTabs: () => void;
}

const ModuleTabsContext = createContext<ModuleTabsContextValue>({
  subTabs: [],
  activeSubTab: "",
  moduleMeta: null,
  registerSubTabs: () => {},
  setActiveSubTab: () => {},
  onSubTabChange: null,
  registerOnChange: () => {},
  clearSubTabs: () => {},
});

export function ModuleTabsProvider({ children }: { children: ReactNode }) {
  const [subTabs, setSubTabs] = useState<ModuleSubTab[]>([]);
  const [activeSubTab, setActiveSubTabState] = useState("");
  const [moduleMeta, setModuleMeta] = useState<ModuleMeta | null>(null);
  const [onChange, setOnChange] = useState<((id: string) => void) | null>(null);

  const registerSubTabs = useCallback((tabs: ModuleSubTab[], activeId: string, meta?: ModuleMeta) => {
    setSubTabs(tabs);
    setActiveSubTabState(activeId);
    if (meta) setModuleMeta(meta);
  }, []);

  const setActiveSubTab = useCallback((id: string) => {
    setActiveSubTabState(id);
    onChange?.(id);
  }, [onChange]);

  const registerOnChange = useCallback((handler: (id: string) => void) => {
    setOnChange(() => handler);
  }, []);

  const clearSubTabs = useCallback(() => {
    setSubTabs([]);
    setActiveSubTabState("");
    setModuleMeta(null);
    setOnChange(null);
  }, []);

  return (
    <ModuleTabsContext.Provider
      value={{ subTabs, activeSubTab, moduleMeta, registerSubTabs, setActiveSubTab, onSubTabChange: onChange, registerOnChange, clearSubTabs }}
    >
      {children}
    </ModuleTabsContext.Provider>
  );
}

export function useModuleTabs() {
  return useContext(ModuleTabsContext);
}
