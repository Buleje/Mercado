"use client";

/**
 * Productos e inventario › Precios: el historial de precios que vivía en la
 * pestaña Productos (plan «panel unificado» F17, ola 3, 2026-10-10), el mismo
 * PriceHistoryTab. La comparación con otras tiendas sigue en Marketplace ›
 * Precios: acá queda el enlace, sólo para quien ve el Marketplace (R2).
 */

import dynamic from "next/dynamic";
import { ArrowRight } from "@buleje/design-system/icons";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { PermisoDe } from "@/components/admin/shared/PermisoDe";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const PriceHistoryTab = dynamic(() => import("@/components/admin/PriceHistoryTab"), { loading: S });

/** Marketplace › Precios (el alias `benchmark` lleva al mismo lugar). */
const HREF_PRECIOS_MARKETPLACE = "/admin?tab=marketplace&vista=precios";

export default function PreciosVista() {
  return (
    <div className="space-y-4">
      <PermisoDe origen="marketplace">
        <p className="text-sm text-[var(--text-secondary)]">
          ¿Cómo están tus precios frente a otras tiendas?{" "}
          <EnlacePanel href={HREF_PRECIOS_MARKETPLACE} className="inline-flex items-center gap-1">
            Compáralos en Marketplace › Precios
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </EnlacePanel>
        </p>
      </PermisoDe>
      <PriceHistoryTab />
    </div>
  );
}
