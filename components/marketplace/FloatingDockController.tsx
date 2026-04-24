"use client";

/**
 * FloatingDockController — Orquesta los widgets floating de la Ronda 4:
 *   - QuickActionsDock: dock vertical (scroll-top, historial, ayuda)
 *   - RecentlyViewedDrawer: drawer con productos vistos recientemente
 *   - ShortcutHelpModal: modal "?" con atajos de teclado
 *
 * Vive dentro de MarketplaceFloatingWidgets (ssr:false, post-FCP).
 * Los 3 son state-locales acá para que el dock pueda abrirlos.
 */

import { useState, useCallback } from "react";
import { ArrowUp, Clock, Keyboard } from "@buleje/design-system/icons";
import QuickActionsDock from "@/components/ui-system/QuickActionsDock";
import RecentlyViewedDrawer from "@/components/ui-system/RecentlyViewedDrawer";
import ShortcutHelpModal from "@/components/ui-system/ShortcutHelpModal";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";

export default function FloatingDockController() {
  const [historyOpen, setHistoryOpen] = useState(false);
  const { items } = useRecentlyViewed();

  const scrollTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <>
      <QuickActionsDock
        position="right"
        scrollThreshold={400}
        actions={[
          {
            id: "scroll-top",
            icon: <ArrowUp className="h-4 w-4" strokeWidth={2} aria-hidden />,
            label: "Volver arriba",
            onClick: scrollTop,
          },
          {
            id: "history",
            icon: <Clock className="h-4 w-4" strokeWidth={2} aria-hidden />,
            label: "Productos recientes",
            onClick: () => setHistoryOpen(true),
            badge: items.length > 0 ? items.length : undefined,
            show: items.length > 0,
          },
          {
            id: "help",
            icon: <Keyboard className="h-4 w-4" strokeWidth={2} aria-hidden />,
            label: "Atajos (?)",
            onClick: () => {
              // disparar el modal via custom event para respetar showFab
              const evt = new KeyboardEvent("keydown", { key: "?", shiftKey: true });
              document.dispatchEvent(evt);
            },
          },
        ]}
      />

      <RecentlyViewedDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} />

      {/* Modal con atajos — ya escucha "?" + Shift via useKeyboardShortcut */}
      <ShortcutHelpModal showFab={false} />
    </>
  );
}
