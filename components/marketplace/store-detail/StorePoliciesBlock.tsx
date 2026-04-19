"use client";

/**
 * StorePoliciesBlock — 3 cards: delivery, pagos, devoluciones.
 *
 * Grid 3 cols desktop / 1 col mobile. Iconos Lucide grises.
 * Holded style: sin saturación, sin emojis, borde sutil.
 */

import { Truck, Wallet, RefreshCw } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface PolicyCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function PolicyCard({ icon, title, description }: PolicyCardProps) {
  return (
    <div className="flex flex-col gap-3 p-5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <span className="text-gray-400 dark:text-gray-500" aria-hidden>
        {icon}
      </span>
      <h3 className="text-sm font-bold text-gray-900 dark:text-white">
        {title}
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
        {description}
      </p>
    </div>
  );
}

export default function StorePoliciesBlock() {
  return (
    <section aria-labelledby="store-policies-heading" className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-gray-400 dark:text-gray-500 mb-2">
          Políticas
        </p>
        <h2
          id="store-policies-heading"
          className="text-xl sm:text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white"
        >
          Cómo compramos
        </h2>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <PolicyCard
          icon={<Truck className="h-5 w-5" />}
          title="Delivery"
          description="Gratis en pedidos mayores a S/30. Tiempo promedio 25 minutos. Cobertura en Callería y Manantay."
        />
        <PolicyCard
          icon={<Wallet className="h-5 w-5" />}
          title="Pagos"
          description="Aceptamos Yape, Plin y efectivo al recibir. Sin recargos ni costos adicionales por método de pago."
        />
        <PolicyCard
          icon={<RefreshCw className="h-5 w-5" />}
          title="Devoluciones"
          description="Reembolso completo si el producto llega dañado o en mal estado. Reportar por WhatsApp dentro de las 2 horas."
        />
      </div>
    </section>
  );
}
