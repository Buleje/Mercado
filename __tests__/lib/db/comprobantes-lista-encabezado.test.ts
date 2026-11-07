import { beforeEach, describe, expect, it, vi } from "vitest";

/** Los filtros del encabezado de Facturas y boletas se arman en la base, por negocio, y son opcionales. */
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: { sunatInvoice: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0), groupBy: vi.fn(async () => []) } },
}));

import { ComprobantesSeguimientoDB } from "@/lib/db/comprobantes-seguimiento.db";
import { prisma } from "@/lib/prisma";

const base = { rango: { desde: null, hasta: null }, busqueda: null, tipos: [], estados: [], origen: null, limite: 200 } as never;
const findMany = prisma.sunatInvoice.findMany as unknown as ReturnType<typeof vi.fn>;
const dondeUsado = () => findMany.mock.calls[0][0].where as { tenantId: string; AND: unknown[] };

describe("ComprobantesSeguimientoDB.listar · filtros del encabezado", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sin parámetros nuevos, la consulta es la de siempre", async () => {
    await ComprobantesSeguimientoDB.listar("t1", base);
    expect(dondeUsado()).toEqual({ tenantId: "t1", AND: [] });
  });

  it("cliente filtra por nombre o RUC/DNI, sin importar mayúsculas", async () => {
    await ComprobantesSeguimientoDB.listar("t1", { ...(base as object), cliente: " perez " } as never);
    expect(dondeUsado().AND).toEqual([
      { OR: [{ customerName: { contains: "perez", mode: "insensitive" } }, { customerRuc: { contains: "perez" } }] },
    ]);
  });

  it("serie-número y monto se combinan", async () => {
    await ComprobantesSeguimientoDB.listar("t1", { ...(base as object), serieNumero: "B001-12", montoMin: 10, montoMax: 50 } as never);
    expect(dondeUsado().AND).toEqual([
      { AND: [{ series: { contains: "B001", mode: "insensitive" } }, { number: 12 }] },
      { total: { gte: 10, lte: 50 } },
    ]);
  });

  it("no cruza negocios: el tenant siempre es el que llega", async () => {
    await ComprobantesSeguimientoDB.listar("t2", { ...(base as object), cliente: "x" } as never);
    expect(dondeUsado().tenantId).toBe("t2");
    expect((prisma.sunatInvoice.count as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0].where.tenantId).toBe("t2");
  });
});
