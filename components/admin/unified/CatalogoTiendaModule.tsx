"use client";
import { useState } from "react";
import dynamic from "next/dynamic";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const ProductsAdminTab   = dynamic(() => import("@/components/admin/ProductsAdminTab"), { loading: S });
const CategoriesEditorTab = dynamic(() => import("@/components/admin/CategoriesEditorTab"), { loading: S });
const CombosEditorTab     = dynamic(() => import("@/components/admin/CombosEditorTab"), { loading: S });
const BundlesTab          = dynamic(() => import("@/components/admin/BundlesTab"), { loading: S });
const KitManagerTab       = dynamic(() => import("@/components/admin/KitManagerTab"), { loading: S });
const HomepageEditorTab   = dynamic(() => import("@/components/admin/HomepageEditorTab"), { loading: S });
const EtiquetasTab        = dynamic(() => import("@/components/admin/EtiquetasTab"), { loading: S });

const TABS = [
  { id: "productos"     as const, label: "📦 Productos" },
  { id: "categorias"    as const, label: "Categorías" },
  { id: "combos-editor" as const, label: "Editor Combos" },
  { id: "combos"        as const, label: "Combos / Bundles" },
  { id: "kits"          as const, label: "Kits" },
  { id: "etiquetas"     as const, label: "Etiquetas" },
  { id: "homepage"      as const, label: "Página de Inicio" },
];

export default function CatalogoTiendaModule() {
  const [sub, setSub] = useState(TABS[0].id);
  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex gap-0.5 sm:gap-1 overflow-x-auto scrollbar-none border-b border-gray-200 dark:border-card-border -mx-1 px-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={`shrink-0 px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-bold whitespace-nowrap transition-colors border-b-2 ${
              sub === t.id
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 dark:text-muted hover:text-gray-700 dark:hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {sub === "productos"     && <ProductsAdminTab />}
      {sub === "categorias"    && <CategoriesEditorTab />}
      {sub === "combos-editor" && <CombosEditorTab />}
      {sub === "combos"        && <BundlesTab />}
      {sub === "kits"          && <KitManagerTab />}
      {sub === "etiquetas"     && <EtiquetasTab />}
      {sub === "homepage"      && <HomepageEditorTab />}
    </div>
  );
}
