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
  /*
   * El <main> va SIN `role="tabpanel"`.
   *
   * Estaba puesto como si el sidebar fuera una barra de pestañas, y no lo es:
   * es navegación. Eso daba dos problemas a la vez — un tabpanel huérfano
   * (ningún `role="tab"` lo apunta) y, peor, el rol pisaba el landmark
   * implícito de `<main>`, así que la página se quedaba SIN landmark principal
   * justo donde apunta el skip-link «Ir al contenido». Las pestañas de verdad
   * (AdminTabBar) arman su par tab/tabpanel adentro.
   */
  return (
    <main
      id="main-content"
      aria-label="Contenido del módulo activo"
      className={cn(
        "flex-1 mx-auto w-full pb-[calc(88px+env(safe-area-inset-bottom))] sm:pb-8",
        presentationMode
          ? "max-w-full px-4 py-4"
          : compactMode
            /* Compact ya pedía "casi todo el viewport": +25% sobre el ancho
               normal en cada escalón, en vez del 1920px fijo que en un 1440p
               era MENOS que lo que hoy da el modo normal. */
            ? "max-w-[calc(var(--panel-max,1600px)*1.25)]"
            /* El tope duro de 1600px dejaba 660px muertos en 2560px (26% de
               la pantalla). El token sube por escalones: 1600 → 1800 (≥1600px)
               → 2160 (≥2100px) → 2400 (≥2560px). Ver globals.css §PANEL SHELL. */
            : "max-w-[var(--panel-max,1600px)]",
        compactMode && !presentationMode
          ? "px-[calc(var(--panel-gutter)*0.75)] py-3 sm:py-4"
          : !presentationMode
            /* El gutter también es un token: 20px en laptop (cada píxel es
               contenido), 24 estándar, 32/40/48 en monitores grandes. El aire
               vertical va por su cuenta: se achica en pantallas BAJAS, donde
               32px arriba son 32px menos de tabla. */
            ? "px-4 sm:px-[var(--panel-gutter)] py-4 sm:py-[var(--panel-pad-y,32px)]"
            : "",
      )}
      {...swipeHandlers}
    >
      {/* QW1 perf (2026-05-16): mode="popLayout" en lugar de "wait" —
          monta el tab nuevo INMEDIATAMENTE sin esperar el exit del previo.
          Transición simplificada a sólo opacity (sin y/spring) para que no
          bloquee el primer paint del módulo nuevo. Ganancia ~160ms por click.
          NOTE: no usar `filter` — crea containing block que rompe modales fixed.

          Fase 4 (ADR-113 TabMultiplexer keep-alive) DEFERIDA: la primera
          implementación causaba "Rendered more hooks" errors porque varios
          módulos del admin tienen hooks condicionales (early returns) que
          no toleran que React reconcilie hermanos con types distintos.
          Requiere primero auditar y normalizar el patrón de hooks en los
          ~45 módulos del TabRouter. Ver components/admin/_components/TabMultiplexer.tsx
          para el componente listo (sin usar) con la lógica LRU. */}
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
