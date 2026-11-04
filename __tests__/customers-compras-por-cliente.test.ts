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
  /**
   * Lo que devuelve la consulta de comprasPorCliente (04-11: una sola, pedidos
   * UNION ALL ventas), armado en JS desde `datos`: una fila por teléfono crudo y
   * fuente, filtrando por el tenant y la fecha que viajan como parámetros ($n).
   * Que la consulta real dé lo mismo que los 5 groupBy de antes se comparó con
   * la base en 8 negocios (salida idéntica).
   */
  const esFecha = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v);
  const filasDe = (filas: Fila[], tenantId: string, desde: Date, pedidos: boolean) => {
    const por = new Map<string, Fila[]>();
    for (const f of filas) {
      if (f.tenantId !== tenantId || f.customerPhone == null) continue;
      por.set(f.customerPhone, [...(por.get(f.customerPhone) ?? []), f]);
    }
    return [...por].map(([tel, fs]) => {
      const vivas = pedidos ? fs.filter((f) => f.status !== "cancelado") : fs;
      const cerradas = pedidos ? fs.filter((f) => f.status === "entregado") : fs;
      return {
        tel,
        vivas: vivas.length,
        ultima: vivas.reduce<Date | null>((m, f) => (!m || f.createdAt > m ? f.createdAt : m), null),
        cerradas: cerradas.length,
        centimos: cerradas.reduce((s, f) => s + Math.round(f.total * 100), 0),
        vivas30: vivas.filter((f) => f.createdAt >= desde).length,
      };
    });
  };
  const tx = {
    $queryRaw: vi.fn(async (_sql: TemplateStringsArray, ...valores: unknown[]) => {
      const tenants = valores.filter((v) => !esFecha(v));
      const desde = new Date(String(valores.find(esFecha)));
      const tenantId = String(tenants[0]);
      return [...filasDe(datos.pedidos, tenantId, desde, true), ...filasDe(datos.ventas, tenantId, desde, false)];
    }),
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
    // Sólo cancelados y sin ventas: ni aparece en el mapa.
    pedido("944444444", "cancelado", 80, 1),
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
    // Una sola consulta y todo parámetro que no es la fecha es el tenant pedido.
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    for (const v of tx.$queryRaw.mock.calls[0].slice(1)) if (!/^\d{4}-/.test(String(v))) expect(v).toBe("t1");
  });

  it("suma en céntimos: 0,1 + 0,2 no deja 0,30000000000000004", async () => {
    datos.pedidos = [pedido("933333333", "entregado", 0.1, 1), pedido("933333333", "entregado", 0.2, 1)];
    datos.ventas = [];
    const m = await CustomersDB.comprasPorCliente("t1", AHORA);
    expect(m.get("933333333")?.gastado).toBe(0.3);
  });
});
