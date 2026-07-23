"use client";

/**
 * app/admin/_hooks/useAdminPageState.ts
 *
 * Hook que agrupa estado de UI local del AdminPage que no ameritaba su
 * propio hook especializado: selección de categoría, dropdowns, accordion,
 * flyout del sidebar colapsado, búsqueda del sidebar, etc.
 *
 * Extraído de app/admin/page.tsx (Sprint A etapa final del refactor —
 * ver docs/refactor-giant-files-plan.md).
 */

import { useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

export interface UseAdminPageStateResult {
  selectedCategory: string | null;
  setSelectedCategory: Dispatch<SetStateAction<string | null>>;
  categoryDropdownOpen: boolean;
  setCategoryDropdownOpen: Dispatch<SetStateAction<boolean>>;
  sidebarSearch: string;
  setSidebarSearch: Dispatch<SetStateAction<string>>;
  showModuleHelp: boolean;
  setShowModuleHelp: Dispatch<SetStateAction<boolean>>;
  recentCollapsed: boolean;
  setRecentCollapsed: Dispatch<SetStateAction<boolean>>;
  hoveredCategory: string | null;
  setHoveredCategory: Dispatch<SetStateAction<string | null>>;
  openAccordionCategories: Set<string>;
  setOpenAccordionCategories: Dispatch<SetStateAction<Set<string>>>;
  sidebarFlyout: { categoryId: string; top: number } | null;
  setSidebarFlyout: Dispatch<
    SetStateAction<{ categoryId: string; top: number } | null>
  >;
  flyoutTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

export function useAdminPageState(): UseAdminPageStateResult {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [showModuleHelp, setShowModuleHelp] = useState(false);
  // Arranca DESPLEGADA: la sección de recientes estuvo sin pintarse mucho
  // tiempo y con el default plegado seguiría escondida — su valor es verse
  // apenas abrís el panel. Se recuerda plegada si el usuario la cierra.
  const [recentCollapsed, setRecentCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("admin-recientes-plegado") === "true"; } catch { return false; }
  });
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [openAccordionCategories, setOpenAccordionCategories] = useState<
    Set<string>
  >(new Set());
  const [sidebarFlyout, setSidebarFlyout] = useState<{
    categoryId: string;
    top: number;
  } | null>(null);
  const flyoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return {
    selectedCategory,
    setSelectedCategory,
    categoryDropdownOpen,
    setCategoryDropdownOpen,
    sidebarSearch,
    setSidebarSearch,
    showModuleHelp,
    setShowModuleHelp,
    recentCollapsed,
    setRecentCollapsed,
    hoveredCategory,
    setHoveredCategory,
    openAccordionCategories,
    setOpenAccordionCategories,
    sidebarFlyout,
    setSidebarFlyout,
    flyoutTimerRef,
  };
}
