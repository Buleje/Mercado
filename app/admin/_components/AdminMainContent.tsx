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

import { memo, type ComponentProps, type TouchEventHandler } from "react";
// Use `m` (tree-shakeable) + AnimatePresence from the admin LazyMotion boundary.
// This avoids pulling the full framer-motion bundle into the initial admin chunk.
import { m, AnimatePresence } from "@/components/admin/providers";
import { cn } from "@/lib/utils";
import type { Tab } from "../_lib/tabs.types";
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

function AdminMainContentInner({
  tab,
  navigateTab,
  compactMode,
  presentationMode,
  swipeHandlers,
  tabRouter,
}: AdminMainContentProps) {
  return (
    <main
      id="main-content"
      role="tabpanel"
      aria-label="Contenido del modulo activo"
      className={cn(
        "flex-1 mx-auto w-full pb-24 sm:pb-8",
        presentationMode
          ? "max-w-full px-4 py-4"
          : compactMode
            ? "max-w-[1920px]" /* en compact modo, usar casi todo el viewport */
            : "max-w-[1600px]",
        compactMode && !presentationMode
          ? "px-3 sm:px-4 py-3 sm:py-4"
          : !presentationMode
            ? "px-4 sm:px-6 py-5 sm:py-8"
            : "",
      )}
      {...swipeHandlers}
    >
      {/* QW1 perf (2026-05-16): mode="popLayout" en lugar de "wait" —
          monta el tab nuevo INMEDIATAMENTE sin esperar el exit del previo.
          Transición simplificada a sólo opacity (sin y/spring) para que no
          bloquee el primer paint del módulo nuevo. Ganancia ~160ms por click.
          NOTE: no usar `filter` — crea containing block que rompe modales fixed. */}
      <AnimatePresence mode="popLayout" initial={false}>
        <m.div
          key={tab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12, ease: "linear" }}
        >
          <TabRouter tab={tab} onNavigateTab={navigateTab} {...tabRouter} />
        </m.div>
      </AnimatePresence>
    </main>
  );
}

/**
 * QW2 perf (2026-05-16): memo evita re-render del shell cuando el parent
 * AdminPage actualiza estado no relacionado al tab (theme, sidebar toggle).
 * El re-render del shell antes propagaba a AnimatePresence + TabRouter
 * disparando trabajo innecesario. Sólo re-renderiza si las props cambian.
 */
export const AdminMainContent = memo(AdminMainContentInner);
