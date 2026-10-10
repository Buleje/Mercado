"use client";

/**
 * Los datos del Resumen de Mi Plata: una sola carga que trae ventas, gastos,
 * cuentas por pagar, fiados y el resumen mensual, y de ahí deriva cada bloque.
 *
 * Vivía dentro de `FinanzasDashboard.tsx` (1.037 líneas); se mudó sin cambiar
 * el comportamiento para que el tablero quede en dibujar.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  fetchFinanzas, invalidateFinanzasCache, n,
  type ExpenseRaw, type HealthData,
  ingresosDelMes, gastosDelMes, claveDeMes,
} from "@/components/admin/finanzas/shared";
import { gastoDelMes, mesDeGasto, type IngresoDelMes } from "@/lib/finance/ingresos-del-periodo";
import { limaDateKey } from "@/lib/utils";
import type { RespuestaResultado } from "@/lib/finance/resultado-del-negocio";
import { derivarDelResultado, type BaseDelMes } from "@/hooks/resumen-plata-del-resultado";
import type {
  MesResumen, Porcion, DiaFlujo, Deudor, Proyeccion, Fiscal,
} from "@/components/admin/unified/finanzas/resumen/tipos";
import {
  ESTADOS_FIADO_PENDIENTE, mayoresDeudores, totalQueTeDeben, type FiadoDeLista,
  mayoresAcreedores, totalQueDebes, type CuentaPorPagarDeLista,
} from "@/components/admin/unified/finanzas/resumen/deudores";
import type { IgvDelMes } from "@/components/admin/unified/finanzas/resumen/igv";
import {
  leerDeudasDelNegocio, SIN_DEUDAS, type DeudasDelNegocio,
} from "@/components/admin/unified/finanzas/resumen/deudas-del-negocio";

export interface ResumenPlata {
  loading: boolean;
  kpis: Record<string, number>;
  monthlyData: MesResumen[];
  expensesByCategory: Porcion[];
  paymentMethods: Porcion[];
  cashFlow: DiaFlujo[];
  topPayables: Deudor[];
  topFiados: Deudor[];
  projection: Proyeccion | null;
  fiscal: Fiscal | null;
  /** Sin `efectivo`: ese sale de la caja abierta (`use-caja-abierta`). */
  healthData: Omit<HealthData, "efectivo"> | null;
  /**
   * «Te deben» y «Debes»: los totales de Por cobrar y de Lo que debo, pedidos
   * a las MISMAS funciones que esas secciones (`?resumen=1`). `null` en un
   * lado = no se pudo leer o el rol no lo puede ver.
   */
  deudas: DeudasDelNegocio;
  lastRefresh: Date;
  /**
   * El resultado del servidor (Ingresos, Gastos, Utilidad, Margen y las
   * barras) todavía no llegó: esas cifras son las de la cuenta vieja hasta
   * que llegue. Se pide aparte para no frenar al resto (~2 s contra 0,1 s).
   */
  resultadoCargando: boolean;
  /** Vuelve a pedir todo, saltando la caché de 30 s del módulo. */
  recargar: () => void;
}

export function useResumenPlata(): ResumenPlata {
  const [base, setBase] = useState<BaseDelMes | null>(null);
  const [resultado, setResultado] = useState<RespuestaResultado | null>(null);
  const [resultadoCargando, setResultadoCargando] = useState(true);
  const [expensesByCategory, setExpensesByCategory] = useState<Porcion[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<Porcion[]>([]);
  const [cashFlow, setCashFlow] = useState<DiaFlujo[]>([]);
  const [topPayables, setTopPayables] = useState<Deudor[]>([]);
  const [topFiados, setTopFiados] = useState<Deudor[]>([]);
  const [fiscal, setFiscal] = useState<Fiscal | null>(null);
  const [deudas, setDeudas] = useState<DeudasDelNegocio>(SIN_DEUDAS);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  // El botón «Actualizar» sólo reiniciaba el contador de «hace N min»: no
  // volvía a pedir nada. Ahora cambia la vuelta y el efecto recarga.
  const [vuelta, setVuelta] = useState(0);
  const recargar = useCallback(() => {
    invalidateFinanzasCache();
    setVuelta((v) => v + 1);
  }, []);

  // La ganancia del mes y de cada barra: el MISMO número de «Ganancias y
  // pérdidas» (resta el costo de lo vendido, no sólo los gastos). Va aparte:
  // tarda ~2 s con la caché caliente y el resto 0,04-0,1 s; dentro del
  // `allSettled` hacía esperar a toda la pantalla. Un 403 (el encargado no ve
  // el resultado) vuelve `null` y queda la cuenta vieja. No rechaza nunca.
  useEffect(() => {
    let vivo = true;
    setResultadoCargando(true);
    void fetchFinanzas<RespuestaResultado | null>(
      `/api/finanzas/resultado?mes=${claveDeMes(new Date())}&meses=6`, null,
    ).then((r) => {
      if (!vivo) return;
      setResultado(r);
      setResultadoCargando(false);
    });
    return () => { vivo = false; };
  }, [vuelta]);

  useEffect(() => {
    let vivo = true;
    Promise.allSettled([
      fetchFinanzas<Record<string, unknown> | null>("/api/analytics/kpis-v2", null),
      fetchFinanzas<Record<string, unknown> | null>("/api/expenses/summary", null),
      // Desglose de ventas agregado SERVER-SIDE (métodos de pago + ingresos
      // diarios). Antes era /api/sales?limit=5000 crudo bucketeado en el cliente.
      fetchFinanzas<{ paymentMethods: { name: string; value: number }[]; daily: { day: string; ingresos: number }[] }>("/api/finanzas/sales-breakdown?days=30", { paymentMethods: [], daily: [] }),
      // Sólo gastos reales: sin `recurring=false` venían también las
      // PLANTILLAS de gasto fijo (ADR-374) — en el tenant QA, S/ 2 119,80 de
      // plantillas con fecha de mayo. Ganancias ya las excluía.
      fetch("/api/expenses?limit=2000&recurring=false").then(r => r.ok ? r.json() : []),
      fetch("/api/payables").then(r => r.ok ? r.json() : []),
      // Lo que todavía se debe: ACTIVO y VENCIDO (antes sólo ACTIVO, y el
      // vencido —el más urgente— no salía). El endpoint filtra por UN estado.
      Promise.all(ESTADOS_FIADO_PENDIENTE.map((e) =>
        fetch(`/api/fiados?status=${e}`).then(r => r.ok ? r.json() : []).then((d: unknown) => (Array.isArray(d) ? d : []) as FiadoDeLista[]),
      )).then((listas) => listas.flat()),
      // Ingresos por mes: la ÚNICA fuente de Mi Plata (la regla vive en
      // lib/finance/ingresos-del-periodo.ts; Ganancias lee el mismo endpoint).
      fetchFinanzas<IngresoDelMes[]>("/api/finanzas/monthly-summary?months=6", []),
      // IGV sólo de lo registrado (comprobantes electrónicos y gastos con su
      // IGV). `null` = no se pudo leer.
      fetchFinanzas<IgvDelMes | null>("/api/finanzas/igv-del-mes", null),
      // «Te deben» y «Debes»: el total de cada sección, de su misma función.
      // Un 403 (encargado, almacenero) vuelve `null` y la cifra no se dibuja.
      fetchFinanzas<unknown>("/api/admin/por-cobrar?resumen=1", null),
      fetchFinanzas<unknown>("/api/finanzas/por-pagar?resumen=1", null),
    ]).then(([kR, eR, bR, exR, pR, fR, msR, igvR, cobR, pagR]) => {
      if (!vivo) return;
      const kpisData = kR.status === "fulfilled" ? kR.value : null;
      const expSummary = eR.status === "fulfilled" ? eR.value : null;
      const salesBreakdown = (bR.status === "fulfilled" ? bR.value : { paymentMethods: [], daily: [] }) as { paymentMethods: { name: string; value: number }[]; daily: { day: string; ingresos: number }[] };
      const monthlySummary = (msR.status === "fulfilled" && Array.isArray(msR.value) ? msR.value : []) as IngresoDelMes[];
      const igv = igvR.status === "fulfilled" ? igvR.value : null;
      const expensesRaw = exR.status === "fulfilled" ? exR.value : [];
      const payablesRaw: CuentaPorPagarDeLista[] = pR.status === "fulfilled" ? (Array.isArray(pR.value) ? pR.value : []) : [];
      const fiadosRaw: FiadoDeLista[] = fR.status === "fulfilled" ? fR.value : [];

      const now = new Date();
      // El mes y el día son los de LIMA (el negocio está en Perú, UTC−5), no
      // los de la hora local del navegador.
      const hoyLima = limaDateKey(now);
      const mesActual = claveDeMes(now);

      /*
       * LOS DOS KPIs QUE MANDAN EN ESTE MÓDULO LEÍAN CAMPOS QUE NADIE MANDA.
       *
       * Medido 2026-09-06 en un tenant con datos completos (15 ventas, 25
       * pedidos y 10 gastos, todos del mes): «Ingresos del mes S/0», «Gastos
       * del mes S/0», margen 0 %, IGV 0, punto de equilibrio 0. Todo el
       * módulo en cero teniendo la plata cargada.
       *
       *   /api/analytics/kpis-v2 devuelve  ingresosHoy · ticketPromedio ·
       *     margenOperativo · clientesActivos · fiadoPendiente ·
       *     rotacionInventario.  NO existe `ventasMes` ni `salesMonth`.
       *   /api/expenses/summary devuelve un ARRAY [{category,total,count}]
       *     (agrupado por categoría, sin filtro de fecha). Un array no tiene
       *     `.totalMonth` ni `.total`, así que la lectura daba undefined.
       *
       * Se conserva la lectura del contrato esperado —si algún día el endpoint
       * manda esos campos, mandan ellos— y se agrega el fallback derivado de
       * datos que ESTA MISMA carga ya trajo, igual que hacen `deuda` y
       * `fiados` acá abajo. Un KPI en cero que debería tener plata es peor que
       * uno ausente: parece un negocio parado.
       */
      const itemsGasto = (Array.isArray(expensesRaw)
        ? expensesRaw
        : ((expensesRaw as { expenses?: unknown[] } | null)?.expenses ?? [])) as ExpenseRaw[];

      // ── Lo de la cuenta vieja (ventas y gastos registrados) ──
      // Queda de respaldo: el resultado del servidor manda cuando llega (ver
      // el `useMemo` de abajo). El IGV y el punto de equilibrio siguen acá.
      const ingresos = ingresosDelMes(kpisData, monthlySummary, now);
      const gastosMes = gastosDelMes(expSummary, itemsGasto, now);
      const diasTranscurridos = Math.max(1, Number(hoyLima.slice(8, 10)) || 1);
      const [anioLima, mesLimaNum] = mesActual.split("-").map(Number);
      setBase({
        mesActual,
        ingresos,
        gastos: gastosMes,
        /* Lo que se debe es amount − paidAmount (`netoPorPagar`): una cuenta de
           S/ 1 000 con S/ 700 pagados sumaba 1 000. Tarjeta y lista «Debo a
           proveedores» salen de la misma lista con la misma regla. */
        deuda: totalQueDebes(payablesRaw),
        /* Lo que deben es el SALDO (el total incluye lo ya cobrado: medido en
           datos reales, se fiaron S/496.30, quedaban S/345.50 y el panel decía
           S/461). La tarjeta y la lista «Me deben» salen de la MISMA lista con
           la MISMA regla (`deudores.ts`). */
        fiados: totalQueTeDeben(fiadosRaw),
        puntoEq: Math.round(gastosMes / diasTranscurridos),
        diasTranscurridos,
        diasTotales: new Date(Date.UTC(anioLima, mesLimaNum, 0)).getUTCDate(),
        // (el efectivo lo pone el tablero con la caja abierta real; antes se
        // inventaba como `ingresos * 0.3`)
        fiadosVencidos: n(kpisData?.fiadosVencidosMonto),
        payablesVencidos: n(kpisData?.payablesVencidosMonto),
        // Gastos de cada mes: de la lista de gastos reales con la misma
        // partición de meses (se leían de `expSummary.monthly`, un campo que
        // /api/expenses/summary no manda, y cada barra salía en 0).
        meses: monthlySummary.map(({ month, ingresos: ing }) => ({ clave: month, ingresos: ing, gastos: gastoDelMes(month, itemsGasto) })),
      });

      // ── Fiscal ── (el IGV, sólo el registrado: ver resumen/igv.ts)
      setFiscal({ ventas: ingresos, compras: gastosMes, igv });

      // ── Expenses by category (donut) ──
      const items = itemsGasto;
      const catMap = new Map<string, number>();
      for (const e of items) {
        if (mesDeGasto(e.date ?? e.createdAt) === mesActual) {
          const cat = (e.category ?? "otros").charAt(0).toUpperCase() + (e.category ?? "otros").slice(1);
          catMap.set(cat, (catMap.get(cat) ?? 0) + n(e.amount));
        }
      }
      setExpensesByCategory(
        Array.from(catMap.entries())
          .map(([name, value]) => ({ name, value: Math.round(value) }))
          .filter(g => g.value > 0)
          .sort((a, b) => b.value - a.value)
      );

      // ── Métodos de pago (del endpoint, agregado por el campo real `payment`) ──
      // FIX: el cliente leía paymentMethod/metodoPago (inexistentes) → todo "Efectivo".
      setPaymentMethods(salesBreakdown.paymentMethods);

      // ── Cashflow diario: ingresos del endpoint (UTC), gastos de expenses (items) ──
      const flowData = salesBreakdown.daily.map(({ day: dayKey, ingresos: dayIngresos }) => {
        const [, mm, dd2] = dayKey.split("-").map(Number);
        const dayLabel = `${dd2}/${mm}`;
        const dayGastos = items
          .filter((e) => (e.date ?? e.createdAt ?? "").slice(0, 10) === dayKey)
          .reduce((sum, e) => sum + n(e.amount), 0);
        return { dia: dayLabel, ingresos: Math.round(dayIngresos), gastos: Math.round(dayGastos), balance: Math.round(dayIngresos - dayGastos) };
      });
      setCashFlow(flowData);

      // ── Top payables (proveedores): por lo que falta pagar, como la tarjeta ──
      setTopPayables(mayoresAcreedores(payablesRaw, now));

      // ── Top fiados (deudores): por SALDO, la misma regla que la tarjeta ──
      setTopFiados(mayoresDeudores(fiadosRaw, now));

      // ── Te deben / Debes: los totales de sus secciones, sin re-sumar ──
      setDeudas(leerDeudasDelNegocio(
        cobR.status === "fulfilled" ? cobR.value : null,
        pagR.status === "fulfilled" ? pagR.value : null,
      ));

      setLoading(false);
      setLastRefresh(new Date());
    });
    return () => { vivo = false; };
  }, [vuelta]);

  const { kpis, monthlyData, projection, healthData } = useMemo(() => derivarDelResultado(base, resultado), [base, resultado]);

  return {
    loading, kpis, monthlyData, expensesByCategory, paymentMethods, cashFlow,
    topPayables, topFiados, projection, fiscal, healthData, deudas, lastRefresh,
    resultadoCargando, recargar,
  };
}
