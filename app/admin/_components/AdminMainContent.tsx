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
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import AdminBreadcrumb from "@/components/admin/shared/AdminBreadcrumb";
import type { Tab } from "../_lib/tabs.types";
import { TAB_CATEGORIES, MODULE_INFO } from "../_lib/tab-categories";
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
  const modInfo = MODULE_INFO[tab];
  const breadcrumbItems: { label: string; onClick?: () => void }[] = [];
  if (cat && cat.tabs.length > 1) {
    breadcrumbItems.push({
      label: cat.label,
      onClick: () => navigateTab(cat.tabs[0]),
    });
  }
  breadcrumbItems.push({
    label: modInfo?.emoji
      ? `${modInfo.emoji} ${modInfo?.desc?.split(".")[0] || tab}`
      : cat?.label || tab,
  });

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
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <TabRouter tab={tab} onNavigateTab={navigateTab} {...tabRouter} />
        </motion.div>
      </AnimatePresence>
    </main>
  );
}
