/**
 * Puntaje de salud con señales REALES (noche 2026-11-04).
 *
 * Antes: el cron buscaba los ingresos con otro nombre y sólo sumaba pedidos → Blas (879
 * acciones y 39 ingresos de personas en 30 días, 0 pedidos) salía «crítico» 10/100 igual que
 * un negocio abandonado. Ahora el puntaje sale de `SaludNegocioDB.senalesDeUso`
 * (ingresos de personas, operaciones = pedidos + ventas + libro CTP + trozas, módulos).
 *
 * Cifras de Blas = las medidas en producción el 04-11 (solo lectura).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const m = vi.hoisted(() => ({
  queryRawUnsafe: vi.fn(),
  tenantFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRawUnsafe: m.queryRawUnsafe,
    tenant: { findUnique: m.tenantFindUnique },
    tenantHealthScore: { create: vi.fn(), findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  calculateHealthScore,
  classifyRisk,
  detectSignals,
  puntajeDesdeSenales,
  type HealthScoreResult,
} from "@/lib/churn/health-scorer";
import { SaludNegocioDB, type SenalesDeUso } from "@/lib/db/salud-negocio.db";

const AHORA = new Date("2026-11-04T12:00:00.000Z");
const haceDias = (n: number) => new Date(AHORA.getTime() - n * 24 * 60 * 60 * 1000);

const sinUso: SenalesDeUso = {
  ingresos7d: 0,
  ingresos30d: 0,
  ultimoIngreso: null,
  acciones7d: 0,
  acciones30d: 0,
  modulos30d: 0,
  operaciones7d: 0,
  operaciones30d: 0,
  ultimaOperacion: null,
  desglose30d: { pedidos: 0, ventas: 0, libroCtp: 0, trozas: 0 },
};

/** Blas el 04-11: 39 ingresos de personas (10 en 7 d), 0 pedidos, 2 ventas, 10 líneas CTP, 26 módulos. */
const blas: SenalesDeUso = {
  ...sinUso,
  ingresos7d: 10,
  ingresos30d: 39,
  ultimoIngreso: haceDias(0),
  acciones7d: 193,
  acciones30d: 879,
  modulos30d: 26,
  operaciones7d: 10,
  operaciones30d: 12,
  ultimaOperacion: haceDias(0),
  desglose30d: { pedidos: 0, ventas: 2, libroCtp: 10, trozas: 0 },
};

describe("puntajeDesdeSenales — del uso real al puntaje", () => {
  it("Blas-like (aserradero sin pedidos pero con libro CTP): NO sale crítico", () => {
    const r = puntajeDesdeSenales("blas", blas, 422, AHORA);
    expect(r.riskLevel).toBe("low");
    expect(r.score).toBe(91);
    // los nombres viejos de columna cargan los conteos nuevos
    expect(r).toMatchObject({
      loginsLast7d: 10,
      loginsLast30d: 39,
      ordersLast7d: 10,
      ordersLast30d: 12,
      featuresUsed: 26,
      daysSinceLastOrder: 0,
      daysSinceLastLogin: 0,
    });
  });

  it("lo que medía el código viejo (0 ingresos, 0 pedidos, 1 módulo, 999 días) daba 10/100 crítico", () => {
    // Regresión documentada: así salía Blas antes del arreglo.
    const viejo = { ...sinUso, modulos30d: 1 };
    const r = puntajeDesdeSenales("blas", viejo, 422, AHORA);
    expect(r.score).toBe(10);
    expect(r.riskLevel).toBe("critical");
  });

  it("bodega-like (pedidos + ventas todos los días, sin libro CTP): sano", () => {
    const bodega: SenalesDeUso = {
      ...sinUso,
      ingresos7d: 5,
      ingresos30d: 15,
      ultimoIngreso: haceDias(0),
      modulos30d: 18,
      operaciones7d: 8,
      operaciones30d: 25,
      ultimaOperacion: haceDias(0),
      desglose30d: { pedidos: 20, ventas: 5, libroCtp: 0, trozas: 0 },
    };
    const r = puntajeDesdeSenales("bodega", bodega, null, AHORA);
    expect(r.score).toBe(81);
    expect(r.riskLevel).toBe("low");
    expect(r.trialDaysLeft).toBeNull();
  });

  it("negocio dormido (sin personas, sin operaciones desde hace 58 días): sigue crítico", () => {
    const dormido: SenalesDeUso = { ...sinUso, ultimoIngreso: haceDias(58), ultimaOperacion: haceDias(58) };
    const r = puntajeDesdeSenales("demo", dormido, 26719, AHORA);
    expect(r.score).toBe(10); // sólo suma el trial (nadie lo penaliza por no estar en prueba corta)
    expect(r.riskLevel).toBe("critical");
    expect(r.daysSinceLastOrder).toBe(58);
    expect(r.daysSinceLastLogin).toBe(58);
  });

  it("dormido con la prueba vencida: 0 puntos", () => {
    const r = puntajeDesdeSenales("x", sinUso, 0, AHORA);
    expect(r.score).toBe(0);
    expect(r.riskLevel).toBe("critical");
  });

  it("nunca operó ni entró: el puntaje usa 999 días pero se guarda 0 (convención de siempre)", () => {
    const r = puntajeDesdeSenales("nuevo", sinUso, null, AHORA);
    expect(r.daysSinceLastOrder).toBe(0);
    expect(r.daysSinceLastLogin).toBe(0);
    expect(r.score).toBe(10); // sólo el trial null (= sin prueba) aporta
  });

  it("entra seguido pero no opera (aserradero que sólo mira): medio, no crítico", () => {
    const r = puntajeDesdeSenales("mira", { ...sinUso, ingresos7d: 7, ingresos30d: 20, ultimoIngreso: haceDias(0), modulos30d: 6 }, null, AHORA);
    expect(r.score).toBe(25 + 0 + 3 + 0 + 10);
    expect(r.riskLevel).toBe("high");
  });

  it("una fecha futura (reloj desfasado) no da días negativos", () => {
    const r = puntajeDesdeSenales("x", { ...blas, ultimaOperacion: haceDias(-2), ultimoIngreso: haceDias(-2) }, null, AHORA);
    expect(r.daysSinceLastOrder).toBe(0);
    expect(r.daysSinceLastLogin).toBe(0);
  });

  it("los umbrales de riesgo no cambiaron", () => {
    expect(classifyRisk(71)).toBe("low");
    expect(classifyRisk(70)).toBe("medium");
    expect(classifyRisk(50)).toBe("medium");
    expect(classifyRisk(49)).toBe("high");
    expect(classifyRisk(30)).toBe("high");
    expect(classifyRisk(29)).toBe("critical");
  });
});

describe("detectSignals con el nuevo significado", () => {
  const previoViejo: HealthScoreResult = {
    tenantId: "blas", score: 10, loginsLast7d: 0, loginsLast30d: 0, ordersLast7d: 0, ordersLast30d: 0,
    featuresUsed: 1, daysSinceLastOrder: 0, daysSinceLastLogin: 0, trialDaysLeft: 422, riskLevel: "critical",
  };

  it("Blas ya no genera «Score crítico» ni caídas al pasar del puntaje viejo al nuevo", async () => {
    const actual = puntajeDesdeSenales("blas", blas, 422, AHORA);
    const senales = await detectSignals("blas", actual, previoViejo);
    expect(senales).toEqual([]);
  });

  it("la caída de operaciones lo dice con todas las letras (no sólo «pedidos»)", async () => {
    const actual = puntajeDesdeSenales("x", { ...blas, operaciones30d: 2 }, null, AHORA);
    const previo = { ...previoViejo, ordersLast30d: 20 };
    const senales = await detectSignals("x", actual, previo);
    const caida = senales.find((s) => s.signalType === "order_drop");
    expect(caida?.detail).toContain("Operaciones");
    expect(caida?.severity).toBe("critical");
  });
});

describe("SaludNegocioDB.senalesDeUso — la consulta", () => {
  // Con llaves: si el callback devuelve la función, vitest la corre como limpieza (sin argumentos).
  beforeEach(() => {
    m.queryRawUnsafe.mockReset();
  });

  /** Responde según la consulta, como lo haría la base. BigInt y fechas como llegan del driver. */
  function responderBase() {
    m.queryRawUnsafe.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM "Order"')) {
        return [{
          pedidos7d: 0, pedidos30d: 0, pedidosUlt: null,
          ventas7d: 1, ventas30d: 2, ventasUlt: new Date("2026-11-02T10:00:00.000Z"),
          libro7d: 4, libro30d: 10, libroUlt: new Date("2026-11-04T09:00:00.000Z"),
          trozas7d: BigInt(0), trozas30d: BigInt(3), trozasUlt: new Date("2026-10-20T00:00:00.000Z"),
        }];
      }
      if (sql.includes("ORDER BY")) return [{ createdAt: new Date("2026-11-04T08:00:00.000Z") }];
      return [{ ingresos7d: 10, ingresos30d: BigInt(39), acciones7d: 150, acciones30d: 700, modulos30d: 26 }];
    });
  }

  it("suma pedidos + ventas + libro CTP + trozas y se queda con la fecha más reciente", async () => {
    responderBase();
    const s = await SaludNegocioDB.senalesDeUso("blas", haceDias(7), haceDias(30));
    expect(s.operaciones7d).toBe(5);
    expect(s.operaciones30d).toBe(15);
    expect(s.ultimaOperacion?.toISOString()).toBe("2026-11-04T09:00:00.000Z");
    expect(s.ultimoIngreso?.toISOString()).toBe("2026-11-04T08:00:00.000Z");
    expect(s.ingresos30d).toBe(39); // BigInt → number
    expect(s.modulos30d).toBe(26);
    expect(s.desglose30d).toEqual({ pedidos: 0, ventas: 2, libroCtp: 10, trozas: 3 });
  });

  it("tenantId es el 1.er parámetro de cada consulta y los usuarios máquina van como parámetro", async () => {
    responderBase();
    await SaludNegocioDB.senalesDeUso("blas", haceDias(7), haceDias(30));
    expect(m.queryRawUnsafe).toHaveBeenCalledTimes(3);
    for (const [sql, ...params] of m.queryRawUnsafe.mock.calls as [string, ...unknown[]][]) {
      expect(params[0]).toBe("blas");
      expect(sql).toContain('"tenantId" = $1');
      expect(sql).not.toMatch(/\$\{/);
      expect(sql).not.toContain("'claude'"); // la lista viaja en $2/$3, no escrita en el SQL
    }
    const actividad = m.queryRawUnsafe.mock.calls.find(([sql]) => String(sql).includes("FILTER"))!;
    expect(actividad[2]).toContain("claude");
    expect(actividad[2]).toContain("cron");
    expect(actividad[3]).toContain("script:%");
    expect(String(actividad[0])).toContain("entity <> 'System'");
    expect(String(actividad[0])).toContain("[L29733]%");
  });

  it("negocio sin nada: ceros y fechas nulas, no revienta", async () => {
    m.queryRawUnsafe.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM "Order"')) {
        return [{
          pedidos7d: 0, pedidos30d: 0, pedidosUlt: null, ventas7d: 0, ventas30d: 0, ventasUlt: null,
          libro7d: 0, libro30d: 0, libroUlt: null, trozas7d: 0, trozas30d: 0, trozasUlt: null,
        }];
      }
      if (sql.includes("ORDER BY")) return [];
      return [{ ingresos7d: 0, ingresos30d: 0, acciones7d: 0, acciones30d: 0, modulos30d: 0 }];
    });
    const s = await SaludNegocioDB.senalesDeUso("vacio", haceDias(7), haceDias(30));
    expect(s).toEqual(sinUso);
  });
});

describe("calculateHealthScore — de punta a punta con la base falsa", () => {
  beforeEach(() => {
    m.queryRawUnsafe.mockReset();
    m.tenantFindUnique.mockReset();
  });

  it("arma el puntaje de Blas con las señales de la base y NO escribe nada", async () => {
    m.tenantFindUnique.mockResolvedValue({ id: "blas-id", slug: "blas", trialEndsAt: null, plan: "enterprise" });
    m.queryRawUnsafe.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM "Order"')) {
        return [{
          pedidos7d: 0, pedidos30d: 0, pedidosUlt: null, ventas7d: 0, ventas30d: 2, ventasUlt: new Date(),
          libro7d: 10, libro30d: 10, libroUlt: new Date(), trozas7d: 0, trozas30d: 0, trozasUlt: null,
        }];
      }
      if (sql.includes("ORDER BY")) return [{ createdAt: new Date() }];
      return [{ ingresos7d: 10, ingresos30d: 39, acciones7d: 150, acciones30d: 700, modulos30d: 26 }];
    });
    const r = await calculateHealthScore("blas");
    expect(r.tenantId).toBe("blas-id");
    expect(r.riskLevel).toBe("low");
    expect(r.loginsLast30d).toBe(39);
    expect(r.ordersLast30d).toBe(12);
    // todas las consultas fueron del negocio pedido
    for (const [, tenantId] of m.queryRawUnsafe.mock.calls as [string, string][]) expect(tenantId).toBe("blas-id");
  });

  it("si la base falla NO devuelve ceros (no pinta «crítico» a un negocio sano): el cron lo cuenta como error", async () => {
    m.tenantFindUnique.mockResolvedValue({ id: "blas-id", slug: "blas", trialEndsAt: null, plan: "enterprise" });
    m.queryRawUnsafe.mockRejectedValue(new Error("pooler caído"));
    await expect(calculateHealthScore("blas")).rejects.toThrow("pooler caído");
  });

  it("negocio que no existe: error claro", async () => {
    m.tenantFindUnique.mockResolvedValue(null);
    await expect(calculateHealthScore("fantasma")).rejects.toThrow("Tenant no encontrado");
  });
});
