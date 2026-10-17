// @vitest-environment node
/**
 * POST /api/commissions/pagar — revisión 08-10: el mismo tramo se podía pagar
 * dos veces (un pago que se pisa con el período sin caber dentro contaba 0),
 * la confirmación podía mostrar un monto de otro período y dos pestañas a la
 * vez pagaban las dos. El candado se simula con una fila en memoria.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  pagos: [] as { id: string; amount: number; notes: string; date: string }[],
  altas: 0,
  fila: Promise.resolve() as Promise<unknown>,
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: vi.fn(async () => ({ tenantId: "t1", username: "brandon", role: "admin" })) }));
vi.mock("@/lib/billing/require-active-subscription", () => ({ requireActiveSubscription: vi.fn(async () => null) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/queue", () => ({ enqueueActivityLog: vi.fn(async () => {}) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/db/commissions.db", () => ({
  CommissionsDB: { cashierSummary: vi.fn(async () => [{ cashierId: "maria", cashierName: "María", role: "cajero", sales: 4, revenue: 400 }]) },
}));
vi.mock("@/lib/db/commission-rules.db", () => ({ CommissionRulesDB: { list: vi.fn(async () => []) } }));
vi.mock("@/lib/db/finance.db", () => ({
  ExpensesDB: {
    add: vi.fn(async (_t: string, g: { amount: number; notes: string }) => {
      await new Promise((r) => setTimeout(r, 5));
      H.altas += 1;
      H.pagos.push({ id: `g${H.altas}`, amount: g.amount, notes: g.notes, date: "2026-10-08T15:00:00Z" });
      return { id: `g${H.altas}` };
    }),
  },
}));
vi.mock("@/lib/db/commission-pagos.db", () => ({
  CommissionPagosDB: {
    // Igual que pg_advisory_xact_lock: el siguiente espera a que termine el anterior.
    conCandado: (_t: string, _c: string, fn: (p: typeof H.pagos) => Promise<unknown>) => {
      const turno = H.fila.then(() => fn([...H.pagos]));
      H.fila = turno.catch(() => undefined);
      return turno;
    },
  },
}));

import { POST } from "@/app/api/commissions/pagar/route";
import { marcaDePago } from "@/lib/comisiones/calcular";

const pagar = (from: string, to: string, montoVisto = 8) =>
  POST(new NextRequest("http://localhost/api/commissions/pagar", {
    method: "POST",
    body: JSON.stringify({ cashierId: "maria", from, to, paymentMethod: "yape", montoVisto }),
  }));

beforeEach(() => {
  H.pagos = [];
  H.altas = 0;
  H.fila = Promise.resolve();
});

describe("POST /api/commissions/pagar", () => {
  it("paga lo pendiente (2 % de S/ 400) y la segunda vez da 409", async () => {
    const r = await pagar("2026-10-01", "2026-10-08");
    expect(r.status).toBe(201);
    expect(await r.json()).toMatchObject({ monto: 8 });
    expect((await pagar("2026-10-01", "2026-10-08")).status).toBe(409);
    expect(H.altas).toBe(1);
  });

  it("pagaste «Este mes» (01–08): «Esta semana» (06–08) da 409, ya está en ese pago", async () => {
    H.pagos.push({ id: "m", amount: 8, notes: marcaDePago("maria", "2026-10-01", "2026-10-08"), date: "2026-10-08" });
    const r = await pagar("2026-10-06", "2026-10-08");
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/ya está en el pago del 01\/10 al 08\/10/);
    expect(H.altas).toBe(0);
  });

  it("pagaste la semana 29/09–05/10: setiembre da 409 y dice qué días quedan libres", async () => {
    H.pagos.push({ id: "s", amount: 8, notes: marcaDePago("maria", "2026-09-29", "2026-10-05"), date: "2026-10-06" });
    const r = await pagar("2026-09-01", "2026-09-30");
    expect(r.status).toBe(409);
    const body = await r.json();
    expect(body.error).toMatch(/Paga del 01\/09 al 28\/09/);
    expect(body.libre).toEqual({ desde: "2026-09-01", hasta: "2026-09-28" });
  });

  it("si el monto que viste ya no es el pendiente, no paga (409 con el nuevo)", async () => {
    const r = await pagar("2026-10-01", "2026-10-08", 12.5);
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ pendiente: 8 });
    expect(H.altas).toBe(0);
  });

  it("sin montoVisto es 400", async () => {
    const r = await POST(new NextRequest("http://localhost/api/commissions/pagar", { method: "POST", body: JSON.stringify({ cashierId: "maria", from: "2026-10-01", to: "2026-10-08" }) }));
    expect(r.status).toBe(400);
  });

  it("dos pestañas a la vez: una paga y la otra da 409", async () => {
    const [a, b] = await Promise.all([pagar("2026-10-01", "2026-10-08"), pagar("2026-10-01", "2026-10-08")]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(H.altas).toBe(1);
  });
});
