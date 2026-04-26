"use client";

/**
 * FloatingDockController — Orquesta los widgets floating de la Ronda 4:
 *   - QuickActionsDock: dock vertical (scroll-top, historial, ayuda)
 *   - RecentlyViewedDrawer: drawer con productos vistos recientemente
 *   - ShortcutHelpModal: modal "?" con atajos de teclado
 *
 * Vive dentro de MarketplaceFloatingWidgets (post-FCP).
 * Los 3 son state-locales acá para que el dock pueda abrirlos.
 */

import { useState } from "react";
import { Clock } from "@buleje/design-system/icons";
import QuickActionsDock from "@/components/ui-system/QuickActionsDock";
import RecentlyViewedDrawer from "@/components/ui-system/RecentlyViewedDrawer";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";

/**
 * FloatingDockController — Sólo deja la acción "Productos recientes"
 * cuando hay historial. Removidos por feedback del usuario:
 *   - "Volver arriba" (scroll-top): poco usado; ocupa espacio en mobile
 *   - "Atajos de teclado": no aplica a mobile, distraía
 */
export default function FloatingDockController() {
  const [historyOpen, setHistoryOpen] = useState(false);
  const { items } = useRecentlyViewed();

  // Sin historial → no rendear nada (libera la zona derecha del viewport
  // para el chat flotante y el sticky cart bar).
  if (items.length === 0) return null;

  return (
    <>
      <QuickActionsDock
        position="right"
        scrollThreshold={400}
        actions={[
          {
            id: "history",
            icon: <Clock className="h-4 w-4" strokeWidth={2} aria-hidden />,
            label: "Productos recientes",
            onClick: () => setHistoryOpen(true),
            badge: items.length,
          },
        ]}
      />

      <RecentlyViewedDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </>
  );
}
