"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { BotMessageSquare, Wand2, Webhook } from "@buleje/design-system/icons";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

// ── Hub del Asistente IA ─────────────────────────────────────────────────────
// Antes eran 3 entradas top-level separadas (asistente-ia, ai-command,
// sugerencias-ia) y después 4 vistas. «Sugerencias IA» se fundió el 10-10 en
// Comandos (lo que no se vende → Precios en bloque; a quién ofrecerle →
// A quién escribir) y en Compras › Sugerencias (qué reponer): repetía lo de
// las otras pestañas. `?vista=sugerencias` y `?tab=sugerencias-ia` caen en
// Comandos.
const ChatIAModule = dynamic(() => import("@/components/admin/unified/ChatIAModule"), { loading: S, ssr: false });
const AICommandModule = dynamic(() => import("@/components/admin/unified/AICommandModule"), { loading: S });
const AutomatizacionesModule = dynamic(() => import("@/components/admin/unified/AutomatizacionesModule"), { loading: S, ssr: false });
// El medidor de IA del mes: UNO para las tres vistas (10-10: antes Chat y
// Comandos dibujaban el suyo y contaban cosas distintas). Se calla solo
// mientras «Lo que hizo la IA › Indicadores» muestra la tarjeta del mes.
const ConsumoIA = dynamic(() => import("@/components/admin/comandos-ia/ConsumoIA"), { loading: () => null, ssr: false });

const MODULE_ID = "asistente-ia-hub";

const TABS = [
  { id: "chat", label: "Chat IA", icon: BotMessageSquare },
  { id: "comandos", label: "Comandos IA", icon: Wand2 },
  { id: "automatizaciones", label: "Automatizaciones", icon: Webhook },
];

/** Los ids, estables: el hook los usa como dependencia. */
const TAB_IDS = TABS.map((t) => t.id);

/**
 * Comandos guarda su sub-vista en `?sub=` (papel, precios, mensajes,
 * historial). Al salir de Comandos se borra: sin esto, `?vista=chat&sub=historial`
 * quedaba pegado en la URL del Chat (lo vio Brandon el 10-10).
 */
const OPCIONES = {
  paramsDeVista: { comandos: ["sub"] },
  alias: { sugerencias: "comandos" },
} as const;

export default function AsistenteIAHubModule({ initialTab }: { initialTab?: string } = {}) {
  // La sub-vista vive en `?vista=`: así se comparte por link, el botón «atrás»
  // la recorre y el buscador global puede mandar directo acá. `initialTab` gana
  // cuando el módulo se abre desde un tab alias (ver useVistaModulo).
  const { vista: sub, irA: setSub } = useVistaModulo(MODULE_ID, TAB_IDS, "chat", initialTab, OPCIONES);

  // `paramsDeVista` borra el `?sub=` al SALIR de Comandos, no al entrar por un
  // link que ya lo trae pegado (`?vista=chat&sub=historial`, el de Brandon el
  // 10-10): quedaba en la URL y «Comandos IA» abría «Lo que hizo la IA» en vez
  // de su vista. Al montar fuera de Comandos, el `?sub=` sobra.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (sub === "comandos" || !url.searchParams.has("sub")) return;
    url.searchParams.delete("sub");
    window.history.replaceState(window.history.state, "", url.toString());
    // Sólo al montar: las navegaciones posteriores las limpia `irA`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      {/* El título va DENTRO de la barra de pestañas (patrón acordado con
          Brandon 2026-09-07): identidad a la izquierda, pestañas al lado y el
          medidor de IA a la derecha, en una sola banda. */}
      <AdminTabBar
        heading={{
          title: "Asistente IA",
          description: "Pregunta y anota hablando, la IA hace tareas por ti y conecta WhatsApp, Telegram y n8n.",
          icon: BotMessageSquare,
          actions: <ConsumoIA compacto />,
        }}
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      >
        {sub === "chat" && <ChatIAModule />}
        {sub === "comandos" && <AICommandModule />}
        {sub === "automatizaciones" && <AutomatizacionesModule />}
      </AdminTabBar>
    </div>
  );
}
