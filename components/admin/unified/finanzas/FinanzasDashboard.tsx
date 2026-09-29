"use client";

/**
 * El tablero de «Resumen» de Mi Plata.
 *
 * Vivía dentro de `FinanzasModule.tsx`, que llegó a 1.420 líneas y mezclaba la
 * navegación del hub con el dibujo de sus ocho KPIs y sus nueve gráficos. Acá
 * queda el tablero solo; el módulo queda con la navegación sola.
 *
 * 2026-09-28: el tablero llegó a 1.037 líneas. Los datos pasaron a
 * `hooks/use-resumen-plata.ts` y cada bloque a `./resumen/`; este archivo
 * decide qué se ve y en qué orden.
 */

import { CardTitle } from "@buleje/design-system";
import { useState, useEffect, useMemo } from "react";
import { BarChart3 } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/currency";
import { useFavoriteCharts } from "@/hooks/use-favorite-charts";
import { useResumenPlata } from "@/hooks/use-resumen-plata";
import { useCajaAbierta, efectivoConocido, type UsoCajaAbierta } from "@/hooks/use-caja-abierta";
import { StaggerItem } from "@/components/admin/finanzas/charts";
import { calcHealthScore } from "@/components/admin/finanzas/shared";
import { formatMonthYear } from "@/lib/format";
import CabeceraDelResumen, { type Alerta, type Periodo } from "./resumen/CabeceraDelResumen";
import KpisDelResumen from "./resumen/KpisDelResumen";
import GraficoIngresosGastos from "./resumen/GraficoIngresosGastos";
import DonutsGastosYPagos from "./resumen/DonutsGastosYPagos";
import FlujoCajaDiario from "./resumen/FlujoCajaDiario";
import ProyeccionDelMes from "./resumen/ProyeccionDelMes";
import ResumenFiscal from "./resumen/ResumenFiscal";
import { IndicadoresDeSalud, SaludDelNegocio } from "./resumen/SaludFinanciera";
import DeudasYCobros from "./resumen/DeudasYCobros";
import CompararMeses from "./resumen/CompararMeses";
import GraficosAmpliados from "./resumen/GraficosAmpliados";
import EsqueletoResumen from "./resumen/EsqueletoResumen";
import CajaDelResumen from "./resumen/CajaDelResumen";

/** Por qué la liquidez no se puede medir, en palabras del dueño. */
function motivoSinLiquidez({ caja, error }: UsoCajaAbierta): string {
  if (error || !caja) return "no se pudo leer la caja";
  if (!caja.abierta) return "no hay caja abierta";
  return "la caja espera un saldo negativo";
}

export default function FinanzasDashboard() {
  const {
    loading, kpis, monthlyData, expensesByCategory, paymentMethods, cashFlow,
    topPayables, topFiados, projection, fiscal, healthData, lastRefresh, recargar,
  } = useResumenPlata();
  const caja = useCajaAbierta();
  // Mejora 13: Expand chart modal
  const [expandedChart, setExpandedChart] = useState<string | null>(null);
  // Mejora 1: Period selector
  const [period, setPeriod] = useState<Periodo>("month");
  // Mejora 3: Auto-refresh
  const [minAgo, setMinAgo] = useState(0);
  // Mejora 5: Favoritos
  const finFavs = useFavoriteCharts("finanzas");

  // Mejora 3: Auto-refresh timer
  useEffect(() => {
    const minuteInterval = setInterval(() => {
      setMinAgo(Math.floor((Date.now() - lastRefresh.getTime()) / 60000));
    }, 60000);
    return () => clearInterval(minuteInterval);
  }, [lastRefresh]);

  // El efectivo es el esperado de la caja abierta, o no se sabe. Antes:
  // `ingresos * 0.3`, un número que nadie contó.
  const efectivo = efectivoConocido(caja.caja);
  const healthScore = useMemo(
    () => healthData ? calcHealthScore({ ...healthData, efectivo }) : null,
    [healthData, efectivo],
  );
  const sinLiquidez = motivoSinLiquidez(caja);

  // Mejora 6: Alertas inteligentes — ALL hooks MUST be before any early return
  const alertas = useMemo(() => {
    const a: Alerta[] = [];
    if ((kpis.fiados ?? 0) > 0) a.push({ msg: `${formatCurrency(kpis.fiados ?? 0, { decimals: 0 })} en fiados pendientes`, color: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]" });
    if ((kpis.utilidad ?? 0) < 0) a.push({ msg: "Balance negativo este mes", color: "bg-[var(--data-error-100)] text-[var(--data-error-500)]" });
    if (topPayables.some(p => p.vencido)) a.push({ msg: `${topPayables.filter(p => p.vencido).length} pagos vencidos a proveedores`, color: "bg-[var(--data-error-100)] text-[var(--data-error-500)]" });
    return a;
  }, [kpis, topPayables]);

  if (loading) return <EsqueletoResumen />;

  const mesNombre = formatMonthYear(new Date(), { largo: true });
  const mesCapitalized = mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1);

  // Empty state
  if (Object.values(kpis).every(v => v === 0) && monthlyData.every(m => m.ingresos === 0 && m.gastos === 0)) {
    return (
      <div className="space-y-4">
        {caja.caja?.abierta && <CajaDelResumen {...caja} />}
        <div className="text-center py-16">
        <div className="h-16 w-16 rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center mx-auto mb-4">
          <BarChart3 className="h-8 w-8 text-[var(--text-tertiary)] dark:text-muted" />
        </div>
        <CardTitle className="text-lg font-semibold text-[var(--text-primary)]">Sin datos financieros</CardTitle>
        <p className="text-sm text-muted mt-1">Registra tus primeras ventas y gastos para ver el dashboard</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CabeceraDelResumen
        period={period}
        setPeriod={setPeriod}
        minAgo={minAgo}
        onRefresh={() => { recargar(); caja.recargar(); setMinAgo(0); }}
        alertas={alertas}
      />

      <CajaDelResumen {...caja} />

      <StaggerItem index={1}>
        <KpisDelResumen kpis={kpis} monthlyData={monthlyData} fiscal={fiscal} />
      </StaggerItem>

      <StaggerItem index={1}>
        <GraficoIngresosGastos monthlyData={monthlyData} finFavs={finFavs} setExpandedChart={setExpandedChart} />
      </StaggerItem>

      <StaggerItem index={2}>
        <DonutsGastosYPagos expensesByCategory={expensesByCategory} paymentMethods={paymentMethods} finFavs={finFavs} setExpandedChart={setExpandedChart} />
      </StaggerItem>

      <StaggerItem index={3}>
        <FlujoCajaDiario cashFlow={cashFlow} finFavs={finFavs} setExpandedChart={setExpandedChart} />
      </StaggerItem>

      <StaggerItem index={4}>
        <ProyeccionDelMes projection={projection} mesCapitalized={mesCapitalized} />
      </StaggerItem>

      <StaggerItem index={5}>
        <ResumenFiscal fiscal={fiscal} mesCapitalized={mesCapitalized} />
      </StaggerItem>

      <StaggerItem index={6}>
        <IndicadoresDeSalud healthScore={healthScore} motivoSinLiquidez={sinLiquidez} />
      </StaggerItem>

      <StaggerItem index={7}>
        <DeudasYCobros topPayables={topPayables} topFiados={topFiados} />
      </StaggerItem>

      <SaludDelNegocio healthScore={healthScore} monthlyData={monthlyData} motivoSinLiquidez={sinLiquidez} />

      <StaggerItem index={9}>
        <CompararMeses monthlyData={monthlyData} />
      </StaggerItem>

      <GraficosAmpliados
        expandedChart={expandedChart}
        setExpandedChart={setExpandedChart}
        monthlyData={monthlyData}
        cashFlow={cashFlow}
        expensesByCategory={expensesByCategory}
      />
    </div>
  );
}
