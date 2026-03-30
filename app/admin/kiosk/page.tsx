"use client";

/**
 * /admin/kiosk — Modo Kiosko POS fullscreen para tablets.
 * Oculta completamente navbar y sidebar del panel admin.
 * Carga KioskPOS con lazy loading para tablets lentas.
 */

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const KioskPOS = dynamic(
  () => import("@/components/admin/KioskPOS"),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col items-center justify-center h-screen bg-black gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-teal-500" />
        <p className="text-gray-500 text-sm font-medium">Cargando modo caja...</p>
      </div>
    ),
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
