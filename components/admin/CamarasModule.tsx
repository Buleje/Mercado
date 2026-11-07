"use client";

/**
 * Cámaras — módulo propio del panel (ADR-411).
 *
 * Nació como una pestaña dentro de Herramientas Forestales, y salió de ahí por
 * pedido de Brandon: lo que uno mira «a ver qué pasó anoche» no puede estar a
 * tres clics adentro de otra herramienta. Ahora tiene su renglón en la barra
 * lateral y su propia dirección (`/admin?tab=camaras`).
 *
 * La pantalla es la misma pieza (`CamarasView`), que desde el 10-10 dibuja su
 * propia banda (título + pestañas en una fila, `AdminTabBar heading`). Se dejó
 * de ofrecer en Herramientas para no tener el mismo lugar dos veces en el menú.
 */

import dynamic from "next/dynamic";
import { LoadingState } from "@buleje/design-system";

const CamarasView = dynamic(() => import("@/components/admin/forestal/CamarasView"), {
  ssr: false,
  loading: () => <LoadingState message="Cargando las cámaras…" />,
});

export default function CamarasModule() {
  return <CamarasView />;
}
