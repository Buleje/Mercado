"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Tag } from "@buleje/design-system/icons";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import type { AdminTab } from "@/components/admin/shared/AdminTabBar";
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
      {/* El título va DENTRO de la barra de pestañas (patrón acordado con
          Brandon 2026-09-07, piloto en Análisis): identidad a la izquierda,
          pestañas a la derecha, una sola regla. Recupera ~90px verticales,
          que en una laptop de 677px útiles es la diferencia entre ver los
          datos o sólo los encabezados.
          El `eyebrow` se fue con el header: decía la categoría del sidebar
          («Abastecimiento · Compras» sobre un título «Compras») — el mismo
          dato tres veces contando el ítem marcado en el sidebar. */}
      <AdminTabBar
        heading={{ title: "Promociones & Ofertas", description: "Categorías, promociones, cupones y precios", icon: Tag }}
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

