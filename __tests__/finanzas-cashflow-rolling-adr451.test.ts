/**
 * ADR-451 — la proyección de 13 semanas sólo AGREGA campos.
 *
 * Las lecturas pasaron de `prisma.*` sueltos a `ResultadoNegocioDB.proyeccion`
 * con los mismos `where`. Este test corre la proyección real contra una base
 * falsa (Proxy que responde por modelo y `where`) y fija:
 *  1. los campos viejos — `startingBalance`, `weeks[*]` sin `advanceCollections`,
 *     `criticalWeek` — con los valores que daba el código de HEAD sobre estos
 *     mismos datos (capturados corriendo la versión anterior, 29-09-2026);
 *  2. los campos nuevos: saldo inicial rotulado, de dónde sale la nómina, ≈ RRHH,
 *     adelantos con vencimiento (fuera del cierre) y lo que no cae en ninguna semana.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Args = { where?: Record<string, unknown> } | undefined;

const H = vi.hoisted(() => {
  const llamadas: { modelo: string; metodo: string; args: unknown }[] = [];
  const responder = (modelo: string, metodo: string, args: { where?: Record<string, unknown> } | undefined): unknown => {
    const w = args?.where ?? {};
    const k = `${modelo}.${metodo}`;
    const r = H_RESPUESTAS[k];
    if (typeof r === "function") return r(w);
    if (metodo === "aggregate") return { _sum: {}, _count: 0 };
    if (metodo === "count") return 0;
    if (metodo.startsWith("find") && !metodo.endsWith("Many")) return null;
    return [];
  };
  const H_RESPUESTAS: Record<string, (w: Record<string, unknown>) => unknown> = {};
  const modelo = (nombre: string) =>
    new Proxy({}, {
      get: (_t, metodo: string) => async (args: { where?: Record<string, unknown> } | undefined) => {
        llamadas.push({ modelo: nombre, metodo, args });
        return responder(nombre, metodo, args);
      },
    });
  const prisma = new Proxy({}, { get: (_t, p: string) => (p === "then" ? undefined : modelo(p)) });
  return { llamadas, respuestas: H_RESPUESTAS, prisma, ganado: vi.fn() };
});

vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("@/lib/db/platform-settings.db", () => ({ PlatformSettingsDB: { get: async () => null } }));
vi.mock("@/lib/db/rrhh-ganado.db", () => ({ GanadoDB: { periodo: (...a: unknown[]) => H.ganado(...a) } }));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({ ForestCtpCierreDB: { list: async () => [] } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
// La ruta corre con el `requireAdmin` REAL: sólo se simula el JWT.
const S = vi.hoisted(() => ({ payload: null as null | { username: string; role: string; tenantId: string } }));
vi.mock("@/lib/session", async (real) => ({ ...(await real<typeof import("@/lib/session")>()), getSessionPayload: async () => S.payload }));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));

import { NextRequest } from "next/server";
import { computeCashflowRolling } from "@/lib/finance/cashflow-rolling";
import { GET as GET_PROYECCION } from "@/app/api/finance/cashflow-rolling/route";
import { RUTAS_PANEL } from "@/lib/auth/roles-rutas-panel";
import { canRead } from "@/lib/auth/role-permissions";

// Martes 29-09-2026, 10:00 de Pucallpa. La semana 1 arranca el lunes 28.
const AHORA = new Date("2026-09-29T15:00:00.000Z");
const d = (iso: string) => new Date(iso);

function sembrar() {
  const r = H.respuestas;
  r["treasuryCuenta.findMany"] = () => []; // sin tesorería → neto de 30 días
  r["sale.aggregate"] = () => ({ _sum: { total: 170 } });
  r["expense.aggregate"] = (w) =>
    w.category === "personal" ? { _sum: { amount: 400 } } : w.recurring === true ? { _sum: { amount: 200 } } : { _sum: { amount: 620 } };
  r["order.findMany"] = () => [{ total: 50, createdAt: d("2026-10-06T15:00:00.000Z") }];
  r["fiado.findMany"] = () => [{ saldo: 30, fechaVence: d("2026-10-13T15:00:00.000Z") }];
  r["payable.findMany"] = (w) =>
    (w.dueDate as { lt?: Date; gte?: Date }).gte
      ? [{ amount: 100, paidAmount: 20, dueDate: d("2026-09-30T15:00:00.000Z") }]
      : [{ amount: 50, paidAmount: 0, dueDate: d("2026-09-01T15:00:00.000Z") }];
  r["prestamoCuota.findMany"] = () => [{ monto: 70, fechaVence: d("2026-10-20T15:00:00.000Z") }];
  r["adelanto.findMany"] = () => [
    { saldoPendiente: 26690, fechaVencimiento: d("2026-10-15T00:00:00.000Z") },
    { saldoPendiente: 100, fechaVencimiento: null },
    { saldoPendiente: 40, fechaVencimiento: d("2026-09-01T00:00:00.000Z") },
  ];
  r["fiado.aggregate"] = () => ({ _sum: { saldo: 30 }, _count: 1 });
}

/** Lo que daba HEAD (antes de ADR-451) con estos mismos datos y este mismo reloj. */
const HEAD = {
  startingBalance: -450,
  criticalWeek: 1,
  weeks: [
    { weekNumber: 1, openingBalance: -450, expectedCollections: 0, creditCollections: 0, supplierPayments: 80, payroll: 100, loans: 0, otherExpenses: 50, closingBalance: -680, isNegative: true },
    { weekNumber: 2, openingBalance: -680, expectedCollections: 50, creditCollections: 0, supplierPayments: 0, payroll: 100, loans: 0, otherExpenses: 50, closingBalance: -780, isNegative: true },
    { weekNumber: 3, openingBalance: -780, expectedCollections: 0, creditCollections: 30, supplierPayments: 0, payroll: 100, loans: 0, otherExpenses: 50, closingBalance: -900, isNegative: true },
    { weekNumber: 4, openingBalance: -900, expectedCollections: 0, creditCollections: 0, supplierPayments: 0, payroll: 100, loans: 70, otherExpenses: 50, closingBalance: -1120, isNegative: true },
  ],
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AHORA);
  H.llamadas.length = 0;
  for (const k of Object.keys(H.respuestas)) delete H.respuestas[k];
  H.ganado.mockReset();
  H.ganado.mockResolvedValue({ personas: [{ total: 1200 }], total: 1200 });
  sembrar();
});
afterEach(() => vi.useRealTimers());

describe("proyección de 13 semanas: los campos viejos no cambian", () => {
  it("saldo inicial, semanas y semana crítica dan lo mismo que HEAD", async () => {
    const r = await computeCashflowRolling("t1", { verPlanilla: true });
    expect(r.startingBalance).toBe(HEAD.startingBalance);
    expect(r.criticalWeek).toBe(HEAD.criticalWeek);
    expect(r.weeks).toHaveLength(13);
    for (const w of HEAD.weeks) {
      const got = r.weeks[w.weekNumber - 1];
      const { advanceCollections: _nuevo, weekStart: _s, weekEnd: _e, ...viejos } = got;
      expect(viejos, `semana ${w.weekNumber}`).toEqual(w);
    }
    // El adelanto que vence el 15/10 se informa, pero NO mueve el cierre.
    expect(r.weeks[2].advanceCollections).toBe(26690);
    expect(r.weeks[2].closingBalance).toBe(-900);
  });

  it("todas las lecturas van con el tenant de la llamada", async () => {
    await computeCashflowRolling("t1");
    expect(H.llamadas.length).toBeGreaterThan(8);
    for (const c of H.llamadas) {
      expect(JSON.stringify(c.args), `${c.modelo}.${c.metodo}`).toContain('"tenantId":"t1"');
    }
    // ADR-448: los adelantos que se proyectan son sólo los DADOS.
    const adel = H.llamadas.find((c) => c.modelo === "adelanto");
    expect((adel?.args as Args)?.where).toMatchObject({ direccion: "DADO", status: "ABIERTO" });
  });
});

describe("proyección de 13 semanas: los campos nuevos", () => {
  it("rotula el saldo inicial, la nómina, ≈ RRHH, los adelantos y lo que no cae en ninguna semana", async () => {
    const r = await computeCashflowRolling("t1", { verPlanilla: true });
    expect(r.saldoInicial).toEqual({ monto: -450, fuente: "neto_30_dias", estimado: true });
    expect(r.payrollFuente).toBe("gastos_personal");
    expect(r.payrollRrhhSemanal).toBe(300);
    expect(r.adelantosConVencimiento).toEqual({ monto: 26690, cuantos: 1 });
    expect(r.sinFecha).toEqual({ porCobrar: 170, cuantosPorCobrar: 3, porPagar: 50, cuantosPorPagar: 1 });
  });

  it("con tesorería, el saldo inicial es medido; sin personal en RRHH, la referencia es null", async () => {
    H.respuestas["treasuryCuenta.findMany"] = () => [{ saldo: 1000 }, { saldo: 250.5 }];
    H.respuestas["expense.aggregate"] = (w) => (w.recurring === true ? { _sum: { amount: 200 } } : { _sum: {} });
    H.ganado.mockResolvedValue({ personas: [], total: 0 });
    const r = await computeCashflowRolling("t1", { verPlanilla: true });
    expect(r.startingBalance).toBe(1250.5);
    expect(r.saldoInicial).toEqual({ monto: 1250.5, fuente: "tesoreria", estimado: false });
    expect(r.payrollFuente).toBe("sin_dato");
    expect(r.payrollRrhhSemanal).toBeNull();
  });
});

describe("proyección de 13 semanas: la nómina sólo para quien ve RRHH", () => {
  it("sin permiso de RRHH el cierre se calcula SIN nómina (no hay sueldo que deducir) y se rotula", async () => {
    const con = await computeCashflowRolling("t1", { verPlanilla: true });
    expect(con.cierreSinNomina).toBe(false);
    H.ganado.mockClear();
    H.llamadas.length = 0;
    const sin = await computeCashflowRolling("t1");
    expect(sin.cierreSinNomina).toBe(true);
    expect(sin.payrollFuente).toBe("sin_permiso");
    expect("payrollRrhhSemanal" in sin).toBe(false);
    for (const w of sin.weeks) {
      expect("payroll" in w).toBe(false);
      // El cierre es exactamente las filas que viajan: restarlas no deja nada escondido.
      expect(w.closingBalance).toBe(
        Math.round((w.openingBalance + w.expectedCollections + w.creditCollections - w.supplierPayments - w.loans - w.otherExpenses) * 100) / 100,
      );
    }
    expect(sin.weeks.slice(0, 4).map((w) => w.closingBalance)).toEqual([-580, -580, -600, -720]);
    // Ni lo ganado de RRHH ni los gastos de personal se consultan.
    expect(H.ganado).not.toHaveBeenCalled();
    expect(H.llamadas.some((c) => c.modelo === "expense" && (c.args as Args)?.where?.category === "personal")).toBe(false);
  });
});

describe("ruta de la proyección: los roles de la matriz", () => {
  const pedir = () => new NextRequest("http://localhost/api/finance/cashflow-rolling", { headers: { cookie: "buleje-admin-sess=token-falso" } });
  const como = (role: string) => { S.payload = { username: `qa-${role}`, role, tenantId: "t1" }; };

  it("el espejo de RUTAS_PANEL es la matriz: leer gastos Y cuentas por pagar", () => {
    const roles = ["admin", "owner", "manager", "analista", "cajero", "almacenero", "proveedor", "delivery", "tienda_owner"] as const;
    const espejo = RUTAS_PANEL["/api/finance/cashflow-rolling"] as readonly string[];
    for (const r of roles) expect(espejo.includes(r), r).toBe(canRead(r, "expenses") && canRead(r, "payables"));
  });

  it.each(["cajero", "almacenero", "tienda_owner"])("%s → 403 (la matriz no le da gastos y cuentas por pagar)", async (role) => {
    como(role);
    expect((await GET_PROYECCION(pedir())).status).toBe(403);
    expect(H.llamadas).toHaveLength(0);
  });

  it.each(["manager", "analista"])("%s → 200 con el cierre sin nómina y rotulado", async (role) => {
    como(role);
    const res = await GET_PROYECCION(pedir());
    expect(res.status).toBe(200);
    const texto = await res.text();
    expect(texto).not.toContain('"payroll":');
    expect(texto).not.toContain("payrollRrhhSemanal");
    const body = JSON.parse(texto);
    expect(body).toMatchObject({ payrollFuente: "sin_permiso", cierreSinNomina: true });
    expect(body.weeks[0].closingBalance).toBe(-580);
    expect(H.ganado).not.toHaveBeenCalled();
  });

  it.each(["admin", "owner"])("%s → igual que antes: con nómina y el cierre de HEAD", async (role) => {
    como(role);
    const body = await (await GET_PROYECCION(pedir())).json();
    expect(body.weeks[0]).toMatchObject({ payroll: 100, closingBalance: -680 });
    expect(body.criticalWeek).toBe(HEAD.criticalWeek);
    expect(body.cierreSinNomina).toBe(false);
    expect(body.payrollRrhhSemanal).toBe(300);
  });
});
