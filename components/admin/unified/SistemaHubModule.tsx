"use client";

import { Gauge } from "@buleje/design-system/icons";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import ContenidoSistema from "@/components/admin/sistema/ContenidoSistema";
import { MODULE_ID_SISTEMA as MODULE_ID, useSubvistasSistema } from "@/components/admin/sistema/use-subvistas-sistema";

// ── Hub de Sistema (lo que abren `?tab=rendimiento`, `auditoria` y `colas`) ──
// Plan «panel unificado», ola 2 (2026-10-10): Sistema vive en Configuración ›
// Sistema, con Preferencias y una sola barra de segundo nivel (`?sub=`). Este
// hub suelto queda para los ids viejos mientras no pasen a ser alias: muestra
// las MISMAS sub-vistas (sin Preferencias, que necesita el estado de Ajustes)
// y con la misma barra. Antes eran Rendimiento › (otra barra de 4) · Auditoría
// · Colas: tres niveles.
//
// `MODULE_ID` = el de Configuración › Sistema: retomar donde estabas vale en
// los dos lugares.

export default function SistemaHubModule({ initialTab }: { initialTab?: string } = {}) {
  // `initialTab` (el id viejo) gana sobre la memoria pero no sobre un `?sub=`
  // explícito (ver useVistaModulo).
  const { tabs, activa, vista, irA } = useSubvistasSistema(false, initialTab);

  return (
    <div className="space-y-4">
      {/* El título va DENTRO de la barra de pestañas (patrón acordado con
          Brandon 2026-09-07): identidad a la izquierda, pestañas a la
          derecha, una sola regla. */}
      <AdminTabBar
        heading={{ title: "Sistema", description: "Velocidad de tu tienda, salud técnica, registro de actividad y colas de trabajo.", icon: Gauge }}
        tabs={tabs}
        activeTab={activa ?? vista}
        onTabChange={irA}
        moduleId={MODULE_ID}
        draggable={false}
        className="[&_[role=tablist]:empty]:hidden"
      >
        <ContenidoSistema activa={activa} />
      </AdminTabBar>
    </div>
  );
}
