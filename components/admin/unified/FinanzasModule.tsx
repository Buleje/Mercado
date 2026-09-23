"use client";

/**
 * Mi Plata — el hub financiero del panel.
 *
 * Acá vive SÓLO la navegación del hub: qué pestaña está abierta, qué sección
 * dentro de ella, y de dónde salió esa decisión (la URL, un atajo del menú o la
 * memoria). La estructura —las cinco pestañas y sus secciones— está en
 * `finanzas/estructura.ts` y el tablero de Resumen en
 * `finanzas/FinanzasDashboard.tsx`: este archivo tenía 1.420 líneas mezclando
 * las tres cosas.
 */

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import dynamic from "next/dynamic";
import { FileText, Wallet, ChevronRight } from "@buleje/design-system/icons";

import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import AutoRefreshControl from "@/components/admin/shared/AutoRefreshControl";
import ActionMenu from "@/components/admin/shared/action-menu";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";
import { ComparativoMensual } from "@/components/admin/finanzas/charts";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
import { useSeccionesConDatos } from "@/hooks/use-secciones-con-datos";

import GastosConPresupuesto from "./finanzas/GastosConPresupuesto";
import SeccionesNav from "./finanzas/SeccionesNav";
import { generarReporteBancario } from "./finanzas/reporte-bancario";
import { MODULE_ID, SECCIONES, TABS, VISTAS, ubicar, type ClaveDeDato } from "./finanzas/estructura";

const FinanzasDashboard = dynamic(() => import("./finanzas/FinanzasDashboard"), { loading: S });
const PLTab = dynamic(() => import("@/components/admin/PLTab"), { loading: S });
const ProfitabilityTab = dynamic(() => import("@/components/admin/ProfitabilityTab"), { loading: S });
const ReportsTab = dynamic(() => import("@/components/admin/ReportsTab"), { loading: S });
const ImportExportTab = dynamic(() => import("@/components/admin/ImportExportTab"), { loading: S });
const WeeklyReportCard = dynamic(() => import("@/components/admin/WeeklyReportCard"), { loading: S });
const BudgetAlertWidget = dynamic(() => import("@/components/admin/BudgetAlertWidget"), { loading: S });
const MonthProjectionCard = dynamic(() => import("@/components/admin/MonthProjectionCard"), { loading: S });
const ProfitLossAutoCard = dynamic(() => import("@/components/admin/ProfitLossAutoCard"), { loading: S });
const CashflowRollingTable = dynamic(() => import("@/components/admin/finance/CashflowRollingTable"), { loading: S });
const BreakEvenDashboard = dynamic(() => import("@/components/admin/BreakEvenDashboard"), { loading: S });
// LoanCalculator → movido a PrestamosModule (evitar duplicación)
// CommissionCalculator → movido a POSCajaModule (es operativo de ventas)
// PaymentCalendar → movido a TesoreriaModule (es operativo de tesorería)
const MoneyLeakDetector = dynamic(() => import("@/components/admin/MoneyLeakDetector"), { loading: S });
const HistorialCierresTab = dynamic(() => import("@/components/admin/HistorialCierresTab"), { loading: S });
const ReporteMensualTab     = dynamic(() => import("@/components/admin/ReporteMensualTab"),              { loading: S });
// Comparador de períodos: estaba huérfano (0 imports); real (/api/admin/dashboard),
// read-only, distinto del dashboard. Montado tras verificar. Brandon 2026-06-20.
const PeriodComparatorTab   = dynamic(() => import("@/components/admin/PeriodComparatorTab"),            { loading: S });
// Inteligencia (BI operacional) movida a AnalisisHubModule → components/admin/analisis/InteligenciaTab.tsx
// DocumentosEmitidosTab → movido a categoría Documentos (no es finanzas)
const TreasuryDashboard = dynamic(() => import("@/components/admin/TreasuryDashboard"), { loading: S });

// ── Crédito y capital: entradas del menú del panel que son secciones de acá ──
const FiadosModule    = dynamic(() => import("@/components/admin/FiadosModule"),              { loading: S });
const PrestamosModule = dynamic(() => import("@/components/admin/PrestamosModule"),           { loading: S });
const AdelantosModule = dynamic(() => import("@/components/admin/adelantos/AdelantosModule"), { loading: S });
const ActivosModule   = dynamic(() => import("@/components/admin/activos/ActivosModule"),     { loading: S });
const PorCobrarDashboard = dynamic(() => import("@/components/admin/PorCobrarDashboard"),     { loading: S });
const ScoringCrediticioTab = dynamic(() => import("@/components/admin/ScoringCrediticioTab"), { loading: S });

export default function FinanzasModule({ initialTab }: { initialTab?: string } = {}) {
  /**
   * La vista vive en `?vista=`: link compartible, atrás del navegador y destino
   * del buscador global.
   *
   * Lo que se guarda es la VISTA (la hoja), no la pestaña: volver a «Mi Plata»
   * tiene que devolver a «Fiados» si ahí estabas, no al padre que lo contiene.
   * Por eso todo pasa por `ubicar()`, que traduce cualquier nombre —viejo o
   * nuevo, pestaña o vista— a la hoja donde de verdad cae.
   */
  const { vista, irA: irAVista } = useVistaModulo(
    MODULE_ID,
    VISTAS,
    ubicar(undefined).vista,
    initialTab ? ubicar(initialTab).vista : undefined,
  );
  const ubic = ubicar(vista);
  const tab = ubic.tab;
  const seccion = ubic.seccion;
  const irA = useCallback((id: string) => irAVista(ubicar(id).vista), [irAVista]);
  // Un atajo del menú puede llegar con el módulo ya montado (`?tab=fiados`).
  useEffect(() => { if (initialTab) irAVista(ubicar(initialTab).vista); }, [initialTab, irAVista]);

  const secciones = SECCIONES[tab];

  /**
   * Los datos que hay que medir para ESTA pestaña: el de cada sección que puede
   * estar vacía, más el del presupuesto, que no es una sección pero se pliega
   * con el mismo criterio. Sólo se pregunta por lo que esta pestaña muestra.
   */
  const claves = useMemo<ClaveDeDato[]>(() => {
    const lista = (secciones ?? []).flatMap((s) => (s.dato ? [s.dato] : []));
    if (tab === "movimientos") lista.push("presupuesto");
    return lista;
  }, [secciones, tab]);
  const datos = useSeccionesConDatos(claves);

  // Auto-refresh every 5 minutes
  const [refreshKey, setRefreshKey] = useState(0);
  const autoRefresh = useAutoRefresh({
    intervalSeconds: 300,
    onRefresh: useCallback(() => setRefreshKey(k => k + 1), []),
    enabled: vista === "resumen",
  });

  return (
    <div className="space-y-6">
      {/* El título va DENTRO de la barra de pestañas (patrón acordado con
          Brandon 2026-09-07, piloto en Análisis): identidad a la izquierda,
          pestañas a la derecha, una sola regla.
          Y con las acciones viaja el SEGUNDO NIVEL: el control de secciones va
          acá, en la fila del título, en lugar de cobrar una barra propia arriba
          del contenido (56 px en 14 de las 15 vistas, medidos el 2026-09-21).
          Sin `description`: la que había enumeraba «pérdidas y ganancias,
          gastos, flujo de caja y reportes», que es leer en voz alta las
          pestañas de la línea de abajo. */}
      <AdminTabBar
        heading={{
          title: "Mi Plata",
          icon: Wallet,
          actions: (
            <>
              {secciones && secciones.length > 1 && (
                <SeccionesNav
                  secciones={secciones}
                  activa={seccion}
                  onIr={irA}
                  datos={datos}
                  etiqueta={`Secciones de ${TABS.find((t) => t.id === tab)?.label ?? "Mi Plata"}`}
                />
              )}
              {vista === "resumen" && (
                <AutoRefreshControl
                  secondsLeft={autoRefresh.secondsLeft}
                  paused={autoRefresh.paused}
                  isActive={autoRefresh.isActive}
                  onTogglePause={autoRefresh.togglePause}
                  onRefreshNow={autoRefresh.refreshNow}
                />
              )}
              {/* El reporte bancario se pide una vez al mes y se llevaba 170 px
                  fijos de la banda: al menú, con su explicación de una línea. */}
              <ActionMenu
                label="Opciones"
                size="sm"
                compactoEnMovil
                actions={[
                  {
                    id: "reporte-bancario",
                    label: "Reporte bancario",
                    hint: "Seis meses de ingresos, gastos y utilidad, listos para imprimir",
                    icon: FileText,
                    onSelect: generarReporteBancario,
                  },
                ]}
              />
            </>
          ),
        }}
        tabs={TABS}
        wrap
        activeTab={tab}
        onTabChange={irA}
        moduleId="finanzas"
      >
      {vista === "resumen" && (
        <div className="space-y-6" key={refreshKey}>
          <FinanzasDashboard />
          {/* Cuatro de estas cinco tarjetas son la versión corta de otra sección
              —resultado, caja, presupuesto, reportes— y colgaban al final de un
              tablero que ya medía casi 5000 px. La quinta, el detector de fugas,
              no vive en ninguna otra parte: por eso queda afuera del pliegue.

              Plegadas y no borradas: un resumen automático al lado del tablero
              sirve cuando se lo busca; lo que no puede es cobrarle mil píxeles
              de scroll a quien entró a mirar el gráfico de arriba. */}
          <MoneyLeakDetector />
          <details className="group rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
              Resúmenes automáticos
              <span className="font-medium text-[var(--text-tertiary)]">
                · resultado del mes, proyección, presupuesto y reporte semanal
              </span>
            </summary>
            <div className="grid grid-cols-1 gap-4 border-t border-[var(--rule-base)] p-4 lg:grid-cols-2">
              <ProfitLossAutoCard />
              <MonthProjectionCard />
              <BudgetAlertWidget />
              <WeeklyReportCard />
            </div>
          </details>
        </div>
      )}

      {/* ── Resultado: la misma pregunta —«¿cuánto gané?»— en tres presentaciones ── */}
      {vista === "pl" && (
        <div className="space-y-6">
          <PLTab />
          <ComparativoMensual />
        </div>
      )}
      {vista === "rentabilidad" && (
        <div className="space-y-6">
          <ProfitabilityTab />
          <BreakEvenDashboard />
        </div>
      )}
      {vista === "comparador" && <PeriodComparatorTab />}

      {/* ── Movimientos: en qué se va la plata ── */}
      {seccion === "gastos" && (
        <GastosConPresupuesto pedidoPorUrl={vista === "presupuesto"} hayPresupuesto={datos.presupuesto} />
      )}
      {/* La proyección a 13 semanas reemplazó a la de 30 días: eran la misma
          pregunta con menos horizonte, y el propio código las rotulaba
          "legacy" mientras las seguía mostrando debajo. */}
      {vista === "flujo-caja" && <CashflowRollingTable />}
      {vista === "tesoreria" && (
        <Suspense fallback={<S />}>
          <TreasuryDashboard />
        </Suspense>
      )}
      {vista === "activos" && <ActivosModule />}

      {/* ── Por cobrar: quién me debe ── */}
      {vista === "por-cobrar" && <PorCobrarDashboard onIr={irA} />}
      {vista === "fiados" && <FiadosModule />}
      {vista === "prestamos" && <PrestamosModule />}
      {vista === "adelantos" && <AdelantosModule />}
      {vista === "scoring" && <ScoringCrediticioTab />}

      {/* ── Reportes ── */}
      {vista === "reportes" && (
        <div className="space-y-6">
          <ReporteMensualTab />
          <div className="border-t border-[var(--rule-base)] pt-6">
            <ReportsTab />
            <div className="mt-4"><ImportExportTab /></div>
          </div>
          <div className="border-t border-[var(--rule-base)] pt-6">
            <HistorialCierresTab />
          </div>
        </div>
      )}
      </AdminTabBar>
    </div>
  );
}
