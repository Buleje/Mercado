/**
 * GET /api/customers → `creditBalance` = lo que el cliente debe de fiados
 * ACTIVO + VENCIDO (2026-10-09). La columna `Customer.creditBalance` valía 0 en
 * todos los clientes aunque hubiera fiados abiertos (Cliente 4455 debía S/ 150
 * vencido y el POS no mostraba nada).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { tx, fiadosPorTenant } = vi.hoisted(() => {
  const fiadosPorTenant: Record<string, { customerId: string; saldo: number; status: string; fechaVence: Date | null }[]> = {};
  /**
   * Lo que devuelve la consulta de deudaDeFiados (04-11: una sola, con FILTER
   * para lo vencido), armado en JS desde `fiadosPorTenant`: una fila por cliente
   * con fiados ACTIVO/VENCIDO, en céntimos, filtrando por el tenant y el corte
   * que viajan como parámetros. Que la consulta real dé lo mismo que los 2
   * groupBy de antes se comparó con la base en 6 negocios (salida idéntica).
   */
  const esFecha = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v);
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
    $queryRaw: vi.fn(async (_sql: TemplateStringsArray, ...valores: unknown[]) => {
      const corte = new Date(String(valores.find(esFecha)));
      const tenantId = String(valores.find((v) => !esFecha(v)));
      const por = new Map<string, { deuda: number; vencido: number }>();
      for (const f of fiadosPorTenant[tenantId] ?? []) {
        if (f.status !== "ACTIVO" && f.status !== "VENCIDO") continue;
        const c = Math.round(f.saldo * 100); // numeric: exacto
        const vencida = f.status === "VENCIDO" || (f.fechaVence != null && f.fechaVence < corte);
        const prev = por.get(f.customerId) ?? { deuda: 0, vencido: 0 };
        por.set(f.customerId, { deuda: prev.deuda + c, vencido: prev.vencido + (vencida ? c : 0) });
      }
      return [...por].map(([customerId, v]) => ({ customerId, ...v }));
    }),
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
    for (const [, ...valores] of tx.$queryRaw.mock.calls) expect(valores).toContain("t1");
    expect(await CustomersDB.getAllConDeuda("t2")).toEqual([]); // t2 no ve los clientes de t1
  });

  it("el ACTIVO que vence justo después del corte todavía no cuenta como vencido", async () => {
    fiadosPorTenant.t1 = [
      { customerId: "900000001", saldo: 20, status: "ACTIVO", fechaVence: new Date(AHORA.getTime() + 1) },
      { customerId: "900000001", saldo: 5, status: "ACTIVO", fechaVence: new Date(AHORA.getTime() - 1) },
    ];
    expect((await CustomersDB.deudaDeFiados("t1", AHORA)).get("900000001")).toEqual({ deuda: 25, vencido: 5 });
  });

  it("cliente sin fiados abiertos = 0", async () => {
    fiadosPorTenant.t1 = [];
    const lista = await CustomersDB.getAllConDeuda("t1");
    expect(lista.map((c) => c.creditBalance)).toEqual([0, 0]);
  });
});
