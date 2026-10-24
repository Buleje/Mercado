"use client";

import { useMemo } from "react";
import { AlertTriangle } from "@buleje/design-system/icons";
import dynamic from "next/dynamic";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import { describeRange, type DateRange } from "./DashboardDateRange";
import { BulejeDashboardSkeleton, DashboardSection, type SectionKPI } from "./_shared";
import EmptyDateRangeState from "./EmptyDateRangeState";
import { cantidad, porcentaje } from "@/lib/admin/inicio/formato-tablero";
import {
  calcularClientes,
  cifraONinguno,
  hayClientesEnRango,
  pct,
  type ClientesCrudos,
  type ClientesData,
} from "./clientes-tablero";

// El tipo vive con las cuentas; se re-exporta para no romper los imports.
export type { ClientesData };

const ClientesCharts = dynamic(() => import("./ClientesCharts"), { ssr: false });
const ClientesAdvancedCharts = dynamic(
  () => import("./ClientesAdvancedCharts").then((m) => ({ default: m.ClientesAdvancedCharts })),
  { ssr: false },
);

/**
 * Las 4 cifras que el dueño mira primero (R3: sin «0» de relleno). Reemplaza 6
 * StatCards + la franja «Retención | Nuevos | Recurrentes» que repetía lo mismo:
 * los registrados y las reseñas siguen a la vista como línea chica.
 */
function kpisDeResumen(d: ClientesData, periodo: string): SectionKPI[] {
  const compraron = d.clientesActivos;
  return [
    {
      label: "Compraron",
      value: cantidad(compraron),
      delta: d.dActivos,
      deltaLabel: "vs período anterior",
      sub: `de ${cantidad(d.totalClientes)} registrados`,
      hint: `Clientes con teléfono que te compraron ${periodo}: pedidos entregados y ventas con cliente.`,
      tone: "primary",
    },
    {
      label: "Nuevos",
      value: cifraONinguno(d.nuevos),
      delta: d.nuevos > 0 ? d.dNuevos : null,
      deltaLabel: "vs período anterior",
      sub: d.nuevos > 0 ? "su primera compra" : "ya eran clientes",
      hint: `Clientes cuya primera compra fue ${periodo}.`,
    },
    {
      label: "Volvieron",
      value: cifraONinguno(d.recurrentes),
      sub: d.recurrentes > 0 ? `${porcentaje(pct(d.recurrentes, compraron))} del total` : "todos son nuevos",
      hint: "Clientes que ya te habían comprado antes de este período y volvieron.",
      tone: d.recurrentes > 0 ? "success" : "neutral",
    },
    {
      label: "Puntaje",
      value: `${d.ratingPromedio.toFixed(1)} de 5`,
      sinDato: d.totalResenas === 0,
      sinDatoHint: "Todavía no tienes reseñas. Pídeselas a tus clientes después de cada pedido.",
      sub: `de ${cantidad(d.totalResenas)} ${d.totalResenas === 1 ? "reseña" : "reseñas"}`,
      hint: "Promedio de las estrellas de todas tus reseñas, no sólo las del período.",
      tone: d.ratingPromedio >= 4 ? "success" : d.ratingPromedio < 3 ? "warning" : "neutral",
    },
  ];
}

interface ClientesDashboardProps {
  dateRange: DateRange;
  onChangeRange?: (r: DateRange) => void;
}

export default function ClientesDashboard({ dateRange, onChangeRange }: ClientesDashboardProps) {
  const { data: shared, loading, error, refresh } = useDashboardData();

  const data = useMemo<ClientesData | null>(() => {
    if (!shared) return null;
    const raw = {
      customers: shared.customers ?? [],
      orders: shared.orders ?? [],
      sales: shared.sales ?? [],
      reviews: shared.reviews ?? [],
    } as unknown as ClientesCrudos;
    return calcularClientes(raw, dateRange);
  }, [shared, dateRange]);

  if (loading) return <BulejeDashboardSkeleton />;
  if (error && !data) return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <AlertTriangle className="h-10 w-10 text-[var(--data-warning-500)]" />
      <p className="text-sm text-[var(--text-secondary)]">{error}</p>
      <button onClick={() => void refresh()} className="px-4 min-h-10 rounded-xl bg-[var(--brand-primary)] text-white text-sm font-semibold hover:opacity-90 transition-opacity">Reintentar</button>
    </div>
  );
  if (!data) return null;

  // R1 (Brandon 2026-10-09): ningún cliente compró en el rango → sólo el estado
  // vacío del paiche, aunque haya clientes registrados (antes salía el tablero
  // entero con «0 activos», «0.0» de calificación en rojo y gráficos vacíos).
  if (!hayClientesEnRango(data)) {
    return (
      <EmptyDateRangeState
        dateRange={dateRange}
        metric="compras de clientes"
        onChangeRange={onChangeRange}
        description="Prueba otro período, o agrega a tus clientes con su teléfono para ver quién te compra."
        action={{ label: "Agregar cliente", href: "/admin?tab=clientes&vista=crm" }}
      />
    );
  }

  const periodo = describeRange(dateRange);
  return (
    <div className="space-y-4">
      <DashboardSection kicker={`Resumen · ${periodo}`} title="Tus clientes" kpis={kpisDeResumen(data, periodo)} className="pb-0 sm:pb-0">
        {null}
      </DashboardSection>

      {/* ── Gráficos base (quién compra, por día, gasto, frecuencia, por mes, ticket) ── */}
      <ClientesCharts data={data} />

      {/* ── Gráficos especializados (cohortes, grupos, reseñas, semana vs semana, horario, en riesgo) ── */}
      <ClientesAdvancedCharts />
    </div>
  );
}
