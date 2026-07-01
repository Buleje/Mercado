"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface ModuleSubTab {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface ModuleTabsContextValue {
  /** Sub-tabs registered by the active module */
  subTabs: ModuleSubTab[];
  /** Currently active sub-tab ID */
  activeSubTab: string;
  /** Register sub-tabs (called by module on mount) */
  registerSubTabs: (tabs: ModuleSubTab[], activeId: string) => void;
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
  registerSubTabs: () => {},
  setActiveSubTab: () => {},
  onSubTabChange: null,
  registerOnChange: () => {},
  clearSubTabs: () => {},
});

export function ModuleTabsProvider({ children }: { children: ReactNode }) {
  const [subTabs, setSubTabs] = useState<ModuleSubTab[]>([]);
  const [activeSubTab, setActiveSubTabState] = useState("");
  const [onChange, setOnChange] = useState<((id: string) => void) | null>(null);

  const registerSubTabs = useCallback((tabs: ModuleSubTab[], activeId: string) => {
    setSubTabs(tabs);
    setActiveSubTabState(activeId);
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
    setOnChange(null);
  }, []);

  return (
    <ModuleTabsContext.Provider
      value={{ subTabs, activeSubTab, registerSubTabs, setActiveSubTab, onSubTabChange: onChange, registerOnChange, clearSubTabs }}
    >
      {children}
    </ModuleTabsContext.Provider>
  );
}

export function useModuleTabs() {
  return useContext(ModuleTabsContext);
}
