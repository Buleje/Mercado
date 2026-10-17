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
import type { MapaDeDatos } from "@/hooks/use-secciones-con-datos";
import BloqueMudado from "./BloqueMudado";
import GastosConPresupuesto from "./GastosConPresupuesto";

const FinanzasDashboard = dynamic(() => import("./FinanzasDashboard"), { loading: S });
const PLTab = dynamic(() => import("@/components/admin/PLTab"), { loading: S });
const Rentabilidad = dynamic(() => import("./resultado/Rentabilidad"), { loading: S });
const ReportsTab = dynamic(() => import("@/components/admin/ReportsTab"), { loading: S });
const ImportExportTab = dynamic(() => import("@/components/admin/ImportExportTab"), { loading: S });
const CashflowRollingTable = dynamic(() => import("@/components/admin/finance/CashflowRollingTable"), { loading: S });
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

interface Props {
  vista: string;
  /** La sección que se pinta activa (una vista de `adentro` marca a su dueña). */
  seccion: string;
  datos: MapaDeDatos;
  irA: (id: string) => void;
}

export default function VistaDePlata({ vista, seccion, datos, irA }: Props) {
  switch (vista) {
    case "resumen":
      /* El detector de fugas, «Esta semana» y el presupuesto viven en las
         secciones del Resumen (`resumen/SeccionesDelResumen`, 2026-10-11). Los
         dos «resúmenes automáticos» que repetían la franja de arriba se fueron
         antes (Resultado del mes, Proyección del mes). */
      return <FinanzasDashboard />;

    /* ── Resultado: la misma pregunta —«¿cuánto gané?»— en tres presentaciones ── */
    case "pl":
      /* Sin el «Comparativo Mensual» de abajo (2026-10-11): restaba sólo los
         gastos registrados, así que su utilidad de setiembre en `main` era
         −S/ 386 con la tira de arriba diciendo −S/ 2 966. La tira de seis
         meses de Ganancias sale del servidor y es la que vale. */
      return <PLTab />;
    case "rentabilidad":
      /* Por producto y el equilibrio del día, una a la vez (`?sub=`, 2026-10-11). */
      return <Rentabilidad />;
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
      /* «El mes / El año» son secciones de TaxTab (`?sub=`, carril plata-c,
         2026-10-11). Antes «El año» iba además acá abajo, plegado: salía dos veces. */
      return <TaxTab />;
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
