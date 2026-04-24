"use client";

/**
 * DockFeatureSpotlight — Anuncia la nueva feature del dock flotante
 * (scroll-top + historial + atajos).
 *
 * Se muestra UNA sola vez al user, ~5s despues de entrar al marketplace,
 * solo si el dock esta visible (scroll > 400px).
 *
 * Evita colisionar con MarketplaceFirstVisitTour: si el tour aun no se
 * completo, no se dispara.
 */

import { useEffect, useState } from "react";
import FeatureSpotlight from "@/components/ui-system/FeatureSpotlight";
import { wasTourSeen } from "@/components/ui-system/GuidedTour";

const TOUR_ID = "marketplace-2026-04";

export default function DockFeatureSpotlight() {
  const [canShow, setCanShow] = useState(false);

  useEffect(() => {
    // Solo mostrar cuando:
    // 1. El tour ya se vio (o fue skipeado)
    // 2. El user scrolleo para que el dock este visible
    const check = () => {
      if (wasTourSeen(TOUR_ID) && window.scrollY > 400) {
        setCanShow(true);
      }
    };
    // 5s delay desde mount
    const timer = setTimeout(check, 5000);
    window.addEventListener("scroll", check, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", check);
    };
  }, []);

  if (!canShow) return null;

  return (
    <FeatureSpotlight
      id="floating-dock-2026-04"
      target="[aria-label='Volver arriba']"
      title="Navegá más rápido"
      description="Con este dock volvés arriba, ves tu historial de productos y consultás atajos de teclado. Presioná ? para verlos."
      placement="left"
      badge="Nuevo"
      showDelayMs={200}
    />
  );
}
