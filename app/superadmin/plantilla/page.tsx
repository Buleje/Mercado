"use client";

/**
 * /superadmin/plantilla — Plantilla del Panel Admin (configuración base global).
 *
 * Página dedicada del módulo "Plantilla del panel". El superadmin define qué
 * módulos verán los dueños de tienda al cargar su panel admin por primera vez:
 *   - Visibilidad por módulo (mostrar/ocultar)
 *   - Plan mínimo requerido (free / pro / enterprise)
 *   - Etiqueta custom (renombrar "Pedidos" → "Comandas", etc.)
 *
 * El componente UI vive en `components/superadmin/stores/PlantillaPanelTab.tsx`
 * y también está disponible como tab en `/superadmin/stores?tab=plantilla`.
 * Los cambios se aplican en tiempo real al admin vía `useAdminTemplateOverlay`.
 */

import { Layers } from "@buleje/design-system/icons";
import { PlantillaPanelTab } from "@/components/superadmin/stores/PlantillaPanelTab";
import { AdminTabShell } from "../_components/_shared";

export default function PlantillaPage() {
  return (
    <AdminTabShell
      title="Plantilla del panel"
      description="Configura qué módulos del panel admin verán los dueños de tienda al iniciar. Cambios aplican en vivo a todos los tenants."
      icon={Layers}
      kicker="Configuración global"
    >
      <PlantillaPanelTab />
    </AdminTabShell>
  );
}
