"use client";

import dynamic from "next/dynamic";
import { BotMessageSquare, Wand2, Lightbulb, Webhook } from "@buleje/design-system/icons";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

// ── Hub del Asistente IA (consolidación 3→1) ─────────────────────────────────
// Antes eran 3 entradas top-level separadas (asistente-ia, ai-command,
// sugerencias-ia). Ahora viven como sub-tabs de un solo centro de IA. El header
// "Asistente IA" se muestra SIEMPRE arriba (coherencia admin, Brandon
// 2026-06-19); cada módulo conserva su sub-header debajo.
const ChatIAModule        = dynamic(() => import("@/components/admin/unified/ChatIAModule"),        { loading: S, ssr: false });
const AICommandModule     = dynamic(() => import("@/components/admin/unified/AICommandModule"),     { loading: S });
const SugerenciasIAModule = dynamic(() => import("@/components/admin/unified/SugerenciasIAModule"), { loading: S });
const AutomatizacionesModule = dynamic(() => import("@/components/admin/unified/AutomatizacionesModule"), { loading: S, ssr: false });

const MODULE_ID = "asistente-ia-hub";

const TABS = [
  { id: "chat",        label: "Chat IA",        icon: BotMessageSquare },
  { id: "comandos",    label: "Comandos IA",    icon: Wand2 },
  { id: "sugerencias", label: "Sugerencias IA", icon: Lightbulb },
  { id: "automatizaciones", label: "Automatizaciones", icon: Webhook },
];

/** Los ids, estables: el hook los usa como dependencia. */
const TAB_IDS = TABS.map((t) => t.id);

export default function AsistenteIAHubModule({ initialTab }: { initialTab?: string } = {}) {
  // La sub-vista vive en `?vista=`: así se comparte por link, el botón «atrás»
  // la recorre y el buscador global puede mandar directo acá. `initialTab` gana
  // cuando el módulo se abre desde un tab alias (ver useVistaModulo).
  const { vista: sub, irA: setSub } = useVistaModulo(MODULE_ID, TAB_IDS, TAB_IDS[0], initialTab);

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
        heading={{ title: "Asistente IA", description: "Anotá operaciones hablando, preguntá por tu negocio y conectá tus automatizaciones.", icon: BotMessageSquare }} tabs={TABS} activeTab={sub} onTabChange={setSub} moduleId={MODULE_ID}>
        {sub === "chat" && <ChatIAModule />}
        {sub === "comandos" && <AICommandModule />}
        {sub === "sugerencias" && <SugerenciasIAModule />}
        {sub === "automatizaciones" && <AutomatizacionesModule />}
      </AdminTabBar>
    </div>
  );
}
