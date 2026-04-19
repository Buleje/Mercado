"use client";

/**
 * SeguimientoClient — Orchestrator del tracking del pedido.
 *
 * Lifecycle:
 *   - Mount: arma snapshot inicial (server-injected via prop o API fetch).
 *   - Polling: cada 20s pide `/api/orders/[id]/tracking` para refrescar.
 *   - Mock-sim: si `enableMockAdvance` está activo, cada 30s avanza el progreso
 *     del repartidor y el status para simular el flujo "Amazon-real-time"
 *     sin necesidad de backend real.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "@buleje/design-system/icons";
import { SeguimientoHero } from "@/components/customer/seguimiento/SeguimientoHero";
import { OrderTimeline } from "@/components/customer/seguimiento/OrderTimeline";
import { DeliveryMapMock } from "@/components/customer/seguimiento/DeliveryMapMock";
import { DriverCard } from "@/components/customer/seguimiento/DriverCard";
import { OrderItemsCard } from "@/components/customer/seguimiento/OrderItemsCard";
import { ShareTrackingButton } from "@/components/customer/seguimiento/ShareTrackingButton";
import { SupportActions } from "@/components/customer/seguimiento/SupportActions";
import type {
  TrackingSnapshot,
  TrackingStatus,
} from "@/lib/mocks/order-tracking.mock";

interface Props {
  initialSnapshot: TrackingSnapshot;
  /** En vista pública deshabilitar acciones sensibles. */
  publicView?: boolean;
  /** Simular avance local cuando no hay backend que actualice. */
  enableMockAdvance?: boolean;
}

const STATUS_ORDER: TrackingStatus[] = [
  "confirmed",
  "preparing",
  "shipping",
  "nearby",
  "delivered",
];

function nextStatus(current: TrackingStatus): TrackingStatus {
  const idx = STATUS_ORDER.indexOf(current);
  if (idx < 0 || idx >= STATUS_ORDER.length - 1) return current;
  return STATUS_ORDER[idx + 1];
}

export default function SeguimientoClient({
  initialSnapshot,
  publicView = false,
  enableMockAdvance = true,
}: Props) {
  const [snapshot, setSnapshot] = useState<TrackingSnapshot>(initialSnapshot);
  const [refreshing, setRefreshing] = useState(false);
  const pollTimer = useRef<number | null>(null);

  // ── Polling real (contra API) ──
  const poll = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(
        `/api/orders/${encodeURIComponent(initialSnapshot.orderId)}/tracking`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const next = (await res.json()) as TrackingSnapshot;
      setSnapshot(next);
    } catch {
      // silencioso — reintentamos
    } finally {
      setRefreshing(false);
    }
  }, [initialSnapshot.orderId]);

  // ── Mock advance (simula avance del repartidor sin backend real) ──
  useEffect(() => {
    if (!enableMockAdvance) return;

    const tickProgress = window.setInterval(() => {
      setSnapshot((prev) => {
        if (prev.status === "delivered" || prev.status === "canceled") return prev;
        const newProgress = Math.min(1, prev.driverLocation.progress + 0.05);
        const newStatus: TrackingStatus =
          newProgress >= 1
            ? "delivered"
            : newProgress >= 0.85 && prev.status === "shipping"
              ? "nearby"
              : prev.status;
        return {
          ...prev,
          status: newStatus,
          driverLocation: {
            ...prev.driverLocation,
            progress: newProgress,
          },
          timeline: prev.timeline.map((s) => {
            if (s.step === newStatus) {
              return { ...s, done: true, current: true };
            }
            if (STATUS_ORDER.indexOf(s.step) < STATUS_ORDER.indexOf(newStatus)) {
              return { ...s, done: true, current: false };
            }
            return { ...s, current: false };
          }),
        };
      });
    }, 18_000);

    return () => window.clearInterval(tickProgress);
  }, [enableMockAdvance]);

  // ── Polling real cada 60s ──
  useEffect(() => {
    if (enableMockAdvance) return; // cuando mock-advance está activo, no pidamos la API
    pollTimer.current = window.setInterval(() => {
      poll();
    }, 60_000);
    return () => {
      if (pollTimer.current !== null) window.clearInterval(pollTimer.current);
    };
  }, [enableMockAdvance, poll]);

  // expuesto silenciosamente — evita warning lint si el estado no se lee
  void refreshing;
  void nextStatus;

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
      {!publicView && (
        <Link
          href="/cuenta/pedidos"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a mis pedidos
        </Link>
      )}

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
          <DriverCard driver={driver} hidePhone={publicView} />
          <OrderItemsCard items={items} total={total} paymentMethod={paymentMethod} />
          {!publicView && (
            <>
              <ShareTrackingButton orderId={orderId} storeName={storeName} />
              <SupportActions status={status} storeName={storeName} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
