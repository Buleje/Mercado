"use client";

import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import dynamic from "next/dynamic";
import { Sparkles, GitMerge, ShoppingCart, Megaphone, Users, Home, Calendar } from "@buleje/design-system/icons";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";

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
const TabEstrategias = dynamic(() => import("@/components/admin/sugerencias/TabEstrategias"), { ssr: false, loading: Spinner });

const MODULE_ID = "sugerencias-ia";

const TABS = [
  { id: "hoy",          label: "Hoy",            icon: Home },
  { id: "combos",       label: "Combos",         icon: GitMerge },
  { id: "compras",      label: "Qué comprar",    icon: ShoppingCart },
  { id: "ventas",       label: "Qué vender",     icon: Megaphone },
  { id: "estrategias",  label: "Estrategias",    icon: Calendar },
  { id: "clientes",     label: "Para clientes",  icon: Users },
];
const TAB_IDS = TABS.map((t) => t.id);

interface Props {
  tenantId?: string;
}

export default function SugerenciasIAModule({ tenantId: _tenantId }: Props) {
  // La sub-vista vive en `?sub=` (useSubvistaModulo): este módulo se muestra dentro de un hub
  // que ya usa `?vista=`. Link compartible y «atrás» del navegador (antes era estado local).
  const { vista: tab, irA: setTab } = useSubvistaModulo(MODULE_ID, TAB_IDS, TAB_IDS[0]);

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
        heading={{ title: "Sugerencias IA", icon: Sparkles }}
        tabs={TABS}
        activeTab={tab}
        onTabChange={setTab}
        moduleId={MODULE_ID}
      >
        <div className="pt-4">
          {tab === "hoy"          && <TabHoy onTabChange={setTab} />}
          {tab === "combos"       && <TabCombos />}
          {tab === "compras"      && <TabCompras />}
          {tab === "ventas"       && <TabVentas />}
          {tab === "estrategias"  && <TabEstrategias />}
          {tab === "clientes"     && <TabClientes />}
        </div>
      </AdminTabBar>
    </div>
  );
}
