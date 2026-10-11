"use client";
import dynamic from "next/dynamic";
import {
  Users, Star, MapPin, MessageSquare,
  UserPlus,
} from "@buleje/design-system/icons";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const CRMTab = dynamic(() => import("@/components/admin/CRMTab"), { loading: S });
const NPSTab = dynamic(() => import("@/components/admin/NPSTab"), { loading: S });
const CustomerGeoMap = dynamic(() => import("@/components/admin/CustomerGeoMap"), { ssr: false, loading: () => <div className="flex items-center justify-center h-96"><div className="h-6 w-6 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div> });
const MassMessageSender = dynamic(() => import("@/components/admin/MassMessageSender"), { loading: S });
// Funnel de leads consolidado como sub-tab (era entrada top-level "leads-funnel")
const LeadsFunnelModule = dynamic(() => import("@/components/admin/unified/LeadsFunnelModule"), { loading: S });

const MODULE_ID = "clientes";

const TABS = [
  { id: "crm" as const, label: "Mis clientes", icon: Users },
  { id: "leads" as const, label: "Interesados", icon: UserPlus },
  { id: "resenas" as const, label: "Opiniones", icon: Star },
  { id: "mapa" as const, label: "Mapa", icon: MapPin },
  { id: "mensajes" as const, label: "Mensajes masivos", icon: MessageSquare },
];

/** Los ids, estables: el hook los usa como dependencia. */
const TAB_IDS = TABS.map((t) => t.id);

export default function CRMClientesModule({ initialTab }: { initialTab?: string } = {}) {
  // La sub-vista vive en `?vista=`: link compartible, atrás del navegador y
  // destino del buscador global. `initialTab` gana cuando el módulo se abre
  // desde un tab alias (ver useVistaModulo).
  // El cliente abierto (`?cliente=`) es de «Mis clientes»: se borra al salir de esa vista.
  const { vista: sub, irA: setSub } = useVistaModulo(MODULE_ID, TAB_IDS, TAB_IDS[0], initialTab, {
    paramsDeVista: { crm: ["cliente"] },
  });

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
        heading={{
          /* «Clientes», como el hub en el menú (10-10): con «Mis Clientes» la banda
             decía CLIENTES · Mis Clientes y la primera pestaña, otra vez, «Mis clientes». */
          title: "Clientes",
          description: "Tus clientes y lo que compran, los interesados que todavía no compran, sus opiniones, dónde viven y los mensajes masivos.",
          icon: Users,
        }}
        tabs={TABS}
        activeTab={sub}
        onTabChange={(id) => setSub(id as typeof sub)}
        moduleId="crm"
      >
        {sub === "crm" && <CRMTab />}
        {sub === "leads" && <LeadsFunnelModule />}
        {sub === "resenas" && <NPSTab />}
        {sub === "mapa" && <CustomerGeoMap />}
        {sub === "mensajes" && <MassMessageSender />}
      </AdminTabBar>
    </div>
  );
}
