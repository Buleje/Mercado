"use client";

/**
 * Configuración › Sistema (`?tab=config&vista=sistema&sub=…`): Preferencias ·
 * Velocidad · Historial real · Salud del sistema · Soporte técnico · Actividad
 * · Colas, en una sola barra de segundo nivel (plan «panel unificado», ola 2).
 *
 * Sin título propio: el de la vista («Sistema») ya lo puso Configuración. Con
 * una sola sub-vista visible (un plan sin Max ve sólo Preferencias) no hay barra.
 */
import type { ReactNode } from "react";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import ContenidoSistema from "./ContenidoSistema";
import { MODULE_ID_SISTEMA, useSubvistasSistema } from "./use-subvistas-sistema";

export default function SistemaSubvistas({ preferencias }: { preferencias: ReactNode }) {
  const { tabs, activa, vista, irA } = useSubvistasSistema(true);
  const contenido = <ContenidoSistema activa={activa} preferencias={preferencias} />;

  if (tabs.length <= 1) return contenido;

  return (
    <AdminTabBar tabs={tabs} activeTab={activa ?? vista} onTabChange={irA} moduleId={MODULE_ID_SISTEMA} draggable={false}>
      <div className="pt-4">{contenido}</div>
    </AdminTabBar>
  );
}
