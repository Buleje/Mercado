import type { ReactNode } from "react";
import { TreePine } from "@buleje/design-system/icons";
import { CabeceraConPestanas } from "@/components/admin/shared/cabecera-con-pestanas";
import { SuperAdminModuleTabs, PLANTAS_TABS } from "@/components/superadmin/_shared/ModuleTabs";

interface Props {
  titulo: string;
  what: string;
  affects?: string;
  example?: ReactNode;
}

/**
 * Cabecera de las pantallas de Plantas forestales: el título manda, la ayuda va
 * en el ⓘ y las pestañas del módulo van a su lado, en la misma fila (18-10).
 */
export function CabeceraPlantas({ titulo, what, affects, example }: Props) {
  return (
    <CabeceraConPestanas
      icon={TreePine}
      title={titulo}
      kicker="Plataforma · Forestal"
      info={{ title: titulo, what, affects, example }}
      pestanas={<SuperAdminModuleTabs enLinea tabs={PLANTAS_TABS} />}
    />
  );
}
