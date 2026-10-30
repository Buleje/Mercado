"use client";

import { StatCard } from "@buleje/design-system";
import { useMemo } from "react";
import { Truck, DollarSign, AlertTriangle, ShoppingCart, CreditCard } from "@buleje/design-system/icons";
import dynamic from "next/dynamic";
import { useDashboardData } from "@/contexts/dashboard-data-context";
import { describeRange, type DateRange } from "./DashboardDateRange";
import BarraDeuda from "@/components/admin/shared/BarraDeuda";

const ComprasCharts = dynamic(() => import("./ComprasCharts"), { ssr: false });
const ComprasAdvancedCharts = dynamic(
  () => import("./ComprasAdvancedCharts").then((m) => ({ default: m.ComprasAdvancedCharts })),
  { ssr: false },
);
import { BulejeDashboardSkeleton, LineaSinDato } from "./_shared";
import EmptyDateRangeState from "./EmptyDateRangeState";
import { algunDato } from "@/lib/admin/inicio/hay-datos";
import { cantidad, soles } from "@/lib/admin/inicio/formato-tablero";
import { comprasPorMes, serieDelRango, tramosDeDeuda, type ComprasData } from "./compras-presentacion";

export type { ComprasData };

// ── Types ────────────────────────────────────────────────────────────────────

interface Purchase {
  id: string; supplierId: string; supplierName: string;
  total: number; status: string; createdAt?: string;
}
interface Payable {
  id: string; supplierId: string; supplierName: string;
  amount: number; paidAmount: number; status: string; dueDate: string;
}
interface Supplier {
  id: string; name: string; phone: string; email: string; createdAt: string;
}

/** Cuatro cifras héroe: 2 por fila en celular, 4 desde 1024 px. */
const KPI_GRID_4 =
  "grid grid-cols-2 gap-3 lg:grid-cols-4 max-sm:[&_[data-stat-card]>div:first-child>svg]:hidden";

// ── Main Component ───────────────────────────────────────────────────────────

interface ComprasDashboardProps {
  dateRange: DateRange;
  onChangeRange?: (r: DateRange) => void;
}

export default function ComprasDashboard({ dateRange, onChangeRange }: ComprasDashboardProps) {
  const { data: shared, loading, error, refresh } = useDashboardData();

  const purchases = (shared?.purchases ?? []) as Purchase[];
  const payables = (shared?.payables ?? []) as Payable[];
  const suppliers = (shared?.suppliers ?? []) as Supplier[];
  const raw = shared ? { purchases, payables, suppliers } : null;

  const data = useMemo<ComprasData | null>(() => {
    if (!raw) return null;
    const { purchases, payables, suppliers } = raw;
    const { from, to } = dateRange;
    const now = new Date();

    // Filter by date range
    const periodPurchases = purchases.filter(p => p.createdAt && new Date(p.createdAt) >= from && new Date(p.createdAt) <= to);

    // Previous period
    const rangeDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000));
    const prevFrom = new Date(from.getTime() - rangeDays * 86400000);
    const prevTo = new Date(from.getTime() - 1);
    const prevPurchases = purchases.filter(p => p.createdAt && new Date(p.createdAt) >= prevFrom && new Date(p.createdAt) <= prevTo);

    // KPIs
    const totalCompras = periodPurchases.reduce((a, p) => a + p.total, 0);
    const cantidadOrdenes = periodPurchases.length;
    const totalProveedores = suppliers.length;
    const deudaPendiente = payables.filter(p => p.status !== "pagado").reduce((a, p) => a + (p.amount - p.paidAmount), 0);
    const cuentasVencidas = payables.filter(p => p.status !== "pagado" && new Date(p.dueDate) < now).length;
    const promedioOrden = cantidadOrdenes > 0 ? totalCompras / cantidadOrdenes : 0;

    // Delta
    const prevTotal = prevPurchases.reduce((a, p) => a + p.total, 0);
    const dCompras = prevTotal === 0 ? null : ((totalCompras - prevTotal) / prevTotal) * 100;

    // Purchases by supplier
    const provMap = new Map<string, { nombre: string; total: number; ordenes: number }>();
    periodPurchases.forEach(p => {
      const e = provMap.get(p.supplierId) ?? { nombre: p.supplierName, total: 0, ordenes: 0 };
      e.total += p.total; e.ordenes++;
      provMap.set(p.supplierId, e);
    });
    const comprasPorProveedor = [...provMap.values()].sort((a, b) => b.total - a.total).slice(0, 10);

    // Upcoming due accounts
    const pendientes = payables
      .filter(p => p.status !== "pagado")
      .map(p => {
        const due = new Date(p.dueDate);
        const diasRestantes = Math.round((due.getTime() - now.getTime()) / 86400000);
        // «Vencida» con la MISMA regla que `cuentasVencidas` (fecha < ahora): antes una cuenta
        // vencida esta mañana contaba como vencida arriba y como «vence hoy» en la lista.
        const status: "vencido" | "urgente" | "pendiente" = due < now ? "vencido" : diasRestantes < 7 ? "urgente" : "pendiente";
        return { nombre: p.supplierName, monto: p.amount - p.paidAmount, diasRestantes, vence: p.dueDate, status };
      })
      .sort((a, b) => a.diasRestantes - b.diasRestantes);

    // Top suppliers (all time)
    const allProvMap = new Map<string, { nombre: string; total: number; ordenes: number }>();
    purchases.forEach(p => {
      const e = allProvMap.get(p.supplierId) ?? { nombre: p.supplierName, total: 0, ordenes: 0 };
      e.total += p.total; e.ordenes++;
      allProvMap.set(p.supplierId, e);
    });
    const topProveedores = [...allProvMap.values()].sort((a, b) => b.total - a.total).slice(0, 5);

    return {
      totalCompras, cantidadOrdenes, totalProveedores, proveedoresActivos: provMap.size,
      deudaPendiente, cuentasVencidas, promedioOrden, dCompras, comprasPorProveedor,
      serie: serieDelRango(periodPurchases, from, to),
      tramosDeuda: tramosDeDeuda(pendientes),
      cuentasPorVencer: pendientes.slice(0, 10),
      topProveedores,
      comprasMensuales: comprasPorMes(purchases, now),
    };
  }, [raw, dateRange]);

  if (loading) return <BulejeDashboardSkeleton />;
  if (error && !data) return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <AlertTriangle className="h-10 w-10 text-[var(--data-warning-500)]" />
      {/* Sin el código crudo («Error 429»): qué pasó y qué hacer, en una frase. */}
      <p className="text-sm text-[var(--text-secondary)]">
        {/429/.test(error) ? "Hubo muchas consultas seguidas. Espera unos segundos y reintenta." : "No se pudieron cargar tus compras."}
      </p>
      <button onClick={() => void refresh()} className="px-4 min-h-10 rounded-xl bg-[var(--brand-primary)] text-white text-sm font-semibold hover:opacity-90 transition-opacity">Reintentar</button>
    </div>
  );
  if (!data) return null;

  // R1: sin compras en el rango y sin nada que pagar → sólo el estado vacío.
  // La deuda cuenta aunque no sea «del rango»: es lo que hoy le debes a alguien.
  if (!algunDato([data.totalCompras, data.cantidadOrdenes, data.deudaPendiente])) {
    return (
      <EmptyDateRangeState
        dateRange={dateRange}
        metric="compras"
        onChangeRange={onChangeRange}
        action={{ label: "Registrar compra", href: "/admin?tab=compras" }}
      />
    );
  }

  const periodo = describeRange(dateRange);
  const hayCompras = data.totalCompras !== 0 || data.cantidadOrdenes > 0;
  const plural = (n: number, una: string, varias: string) => `${cantidad(n)} ${n === 1 ? una : varias}`;
  // Sin dato no ocupa una tarjeta con «—» (2026-10-29): va en la línea de abajo.
  const hayProveedores = data.proveedoresActivos > 0;
  const nHero = 1 + (hayCompras ? 2 : 0) + (hayProveedores ? 1 : 0);
  const sinDatoHero = [
    ...(hayCompras
      ? []
      : [
          { label: "Compraste", hint: `No registraste compras ${periodo}.` },
          { label: "Órdenes", hint: `Ninguna orden ${periodo}.` },
        ]),
    ...(hayProveedores
      ? []
      : [
          {
            label: "Proveedores",
            hint: `Ningún proveedor te vendió ${periodo} (tienes ${plural(data.totalProveedores, "registrado", "registrados")}).`,
          },
        ]),
  ];

  return (
    <div className="space-y-3">
      {/* Fila héroe: cuánto compraste, cuántas órdenes, a cuántos, cuánto debes. Sin dato = línea «Sin dato» con ⓘ.
          Sin sparkline: repetía «Compras por día» y, escalada de mínimo a máximo, un 3 % parecía un salto. */}
      <div className={nHero >= 4 ? KPI_GRID_4 : nHero === 3 ? "grid grid-cols-2 gap-3 lg:grid-cols-3 max-lg:[&>*:last-child]:col-span-2" : "grid grid-cols-2 gap-3"}>
        {hayCompras && (
          <>
            <StatCard
              density="compact"
              label="Compraste"
              value={soles(data.totalCompras)}
              subValue={periodo}
              icon={DollarSign}
              delta={data.dCompras}
              deltaLabel={data.dCompras != null ? "vs antes" : undefined}
              deltaPolarity="neutral"
            />
            <StatCard
              density="compact"
              label="Órdenes"
              value={cantidad(data.cantidadOrdenes)}
              subValue={`${soles(data.promedioOrden)} en promedio`}
              icon={ShoppingCart}
            />
          </>
        )}
        {hayProveedores && (
          <StatCard
            density="compact"
            label="Proveedores"
            value={cantidad(data.proveedoresActivos)}
            subValue={`te vendieron ${periodo}`}
            icon={Truck}
          />
        )}
        {/* El cero acá es la noticia («Nada»), no un relleno. */}
        <StatCard
          density="compact"
          label="Por pagar"
          value={data.deudaPendiente > 0 ? soles(data.deudaPendiente) : "Nada"}
          subValue={
            data.deudaPendiente > 0
              ? data.cuentasVencidas > 0
                ? `${plural(data.cuentasVencidas, "cuenta vencida", "cuentas vencidas")}`
                : "ninguna vencida"
              : "no le debes a ningún proveedor"
          }
          icon={CreditCard}
          emphasis={data.deudaPendiente > 0 ? (data.cuentasVencidas > 0 ? "error" : "warning") : "neutral"}
        />
      </div>
      {sinDatoHero.length > 0 && <LineaSinDato kpis={sinDatoHero} className="-mt-1" />}

      {/* Lo que pide trabajo, en una línea (`BarraDeuda`): sólo si hay cuentas por pagar.
          Sin `href`: las cuentas por pagar viven en un sub-tab de Facturación cuyo
          estado NO está en la URL; un enlace dejaría al operador en otra pestaña. */}
      {data.deudaPendiente > 0 && (
        <BarraDeuda
          items={
            data.cuentasVencidas > 0
              ? [{
                  key: "cuentas-vencidas",
                  valor: data.cuentasVencidas,
                  label: `cuenta${data.cuentasVencidas > 1 ? "s" : ""} vencida${data.cuentasVencidas > 1 ? "s" : ""}`,
                  hint: `${soles(data.tramosDeuda.vencido.monto)} ya pasaron su fecha`,
                  tono: "error" as const,
                  title: "Cuentas por pagar que ya pasaron su fecha — se revisan en Facturación › Cuentas por pagar",
                }]
              : []
          }
          vacio="Ninguna cuenta por pagar está vencida."
        />
      )}

      {/* ── Gráficos base: por día, lo que debes, proveedores, por mes ── */}
      <ComprasCharts data={data} periodo={periodo} />

      {/* ── Opcionales (apagados de entrada, se prenden en «Gráficos») ── */}
      <ComprasAdvancedCharts topProveedores={data.topProveedores} />
    </div>
  );
}
