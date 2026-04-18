"use client";

/**
 * /admin/kiosk — Modo Kiosko POS fullscreen para tablets.
 * Oculta completamente navbar y sidebar del panel admin.
 * Carga KioskPOS con lazy loading para tablets lentas.
 */

import dynamic from "next/dynamic";
import { LoadingState } from "@buleje/design-system";

const KioskPOS = dynamic(
  () => import("@/components/admin/KioskPOS"),
  {
    ssr: false,
    loading: () => <LoadingState variant="fullscreen" size="lg" message="Cargando modo caja..." />,
  }
);

export default function KioskPage() {
  return (
    // overflow-hidden evita cualquier scroll no deseado en tablet
    <div className="fixed inset-0 z-[9999] bg-black overflow-hidden">
      <KioskPOS />
    </div>
  );
}
