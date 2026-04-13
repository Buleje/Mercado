"use client";

/**
 * app/admin/_components/AdminMainContent.tsx
 *
 * Área `<main>` del panel admin — breadcrumb + AnimatePresence + TabRouter.
 * Extraído de app/admin/page.tsx en el Sprint A final del refactor.
 *
 * Encapsula:
 *  - Clases responsivas del contenedor (focus / compact / presentation)
 *  - Swipe handlers para mobile
 *  - Breadcrumb calculado desde `TAB_CATEGORIES` + `MODULE_INFO`
 *  - Transición suave entre módulos con framer-motion
 *  - Delegación de módulos al `TabRouter`
 */

import type { ComponentProps, TouchEventHandler } from "react";
// Use `m` (tree-shakeable) + AnimatePresence from the admin LazyMotion boundary.
// This avoids pulling the full framer-motion bundle into the initial admin chunk.
import { m, AnimatePresence } from "@/components/admin/providers";
import { cn } from "@/lib/utils";
import AdminBreadcrumb from "@/components/admin/shared/AdminBreadcrumb";
import type { Tab } from "../_lib/tabs.types";
import { TAB_CATEGORIES } from "../_lib/tab-categories";
import { ALL_TABS } from "../_lib/tab-data";
import { TabRouter } from "./TabRouter";

type TabRouterProps = ComponentProps<typeof TabRouter>;

export interface AdminMainContentProps {
  tab: Tab;
  navigateTab: (tab: Tab) => void;
  compactMode: boolean;
  presentationMode: boolean;
  swipeHandlers: {
    onTouchStart: TouchEventHandler;
    onTouchMove: TouchEventHandler;
    onTouchEnd: TouchEventHandler;
  };
  // Props que se reenvían directo al TabRouter
  tabRouter: Omit<TabRouterProps, "tab" | "onNavigateTab">;
}

export function AdminMainContent({
  tab,
  navigateTab,
  compactMode,
  presentationMode,
  swipeHandlers,
  tabRouter,
}: AdminMainContentProps) {
  const cat = TAB_CATEGORIES.find((c) => c.tabs.includes(tab));
  const tabMeta = ALL_TABS.find((t) => t.id === tab);
  const breadcrumbItems: { label: string; onClick?: () => void }[] = [];

  // Level 1: category name (clickable if multi-tab)
  if (cat) {
    breadcrumbItems.push({
      label: cat.label,
      ...(cat.tabs.length > 1 ? { onClick: () => navigateTab(cat.tabs[0]) } : {}),
    });
  }

  // Level 2: specific tab name (only if different from category)
  if (cat && cat.tabs.length > 1 && tabMeta) {
    breadcrumbItems.push({
      label: tabMeta.label,
    });
  }

  return (
    <main
      className={cn(
        "flex-1 mx-auto w-full pb-24 sm:pb-8",
        presentationMode ? "max-w-full px-4 py-4" : "max-w-7xl",
        compactMode && !presentationMode
          ? "px-2 sm:px-3 py-2 sm:py-4"
          : !presentationMode
            ? "px-3 sm:px-6 py-4 sm:py-8"
            : "",
      )}
      {...swipeHandlers}
    >
      <AdminBreadcrumb items={breadcrumbItems} />

      <AnimatePresence mode="wait">
        <m.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <TabRouter tab={tab} onNavigateTab={navigateTab} {...tabRouter} />
        </m.div>
      </AnimatePresence>
    </main>
  );
}
