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
    <div className="flex flex-col gap-3 p-5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
      <span className="text-[var(--text-tertiary)]" aria-hidden>
        {icon}
      </span>
      <h3 className="text-sm font-bold text-[var(--text-primary)]">
        {title}
      </h3>
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
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
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
          Políticas
        </p>
        <h2
          id="store-policies-heading"
          className="text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--text-primary)]"
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
