/**
 * «Yape se anota solo en la caja» (04-11), carril A: la ruta
 * `POST /api/cash-registers/yape` con la DB class REAL y una base simulada en
 * memoria (cajas, movimientos, ventas). Afirma sobre las filas que quedan, no
 * sobre lo que devuelve un mock.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

type Caja = { id: string; tenantId: string; status: string; openedAt: Date };
type Mov = { id: string; cashRegisterId: string; type: string; method: string; amount: string; description: string; createdAt: Date };
type Venta = { tenantId: string; payment: string; total: string; createdAt: Date };
type Rango = { gte: Date; lte: Date };
type Igual = { equals: string; mode?: string };

const H = vi.hoisted(() => {
  const estado = {
    cajas: [] as Caja[],
    movs: [] as Mov[],
    ventas: [] as Venta[],
    /** Simula a otro pedido que insertó el mismo id entre la lectura y el INSERT. */
    carrera: false,
  };
  const tenantDe = (cajaId: string) => estado.cajas.find((c) => c.id === cajaId)?.tenantId;
  const enRango = (f: Date, r: Rango) => f.getTime() >= r.gte.getTime() && f.getTime() <= r.lte.getTime();
  const igual = (v: string, w: Igual) => v.toLowerCase() === w.equals.toLowerCase();

  const cashMovement = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const tenantId = (where.cashRegister as { tenantId: string }).tenantId;
      const fila = estado.movs.find((m) => {
        if (tenantDe(m.cashRegisterId) !== tenantId) return false;
        if (typeof where.id === "string") return m.id === where.id;
        return (
          m.type === where.type &&
          igual(m.method, where.method as Igual) &&
          m.amount === String(where.amount) &&
          enRango(m.createdAt, where.createdAt as Rango)
        );
      });
      return fila ? { id: fila.id, cashRegisterId: fila.cashRegisterId, createdAt: fila.createdAt } : null;
    }),
    create: vi.fn(async ({ data }: { data: Mov }) => {
      if (estado.carrera) {
        estado.carrera = false;
        estado.movs.push({ ...data, description: "insertado por el otro pedido" });
      }
      if (estado.movs.some((m) => m.id === data.id)) throw Object.assign(new Error("Unique constraint"), { code: "P2002" });
      estado.movs.push({ ...data });
      return { id: data.id, cashRegisterId: data.cashRegisterId };
    }),
  };
  const tx = {
    cashMovement,
    /* `SELECT "status" … WHERE "id" = ${cajaId} AND "tenantId" = ${tenantId} FOR SHARE` */
    $queryRaw: vi.fn(async (_s: TemplateStringsArray, cajaId: string, tenantId: string) => {
      const c = estado.cajas.find((x) => x.id === cajaId && x.tenantId === tenantId);
      return c ? [{ status: c.status }] : [];
    }),
  };
  const prisma = {
    cashMovement,
    cashRegister: {
      findFirst: vi.fn(async ({ where }: { where: { tenantId: string; status: string } }) => {
        const abiertas = estado.cajas
          .filter((c) => c.tenantId === where.tenantId && c.status === where.status)
          .sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime());
        return abiertas[0] ? { id: abiertas[0].id, openedAt: abiertas[0].openedAt } : null;
      }),
    },
    sale: {
      findFirst: vi.fn(async ({ where }: { where: { tenantId: string; payment: Igual; total: string; createdAt: Rango } }) => {
        const v = estado.ventas.find(
          (x) => x.tenantId === where.tenantId && igual(x.payment, where.payment) && x.total === String(where.total) && enRango(x.createdAt, where.createdAt),
        );
        return v ? { createdAt: v.createdAt } : null;
      }),
    },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return {
    estado,
    prisma,
    sesion: { tenantId: "t1", username: "cajero1", role: "cajero" } as { tenantId: string; username: string; role: string },
    requireAdmin: vi.fn(),
    invalidate: vi.fn(),
    invalidarVentasOverview: vi.fn(),
    logActivity: vi.fn(async () => {}),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: H.requireAdmin }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null, getClientIp: () => "127.0.0.1" }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: H.logActivity }));
vi.mock("@/lib/logger", () => ({ logger: H.logger }));
vi.mock("@/lib/cache", () => ({ invalidate: H.invalidate, invalidateByPrefix: vi.fn() }));
vi.mock("@/lib/caja/invalidar-ventas-overview", () => ({ invalidarVentasOverview: H.invalidarVentasOverview }));
vi.mock("@/lib/db-retry", () => ({ withDbRetry: (fn: () => Promise<unknown>) => fn() }));

import { POST } from "@/app/api/cash-registers/yape/route";
import { idDeYapeEntrante, montoDesdeCentimos } from "@/lib/db/cash-registers-movements.db";

const LLAVE = "a".repeat(64);
const APERTURA = new Date("2026-11-04T13:00:00.000Z"); // 08:00 Lima
const AVISO = "2026-11-04T15:30:00.000Z"; // 10:30 Lima

const cuerpo = (extra: Record<string, unknown> = {}) => ({
  llave: LLAVE,
  montoCentimos: 1050,
  pagador: "JUAN P.",
  codigo: "123",
  recibidoEn: AVISO,
  ...extra,
});
const enviar = async (body: unknown) => {
  const r = await POST(
    new NextRequest("http://localhost/api/cash-registers/yape", { method: "POST", body: JSON.stringify(body) }),
  );
  return { status: r.status, json: (await r.json()) as Record<string, unknown> };
};
const yapesDe = (cajaId: string) => H.estado.movs.filter((m) => m.cashRegisterId === cajaId && m.id.startsWith("yape-"));

beforeEach(() => {
  vi.clearAllMocks();
  H.estado.cajas = [
    { id: "caja-t1", tenantId: "t1", status: "abierta", openedAt: APERTURA },
    { id: "caja-t2", tenantId: "t2", status: "abierta", openedAt: APERTURA },
  ];
  H.estado.movs = [];
  H.estado.ventas = [];
  H.estado.carrera = false;
  H.requireAdmin.mockImplementation(async () => H.sesion);
});

describe("POST /api/cash-registers/yape — anotar una vez", () => {
  it("anota S/ 10.50 exacto desde 1050 céntimos, como ingreso yape, e invalida la caché", async () => {
    const r = await enviar(cuerpo());
    expect(r.status).toBe(201);
    expect(r.json).toEqual({ estado: "anotado", movimientoId: idDeYapeEntrante("t1", LLAVE), cajaId: "caja-t1" });
    const [fila] = yapesDe("caja-t1");
    expect(fila).toMatchObject({ amount: "10.50", type: "ingreso", method: "yape", description: "Yape de JUAN P. · cód. 123" });
    expect(fila.createdAt.toISOString()).toBe(AVISO);
    expect(H.invalidarVentasOverview).toHaveBeenCalledWith("t1");
    expect(H.invalidate).toHaveBeenCalledWith("admin:alerts-summary:t1");
  });

  it("montos de borde salen exactos (sin float)", () => {
    expect(montoDesdeCentimos(1)).toBe("0.01");
    expect(montoDesdeCentimos(100)).toBe("1.00");
    expect(montoDesdeCentimos(125_000)).toBe("1250.00");
    expect(montoDesdeCentimos(29)).toBe("0.29");
  });

  it("el mismo aviso 3 veces = 1 sola fila; 2.º y 3.º contestan «ya_estaba»", async () => {
    const a = await enviar(cuerpo());
    const b = await enviar(cuerpo());
    const c = await enviar(cuerpo({ forzar: true }));
    expect(a.json.estado).toBe("anotado");
    expect([b.status, b.json.estado, c.json.estado]).toEqual([200, "ya_estaba", "ya_estaba"]);
    expect(b.json.movimientoId).toBe(a.json.movimientoId);
    expect(yapesDe("caja-t1")).toHaveLength(1);
    expect(H.logActivity).toHaveBeenCalledTimes(1);
  });

  it("ya anotado y la caja se cerró después: sigue diciendo «ya_estaba», no «sin_turno»", async () => {
    await enviar(cuerpo());
    H.estado.cajas[0].status = "cerrada";
    const r = await enviar(cuerpo());
    expect(r.json).toMatchObject({ estado: "ya_estaba", cajaId: "caja-t1" });
  });

  it("P2002 (otro pedido lo insertó entre la lectura y el INSERT) → «ya_estaba», 1 fila", async () => {
    H.estado.carrera = true;
    const r = await enviar(cuerpo());
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ estado: "ya_estaba", movimientoId: idDeYapeEntrante("t1", LLAVE), cajaId: "caja-t1" });
    expect(yapesDe("caja-t1")).toHaveLength(1);
    expect(H.invalidarVentasOverview).not.toHaveBeenCalled();
  });
});

describe("pendientes del backend", () => {
  it("sin caja abierta → pendiente «sin_turno» y no escribe nada", async () => {
    H.estado.cajas[0].status = "cerrada";
    const r = await enviar(cuerpo());
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ estado: "pendiente", motivo: "sin_turno" });
    expect(H.estado.movs).toHaveLength(0);
  });

  it("aviso anterior a la apertura de la caja → pendiente «fuera_de_turno» con las horas de Lima", async () => {
    const r = await enviar(cuerpo({ recibidoEn: "2026-11-04T12:45:00.000Z" }));
    expect(r.json).toMatchObject({ estado: "pendiente", motivo: "fuera_de_turno" });
    expect(String(r.json.detalle)).toContain("07:45");
    expect(String(r.json.detalle)).toContain("08:00");
    expect(H.estado.movs).toHaveLength(0);
  });

  it("«Anotar igual» (forzar) de un aviso anterior a la apertura → caja de ahora, fechado a la apertura", async () => {
    const r = await enviar(cuerpo({ recibidoEn: "2026-11-04T12:45:00.000Z", forzar: true }));
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ estado: "anotado", cajaId: "caja-t1" });
    const [fila] = yapesDe("caja-t1");
    expect(fila.createdAt.toISOString()).toBe(APERTURA.toISOString()); // max(llegada, apertura): el arqueo lo cuenta
    expect(fila.description).toContain("llegó 07:45, antes de abrir la caja");
    expect(fila.amount).toBe("10.50");
  });

  it("sin caja abierta, «forzar» no lo anota: sigue «sin_turno»", async () => {
    H.estado.cajas[0].status = "cerrada";
    const r = await enviar(cuerpo({ recibidoEn: "2026-11-04T12:45:00.000Z", forzar: true }));
    expect(r.json).toMatchObject({ estado: "pendiente", motivo: "sin_turno" });
    expect(H.estado.movs).toHaveLength(0);
  });

  it("venta por Yape del mismo monto 6 min antes → pendiente; con «forzar» se anota", async () => {
    H.estado.ventas.push({ tenantId: "t1", payment: "Yape", total: "10.50", createdAt: new Date("2026-11-04T15:24:00.000Z") });
    const r = await enviar(cuerpo());
    expect(r.json).toMatchObject({ estado: "pendiente", motivo: "venta_yape_parecida" });
    expect(String(r.json.detalle)).toContain("10:24");
    expect(H.estado.movs).toHaveLength(0);

    const f = await enviar(cuerpo({ forzar: true }));
    expect(f.json.estado).toBe("anotado");
    expect(yapesDe("caja-t1")).toHaveLength(1);
  });

  it("la parte Yape de una venta mixta (línea de caja) también cuenta como parecida", async () => {
    H.estado.movs.push({ id: "m-venta", cashRegisterId: "caja-t1", type: "venta", method: "yape", amount: "10.50", description: "Venta s1 · yape", createdAt: new Date("2026-11-04T15:35:00.000Z") });
    const r = await enviar(cuerpo());
    expect(r.json).toMatchObject({ estado: "pendiente", motivo: "venta_yape_parecida" });
  });

  it("venta de otro monto, de hace 11 min, en efectivo o de OTRO negocio → no frena", async () => {
    H.estado.ventas.push(
      { tenantId: "t1", payment: "yape", total: "10.00", createdAt: new Date("2026-11-04T15:30:00.000Z") },
      { tenantId: "t1", payment: "yape", total: "10.50", createdAt: new Date("2026-11-04T15:19:00.000Z") },
      { tenantId: "t1", payment: "efectivo", total: "10.50", createdAt: new Date("2026-11-04T15:30:00.000Z") },
      { tenantId: "t2", payment: "yape", total: "10.50", createdAt: new Date("2026-11-04T15:30:00.000Z") },
    );
    const r = await enviar(cuerpo());
    expect(r.json.estado).toBe("anotado");
  });
});

describe("el negocio sale del JWT, nunca del cuerpo", () => {
  it("un `tenantId` en el cuerpo se ignora: anota en la caja del negocio de la sesión", async () => {
    const r = await enviar(cuerpo({ tenantId: "t2", cashRegisterId: "caja-t2" }));
    expect(r.json).toMatchObject({ estado: "anotado", cajaId: "caja-t1" });
    expect(yapesDe("caja-t2")).toHaveLength(0);
  });

  it("negocio sin caja abierta aunque el cuerpo nombre a otro que sí tiene → «sin_turno»", async () => {
    H.estado.cajas[0].status = "cerrada";
    const r = await enviar(cuerpo({ tenantId: "t2" }));
    expect(r.json).toMatchObject({ estado: "pendiente", motivo: "sin_turno" });
    expect(H.estado.movs).toHaveLength(0);
  });

  it("la misma llave en dos negocios son dos movimientos distintos", async () => {
    await enviar(cuerpo());
    H.sesion.tenantId = "t2";
    try {
      const r = await enviar(cuerpo());
      expect(r.json).toMatchObject({ estado: "anotado", cajaId: "caja-t2" });
      expect(idDeYapeEntrante("t1", LLAVE)).not.toBe(idDeYapeEntrante("t2", LLAVE));
      expect(H.estado.movs).toHaveLength(2);
    } finally {
      H.sesion.tenantId = "t1";
    }
  });

  it("sin sesión → 401 y no lee la base", async () => {
    H.requireAdmin.mockImplementation(async () => NextResponse.json({ error: "No autorizado" }, { status: 401 }));
    const r = await enviar(cuerpo());
    expect(r.status).toBe(401);
    expect(H.prisma.cashRegister.findFirst).not.toHaveBeenCalled();
  });

  it("roles explícitos admin y cajero", async () => {
    await enviar(cuerpo());
    expect(H.requireAdmin.mock.calls[0][1]).toEqual(["admin", "cajero"]);
  });
});

describe("validación del cuerpo (Zod)", () => {
  it.each([
    ["monto en soles con decimales", { montoCentimos: 10.5 }],
    ["monto cero", { montoCentimos: 0 }],
    ["monto sobre el tope", { montoCentimos: 500_001 }],
    ["llave que no es hash", { llave: "op:123" }],
    ["código de 4 dígitos", { codigo: "1234" }],
    ["fecha sin formato ISO", { recibidoEn: "ayer" }],
    ["pagador vacío", { pagador: "   " }],
  ])("%s → 400 y no escribe", async (_n, extra) => {
    const r = await enviar(cuerpo(extra));
    expect(r.status).toBe(400);
    expect(H.estado.movs).toHaveLength(0);
  });
});
