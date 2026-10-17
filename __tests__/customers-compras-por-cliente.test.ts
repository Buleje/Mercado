/**
 * CRM «Mis clientes»: Total gastado y CLV promedio daban S/ 0,00 para todos
 * (10-10). `Customer.totalSpent` sólo lo mueve la venta del POS con teléfono;
 * los pedidos no. Medido en main: QA Sec, 9 pedidos por S/ 229,70 (1 entregado
 * por S/ 7,20), columna en 0.
 *
 * `CustomersDB.comprasPorCliente` cuenta desde los pedidos y las ventas:
 * compras = pedidos no cancelados + ventas; gastado = pedidos ENTREGADOS +
 * ventas; compras30d = las de los últimos 30 días; el teléfono se cruza por sus
 * últimos 9 dígitos.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = { tenantId: string; customerPhone: string | null; status?: string; total: number; createdAt: Date };

const { tx, datos } = vi.hoisted(() => {
  const datos: { pedidos: Fila[]; ventas: Fila[] } = { pedidos: [], ventas: [] };
  /** Lo justo del `where` que usa comprasPorCliente: tenant, teléfono no nulo, estado y fecha. */
  const cumple = (f: Fila, w: Record<string, unknown>) => {
    if (f.tenantId !== w.tenantId) return false;
    if (w.customerPhone && f.customerPhone == null) return false;
    const st = w.status as string | { not: string } | undefined;
    if (typeof st === "string" && f.status !== st) return false;
    if (st && typeof st === "object" && f.status === st.not) return false;
    const c = w.createdAt as { gte: Date } | undefined;
    if (c && f.createdAt < c.gte) return false;
    return true;
  };
  const agrupar = (filas: Fila[]) =>
    vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const por = new Map<string | null, Fila[]>();
      for (const f of filas.filter((x) => cumple(x, where))) por.set(f.customerPhone, [...(por.get(f.customerPhone) ?? []), f]);
      return [...por].map(([customerPhone, fs]) => ({
        customerPhone,
        _count: { _all: fs.length },
        _sum: { total: fs.reduce((s, f) => s + f.total, 0) },
        _max: { createdAt: fs.reduce<Date | null>((m, f) => (!m || f.createdAt > m ? f.createdAt : m), null) },
      }));
    });
  const tx = {
    order: { groupBy: vi.fn((a: { where: Record<string, unknown> }) => agrupar(datos.pedidos)(a)) },
    sale: { groupBy: vi.fn((a: { where: Record<string, unknown> }) => agrupar(datos.ventas)(a)) },
  };
  return { tx, datos };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/prisma-rls", () => ({ withRlsTx: (_t: string, fn: (t: typeof tx) => unknown) => fn(tx) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn(), invalidate: vi.fn() }));

import { CustomersDB } from "@/lib/db/customers.db";

const AHORA = new Date("2026-10-10T15:00:00.000Z");
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 86_400_000);
const pedido = (tel: string | null, status: string, total: number, dias: number, tenantId = "t1"): Fila => ({ tenantId, customerPhone: tel, status, total, createdAt: hace(dias) });
const venta = (tel: string | null, total: number, dias: number, tenantId = "t1"): Fila => ({ tenantId, customerPhone: tel, total, createdAt: hace(dias) });

beforeEach(() => {
  vi.clearAllMocks();
  datos.pedidos = [
    // QA Sec de main: 9 pedidos hace ~5 meses, uno solo entregado.
    ...Array.from({ length: 5 }, () => pedido("916409675", "pendiente", 21.14, 155)),
    pedido("916409675", "confirmado", 12.65, 157),
    pedido("916409675", "confirmado", 12.65, 157),
    pedido("916409675", "preparando", 91.5, 157),
    pedido("916409675", "entregado", 7.2, 157),
    // Cancelado: ni compra ni gasto.
    pedido("922222222", "cancelado", 50, 2),
    // Otro tenant con el mismo teléfono: no entra.
    pedido("916409675", "entregado", 999, 1, "t2"),
    // Sin teléfono: no es de nadie.
    pedido(null, "entregado", 10, 1),
  ];
  datos.ventas = [
    // El mismo celular escrito con prefijo en el POS.
    venta("+51 922 222 222", 30.1, 3),
    venta("922222222", 19.9, 40),
  ];
});

describe("CustomersDB.comprasPorCliente", () => {
  it("gastado = pedidos entregados + ventas; compras = no cancelados + ventas", async () => {
    const m = await CustomersDB.comprasPorCliente("t1", AHORA);
    expect(m.get("916409675")).toEqual({ compras: 9, gastado: 7.2, cerradas: 1, ultimaCompra: hace(155).toISOString(), compras30d: 0 });
  });

  it("cruza el teléfono por sus últimos 9 dígitos y no cuenta el cancelado", async () => {
    const m = await CustomersDB.comprasPorCliente("t1", AHORA);
    expect(m.get("922222222")).toEqual({ compras: 2, gastado: 50, cerradas: 2, ultimaCompra: hace(3).toISOString(), compras30d: 1 });
  });

  it("no mezcla tenants ni cuenta lo que no tiene teléfono", async () => {
    const m = await CustomersDB.comprasPorCliente("t1", AHORA);
    expect([...m.keys()].sort()).toEqual(["916409675", "922222222"]);
    for (const c of tx.order.groupBy.mock.calls) expect(c[0].where.tenantId).toBe("t1");
    for (const c of tx.sale.groupBy.mock.calls) expect(c[0].where.tenantId).toBe("t1");
  });

  it("suma en céntimos: 0,1 + 0,2 no deja 0,30000000000000004", async () => {
    datos.pedidos = [pedido("933333333", "entregado", 0.1, 1), pedido("933333333", "entregado", 0.2, 1)];
    datos.ventas = [];
    const m = await CustomersDB.comprasPorCliente("t1", AHORA);
    expect(m.get("933333333")?.gastado).toBe(0.3);
  });
});
