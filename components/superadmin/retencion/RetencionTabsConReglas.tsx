"use client";

import { ListChecks } from "@buleje/design-system/icons";
import { SuperAdminModuleTabs, RETENCION_TABS, type ModuleTab } from "@/components/superadmin/_shared/ModuleTabs";

export const REGLAS_HREF = "/superadmin/rescue/reglas";

/**
 * Barra del hub Retención para la pantalla de reglas. Si `RETENCION_TABS` ya
 * trae la pestaña «Reglas» (receta pendiente en ModuleTabs.tsx), la usa tal cual;
 * si no, la agrega aquí para que la pantalla tenga su pestaña activa.
 */
export function RetencionTabsConReglas() {
  const tabs: ModuleTab[] = RETENCION_TABS.some((t) => t.href === REGLAS_HREF)
    ? RETENCION_TABS
    : [...RETENCION_TABS, { label: "Reglas", href: REGLAS_HREF, icon: ListChecks }];
  return <SuperAdminModuleTabs tabs={tabs} />;
}
