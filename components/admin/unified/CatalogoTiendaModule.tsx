"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Tag } from "@buleje/design-system/icons";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import type { AdminTab } from "@/components/admin/shared/AdminTabBar";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const CategoriesEditorTab = dynamic(() => import("@/components/admin/CategoriesEditorTab"), { loading: S });
const PromotionsTab      = dynamic(() => import("@/components/admin/PromotionsTab"),      { loading: S });
const CouponsTab         = dynamic(() => import("@/components/admin/CouponsTab"),         { loading: S });
const PriceHistoryTab    = dynamic(() => import("@/components/admin/PriceHistoryTab"),    { loading: S });

const MODULE_ID = "catalogo-tienda";

const TABS: AdminTab[] = [
  { id: "categorias",        label: "Categorías",        icon: Tag },
  { id: "promociones",       label: "Ofertas",           icon: Tag },
  { id: "cupones",           label: "Cupones",           icon: Tag },
  { id: "historial-precios", label: "Historial precios", icon: Tag },
];

// ── Componente principal ────────────────────────────────────────────────────

export default function CatalogoTiendaModule() {
  const [sub, setSub] = useState(TABS[0].id);


  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Promociones y Ofertas"
        description="Categorías, promociones, cupones y precios"
        icon={Tag}
      />



      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      >
        {/* Tab content */}
        {sub === "categorias" && <CategoriesEditorTab />}
        {sub === "promociones" && <PromotionsTab />}
        {sub === "cupones" && <CouponsTab />}
        {sub === "historial-precios" && <PriceHistoryTab />}
      </AdminTabBar>
    </div>
  );
}

