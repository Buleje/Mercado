"use client";

/**
 * MarketplaceFirstVisitTour — Tour guiado que se dispara en la PRIMERA visita
 * del user al marketplace.
 *
 * Diferente a onboarding de signup: este es para users ya registrados o
 * incluso anonimos, que entran al marketplace por primera vez. Les muestra:
 *   1. Barra de busqueda (donde escribir arroz, limpieza, etc.)
 *   2. Filtros (para acotar por zona, tienda)
 *   3. Carrito (donde se guardan sus productos)
 *   4. Socio buleje (programa de puntos)
 *
 * Gated por localStorage "buleje-tour-marketplace-2026-04".
 * El user puede re-abrirlo desde el ShortcutHelpModal o link en ayuda.
 *
 * NO se ejecuta en SSR: solo en browser post-mount.
 */

import { useEffect, useState } from "react";
import GuidedTour, { type TourStep } from "@/components/ui-system/GuidedTour";

const TOUR_ID = "marketplace-2026-04";

const STEPS: TourStep[] = [
  {
    target: "[data-tour='search']",
    title: "Buscá lo que necesitás",
    description:
      "Escribí arroz, limpieza, bebidas… o el nombre de una bodega. Te mostramos todo lo que hay cerca.",
    placement: "bottom",
    spotlight: "rounded",
    skipIfMissing: true,
  },
  {
    target: "[data-tour='cart']",
    title: "Tu carrito vive acá",
    description:
      "Podés armar pedidos de varias bodegas a la vez. Cada una te contacta por WhatsApp con su propio delivery.",
    placement: "bottom",
    spotlight: "circle",
    skipIfMissing: true,
  },
  {
    target: "[data-tour='user-menu']",
    title: "Mi cuenta y Socio Buleje",
    description:
      "Desde tu menú accedés a Socio Buleje y ganás puntos en cada compra. Cuanto más comprás, más subís de tier.",
    placement: "bottom",
    spotlight: "circle",
    skipIfMissing: true,
  },
];

export default function MarketplaceFirstVisitTour() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Esperar 2s post-FCP para no interrumpir primer paint
    const timer = setTimeout(() => setMounted(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  if (!mounted) return null;

  return <GuidedTour tourId={TOUR_ID} steps={STEPS} />;
}
