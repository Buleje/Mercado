"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Sparkles, GitMerge, ShoppingCart, Megaphone, Users, Home } from "@buleje/design-system/icons";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";

const Spinner = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-[var(--text-primary)] border-t-transparent rounded-full animate-spin" />
  </div>
);

const TabHoy = dynamic(() => import("@/components/admin/sugerencias/TabHoy"), { ssr: false, loading: Spinner });
const TabCombos = dynamic(() => import("@/components/admin/sugerencias/TabCombos"), { ssr: false, loading: Spinner });
const TabCompras = dynamic(() => import("@/components/admin/sugerencias/TabCompras"), { ssr: false, loading: Spinner });
const TabVentas = dynamic(() => import("@/components/admin/sugerencias/TabVentas"), { ssr: false, loading: Spinner });
const TabClientes = dynamic(() => import("@/components/admin/sugerencias/TabClientes"), { ssr: false, loading: Spinner });

const MODULE_ID = "sugerencias-ia";

const TABS = [
  { id: "hoy",      label: "Hoy",            icon: Home },
  { id: "combos",   label: "Combos",         icon: GitMerge },
  { id: "compras",  label: "Qué comprar",    icon: ShoppingCart },
  { id: "ventas",   label: "Qué vender",     icon: Megaphone },
  { id: "clientes", label: "Para clientes",  icon: Users },
];

interface Props {
  tenantId?: string;
}

export default function SugerenciasIAModule({ tenantId: _tenantId }: Props) {
  const [tab, setTab] = useState<string>(TABS[0].id);

  return (
    <div className="space-y-4 [&_.text-xs]:text-[13px] [&_.text-\\[11px\\]]:text-[12px]">
      <AdminModuleHeader title="Sugerencias IA" icon={Sparkles} />
      <AdminTabBar
        tabs={TABS}
        activeTab={tab}
        onTabChange={setTab}
        moduleId={MODULE_ID}
      >
        <div className="pt-4">
          {tab === "hoy"      && <TabHoy onTabChange={setTab} />}
          {tab === "combos"   && <TabCombos />}
          {tab === "compras"  && <TabCompras />}
          {tab === "ventas"   && <TabVentas />}
          {tab === "clientes" && <TabClientes />}
        </div>
      </AdminTabBar>
    </div>
  );
}
