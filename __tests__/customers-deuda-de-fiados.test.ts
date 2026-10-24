/**
 * GET /api/customers → `creditBalance` = lo que el cliente debe de fiados
 * ACTIVO + VENCIDO (2026-10-09). La columna `Customer.creditBalance` valía 0 en
 * todos los clientes aunque hubiera fiados abiertos (Cliente 4455 debía S/ 150
 * vencido y el POS no mostraba nada).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { tx, fiadosPorTenant } = vi.hoisted(() => {
  const fiadosPorTenant: Record<string, { customerId: string; saldo: number; status: string; fechaVence: Date | null }[]> = {};
  const cumple = (f: { status: string; fechaVence: Date | null }, w: Record<string, unknown>): boolean => {
    if (w.OR) return (w.OR as Record<string, unknown>[]).some((o) => cumple(f, o));
    const st = w.status as string | { in: string[] } | undefined;
    if (typeof st === "string" && f.status !== st) return false;
    if (st && typeof st === "object" && !st.in.includes(f.status)) return false;
    const fv = w.fechaVence as { lt: Date } | undefined;
    if (fv && !(f.fechaVence && f.fechaVence < fv.lt)) return false;
    return true;
  };
  const tx = {
    customer: {
      findMany: vi.fn(async ({ where }: { where: { tenantId: string } }) =>
        where.tenantId === "t1"
          ? ["922334455", "900000001"].map((phone) => ({
              phone, name: `Cliente ${phone.slice(-4)}`, email: null, location: "", reference: "", locations: [],
              activeLocationId: null, birthday: null, aiNotes: null, aiNotesDate: null, loyaltyPoints: 0,
              loyaltyTier: "bronce", totalSpent: 0, privateNotes: null, referralCode: null, referredBy: null,
              creditBalance: 0, creditLimit: 0, tags: null, lat: null, lng: null, notifOrderUpdates: true,
              notifPromotions: true, notifRestock: true, createdAt: new Date(0), updatedAt: new Date(0),
            }))
          : [],
      ),
    },
    fiado: {
      groupBy: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const filas = (fiadosPorTenant[where.tenantId as string] ?? []).filter((f) => cumple(f, where));
        const por = new Map<string, number>();
        for (const f of filas) por.set(f.customerId, (por.get(f.customerId) ?? 0) + f.saldo);
        return [...por].map(([customerId, saldo]) => ({ customerId, _sum: { saldo } }));
      }),
    },
  };
  return { tx, fiadosPorTenant };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/prisma-rls", () => ({ withRlsTx: (_t: string, fn: (t: typeof tx) => unknown) => fn(tx) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn(), invalidate: vi.fn() }));

import { CustomersDB } from "@/lib/db/customers.db";

const AHORA = new Date("2026-10-09T15:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(fiadosPorTenant)) delete fiadosPorTenant[k];
  fiadosPorTenant.t1 = [
    { customerId: "922334455", saldo: 150, status: "VENCIDO", fechaVence: new Date("2026-09-30T05:00:00Z") },
    { customerId: "900000001", saldo: 0.1, status: "ACTIVO", fechaVence: new Date("2026-10-01T05:00:00Z") },
    { customerId: "900000001", saldo: 0.2, status: "ACTIVO", fechaVence: null },
    { customerId: "900000001", saldo: 99, status: "PAGADO", fechaVence: null },
    { customerId: "900000001", saldo: 40, status: "CANCELADO", fechaVence: null },
  ];
  // El mismo teléfono en OTRO negocio: su deuda no se cruza.
  fiadosPorTenant.t2 = [{ customerId: "922334455", saldo: 500, status: "ACTIVO", fechaVence: null }];
});

describe("CustomersDB.deudaDeFiados / getAllConDeuda", () => {
  it("suma ACTIVO + VENCIDO (no PAGADO ni CANCELADO) y separa lo vencido", async () => {
    const m = await CustomersDB.deudaDeFiados("t1", AHORA);
    expect(m.get("922334455")).toEqual({ deuda: 150, vencido: 150 });
    // 0,1 + 0,2 sin arrastrar el 0,30000000000000004 del float; el ACTIVO con fecha pasada cuenta como vencido.
    expect(m.get("900000001")).toEqual({ deuda: 0.3, vencido: 0.1 });
  });

  it("Cliente 4455 sale con creditBalance 150 aunque la columna diga 0", async () => {
    const lista = await CustomersDB.getAllConDeuda("t1");
    const c4455 = lista.find((c) => c.phone === "922334455");
    expect(c4455).toMatchObject({ creditBalance: 150, fiadoVencido: 150 });
  });

  it("filtra por tenantId en el WHERE: la deuda del mismo teléfono en otro negocio no aparece", async () => {
    const m = await CustomersDB.deudaDeFiados("t1", AHORA);
    expect(m.get("922334455")?.deuda).toBe(150); // no 650
    for (const [args] of tx.fiado.groupBy.mock.calls) expect(args.where.tenantId).toBe("t1");
    expect(await CustomersDB.getAllConDeuda("t2")).toEqual([]); // t2 no ve los clientes de t1
  });

  it("cliente sin fiados abiertos = 0", async () => {
    fiadosPorTenant.t1 = [];
    const lista = await CustomersDB.getAllConDeuda("t1");
    expect(lista.map((c) => c.creditBalance)).toEqual([0, 0]);
  });
});
