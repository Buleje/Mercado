// @vitest-environment node
/**
 * `Customer.creditBalance` = SALDO A FAVOR (17-10): lo que la tienda le debe al cliente
 * por devoluciones a crédito (POS y pedido lo SUMAN). La deuda vive en `Fiado`.
 *
 * Antes `updateCreditBalance` lo trataba como DEUDA: delta > 0 sólo pasaba si
 * `creditBalance + delta <= creditLimit` (con límite 0 —todos los clientes— fallaba
 * siempre: PATCH respondía 503) y delta < 0 no tenía guarda (el saldo quedaba negativo).
 * Y cualquier cajero podía mover esa plata por PATCH.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  /** Un cliente en memoria por (tenant, teléfono). */
  const clientes = new Map<string, { creditBalance: number; creditLimit: number }>();
  const k = (tenantId: string, phone: string) => `${tenantId}:${phone}`;
  type Where = { phone: string; tenantId: string; creditBalance?: { gte: number } };
  const tx = {
    customer: {
      updateMany: vi.fn(async ({ where, data }: { where: Where; data: { creditBalance: { increment: number } } }) => {
        const c = clientes.get(k(where.tenantId, where.phone));
        if (!c) return { count: 0 };
        if (where.creditBalance && !(c.creditBalance >= where.creditBalance.gte)) return { count: 0 };
        c.creditBalance += data.creditBalance.increment;
        return { count: 1 };
      }),
      findFirst: vi.fn(async ({ where }: { where: Where }) => clientes.get(k(where.tenantId, where.phone)) ?? null),
    },
    // La guarda vieja de DEUDA (`creditBalance + $1 <= creditLimit`): si se vuelve a usar, el test lo ve.
    $executeRawUnsafe: vi.fn(async (_sql: string, delta: number, phone: string, tenantId: string) => {
      const c = clientes.get(k(tenantId, phone));
      if (!c || c.creditBalance + delta > c.creditLimit) return 0;
      c.creditBalance += delta;
      return 1;
    }),
  };
  return { clientes, k, tx, rol: { value: "owner" as string } };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: { updateMany: vi.fn(async () => ({ count: 1 })) },
    activityLog: { create: vi.fn(async () => ({})) },
  },
}));
vi.mock("@/lib/prisma-rls", () => ({ withRlsTx: (_t: string, fn: (t: typeof h.tx) => unknown) => fn(h.tx) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/jsondb", async () => {
  const db = await import("@/lib/db/customers.db");
  const misc = await import("@/lib/db/misc.db");
  return { CustomersDB: db.CustomersDB, normalizePhone: misc.normalizePhone };
});
vi.mock("@/lib/db/fiados.db", () => ({ FiadosDB: { resumenByCustomer: vi.fn(async () => null) } }));
vi.mock("@/lib/audit/audit-context", () => ({
  runWithAuditContext: (_req: unknown, _u: unknown, fn: () => unknown) => fn(),
}));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () => ({ role: h.rol.value, username: "qa", tenantId: "t1" })),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));

import { CustomersDB } from "@/lib/db/customers.db";
import { PATCH } from "@/app/api/customers/[phone]/route";

const TEL = "987000111";
const saldo = () => h.clientes.get(h.k("t1", TEL))?.creditBalance;

const patch = (body: unknown) =>
  PATCH(
    new NextRequest(`http://localhost/api/customers/${TEL}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ phone: TEL }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.rol.value = "owner";
  h.clientes.clear();
  // Como TODOS los clientes reales (17-10): sin límite de crédito.
  h.clientes.set(h.k("t1", TEL), { creditBalance: 0, creditLimit: 0 });
});

describe("CustomersDB.updateCreditBalance = saldo a favor", () => {
  it("una devolución a crédito de S/ 9 suma S/ 9 aunque el cliente no tenga límite de crédito", async () => {
    await expect(CustomersDB.updateCreditBalance("t1", TEL, 9)).resolves.toBe(9);
    expect(saldo()).toBe(9);
  });

  it("consumir más saldo del que tiene se rechaza y el saldo no queda negativo", async () => {
    h.clientes.get(h.k("t1", TEL))!.creditBalance = 10;
    await expect(CustomersDB.updateCreditBalance("t1", TEL, -30)).rejects.toThrow("SALDO_A_FAVOR_INSUFICIENTE");
    expect(saldo()).toBe(10);
    await expect(CustomersDB.updateCreditBalance("t1", TEL, -10)).resolves.toBe(0);
  });

  it("cliente de otro negocio: no lo toca", async () => {
    await expect(CustomersDB.updateCreditBalance("t2", TEL, 5)).rejects.toThrow("CLIENTE_NO_ENCONTRADO");
    expect(saldo()).toBe(0);
  });
});

describe("PATCH /api/customers/[phone] con creditDelta", () => {
  it("el dueño deja S/ 20 a favor: 200 y el saldo sube (antes 503 por la guarda de deuda)", async () => {
    const res = await patch({ creditDelta: 20 });
    expect(res.status).toBe(200);
    expect(saldo()).toBe(20);
  });

  it("cajero: 403, es plata que la tienda le debe al cliente", async () => {
    h.rol.value = "cajero";
    const res = await patch({ creditDelta: 20 });
    expect(res.status).toBe(403);
    expect(saldo()).toBe(0);
  });

  it("consumir más saldo del que tiene: 422 sin tocar el saldo", async () => {
    h.clientes.get(h.k("t1", TEL))!.creditBalance = 5;
    const res = await patch({ creditDelta: -8 });
    expect(res.status).toBe(422);
    expect(saldo()).toBe(5);
  });
});
