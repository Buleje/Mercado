"use client";

import dynamic from "next/dynamic";
import { MapPin } from "lucide-react";

// Leaflet sólo se carga en el cliente (SSR desactivado)
const DeliveryTrackingMap = dynamic(
  () => import("@/components/tracking/DeliveryTrackingMap"),
  {
    ssr: false,
    loading: () => (
      <div className="animate-pulse space-y-4">
        <div className="h-20 rounded-xl bg-gray-200 dark:bg-gray-800" />
        <div className="h-72 rounded-xl bg-gray-200 dark:bg-gray-800" />
      </div>
    ),
  }
);

interface Props {
  orderId: string;
}

export default function TrackingClient({ orderId }: Props) {
  return (
    <div className="space-y-6">
      <DeliveryTrackingMap orderId={orderId} />

      {/* Footer informativo */}
      <div className="flex items-start gap-2 rounded-xl border border-gray-200 bg-white p-4 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#00B4A6]" />
        <p>
          El mapa se actualiza automáticamente cada 15 segundos mientras el repartidor esté
          en camino. Puedes contactarlo directamente usando el número de teléfono mostrado.
        </p>
      </div>
    </div>
  );
}
