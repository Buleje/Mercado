/**
 * Canje de puntos en el pedido de la tienda (2026-10-08):
 *  - `OrdersDB.add` con `canjePuntos` crea el pedido y descuenta los puntos en
 *    UNA transacción (guard atómico `saldo + débito >= 0`).
 *  - `OrdersDB.cancelarConReposicion` los devuelve una sola vez.
 *
 * La DB es una tabla en memoria con transacciones de verdad para el test: cada
 * `$transaction` anota cómo deshacer sus escrituras y las deshace si la función
 * tira (como el ROLLBACK de Postgres). Así «dos pedidos a la vez con el mismo
 * saldo» prueba el guard del UPDATE y el rollback, no un `if` del test.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Ledger = { id: string; tenantId: string; customerId: string; amount: number; reason: string; metadata: Record<string, unknown> | null };
type Pedido = { id: string; tenantId: string; status: string; cancelledAt: Date | null; idempotencyKey: string | null };

const { db, mockPrisma } = vi.hoisted(() => {
  const db = {
    saldo: new Map<string, number>(),
    ledger: [] as Ledger[],
    pedidos: [] as Pedido[],
  };
  const T = "tenant-a";

  const cumpleMeta = (m: Record<string, unknown> | null, f: { path: string[]; equals: unknown }) =>
    m != null && m[f.path[0]] === f.equals;
  const filtraLedger = (w: Record<string, unknown>) =>
    db.ledger.filter((l) => {
      if (w.tenantId && l.tenantId !== w.tenantId) return false;
      if (w.reason && l.reason !== w.reason) return false;
      const metas: { path: string[]; equals: unknown }[] = [];
      if (w.metadata) metas.push(w.metadata as { path: string[]; equals: unknown });
      for (const a of (w.AND as { metadata: { path: string[]; equals: unknown } }[] | undefined) ?? []) metas.push(a.metadata);
      return metas.every((f) => cumpleMeta(l.metadata, f));
    });

  /** Cliente de DB; `undo` != null = dentro de una transacción. */
  const crearCliente = (undo: (() => void)[] | null): Record<string, unknown> => {
    const anotar = (u: () => void) => undo?.push(u);
    const cliente: Record<string, unknown> = {
      customer: {
        findUnique: vi.fn(async ({ where }: { where: { phone: string } }) =>
          db.saldo.has(where.phone)
            ? { phone: where.phone, tenantId: T, loyaltyPoints: db.saldo.get(where.phone), locations: [] }
            : null,
        ),
        update: vi.fn(async ({ where, data }: { where: { phone: string }; data: { loyaltyPoints?: { increment: number } } }) => {
          const inc = data.loyaltyPoints?.increment;
          if (inc) {
            db.saldo.set(where.phone, (db.saldo.get(where.phone) ?? 0) + inc);
            anotar(() => db.saldo.set(where.phone, (db.saldo.get(where.phone) ?? 0) - inc));
          }
          return {};
        }),
        create: vi.fn(async () => ({})),
      },
      product: { findMany: vi.fn(async () => []) },
      order: {
        create: vi.fn(async ({ data }: { data: { id: string; tenantId: string; idempotencyKey?: string; total: number } }) => {
          await Promise.resolve(); // deja intercalar al otro pedido
          if (data.idempotencyKey && db.pedidos.some((p) => p.idempotencyKey === data.idempotencyKey)) {
            throw Object.assign(new Error("Unique constraint failed on the fields: (`idempotencyKey`)"), {
              code: "P2002",
              meta: { target: ["idempotencyKey"] },
            });
          }
          const p: Pedido = { id: data.id, tenantId: data.tenantId, status: "pendiente", cancelledAt: null, idempotencyKey: data.idempotencyKey ?? null };
          db.pedidos.push(p);
          anotar(() => db.pedidos.splice(db.pedidos.indexOf(p), 1));
          const ahora = new Date();
          return {
            id: data.id, customerName: "Ana", customerPhone: "987654321", customerLocation: "", customerReference: "",
            total: data.total, status: "pendiente", items: [], createdAt: ahora, updatedAt: ahora,
          };
        }),
        updateMany: vi.fn(async ({ where, data }: { where: { id: string; tenantId: string; cancelledAt: null }; data: Partial<Pedido> }) => {
          const hits = db.pedidos.filter((p) => p.id === where.id && p.tenantId === where.tenantId && p.cancelledAt === null && p.status !== "entregado");
          for (const p of hits) {
            const antes = { ...p };
            Object.assign(p, data);
            anotar(() => Object.assign(p, antes));
          }
          return { count: hits.length };
        }),
      },
      orderItem: { findMany: vi.fn(async () => []) },
      loyaltyTransaction: {
        create: vi.fn(async ({ data }: { data: Omit<Ledger, "id"> }) => {
          const fila: Ledger = { id: `lt-${db.ledger.length + 1}`, ...data, metadata: data.metadata ?? null };
          db.ledger.push(fila);
          anotar(() => db.ledger.splice(db.ledger.indexOf(fila), 1));
          return { ...fila, createdAt: new Date() };
        }),
        findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => filtraLedger(where)),
        count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => filtraLedger(where).length),
      },
      // UPDATE "Customer" SET loyaltyPoints = loyaltyPoints + $1 WHERE … AND loyaltyPoints + $1 >= 0
      $executeRawUnsafe: vi.fn(async (_sql: string, monto: number, phone: string) => {
        const actual = db.saldo.get(phone) ?? 0;
        if (actual + monto < 0) return 0;
        db.saldo.set(phone, actual + monto);
        anotar(() => db.saldo.set(phone, (db.saldo.get(phone) ?? 0) - monto));
        return 1;
      }),
      $executeRaw: vi.fn(async () => 1),
    };
    cliente.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const deshacer: (() => void)[] = [];
      try {
        return await fn(crearCliente(deshacer));
      } catch (e) {
        for (const u of deshacer.reverse()) u();
        throw e;
      }
    });
    return cliente;
  };
  return { db, mockPrisma: crearCliente(null) };
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/prisma-rls", () => ({
  withRlsTx: (_t: string, fn: (tx: unknown) => Promise<unknown>) =>
    (mockPrisma.$transaction as (f: typeof fn) => Promise<unknown>)(fn),
}));
vi.mock("@/lib/domain-events", () => ({
  DomainEvents: { ventaCompletada: vi.fn().mockReturnValue(Promise.resolve()) },
}));
vi.mock("@/lib/whatsapp-order-notify", () => ({ notifyOwnerNewOrder: vi.fn() }));
vi.mock("@/lib/tenant", () => ({ findTenantByIdOrSlug: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/coupons/auto-coupon-triggers", () => ({ checkAndIssueCoupons: vi.fn() }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));

import { OrdersDB } from "@/lib/db/orders.db";
import { LoyaltyInsufficientBalanceError } from "@/lib/db/loyalty.db";
import type { DbOrder } from "@/lib/jsondb";

const T = "tenant-a";
const TEL = "987654321";

const pedido = (id: string, idempotencyKey?: string): DbOrder => ({
  id,
  customer: { name: "Ana", phone: TEL, location: "", reference: "" },
  items: [],
  total: 15,
  status: "pendiente",
  paymentMethod: "efectivo",
  ...(idempotencyKey && { idempotencyKey }),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
const canje = (puntos: number) => ({ canjePuntos: { clienteId: TEL, puntos, soles: puntos / 100 } });

beforeEach(() => {
  vi.clearAllMocks();
  db.saldo = new Map([[TEL, 500]]);
  db.ledger = [];
  db.pedidos = [];
});

describe("OrdersDB.add con canje de puntos", () => {
  it("canje válido: crea el pedido y baja el saldo en la misma transacción", async () => {
    await OrdersDB.add(pedido("ord-1"), T, canje(300));
    expect(db.saldo.get(TEL)).toBe(200);
    expect(db.pedidos.map((p) => p.id)).toEqual(["ord-1"]);
    expect(db.ledger).toHaveLength(1);
    expect(db.ledger[0]).toMatchObject({
      amount: -300,
      reason: "redemption",
      metadata: { orderId: "ord-1", soles: 3, canal: "tienda" },
    });
  });

  it("canje mayor que el saldo: no queda el pedido ni el débito (rollback)", async () => {
    await expect(OrdersDB.add(pedido("ord-1"), T, canje(800))).rejects.toBeInstanceOf(
      LoyaltyInsufficientBalanceError,
    );
    expect(db.saldo.get(TEL)).toBe(500);
    expect(db.pedidos).toHaveLength(0);
    expect(db.ledger).toHaveLength(0);
  });

  it("dos pedidos a la vez con el mismo saldo: solo uno canjea y el saldo nunca queda negativo", async () => {
    const r = await Promise.allSettled([
      OrdersDB.add(pedido("ord-a"), T, canje(500)),
      OrdersDB.add(pedido("ord-b"), T, canje(500)),
    ]);
    const ok = r.filter((x) => x.status === "fulfilled");
    const ko = r.filter((x) => x.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(ko).toHaveLength(1);
    expect(ko[0].reason).toBeInstanceOf(LoyaltyInsufficientBalanceError);
    expect(db.saldo.get(TEL)).toBe(0);
    expect(db.pedidos).toHaveLength(1);
    expect(db.ledger.filter((l) => l.amount < 0)).toHaveLength(1);
  });

  it("misma clave de idempotencia a la vez: un pedido y un solo canje", async () => {
    const r = await Promise.allSettled([
      OrdersDB.add(pedido("ord-a", "clave-1"), T, canje(100)),
      OrdersDB.add(pedido("ord-b", "clave-1"), T, canje(100)),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const ko = r.find((x) => x.status === "rejected") as PromiseRejectedResult;
    expect((ko.reason as { code?: string }).code).toBe("P2002");
    expect(db.saldo.get(TEL)).toBe(400);
    expect(db.ledger).toHaveLength(1);
  });

  it("sin canje no abre transacción ni toca los puntos", async () => {
    await OrdersDB.add(pedido("ord-1"), T);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(db.saldo.get(TEL)).toBe(500);
    expect(db.ledger).toHaveLength(0);
  });
});

describe("OrdersDB.cancelarConReposicion devuelve el canje", () => {
  it("cancelar devuelve los puntos una sola vez (también con dos cancelaciones a la vez)", async () => {
    await OrdersDB.add(pedido("ord-1"), T, canje(300));
    expect(db.saldo.get(TEL)).toBe(200);

    const [a, b] = await Promise.all([
      OrdersDB.cancelarConReposicion(T, "ord-1", null),
      OrdersDB.cancelarConReposicion(T, "ord-1", null),
    ]);
    expect([a.puntosDevueltos, b.puntosDevueltos].sort()).toEqual([0, 300]);
    expect(db.saldo.get(TEL)).toBe(500);

    const otra = await OrdersDB.cancelarConReposicion(T, "ord-1", null);
    expect(otra).toMatchObject({ repuesto: false, puntosDevueltos: 0 });
    expect(db.saldo.get(TEL)).toBe(500);
    const devolucion = db.ledger.filter((l) => l.amount > 0);
    expect(devolucion).toHaveLength(1);
    // Sin `orderId`: el auto-earn de «entregado» no la confunde con una compra.
    expect(devolucion[0]).toMatchObject({
      reason: "adjustment",
      metadata: { canjeDelPedido: "ord-1", canal: "tienda" },
    });
    expect(devolucion[0].metadata).not.toHaveProperty("orderId");
  });

  it("un pedido sin canje se cancela sin tocar puntos", async () => {
    await OrdersDB.add(pedido("ord-1"), T);
    const r = await OrdersDB.cancelarConReposicion(T, "ord-1", null);
    expect(r).toMatchObject({ repuesto: true, puntosDevueltos: 0 });
    expect(db.saldo.get(TEL)).toBe(500);
    expect(db.ledger).toHaveLength(0);
  });
  it("ficha borrada: la cancelación sigue (stock vuelve) y la devolución se registra como error", async () => {
    await OrdersDB.add(pedido("ord-1"), T, canje(300));
    db.saldo.delete(TEL);
    const r = await OrdersDB.cancelarConReposicion(T, "ord-1", null);
    expect(r).toMatchObject({ repuesto: true, puntosDevueltos: 0 });
    expect(db.pedidos.find((p) => p.id === "ord-1")?.status).toBe("cancelado");
    expect(db.ledger.filter((l) => l.amount > 0)).toHaveLength(0);
  });
});
