/**
 * Un pago por mes (ADR-524): el replay idéntico es éxito (`duplicado`), otro
 * pago para el mismo mes es `periodo_ya_pagado`, un mes fuera del contrato es
 * `periodo_fuera_de_plazo` y un alquiler de otro negocio es `not_found`.
 *
 * Prisma en memoria con el único `(alquilerId, periodo)` → P2002 de verdad,
 * para que el camino que se prueba sea el del choque en la base, no un `if`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown>;

const h = vi.hoisted(() => {
  const db = { alquiler: [] as Fila[], alquilerPago: [] as Fila[] };
  const coincide = (f: Fila, where: Fila = {}) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === "object" && !(v instanceof Date) && "in" in (v as Fila)) {
        return ((v as { in: unknown[] }).in).includes(f[k]);
      }
      return (f[k] ?? null) === (v ?? null);
    });
  const conPagos = (a: Fila, include?: Fila) =>
    include?.pagos ? { ...a, pagos: db.alquilerPago.filter((p) => p.alquilerId === a.id) } : a;
  let n = 0;
  const prisma = {
    alquiler: {
      findFirst: vi.fn(async ({ where, include }: { where: Fila; include?: Fila }) => {
        const a = db.alquiler.find((f) => coincide(f, where));
        return a ? conPagos(a, include) : null;
      }),
      findMany: vi.fn(async ({ where, include }: { where: Fila; include?: Fila }) =>
        db.alquiler.filter((f) => coincide(f, where)).map((a) => conPagos(a, include)),
      ),
    },
    alquilerPago: {
      findFirst: vi.fn(async ({ where }: { where: Fila }) => db.alquilerPago.find((f) => coincide(f, where)) ?? null),
      create: vi.fn(async ({ data }: { data: Fila }) => {
        if (db.alquilerPago.some((p) => p.alquilerId === data.alquilerId && p.periodo === data.periodo)) {
          throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        }
        const fila = { id: `pago${++n}`, createdAt: new Date("2026-10-30T15:00:00Z"), ...data };
        db.alquilerPago.push(fila);
        return fila;
      }),
    },
    forestParty: { findMany: vi.fn(async () => []) },
    document: { findMany: vi.fn(async () => []) },
  };
  return { db, prisma, logActivity: vi.fn(async () => undefined) };
});

vi.mock("@/lib/prisma", () => ({ prisma: h.prisma }));
vi.mock("@/lib/cache", () => ({
  getOrSet: (_k: string, _ttl: number, fn: () => unknown) => fn(),
  invalidateByPrefix: vi.fn(),
}));
vi.mock("@/lib/activity-logger", () => ({ logActivity: h.logActivity }));

import { AlquileresDB } from "@/lib/db/alquileres.db";

const T = "tenant-a";
const ALQ = "alq1";

function alquiler(over: Fila = {}): Fila {
  return {
    id: ALQ,
    tenantId: T,
    nombre: "Local Constitución",
    direccion: null,
    partidaSunarp: null,
    manzana: null,
    lote: null,
    areaM2: null,
    ubigeo: null,
    duenoParteId: null,
    duenoTexto: "Drucila",
    inquilinoParteId: null,
    inquilinoTexto: "Agrobanco",
    nuestroPapel: "gestor",
    rentaMensual: "1500.00",
    moneda: "PEN",
    incluyeImpuestos: null,
    diaPago: 5,
    garantiaMonto: null,
    garantiaPagada: null,
    garantiaPagadaEl: null,
    garantiaDevueltaEl: null,
    inicioEl: new Date("2026-01-01T00:00:00Z"),
    finEl: new Date("2027-12-31T00:00:00Z"),
    renovacionAutomatica: false,
    avisoNoRenovarDias: null,
    reajuste: null,
    contratoDocumentId: null,
    cuentaBanco: null,
    cuentaCci: null,
    cuentaTitular: null,
    estado: "vigente",
    notas: null,
    deletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  };
}

const pago = { periodo: "2026-10", monto: 1500, pagadoEl: "2026-10-05", medio: "transferencia" as const, numeroOperacion: "778899" };

beforeEach(() => {
  h.db.alquiler.length = 0;
  h.db.alquilerPago.length = 0;
  h.db.alquiler.push(alquiler(), alquiler({ id: "alqB", tenantId: "tenant-b" }));
  h.logActivity.mockClear();
});

describe("AlquileresDB.registrarPago", () => {
  it("el primero se crea con monto en soles exactos y deja audit", async () => {
    const r = await AlquileresDB.registrarPago(T, ALQ, pago, "brandon");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.duplicado).toBe(false);
    expect(r.pago).toMatchObject({ periodo: "2026-10", monto: 1500, pagadoEl: "2026-10-05" });
    expect(h.db.alquilerPago[0]?.monto).toBe("1500.00");
    expect(r.alquiler.pagos).toHaveLength(1);
    expect(h.logActivity).toHaveBeenCalledTimes(1);
  });

  it("replay idéntico (mismo mes + monto + día) → duplicado, sin segundo pago ni audit", async () => {
    await AlquileresDB.registrarPago(T, ALQ, pago, "brandon");
    const r = await AlquileresDB.registrarPago(T, ALQ, { ...pago, numeroOperacion: "otra-op" }, "brandon");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.duplicado).toBe(true);
    expect(h.db.alquilerPago).toHaveLength(1);
    expect(h.logActivity).toHaveBeenCalledTimes(1);
  });

  it("1500.004 es el mismo monto que 1500 (céntimos, no float)", async () => {
    await AlquileresDB.registrarPago(T, ALQ, pago, "brandon");
    const r = await AlquileresDB.registrarPago(T, ALQ, { ...pago, monto: 1500.004 }, "brandon");
    expect(r.ok && r.duplicado).toBe(true);
  });

  it("otro monto para el mismo mes → periodo_ya_pagado con el pago que ya está", async () => {
    await AlquileresDB.registrarPago(T, ALQ, pago, "brandon");
    const r = await AlquileresDB.registrarPago(T, ALQ, { ...pago, monto: 1400 }, "brandon");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("periodo_ya_pagado");
    expect("pago" in r && r.pago.monto).toBe(1500);
    expect(h.db.alquilerPago).toHaveLength(1);
  });

  it("otro día para el mismo mes → periodo_ya_pagado", async () => {
    await AlquileresDB.registrarPago(T, ALQ, pago, "brandon");
    const r = await AlquileresDB.registrarPago(T, ALQ, { ...pago, pagadoEl: "2026-10-06" }, "brandon");
    expect(!r.ok && r.error).toBe("periodo_ya_pagado");
  });

  it("mes antes del inicio o después del fin → periodo_fuera_de_plazo, sin escribir", async () => {
    const antes = await AlquileresDB.registrarPago(T, ALQ, { ...pago, periodo: "2025-12" }, "brandon");
    const despues = await AlquileresDB.registrarPago(T, ALQ, { ...pago, periodo: "2028-01" }, "brandon");
    expect(!antes.ok && antes.error).toBe("periodo_fuera_de_plazo");
    expect(!despues.ok && despues.error).toBe("periodo_fuera_de_plazo");
    expect(h.prisma.alquilerPago.create).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ periodo: "2025-12" }) }));
    expect(h.db.alquilerPago).toHaveLength(0);
  });

  it("alquiler de otro negocio → not_found (el tenant va en el WHERE)", async () => {
    const r = await AlquileresDB.registrarPago(T, "alqB", pago, "brandon");
    expect(!r.ok && r.error).toBe("not_found");
    expect(h.db.alquilerPago).toHaveLength(0);
    expect(h.prisma.alquiler.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: T, id: "alqB" }) }),
    );
  });

  it("alquiler borrado → not_found", async () => {
    h.db.alquiler[0] = alquiler({ deletedAt: new Date() });
    const r = await AlquileresDB.registrarPago(T, ALQ, pago, "brandon");
    expect(!r.ok && r.error).toBe("not_found");
  });

  it("sin tenant → tira (nunca un fallback)", async () => {
    await expect(AlquileresDB.registrarPago("", ALQ, pago, "brandon")).rejects.toThrow(/tenantId/);
  });
});
