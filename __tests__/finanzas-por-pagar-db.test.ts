/**
 * F10 «Lo que debo» — la clase de lectura contra una base falsa.
 *
 * Lo que la función pura no ve: que cada consulta va con el tenant, que lo
 * pagado/cancelado no llega, que los adelantos se piden por dirección (el
 * barrido de ADR-448) y que los préstamos son sólo los RECIBIDOS.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type Where = Record<string, unknown>;

const H = vi.hoisted(() => {
  const llamadas: { modelo: string; metodo: string; args: { where?: Record<string, unknown> } | undefined }[] = [];
  const respuestas: Record<string, (w: Record<string, unknown>) => unknown> = {};
  const modelo = (nombre: string) =>
    new Proxy({}, {
      get: (_t, metodo: string) => async (args: { where?: Record<string, unknown> } | undefined) => {
        llamadas.push({ modelo: nombre, metodo, args });
        const r = respuestas[`${nombre}.${metodo}`];
        if (r) return r(args?.where ?? {});
        return [];
      },
    });
  const prisma = new Proxy({}, { get: (_t, p: string) => (p === "then" ? undefined : modelo(p)) });
  return {
    llamadas, respuestas, prisma,
    saldos: vi.fn(async (..._a: unknown[]) => [] as unknown[]),
    partes: vi.fn(async (..._a: unknown[]) => [] as unknown[]),
    movs: vi.fn(async (..._a: unknown[]) => [] as unknown[]),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("@/lib/db/adelantos.db", () => ({ AdelantosDB: { saldosPorPersona: (...a: unknown[]) => H.saldos(...a) } }));
vi.mock("@/lib/db/forest-directorio.db", () => ({ ForestDirectorioDB: { listarPartes: (...a: unknown[]) => H.partes(...a) } }));
vi.mock("@/lib/db/forest-cuenta.db", () => ({ ForestCuentaDB: { listar: (...a: unknown[]) => H.movs(...a) } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { PorPagarDB } from "@/lib/db/por-pagar.db";

const whereDe = (modelo: string): Where => (H.llamadas.find((c) => c.modelo === modelo)?.args?.where ?? {}) as Where;

beforeEach(() => {
  H.llamadas.length = 0;
  for (const k of Object.keys(H.respuestas)) delete H.respuestas[k];
  H.saldos.mockReset().mockResolvedValue([]);
  H.partes.mockReset().mockResolvedValue([]);
  H.movs.mockReset().mockResolvedValue([]);
});

describe("PorPagarDB.getDetalle", () => {
  it("sin tenant no consulta nada", async () => {
    await expect(PorPagarDB.getDetalle("", "2026-09-29")).rejects.toThrow("tenantId");
    expect(H.llamadas).toHaveLength(0);
  });

  it("toda consulta va con el tenant, también las de las clases hermanas", async () => {
    await PorPagarDB.getDetalle("t1", "2026-09-29");
    const modelos = H.llamadas.map((c) => c.modelo).sort();
    expect(modelos).toEqual(["adelanto", "adelantoBeneficiario", "payable", "prestamo"]);
    for (const c of H.llamadas) expect(c.args?.where?.tenantId).toBe("t1");
    expect(H.saldos).toHaveBeenCalledWith("t1", { direccion: "todas" });
    expect(H.partes).toHaveBeenCalledWith("t1", { incluirInactivos: true });
    expect(H.movs).toHaveBeenCalledWith("t1");
  });

  it("adelantos por dirección: recibido con saldo o dado excedido, sin cancelados ni liquidados", async () => {
    await PorPagarDB.getDetalle("t1", "2026-09-29");
    expect(whereDe("adelanto")).toEqual({
      tenantId: "t1",
      status: { in: ["ABIERTO", "EXCEDIDO"] },
      OR: [
        { direccion: "RECIBIDO", saldoPendiente: { gt: 0 } },
        { direccion: "DADO", saldoPendiente: { lt: 0 } },
      ],
    });
  });

  it("cuentas por pagar sin las pagadas; préstamos sólo RECIBIDOS vivos con cuotas impagas", async () => {
    await PorPagarDB.getDetalle("t1", "2026-09-29");
    expect(whereDe("payable")).toEqual({ tenantId: "t1", status: { not: "pagado" } });
    expect(whereDe("prestamo")).toEqual({
      tenantId: "t1",
      direccion: "RECIBIDO",
      status: { in: ["ACTIVO", "VENCIDO"] },
      cuotas: { some: { pagadoEn: null } },
    });
  });

  it("arma las filas con Decimal y fechas de la base (el nombre del proveedor de respaldo)", async () => {
    const dec = (n: number) => ({ toNumber: () => n, toString: () => String(n), toFixed: (d?: number) => n.toFixed(d) });
    H.respuestas["payable.findMany"] = () => [{
      id: "c1", supplierId: "s1", supplierName: "", description: "Clavos", amount: dec(1000), paidAmount: dec(700),
      status: "parcial", dueDate: new Date("2026-09-20T00:00:00Z"), createdAt: new Date("2026-09-02T01:00:00Z"),
      supplier: { name: "Ferretería Lucho" },
    }];
    H.respuestas["adelanto.findMany"] = () => [{
      id: "a1", beneficiarioId: "b1", codigoOperacion: "ADL-2026-0003", reciboManual: null, direccion: "RECIBIDO",
      conceptoRecibido: "SERVICIO", status: "ABIERTO", moneda: "PEN", saldoPendiente: dec(1731),
      fechaAdelanto: new Date("2026-09-19T00:00:00Z"), fechaVencimiento: null, beneficiario: { nombre: "Wasaco" },
    }];
    H.respuestas["adelantoBeneficiario.findMany"] = () => [{ id: "b1", nombre: "Wasaco", documento: null, telefono: null, forestPartyId: null }];
    H.saldos.mockResolvedValue([{ beneficiarioId: "b1", status: "ABIERTO", moneda: "PEN", direccion: "RECIBIDO", saldoPendiente: 1731, cantidad: 1 }]);

    const d = await PorPagarDB.getDetalle("t1", "2026-09-29");
    expect(d.totales).toEqual([{ moneda: "PEN", total: 2031, cuentas: 2, partidas: 2, vencido: 300, cruzable: 0 }]);
    const proveedor = d.personas.find((p) => p.clave === "proveedor:s1");
    expect(proveedor).toMatchObject({ nombre: "Ferretería Lucho", vencido: true });
    // `createdAt` 02/09 01:00 UTC es el 01/09 en Lima.
    expect(proveedor?.partidas[0]).toMatchObject({ monto: 300, vence: "2026-09-20", desde: "2026-09-01" });
    expect(d.personas.find((p) => p.clave === "benef:b1")?.partidas[0]).toMatchObject({ fuente: "adelanto_recibido", monto: 1731, desde: "2026-09-19" });
  });

  it("avisa cuando la cuenta forestal toca el tope de lectura", async () => {
    H.movs.mockResolvedValue(Array.from({ length: 2000 }, (_, i) => ({
      id: `m${i}`, parteId: "p", parteNombre: "P", fecha: "2026-09-01T00:00:00.000Z", tipo: "cargo", concepto: "venta", monto: 1, moneda: "PEN",
      referencia: null, fleteId: null, notas: null,
    })));
    expect((await PorPagarDB.getDetalle("t1", "2026-09-29")).truncado).toBe(true);
  });
});
