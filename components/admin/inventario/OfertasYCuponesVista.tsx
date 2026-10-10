"use client";

/**
 * Productos e inventario › Ofertas y cupones.
 *
 * Junta lo que estaba en tres lugares (plan «panel unificado» F17 + F24, ola 3,
 * 2026-10-10): las ofertas de la tienda (PromotionsTab) y sus cupones
 * (CouponsTab), que vivían en la pestaña Productos, y los cupones del
 * marketplace (MarketplaceCuponesTab). Cada uno se monta tal cual, con su
 * endpoint de siempre: lo único nuevo es el selector «Vale en», porque un cupón
 * de tu tienda y uno del marketplace son dos almacenes distintos.
 *
 * Permiso por origen (R2): las ofertas y los cupones de la tienda se ven con
 * `productos`; los del marketplace, con `marketplace`.
 */

import { useMemo, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Globe, Percent, Store, Ticket } from "@buleje/design-system/icons";
import AdminTabBar, { type AdminTab } from "@/components/admin/shared/AdminTabBar";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useContextoPermiso, usePermisoDe } from "@/hooks/use-vistas-permitidas";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const PromotionsTab = dynamic(() => import("@/components/admin/PromotionsTab"), { loading: S });
const CouponsTab = dynamic(() => import("@/components/admin/CouponsTab"), { loading: S });
const MarketplaceCuponesTab = dynamic(
  () => import("@/components/admin/marketplace/tabs/CuponesTab").then((m) => m.MarketplaceCuponesTab),
  { loading: S },
);

/** Las secciones de la vista (`?sub=`). La lee `admin-subvistas-sincronizadas`. */
export const SUBS_OFERTAS = ["ofertas", "cupones"] as const;
type SubOfertas = (typeof SUBS_OFERTAS)[number];
type Canal = "tienda" | "marketplace";

const MODULE_ID = "inventario-ofertas";
const CLAVE_CANAL = "inventario:cupones-vale-en";

const ORIGEN_TIENDA = ["productos"] as const;
const ORIGEN_MARKETPLACE = ["marketplace"] as const;

export default function OfertasYCuponesVista() {
  const ctx = useContextoPermiso();
  const permisoTienda = usePermisoDe(ORIGEN_TIENDA);
  const permisoMarketplace = usePermisoDe(ORIGEN_MARKETPLACE);
  /* Sin rol confirmado (el hub ya esperó y se cansó) queda lo de la tienda, que
     es lo que veía cualquiera con la pestaña Productos; el marketplace no. */
  const veTienda = ctx === null || permisoTienda;
  const veMarketplace = permisoMarketplace;

  const pestanas = useMemo<AdminTab[]>(
    () => [
      ...(veTienda ? [{ id: "ofertas", label: "Ofertas", icon: Percent, title: "Descuentos y promociones de tu tienda" }] : []),
      { id: "cupones", label: "Cupones", icon: Ticket, title: "Códigos de descuento que el cliente escribe al pagar" },
    ],
    [veTienda],
  );
  const ids = useMemo(() => pestanas.map((p) => p.id as SubOfertas), [pestanas]);
  /* Al hook van TODAS las secciones (constante estable): con sólo las visibles,
     un `?sub=cupones` que llega antes de confirmar el rol se perdería. */
  const { vista: pedida, irA } = useSubvistaModulo<SubOfertas>(MODULE_ID, SUBS_OFERTAS, "ofertas");
  const vista: SubOfertas = ids.includes(pedida) ? pedida : ids[0];

  const [canalGuardado, setCanal] = useLocalStorage<Canal>(CLAVE_CANAL, "tienda");
  const canales: { value: Canal; label: string; icon: ReactNode }[] = [
    ...(veTienda ? [{ value: "tienda" as const, label: "Tu tienda", icon: <Store className="h-4 w-4" aria-hidden /> }] : []),
    ...(veMarketplace
      ? [{ value: "marketplace" as const, label: "Marketplace", icon: <Globe className="h-4 w-4" aria-hidden /> }]
      : []),
  ];
  const canal: Canal = canales.some((c) => c.value === canalGuardado) ? canalGuardado : (canales[0]?.value ?? "tienda");

  return (
    <AdminTabBar tabs={pestanas} activeTab={vista} onTabChange={irA} moduleId={MODULE_ID} draggable={false}>
      {vista === "ofertas" && <PromotionsTab />}
      {vista === "cupones" && (
        <div className="space-y-4">
          {canales.length > 1 && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-[var(--text-secondary)]">Vale en</span>
              <SegmentedControl<Canal> value={canal} onChange={setCanal} options={canales} size="lg" label="Dónde vale el cupón" />
            </div>
          )}
          {canal === "tienda" ? <CouponsTab /> : <MarketplaceCuponesTab />}
        </div>
      )}
    </AdminTabBar>
  );
}
