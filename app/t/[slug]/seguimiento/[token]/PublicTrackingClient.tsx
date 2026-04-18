"use client";

/**
 * PublicTrackingClient — Vista pública del tracking vía token firmado.
 *
 * Reusa SeguimientoClient en modo `publicView` para ocultar acciones sensibles
 * (compartir link, cancelar pedido, llamar al repartidor).
 *
 * Polling: 60s contra /api/public/tracking/[token] — sigue funcionando sin login.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { SeguimientoHero } from "@/components/customer/seguimiento/SeguimientoHero";
import { OrderTimeline } from "@/components/customer/seguimiento/OrderTimeline";
import { DeliveryMapMock } from "@/components/customer/seguimiento/DeliveryMapMock";
import { DriverCard } from "@/components/customer/seguimiento/DriverCard";
import { OrderItemsCard } from "@/components/customer/seguimiento/OrderItemsCard";
import type { TrackingSnapshot } from "@/lib/mocks/order-tracking.mock";

interface Props {
  initialSnapshot: TrackingSnapshot;
  token: string;
}

export default function PublicTrackingClient({ initialSnapshot, token }: Props) {
  const [snapshot, setSnapshot] = useState<TrackingSnapshot>(initialSnapshot);
  const pollTimer = useRef<number | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/tracking/${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const next = (await res.json()) as TrackingSnapshot;
      setSnapshot(next);
    } catch {
      // silencioso
    }
  }, [token]);

  // Mock advance local — para demos sin backend.
  useEffect(() => {
    const tick = window.setInterval(() => {
      setSnapshot((prev) => {
        if (prev.status === "delivered" || prev.status === "canceled") return prev;
        const p = Math.min(1, prev.driverLocation.progress + 0.04);
        return {
          ...prev,
          driverLocation: { ...prev.driverLocation, progress: p },
        };
      });
    }, 20_000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    pollTimer.current = window.setInterval(poll, 60_000);
    return () => {
      if (pollTimer.current !== null) window.clearInterval(pollTimer.current);
    };
  }, [poll]);

  const {
    orderId,
    status,
    etaAt,
    timeline,
    driver,
    items,
    total,
    paymentMethod,
    storeName,
    address,
    driverLocation,
  } = snapshot;

  const destinationLabel = `${address.street} · ${address.district}`;

  return (
    <div className="space-y-6">
      <SeguimientoHero
        orderId={orderId}
        status={status}
        etaAt={etaAt}
        storeName={storeName}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <div className="lg:col-span-2 space-y-4 lg:space-y-6">
          <DeliveryMapMock
            progress={driverLocation.progress}
            storeLabel={storeName}
            destinationLabel={destinationLabel}
            driverName={driver?.name}
          />
          <OrderTimeline timeline={timeline} />
        </div>

        <div className="space-y-4 lg:space-y-6">
          <DriverCard driver={driver} hidePhone />
          <OrderItemsCard items={items} total={total} paymentMethod={paymentMethod} />
        </div>
      </div>
    </div>
  );
}
