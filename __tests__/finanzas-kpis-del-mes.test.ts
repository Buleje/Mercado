/**
 * Los KPIs de Mi Plata no pueden quedar en cero con la plata cargada.
 *
 * Medido 2026-09-06 sobre un tenant con datos completos —15 ventas, 25 pedidos
 * y 10 gastos, todos del mes—: «Ingresos del mes S/0», «Gastos del mes S/0»,
 * margen 0 %, IGV 0, punto de equilibrio 0. Todo el módulo financiero en cero.
 *
 * La causa no era la plata: era el contrato. El componente leía campos que sus
 * endpoints no mandan, y sin fallback el resultado era un cero mudo.
 *
 *   /api/analytics/kpis-v2 -> ingresosHoy · ticketPromedio · margenOperativo ·
 *                             clientesActivos · fiadoPendiente · rotacion…
 *                             (NO trae ventasMes ni salesMonth)
 *   /api/expenses/summary  -> ARRAY [{category,total,count}], sin filtro de fecha
 *
 * Estos casos fijan ese contrato: si el endpoint vuelve a cambiar de forma, el
 * número sigue saliendo.
 */

import { describe, it, expect } from "vitest";
import { ingresosDelMes, gastosDelMes, claveDeMes } from "@/components/admin/finanzas/shared";

const AHORA = new Date(2026, 8, 6); // 6-sep-2026, como el día de la medición

/** La respuesta REAL de kpis-v2 en el tenant demo. */
const KPIS_REALES = {
  ingresosHoy: { valor: 0, cambio: 0, sparkline: [] },
  ticketPromedio: 25.8,
  margenOperativo: 12,
  clientesActivos: 10,
  fiadoPendiente: { valor: 345.5, totalClientes: 4, vencidos: 0 },
  rotacionInventario: 1.2,
};

const MENSUAL = [
  { month: "2026-04", ingresos: 0 },
  { month: "2026-05", ingresos: 0 },
  { month: "2026-06", ingresos: 0 },
  { month: "2026-07", ingresos: 0 },
  { month: "2026-08", ingresos: 0 },
  { month: "2026-09", ingresos: 776.9 },
];

describe("ingresos del mes", () => {
  it("con el contrato real de kpis-v2 sale 776.90, no 0", () => {
    expect(ingresosDelMes(KPIS_REALES, MENSUAL, AHORA)).toBeCloseTo(776.9, 2);
  });

  it("si el endpoint algún día manda ventasMes, manda ese", () => {
    expect(ingresosDelMes({ ventasMes: 1234 }, MENSUAL, AHORA)).toBe(1234);
  });

  it("sin datos de ningún lado es 0, no NaN", () => {
    expect(ingresosDelMes(null, [], AHORA)).toBe(0);
    expect(ingresosDelMes({}, [], AHORA)).toBe(0);
  });

  it("toma el mes en curso, no el último del array", () => {
    const conFuturo = [...MENSUAL, { month: "2026-10", ingresos: 9999 }];
    expect(ingresosDelMes(KPIS_REALES, conFuturo, AHORA)).toBeCloseTo(776.9, 2);
  });
});

describe("gastos del mes", () => {
  /** 10 gastos del tenant demo: sólo 2 caen en septiembre. */
  const GASTOS = [
    { date: "2026-09-02", amount: 1200, category: "alquiler" },
    { date: "2026-09-04", amount: 280, category: "servicios" },
    { date: "2026-08-15", amount: 350, category: "transporte" },
    { date: "2026-07-20", amount: 150, category: "otros" },
    { date: "2026-06-11", amount: 85, category: "limpieza" },
  ];

  it("suma sólo los del mes en curso: 1480, no el total", () => {
    expect(gastosDelMes(null, GASTOS, AHORA)).toBeCloseTo(1480, 2);
  });

  it("un ARRAY de summary no aporta `.total` y no rompe (el bug real)", () => {
    // Así viene /api/expenses/summary: array por categoría.
    const summaryArray = [
      { category: "transporte", total: 350, count: 1 },
      { category: "otros", total: 150, count: 1 },
    ] as unknown as { totalMonth?: number };
    expect(gastosDelMes(summaryArray, GASTOS, AHORA)).toBeCloseTo(1480, 2);
  });

  it("si el endpoint manda totalMonth, manda ese", () => {
    expect(gastosDelMes({ totalMonth: 999 }, GASTOS, AHORA)).toBe(999);
  });

  it("una fecha basura no ensucia la suma", () => {
    const conBasura = [...GASTOS, { date: "no-es-fecha", amount: 500 }];
    expect(gastosDelMes(null, conBasura, AHORA)).toBeCloseTo(1480, 2);
  });

  it("sin gastos da 0", () => {
    expect(gastosDelMes(null, [], AHORA)).toBe(0);
  });
});

describe("utilidad y margen que se derivan", () => {
  it("cuadran con lo medido en pantalla (-703.10 y -91 %)", () => {
    const ing = ingresosDelMes(KPIS_REALES, MENSUAL, AHORA);
    const gas = gastosDelMes(null, [
      { date: "2026-09-02", amount: 1200 },
      { date: "2026-09-04", amount: 280 },
    ], AHORA);
    const utilidad = ing - gas;
    expect(utilidad).toBeCloseTo(-703.1, 2);
    expect(Math.round((utilidad / ing) * 100)).toBe(-91);
  });
});

describe("claveDeMes", () => {
  it("arma YYYY-MM con el mes en dos dígitos", () => {
    expect(claveDeMes(new Date(2026, 8, 6))).toBe("2026-09");
    expect(claveDeMes(new Date(2026, 11, 31))).toBe("2026-12");
    expect(claveDeMes(new Date(2026, 0, 1))).toBe("2026-01");
  });
});
