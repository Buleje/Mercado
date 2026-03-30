import { Suspense } from "react";
import type { Metadata } from "next";
import TrackingClient from "./TrackingClient";

export const metadata: Metadata = {
  title: "Seguimiento de pedido | Bodega San Martín",
  description: "Rastrea en tiempo real la ubicación de tu pedido",
};

interface Props {
  params: Promise<{ orderId: string }>;
}

export default async function TrackingPage({ params }: Props) {
  const { orderId } = await params;

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header de la página */}
      <div className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto max-w-lg px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0f766e]">
              <span className="text-base">🏍️</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 dark:text-white">
                Seguimiento de pedido
              </h1>
              <p className="font-mono text-xs text-gray-500 dark:text-gray-400">
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
      <div className="h-20 rounded-xl bg-gray-200 dark:bg-gray-800" />
      <div className="h-12 rounded-xl bg-gray-200 dark:bg-gray-800" />
      <div className="h-72 rounded-xl bg-gray-200 dark:bg-gray-800" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-16 rounded-xl bg-gray-200 dark:bg-gray-800" />
        <div className="h-16 rounded-xl bg-gray-200 dark:bg-gray-800" />
      </div>
    </div>
  );
}
