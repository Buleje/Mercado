"use client";

/**
 * Cámaras — módulo propio del panel (ADR-411).
 *
 * Nació como una pestaña dentro de Herramientas Forestales, y salió de ahí por
 * pedido de Brandon: lo que uno mira «a ver qué pasó anoche» no puede estar a
 * tres clics adentro de otra herramienta. Ahora tiene su renglón en la barra
 * lateral y su propia dirección (`/admin?tab=camaras`).
 *
 * La pantalla es la misma pieza (`CamarasView`); esto le pone la cabecera del
 * panel. Se dejó de ofrecer en Herramientas para no tener el mismo lugar dos
 * veces en el menú.
 */

import dynamic from "next/dynamic";
import { Camera } from "@buleje/design-system/icons";
import { LoadingState } from "@buleje/design-system";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";

const CamarasView = dynamic(() => import("@/components/admin/forestal/CamarasView"), {
  ssr: false,
  loading: () => <LoadingState message="Cargando las cámaras…" />,
});

export default function CamarasModule() {
  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Cámaras"
        description="Lo que mandó la cámara del patio, con su hora y lo que se ve en cada foto"
        icon={Camera}
      />
      <CamarasView />
    </div>
  );
}
