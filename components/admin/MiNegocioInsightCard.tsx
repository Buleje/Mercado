"use client";

import { useEffect, useState } from "react";
import { AdminInsightCard, type ContextualMetric, type InsightAction } from "@/components/admin/ux";

/**
 * MiNegocioInsightCard — AdminInsightCard (Ola 4) + datos reales.
 *
 * Wrapper que consume `/api/admin/today-summary` y mapea al contrato
 * de AdminInsightCard. Drop-in replacement para MiNegocioHoyCard legacy.
 *
 * @example
 * // En admin home o DashboardTab:
 * <MiNegocioInsightCard greeting="Buen día, Brandon" />
 */

interface TodaySummary {
  ventas: {
    total: number;
    ventasMostrador: number;
    ventasOnline: number;
    cantidadVentas: number;
    cambioVsAyer: number;
  };
  pedidos: {
    hoy: number;
    pendientes: number;
  };
  alertas: {
    stockBajo: number;
    sinStock: number;
    porVencer: number;
    totalAlertas: number;
  };
  topProducto: { nombre: string; cantidad: number } | null;
  generadoA: string;
}

interface Props {
  greeting?: string;
  /** Trend data opcional (ultimos 7 dias) — si no se provee, fallback estatico */
  trend?: number[];
  className?: string;
}

export function MiNegocioInsightCard({ greeting, trend, className }: Props) {
  const [data, setData] = useState<TodaySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const res = await fetch("/api/admin/today-summary");
        if (res.ok && active) {
          setData(await res.json());
        }
      } catch { /* silent */ }
      if (active) setLoading(false);
    };

    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Loading o sin data → skeleton del AdminInsightCard
  if (loading || !data) {
    return (
      <AdminInsightCard
        greeting={greeting}
        heroLabel="Ventas de hoy"
        heroValue={0}
        heroPrefix="S/ "
        loading
        className={className}
      />
    );
  }

  const { ventas, pedidos, alertas, topProducto } = data;

  // Build contextual metrics desde data real
  const contextualMetrics: ContextualMetric[] = [
    {
      label: "Pedidos",
      value: pedidos.hoy,
      delta: undefined, // no tenemos delta vs ayer pedidos
    },
    {
      label: "Ventas",
      value: ventas.cantidadVentas,
    },
    {
      label: "Ticket prom.",
      value: ventas.cantidadVentas > 0 ? ventas.total / ventas.cantidadVentas : 0,
      prefix: "S/ ",
      decimals: 2,
    },
    {
      label: "Alertas",
      value: alertas.totalAlertas,
      status: alertas.totalAlertas > 3 ? "warning" : alertas.totalAlertas > 0 ? "warning" : undefined,
    },
  ];

  // Insight IA basado en datos
  let insight: InsightAction | undefined;
  if (alertas.sinStock > 0) {
    insight = {
      type: "warning",
      text: `Tienes ${alertas.sinStock} ${alertas.sinStock === 1 ? "producto" : "productos"} sin stock. Los clientes no los pueden comprar.`,
      cta: { label: "Ver inventario", href: "/admin?module=inventario&filter=sin-stock" },
    };
  } else if (alertas.porVencer > 0) {
    insight = {
      type: "warning",
      text: `${alertas.porVencer} ${alertas.porVencer === 1 ? "producto" : "productos"} están por vencer. Recomendamos ofertas flash para rotar el stock.`,
      cta: { label: "Crear promo", href: "/admin?module=promociones&action=new" },
    };
  } else if (ventas.cambioVsAyer < -15) {
    insight = {
      type: "opportunity",
      text: `Tus ventas están ${Math.abs(ventas.cambioVsAyer).toFixed(0)}% abajo vs ayer. ¿Creamos una promo flash para recuperar?`,
      cta: { label: "Crear promo flash", href: "/admin?module=promociones&action=new" },
    };
  } else if (ventas.cambioVsAyer > 15) {
    insight = {
      type: "opportunity",
      text: `Vas ${Number(ventas.cambioVsAyer).toFixed(0)}% arriba vs ayer${topProducto ? `. "${topProducto.nombre}" lidera las ventas.` : "."}`,
    };
  } else if (pedidos.pendientes > 0) {
    insight = {
      type: "info",
      text: `${pedidos.pendientes} ${pedidos.pendientes === 1 ? "pedido pendiente" : "pedidos pendientes"} de preparar.`,
      cta: { label: "Ver pedidos", href: "/admin?module=pedidos&filter=pendientes" },
    };
  }

  return (
    <AdminInsightCard
      greeting={greeting}
      heroLabel="Ventas de hoy"
      heroValue={ventas.total}
      heroPrefix="S/ "
      heroDelta={ventas.cambioVsAyer}
      heroDeltaLabel="vs ayer"
      trend={trend}
      contextualMetrics={contextualMetrics}
      insight={insight}
      className={className}
    />
  );
}
