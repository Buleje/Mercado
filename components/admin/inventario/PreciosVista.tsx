"use client";

/**
 * Productos e inventario › Precios: el historial de precios que vivía en la
 * pestaña Productos (plan «panel unificado» F17, ola 3, 2026-10-10), el mismo
 * PriceHistoryTab. La comparación con otras tiendas sigue en Marketplace ›
 * Precios: queda como acción del menú «Más», sólo para quien ve el
 * Marketplace (R2).
 */

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { Store } from "@buleje/design-system/icons";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { usePermisoDe } from "@/hooks/use-vistas-permitidas";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const PriceHistoryTab = dynamic(() => import("@/components/admin/PriceHistoryTab"), { loading: S });

/** Marketplace › Precios (el alias `benchmark` lleva al mismo lugar). */
const HREF_PRECIOS_MARKETPLACE = "/admin?tab=marketplace&vista=precios";
const ORIGEN_MARKETPLACE = ["marketplace"] as const;

export default function PreciosVista() {
  const veMarketplace = usePermisoDe(ORIGEN_MARKETPLACE);
  const extra = useMemo<MenuAccion[]>(
    () =>
      veMarketplace
        ? [{ id: "comparar", label: "Compararte con otras tiendas", hint: "Marketplace › Precios", icon: Store, onSelect: () => irAEnlace(HREF_PRECIOS_MARKETPLACE) }]
        : [],
    [veMarketplace],
  );
  return <PriceHistoryTab accionesExtra={extra} />;
}
