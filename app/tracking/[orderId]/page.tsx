import { Suspense } from "react";
import type { Metadata } from "next";
import { Bike } from "@buleje/design-system/icons";
import TrackingClient from "./TrackingClient";

export const metadata: Metadata = {
  title: "Seguimiento de pedido",
  description: "Rastrea en tiempo real la ubicacion de tu pedido. Delivery con seguimiento GPS.",
};

interface Props {
  params: Promise<{ orderId: string }>;
}

export default async function TrackingPage({ params }: Props) {
  const { orderId } = await params;

  return (
    <main className="min-h-screen bg-[var(--surface-sunken)] dark:bg-background">
      {/* Header de la página */}
      <div className="border-b border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <div className="mx-auto max-w-lg px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center bg-[var(--accent)]">
              <Bike className="h-5 w-5 text-white" strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-base font-bold text-[var(--text-primary)]">
                Seguimiento de pedido
              </h1>
              <p className="font-mono text-xs text-[var(--text-secondary)]">
                #{orderId.slice(-8).toUpperCase()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div className="mx-auto max-w-lg px-4 py-6">
        <Suspense fallback={<TrackingLoadingFallback />}>
          <TrackingClient orderId={orderId} />
        </Suspense>
      </div>
    </main>
  );
}

function TrackingLoadingFallback() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-20 bg-gray-200 dark:bg-gray-800" />
      <div className="h-12 bg-gray-200 dark:bg-gray-800" />
      <div className="h-72 bg-gray-200 dark:bg-gray-800" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-16 bg-gray-200 dark:bg-gray-800" />
        <div className="h-16 bg-gray-200 dark:bg-gray-800" />
      </div>
    </div>
  );
}
