"use client";

/**
 * Lo que se dibuja en cada hoja de Mi Plata (`?vista=`).
 *
 * Se separó de `FinanzasModule.tsx` en la ola 3 del panel unificado
 * (2026-10-10): el módulo se queda con la navegación (qué pestaña, qué
 * sección, qué deja ver el permiso) y acá vive el contenido. Los bloques que
 * llegaron de otra pestaña van en `BloqueMudado`: plegados, con su origen en el
 * título y visibles sólo para quien los veía antes (regla R2 del plan).
 */

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";
import Plegable from "@/components/admin/shared/Plegable";
import type { MapaDeDatos } from "@/hooks/use-secciones-con-datos";
import BloqueMudado from "./BloqueMudado";
import BloquePlegable from "./resumen/BloquePlegable";
import GastosConPresupuesto from "./GastosConPresupuesto";

const FinanzasDashboard = dynamic(() => import("./FinanzasDashboard"), { loading: S });
const PLTab = dynamic(() => import("@/components/admin/PLTab"), { loading: S });
const ProfitabilityTab = dynamic(() => import("@/components/admin/ProfitabilityTab"), { loading: S });
const ReportsTab = dynamic(() => import("@/components/admin/ReportsTab"), { loading: S });
const ImportExportTab = dynamic(() => import("@/components/admin/ImportExportTab"), { loading: S });
const WeeklyReportCard = dynamic(() => import("@/components/admin/WeeklyReportCard"), { loading: S });
const BudgetAlertWidget = dynamic(() => import("@/components/admin/BudgetAlertWidget"), { loading: S });
const CashflowRollingTable = dynamic(() => import("@/components/admin/finance/CashflowRollingTable"), { loading: S });
const BreakEvenDashboard = dynamic(() => import("@/components/admin/BreakEvenDashboard"), { loading: S });
const MoneyLeakDetector = dynamic(() => import("@/components/admin/MoneyLeakDetector"), { loading: S });
const HistorialCierresTab = dynamic(() => import("@/components/admin/HistorialCierresTab"), { loading: S });
const ReporteMensualTab = dynamic(() => import("@/components/admin/ReporteMensualTab"), { loading: S });
// Comparador de períodos: estaba huérfano (0 imports); real (/api/admin/dashboard),
// read-only, distinto del dashboard. Montado tras verificar. Brandon 2026-06-20.
const PeriodComparatorTab = dynamic(() => import("@/components/admin/PeriodComparatorTab"), { loading: S });
const TreasuryDashboard = dynamic(() => import("@/components/admin/TreasuryDashboard"), { loading: S });

// ── Crédito y capital: pestañas propias desde la ola 3 (su 2.º nivel es el suyo) ──
const PrestamosModule = dynamic(() => import("@/components/admin/PrestamosModule"), { loading: S });
const AdelantosModule = dynamic(() => import("@/components/admin/adelantos/AdelantosModule"), { loading: S });
const ActivosModule = dynamic(() => import("@/components/admin/activos/ActivosModule"), { loading: S });
const PorCobrarDashboard = dynamic(() => import("@/components/admin/PorCobrarDashboard"), { loading: S });
const PorPagarDashboard = dynamic(() => import("./PorPagarDashboard"), { loading: S });
const ScoringCrediticioTab = dynamic(() => import("@/components/admin/ScoringCrediticioTab"), { loading: S });

// ── Llegaron de otra pestaña (ola 3) ──
/* Análisis › Inteligencia › Comparativo: la otra lectura de «comparar períodos». */
const ComparativeReportsTab = dynamic(() => import("@/components/admin/ComparativeReportsTab"), { loading: S });
/* Comprobantes › Impuestos y Obligaciones: contabilidad, no comprobantes. */
const TaxTab = dynamic(() => import("@/components/admin/TaxTab"), { loading: S });
const ObligacionesTab = dynamic(() => import("@/components/admin/ObligacionesTab"), { loading: S });

interface Props {
  vista: string;
  /** La sección que se pinta activa (una vista de `adentro` marca a su dueña). */
  seccion: string;
  datos: MapaDeDatos;
  irA: (id: string) => void;
  /** Cambia con el auto-refresco del Resumen: remonta el tablero. */
  vuelta: number;
}

export default function VistaDePlata({ vista, seccion, datos, irA, vuelta }: Props) {
  switch (vista) {
    case "resumen":
      return (
        <div className="space-y-2" key={vuelta}>
          <FinanzasDashboard />
          {/* El detector de fugas no vive en ninguna otra parte. */}
          <MoneyLeakDetector />
          {/* 2026-10-11: de los cuatro «resúmenes automáticos» quedan los dos
              que no están en otra parte. «Resultado del mes» repetía Entró /
              Salió / Quedó de la franja de arriba (y Ganancias), y la
              «Proyección del mes» repetía el bloque Proyección con otra cuenta
              (sólo ventas de mostrador, sumadas en el navegador). */}
          <BloquePlegable
            id="semana-y-presupuesto"
            titulo="Esta semana y el presupuesto"
            resumen="ventas y margen de los últimos 7 días · lo gastado contra tu presupuesto del mes"
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <WeeklyReportCard />
              <BudgetAlertWidget />
            </div>
          </BloquePlegable>
        </div>
      );

    /* ── Resultado: la misma pregunta —«¿cuánto gané?»— en tres presentaciones ── */
    case "pl":
      /* Sin el «Comparativo Mensual» de abajo (2026-10-11): restaba sólo los
         gastos registrados, así que su utilidad de setiembre en `main` era
         −S/ 386 con la tira de arriba diciendo −S/ 2 966. La tira de seis
         meses de Ganancias sale del servidor y es la que vale. */
      return <PLTab />;
    case "rentabilidad":
      return (
        <div className="space-y-6">
          <ProfitabilityTab />
          <BreakEvenDashboard />
        </div>
      );
    case "comparador":
      return (
        <div className="space-y-6">
          <PeriodComparatorTab />
          <BloqueMudado
            origen="analytics-pro"
            deDonde="Análisis"
            clave="plata:comparador:comparativos"
            titulo="Reportes comparativos"
            resumen="Este mes contra el pasado o contra el mismo mes del año anterior: ventas, pedidos, ticket y margen"
          >
            <ComparativeReportsTab />
          </BloqueMudado>
        </div>
      );

    /* ── Movimientos: en qué se va la plata ── */
    case "flujo-caja":
      /* La proyección a 13 semanas reemplazó a la de 30 días: eran la misma
         pregunta con menos horizonte. */
      return <CashflowRollingTable />;
    case "tesoreria":
      return (
        <Suspense fallback={<S />}>
          <TreasuryDashboard />
        </Suspense>
      );

    /* ── Por cobrar y pagar: quién me debe, a quién le debo y a quién fiarle ── */
    case "por-cobrar":
      return <PorCobrarDashboard onIr={irA} />;
    case "por-pagar":
      return <PorPagarDashboard onIr={irA} />;
    case "scoring":
      /* Sin el bloque mudado «Quién te debe» (2026-10-11, pedido del carril de
         Por cobrar): la lista de fiados con vencidos y el recordatorio ya viven
         en Ventas y caja › Me deben, y su cifra en «Todo lo que me deben». Sigue
         montado en Análisis («ia-fiados»). */
      return <ScoringCrediticioTab />;

    /* ── Pestañas con su propio segundo nivel (`?sub=`) ── */
    case "prestamos":
      return <PrestamosModule />;
    case "adelantos":
      return <AdelantosModule />;
    case "activos":
      return <ActivosModule />;

    /* ── Impuestos y reportes: cada pantalla en su sección (antes, cuatro apiladas) ── */
    case "impuestos":
      return (
        <div className="space-y-6">
          <TaxTab />
          {/* Plegada: abierta, la vista medía 3,4 pantallas y 126 palabras de
              ayuda (medir-orden, 2026-10-10). Plegada no pide sus datos. */}
          {/* «El año» (pedido del carril de Impuestos, 2026-10-11): la tabla
              de los 12 meses; el total del mes ya lo dice TaxTab arriba. */}
          <Plegable
            clave="plata:impuestos:obligaciones"
            titulo="El año"
            resumen={<span className="text-sm">Cada mes: ingresos, IGV, Renta y si lo declaraste</span>}
          >
            <ObligacionesTab />
          </Plegable>
        </div>
      );
    case "reportes":
      return <ReporteMensualTab />;
    case "contador":
      return <ReportsTab />;
    case "importar":
      return <ImportExportTab />;
    case "cierres":
      return <HistorialCierresTab />;

    default:
      /* Gastos y su presupuesto comparten hoja: `presupuesto` vive adentro. */
      if (seccion === "gastos") {
        return <GastosConPresupuesto pedidoPorUrl={vista === "presupuesto"} hayPresupuesto={datos.presupuesto} />;
      }
      return null;
  }
}
