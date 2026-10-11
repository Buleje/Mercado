"use client";

/**
 * MarketplaceModule — «Marketplace» (`?tab=marketplace`): tu tienda dentro de la
 * plataforma, en UNA fila de pestañas.
 *
 * La vista vive en `?vista=` (11-10): antes se elegía con `useState`, así que
 * todo enlace `?tab=marketplace&vista=cupones` —el buscador global, el aviso
 * «Nuevo pedido marketplace»— caía en Resumen sin decir nada.
 *
 * La cabecera es una sola banda: título + ⓘ, pestañas y «⋯ Más». «Actualizar»
 * vuelve a cargar la vista abierta (antes sólo recargaba un KPI del Resumen, y
 * en Órdenes o Productos no hacía nada visible); cada vista suma ahí lo suyo
 * con `useAccionesDeVista` (Órdenes: el CSV).
 *
 * `useVistaModulo` valida la vista de la URL UNA vez al montar: se espera al rol
 * antes de montar las pestañas (patrón de Comprobantes) para que una vista que
 * la matriz esconde no quede abierta.
 */

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Store, Package, ShoppingCart, DollarSign, RefreshCw, TrendingUp, Star, BarChart3, Gift, MoreHorizontal } from "@buleje/design-system/icons";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import type { AdminTab } from "@/components/admin/shared/AdminTabBar";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { useVistaModulo, type ParamsDeVista } from "@/hooks/use-vista-modulo";
import { useContextoPermiso, useVistasPermitidas } from "@/hooks/use-vistas-permitidas";
import { Spinner, MODULE_ID } from "@/components/admin/marketplace/shared";
import { AccionesDeVistaProvider } from "@/components/admin/marketplace/acciones-de-vista";
import { MarketplaceFidelidadTab } from "@/components/admin/marketplace/tabs/FidelidadTab";
import { MarketplaceComisionesTab } from "@/components/admin/marketplace/tabs/ComisionesTab";
import { MarketplaceResenasTab } from "@/components/admin/marketplace/tabs/ResenasTab";
import { MarketplaceTiendaTab } from "@/components/admin/marketplace/tabs/TiendaTab";
import { MarketplaceProductosTab } from "@/components/admin/marketplace/tabs/ProductosTab";
import { MarketplaceOrdenesTab } from "@/components/admin/marketplace/tabs/OrdenesTab";

const CompetitivePricingTab = lazy(() => import("@/components/admin/CompetitivePricingTab"));
const MarketplaceDashboardTab = lazy(() => import("@/components/admin/marketplace/MarketplaceDashboard"));

// Los programas de crecimiento (suscripciones, gift cards, socio, lives) viven
// en el hub Crecimiento desde 2026-06-21: acá queda la tienda.

type Vista = "resumen" | "tienda" | "productos" | "ordenes" | "comisiones" | "precios" | "resenas" | "fidelidad";

const TABS: readonly (AdminTab & { id: Vista })[] = [
  { id: "resumen",      label: "Resumen",      icon: BarChart3 },
  { id: "tienda",       label: "Mi Tienda Personal",    icon: Store },
  { id: "productos",    label: "Productos",    icon: Package },
  { id: "ordenes",      label: "Órdenes",      icon: ShoppingCart },
  { id: "comisiones",   label: "Comisiones",   icon: DollarSign },
  { id: "precios",      label: "Precios",      icon: TrendingUp },
  { id: "resenas",      label: "Reseñas",      icon: Star },
  { id: "fidelidad",    label: "Fidelidad",    icon: Gift },
];

/** Mi Tienda Personal lleva su sección en `?sub=`: al salir, no viaja a la vista siguiente. */
const PARAMS_DE_VISTA: ParamsDeVista<Vista> = { tienda: ["sub"] };

const AYUDA_DEL_HUB =
  "Tu tienda dentro del marketplace de Buleje: cómo te va, qué publicas, los pedidos que entran por ahí, lo que cobra la plataforma y los premios para tus compradores.";

/** Cuánto se espera al rol antes de abrir igual (con las vistas propias del hub). */
const ESPERA_DEL_ROL_MS = 4000;

export default function MarketplaceModule({ initialTab }: { initialTab?: string } = {}) {
  const rolListo = useContextoPermiso() !== null;
  const rolTarde = useEsperaVencida(!rolListo, ESPERA_DEL_ROL_MS);
  if (!rolListo && !rolTarde) return <Spinner />;
  return <HubMarketplace initialTab={initialTab} />;
}

/** `true` cuando `esperando` lleva `ms` sin resolverse. */
function useEsperaVencida(esperando: boolean, ms: number): boolean {
  const [vencida, setVencida] = useState(false);
  useEffect(() => {
    if (!esperando) return;
    const t = setTimeout(() => setVencida(true), ms);
    return () => clearTimeout(t);
  }, [esperando, ms]);
  return vencida;
}

function HubMarketplace({ initialTab }: { initialTab?: string }) {
  const tabs = useVistasPermitidas("marketplace", TABS);
  const tabIds = useMemo(() => tabs.map((t) => t.id), [tabs]);
  const { vista, irA } = useVistaModulo<Vista>(MODULE_ID, tabIds, tabIds[0] ?? "resumen", initialTab, {
    paramsDeVista: PARAMS_DE_VISTA,
  });
  /* «Actualizar» remonta la vista abierta: cada una vuelve a pedir lo suyo. */
  const [recarga, setRecarga] = useState(0);
  const [accionesVista, setAccionesVista] = useState<MenuAccion[]>([]);

  const acciones: MenuAccion[] = [
    ...accionesVista,
    { id: "actualizar", label: "Actualizar", hint: "Vuelve a cargar esta vista", icon: RefreshCw, onSelect: () => setRecarga((n) => n + 1) },
  ];

  return (
    <div className="space-y-4">
      <AdminTabBar
        heading={{
          title: "Marketplace",
          description: AYUDA_DEL_HUB,
          icon: Store,
          actions: (
            <ActionMenu
              label="Más"
              icon={MoreHorizontal}
              actions={acciones}
              soloIcono
              size="md"
              className="w-12 shrink-0"
              title={accionesVista.length > 0 ? `${accionesVista.map((a) => a.label).join(", ")} y actualizar` : "Actualizar"}
            />
          ),
        }}
        tabs={tabs}
        activeTab={vista}
        onTabChange={(id) => irA(id as Vista)}
        moduleId={MODULE_ID}
      >
        <AccionesDeVistaProvider value={setAccionesVista}>
          <div key={`${vista}-${recarga}`}>
            {vista === "resumen" && (
              <Suspense fallback={<Spinner />}>
                <MarketplaceDashboardTab onIrA={(v) => irA(v as Vista)} />
              </Suspense>
            )}
            {vista === "tienda" && <MarketplaceTiendaTab />}
            {vista === "productos" && <MarketplaceProductosTab />}
            {vista === "ordenes" && <MarketplaceOrdenesTab />}
            {vista === "comisiones" && <MarketplaceComisionesTab />}
            {vista === "precios" && (
              <Suspense fallback={<Spinner />}>
                <CompetitivePricingTab />
              </Suspense>
            )}
            {vista === "resenas" && <MarketplaceResenasTab />}
            {vista === "fidelidad" && <MarketplaceFidelidadTab />}
          </div>
        </AccionesDeVistaProvider>
      </AdminTabBar>
    </div>
  );
}
