"use client";

/**
 * NavModeToast — toast en el marketplace público que confirma cuando el
 * superadmin acaba de aplicar un nuevo modo de navegación. Si el usuario
 * tiene la pestaña del marketplace abierta y cambia el modo desde otro tab,
 * este toast aparece via storage event de localStorage.
 *
 * Solo se muestra cuando hay cambio real — no en el primer load.
 */

import { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "@buleje/design-system/icons";
import {
  detectMarketplaceNavMode,
  type MarketplaceNavMode,
} from "@/lib/nav-visibility";

const MODE_LABELS: Record<MarketplaceNavMode, string> = {
  full: "Marketplace completo",
  "tiendas-only": "Solo Tiendas",
  minimo: "Mínimo (Tiendas + Ofertas)",
  custom: "Personalizado",
};

export default function NavModeToast() {
  const [visible, setVisible] = useState(false);
  const [label, setLabel] = useState<string>("");
  const lastMode = useRef<MarketplaceNavMode | null>(null);

  useEffect(() => {
    // Inicializa con el modo actual al montar — no dispara toast.
    lastMode.current = detectMarketplaceNavMode();

    const handler = () => {
      const next = detectMarketplaceNavMode();
      if (next && lastMode.current !== null && next !== lastMode.current) {
        setLabel(MODE_LABELS[next] ?? "Modo personalizado");
        setVisible(true);
        window.setTimeout(() => setVisible(false), 3500);
      }
      lastMode.current = next;
    };

    // BUG FIX (Bug Hunter Report 2026-04-30 P0#4): el storage listener era
    // función inline anónima — `removeEventListener` no podía limpiarla y
    // cada remount acumulaba listeners (memory leak).
    const storageHandler = (e: StorageEvent) => {
      if (e.key === "buleje-nav-visibility") handler();
    };
    window.addEventListener("buleje:nav-visibility-changed", handler);
    window.addEventListener("storage", storageHandler);
    return () => {
      window.removeEventListener("buleje:nav-visibility-changed", handler);
      window.removeEventListener("storage", storageHandler);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-[9000] flex items-center gap-3 rounded-xl bg-[var(--data-success-600)] px-5 py-3.5 text-sm font-bold text-white shadow-2xl"
    >
      <CheckCircle2 className="h-5 w-5 shrink-0" />
      <div>
        <p>Modo aplicado: {label}</p>
        <p className="text-xs font-medium opacity-90 mt-0.5">
          La barra superior se actualizó al instante.
        </p>
      </div>
    </div>
  );
}
