"use client";

/**
 * TiendaPreviewKPIs — 4 StatCards con mini sparkline + mini chart SVG del mes.
 * Datos mock, no llaman API. Sólo demo visual.
 */

import { StatCard, AdminGrid } from "@buleje/design-system";
import {
  ShoppingCart,
  Wallet,
  Star,
  Package,
} from "@buleje/design-system/icons";

interface KpiCard {
  label: string;
  value: string;
  delta: number | null;
  deltaLabel?: string;
  Icon: typeof ShoppingCart;
  sparkline: number[];
}

const KPIS: KpiCard[] = [
  {
    label: "Pedidos del mes",
    value: "247",
    delta: 18.3,
    deltaLabel: "vs mes pasado",
    Icon: ShoppingCart,
    sparkline: [12, 18, 15, 22, 28, 25, 30, 34, 38, 42, 40, 48],
  },
  {
    label: "Ingresos del mes",
    value: "S/ 11,340",
    delta: 22.7,
    deltaLabel: "vs mes pasado",
    Icon: Wallet,
    sparkline: [580, 720, 650, 920, 1100, 980, 1200, 1380, 1520, 1680, 1580, 1840],
  },
  {
    label: "Rating promedio",
    value: "4.8",
    delta: 0.3,
    deltaLabel: "vs mes pasado",
    Icon: Star,
    sparkline: [4.5, 4.5, 4.6, 4.7, 4.7, 4.6, 4.7, 4.7, 4.8, 4.8, 4.8, 4.8],
  },
  {
    label: "Productos activos",
    value: "84",
    delta: null,
    Icon: Package,
    sparkline: [70, 72, 74, 76, 78, 80, 82, 84, 84, 84, 84, 84],
  },
];

export default function TiendaPreviewKPIs() {
  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">Resumen del mes</h2>
        <p className="text-xs text-[var(--text-tertiary)]">
          Últimos 30 días
        </p>
      </div>
      <AdminGrid cols={4} gap={4}>
        {KPIS.map((k) => (
          <StatCard
            key={k.label}
            label={k.label}
            value={k.value}
            delta={k.delta}
            deltaLabel={k.deltaLabel}
            icon={k.Icon}
            sparkline={{ data: k.sparkline, height: 28 }}
          />
        ))}
      </AdminGrid>
    </section>
  );
}
