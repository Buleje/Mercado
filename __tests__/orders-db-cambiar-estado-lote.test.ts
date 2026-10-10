/**
 * OrdersDB.cambiarEstadoEnLote + cancelarConReposicion + contarComprasPorTelefono
 * (security 2026-10-08).
 *
 * Antes el cambio en lote era un `updateMany` ciego: pasaba de entregado a
 * cancelado, revivía cancelados y cada vuelta a «cancelado» reponía stock.
 * Acá la DB es una tabla en memoria que respeta el WHERE de cada update, así
 * se prueba la condición del WHERE y no un `if` del test.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Fila = { id: string; tenantId: string; status: string; cancelledAt: Date | null; deletedAt: Date | null };

const { db, mockPrisma } = vi.hoisted(() => {
  const db = { pedidos: [] as Fila[], reposiciones: [] as string[] };

  // Evalúa el subconjunto de WHERE que usa orders.db en estos métodos.
  const cumple = (f: Fila, w: Record<string, unknown>): boolean => {
    for (const [k, v] of Object.entries(w)) {
      const val = (f as unknown as Record<string, unknown>)[k];
      if (v !== null && typeof v === "object" && !(v instanceof Date)) {
        const o = v as { in?: unknown[]; not?: unknown; notIn?: unknown[] };
        if (o.in && !o.in.includes(val)) return false;
        if ("not" in o && val === o.not) return false;
        if (o.notIn && o.notIn.includes(val)) return false;
      } else if (val !== v) {
        return false;
      }
    }
    return true;
  };

  const order = {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      db.pedidos.filter((f) => cumple(f, where)).map((f) => ({ ...f })),
    ),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Fila> }) => {
      const hits = db.pedidos.filter((f) => cumple(f, where));
      for (const f of hits) Object.assign(f, data);
      return { count: hits.length };
    }),
    count: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      db.pedidos.filter((f) => cumple(f, where)).length,
    ),
  };
  const base = {
    order,
    orderItem: {
      findMany: vi.fn(async ({ where }: { where: { orderId: string } }) => [
        { productId: 1, quantity: 2, orderId: where.orderId },
      ]),
    },
    // Reposición de stock (tagged template): se anota el pedido.
    $executeRaw: vi.fn(async () => {
      db.reposiciones.push("x");
      return 1;
    }),
    $executeRawUnsafe: vi.fn(async () => 0),
    // Cancelar mira si el pedido canjeó puntos (2026-10-08): acá ninguno.
    loyaltyTransaction: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
  };
  const mockPrisma = {
    ...base,
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(mockPrisma)),
  };
  return { db, mockPrisma };
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/domain-events", () => ({
  DomainEvents: { ventaCompletada: vi.fn().mockReturnValue({ catch: vi.fn() }) },
}));
vi.mock("@/lib/whatsapp-order-notify", () => ({ notifyOwnerNewOrder: vi.fn() }));
vi.mock("@/lib/tenant", () => ({ findTenantByIdOrSlug: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/coupons/auto-coupon-triggers", () => ({ checkAndIssueCoupons: vi.fn() }));

import { OrdersDB } from "@/lib/db/orders.db";

const T = "tenant-a";
const fila = (id: string, status: string, extra: Partial<Fila> = {}): Fila => ({
  id,
  tenantId: T,
  status,
  cancelledAt: null,
  deletedAt: null,
  ...extra,
});

beforeEach(() => {
  db.pedidos = [];
  db.reposiciones = [];
  vi.clearAllMocks();
});

describe("cambiarEstadoEnLote", () => {
  it("de entregado a cancelado → rechazado: sigue entregado y no repone stock", async () => {
    db.pedidos = [fila("e1", "entregado")];
    const r = await OrdersDB.cambiarEstadoEnLote(T, ["e1"], "cancelado");
    expect(r.actualizados).toEqual([]);
    expect(r.rechazados).toEqual([{ id: "e1", desde: "entregado" }]);
    expect(db.pedidos[0].status).toBe("entregado");
    expect(db.reposiciones).toHaveLength(0);
  });

  it("no revive un cancelado (cancelado → pendiente rechazado)", async () => {
    db.pedidos = [fila("c1", "cancelado", { cancelledAt: new Date() })];
    const r = await OrdersDB.cambiarEstadoEnLote(T, ["c1"], "pendiente");
    expect(r.rechazados).toEqual([{ id: "c1", desde: "cancelado" }]);
    expect(db.pedidos[0].status).toBe("cancelado");
  });

  it("cancelar dos veces el mismo pedido repone el stock UNA vez", async () => {
    db.pedidos = [fila("p1", "pendiente")];
    const a = await OrdersDB.cambiarEstadoEnLote(T, ["p1", "p1"], "cancelado");
    const b = await OrdersDB.cambiarEstadoEnLote(T, ["p1"], "cancelado");
    expect(a.actualizados).toEqual(["p1"]);
    expect(a.stockRepuesto).toBe(1);
    expect(b.sinCambio).toEqual(["p1"]);
    expect(db.reposiciones).toHaveLength(1);
    expect(db.pedidos[0].cancelledAt).toBeInstanceOf(Date);
  });

  it("lote mixto: aplica las válidas, informa las inválidas y las de otro negocio no existen", async () => {
    db.pedidos = [
      fila("p1", "pendiente"),
      fila("e1", "entregado"),
      fila("x1", "pendiente", { tenantId: "tenant-b" }),
    ];
    const r = await OrdersDB.cambiarEstadoEnLote(T, ["p1", "e1", "x1"], "confirmado");
    expect(r.actualizados).toEqual(["p1"]);
    expect(r.rechazados).toEqual([{ id: "e1", desde: "entregado" }]);
    expect(r.noEncontrados).toEqual(["x1"]);
    expect(db.pedidos.find((f) => f.id === "x1")?.status).toBe("pendiente");
  });

  it("un pedido revivido por el lote viejo (cancelledAt puesto) se cancela sin reponer otra vez", async () => {
    db.pedidos = [fila("r1", "confirmado", { cancelledAt: new Date("2026-09-01") })];
    const r = await OrdersDB.cambiarEstadoEnLote(T, ["r1"], "cancelado");
    expect(r.actualizados).toEqual(["r1"]);
    expect(r.stockRepuesto).toBe(0);
    expect(db.pedidos[0].status).toBe("cancelado");
    expect(db.reposiciones).toHaveLength(0);
  });
});

describe("cancelarConReposicion (rechazo del pago)", () => {
  it("salta el entregado: no lo cancela ni repone", async () => {
    db.pedidos = [fila("e1", "entregado")];
    const r = await OrdersDB.cancelarConReposicion(T, "e1", "pago rechazado");
    expect(r.repuesto).toBe(false);
    expect(db.pedidos[0].status).toBe("entregado");
    expect(db.reposiciones).toHaveLength(0);
  });
});

describe("contarComprasPorTelefono", () => {
  it("no cuenta cancelados ni borrados", async () => {
    db.pedidos = [
      { ...fila("a", "entregado"), customerPhone: "987654321" } as Fila,
      { ...fila("b", "cancelado"), customerPhone: "987654321" } as Fila,
      { ...fila("c", "pendiente", { deletedAt: new Date() }), customerPhone: "987654321" } as Fila,
    ];
    expect(await OrdersDB.contarComprasPorTelefono(T, "+51 987 654 321")).toBe(1);
  });
});
