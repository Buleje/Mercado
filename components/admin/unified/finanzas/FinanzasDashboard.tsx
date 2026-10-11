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
 *
 * 2026-10-09: medía 5,26 pantallas. Arriba queda lo de hoy (caja, deudas,
 * indicadores del mes y el gráfico); el resto son bloques plegables y
 * recordados (`./resumen/BloquePlegable`) que plegados dicen su cifra.
 *
 * 2026-10-11: la primera pantalla contesta cuánto entró, salió y quedó en el
 * mes y qué falta (te deben, debes, la caja) en una franja (`CifrasDelMes`).
 * Se fueron el selector de período que no cambiaba nada, los avisos que
 * repetían tarjetas, los ocho indicadores (cuatro eran parte de otra cifra) y
 * «Comparar meses» (la misma serie de seis meses que el gráfico de acá y que
 * Resultado › Ganancias, con su propia sección en Comparar períodos). El
 * gráfico, plegado como los demás bloques.
 */

import { CardTitle } from "@buleje/design-system";
import { useState, useMemo } from "react";
import { BarChart3 } from "@buleje/design-system/icons";
import { useFavoriteCharts } from "@/hooks/use-favorite-charts";
import { useResumenPlata } from "@/hooks/use-resumen-plata";
import { useCajaAbierta, efectivoConocido, type UsoCajaAbierta } from "@/hooks/use-caja-abierta";
import { StaggerItem } from "@/components/admin/finanzas/charts";
import { calcHealthScore } from "@/components/admin/finanzas/shared";
import { formatMonthYear } from "@/lib/format";
import CabeceraDelResumen from "./resumen/CabeceraDelResumen";
import CifrasDelMes from "./resumen/CifrasDelMes";
import GraficoIngresosGastos from "./resumen/GraficoIngresosGastos";
import DonutsGastosYPagos from "./resumen/DonutsGastosYPagos";
import FlujoCajaDiario from "./resumen/FlujoCajaDiario";
import ProyeccionDelMes from "./resumen/ProyeccionDelMes";
import ResumenFiscal from "./resumen/ResumenFiscal";
import { IndicadoresDeSalud, SaludDelNegocio } from "./resumen/SaludFinanciera";
import DeudasYCobros from "./resumen/DeudasYCobros";
import GraficosAmpliados from "./resumen/GraficosAmpliados";
import EsqueletoResumen from "./resumen/EsqueletoResumen";
import CajaDelResumen from "./resumen/CajaDelResumen";
import TeDebenYDebes from "./resumen/TeDebenYDebes";
import BloquePlegable from "./resumen/BloquePlegable";
import { etiquetaSalud } from "./resumen/lineas-plegadas";

/** Por qué la liquidez no se puede medir, en palabras del dueño. */
function motivoSinLiquidez({ caja, error }: UsoCajaAbierta): string {
  if (error || !caja) return "no se pudo leer la caja";
  if (!caja.abierta) return "no hay caja abierta";
  return "la caja espera un saldo negativo";
}

export default function FinanzasDashboard() {
  const {
    loading, kpis, monthlyData, expensesByCategory, paymentMethods, cashFlow,
    topPayables, topFiados, projection, fiscal, healthData, deudas,
  } = useResumenPlata();
  const caja = useCajaAbierta();
  // Mejora 13: Expand chart modal
  const [expandedChart, setExpandedChart] = useState<string | null>(null);
  // Mejora 5: Favoritos
  const finFavs = useFavoriteCharts("finanzas");

  // El efectivo es el esperado de la caja abierta, o no se sabe. Antes:
  // `ingresos * 0.3`, un número que nadie contó.
  const efectivo = efectivoConocido(caja.caja);
  const healthScore = useMemo(
    () => healthData ? calcHealthScore({ ...healthData, efectivo }) : null,
    [healthData, efectivo],
  );
  const sinLiquidez = motivoSinLiquidez(caja);

  if (loading) return <EsqueletoResumen />;

  const mesNombre = formatMonthYear(new Date(), { largo: true });
  const mesCapitalized = mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1);

  // Empty state
  if (Object.values(kpis).every(v => v === 0) && monthlyData.every(m => m.ingresos === 0 && m.gastos === 0)) {
    return (
      <div className="space-y-4">
        {caja.caja?.abierta && <CajaDelResumen {...caja} />}
        {/* Sin ventas ni gastos del mes puede haber deudas igual: no se esconden. */}
        <TeDebenYDebes deudas={deudas} />
        <div className="text-center py-16">
        <div className="h-16 w-16 rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center mx-auto mb-4">
          <BarChart3 className="h-8 w-8 text-[var(--text-tertiary)] dark:text-muted" />
        </div>
        <CardTitle className="text-[length:var(--ts-xl)] font-bold text-[var(--text-primary)]">Sin datos financieros</CardTitle>
        <p className="text-sm text-muted mt-1">Registra tus primeras ventas y gastos para ver el dashboard</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CabeceraDelResumen mes={mesCapitalized} />

      <CifrasDelMes
        kpis={kpis}
        monthlyData={monthlyData}
        deudas={deudas}
        vencidos={{ fiados: healthData?.fiadosVencidos ?? 0, pagos: healthData?.payablesVencidos ?? 0 }}
      />

      <CajaDelResumen {...caja} />

      {/* Los bloques plegados, juntos y apretados: plegados son una lista de
          renglones con su cifra, no tarjetas sueltas con 16 px de aire. */}
      <div className="space-y-2">
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
        <ProyeccionDelMes projection={projection} />
      </StaggerItem>

      <StaggerItem index={5}>
        <ResumenFiscal fiscal={fiscal} />
      </StaggerItem>

      {/* Los indicadores y el puntaje hablan de lo mismo: un solo bloque, que
          plegado dice el puntaje. Antes eran dos tarjetas con casi el mismo título. */}
      {healthScore && (
        <StaggerItem index={6}>
          <BloquePlegable
            id="salud"
            titulo="Salud del negocio"
            resumen={`${healthScore.total}/100 — ${etiquetaSalud(healthScore.total)}`}
          >
            <div className="space-y-6">
              <IndicadoresDeSalud healthScore={healthScore} motivoSinLiquidez={sinLiquidez} />
              <SaludDelNegocio healthScore={healthScore} monthlyData={monthlyData} motivoSinLiquidez={sinLiquidez} />
            </div>
          </BloquePlegable>
        </StaggerItem>
      )}

      <StaggerItem index={7}>
        <DeudasYCobros topPayables={topPayables} topFiados={topFiados} />
      </StaggerItem>
      </div>

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
