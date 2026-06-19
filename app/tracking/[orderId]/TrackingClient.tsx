"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { MapPin } from "@buleje/design-system/icons";

// Leaflet sólo se carga en el cliente (SSR desactivado)
const DeliveryTrackingMap = dynamic(
  () => import("@/components/tracking/DeliveryTrackingMap"),
  {
    ssr: false,
    loading: () => (
      <div className="animate-pulse space-y-4">
        <div className="h-20 bg-gray-200 dark:bg-gray-800" />
        <div className="h-72 bg-gray-200 dark:bg-gray-800" />
      </div>
    ),
  }
);

const TipWidget = dynamic(() => import("@/components/tracking/TipWidget"), {
  ssr: false,
});

interface Props {
  orderId: string;
}

interface TrackingMeta {
  status: string;
  partnerName: string;
}

export default function TrackingClient({ orderId }: Props) {
  const [meta, setMeta] = useState<TrackingMeta | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/delivery/tracking/${orderId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setMeta({ status: data.status, partnerName: data.partnerName });
        }
      } catch {
        /* poll silencioso */
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [orderId]);

  return (
    <div className="space-y-6">
      <DeliveryTrackingMap orderId={orderId} />

      {meta?.status === "delivered" && (
        <TipWidget orderId={orderId} partnerName={meta.partnerName} />
      )}

      {/* Footer informativo */}
      <div className="flex items-start gap-2 border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 text-sm text-[var(--text-secondary)]">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
        <p>
          El mapa se actualiza automáticamente cada 15 segundos mientras el repartidor esté
          en camino. Puedes contactarlo directamente usando el número de teléfono mostrado.
        </p>
      </div>
    </div>
  );
}
