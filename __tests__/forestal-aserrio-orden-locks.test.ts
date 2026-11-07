/**
 * El orden de los locks del cargo de aserrío (revisión ADR-449, seguridad
 * 28-09): la corrida SIEMPRE antes que la persona, y el cargo se relee DENTRO
 * de la transacción, después del lock de la corrida.
 *
 *  · `cobrarCorrida` bloqueaba corrida → parte y `dejarDeCobrar` parte →
 *    corrida: dos pedidos cruzados se esperaban el uno al otro (deadlock).
 *  · `dejarDeCobrar` y `alAnular` leían el cargo ANTES de la transacción: si
 *    la parte cambiaba en ese instante, bloqueaban la parte vieja.
 *
 * Base falsa que anota cada paso en orden: fuera de la transacción el cargo es
 * de `p-vieja`; adentro, ya es de `p-nueva`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => {
  const pasos: string[] = [];
  const cargo = (parteId: string) => ({ id: "mov-1", monto: 150, parteNombre: parteId.toUpperCase(), parteId, referencia: "Corrida N° 7" });
  const tx = {
    $queryRaw: vi.fn(async (partes: TemplateStringsArray) => {
      if (partes.join("?").includes("ForestCtpEntry") && partes.join("?").includes("FOR UPDATE")) pasos.push("corrida");
      return [{ id: "c1" }];
    }),
    $executeRaw: vi.fn(async (_p: TemplateStringsArray, clave: string) => {
      pasos.push(`lock ${clave}`);
      return 0;
    }),
    forestCtpEntry: {
      findFirst: vi.fn(async () => {
        pasos.push("leer corrida");
        return { duenoParteId: "p-nueva" };
      }),
      update: vi.fn(async () => {
        pasos.push("escribir corrida");
        return {};
      }),
    },
    forestCuentaMov: {
      findFirst: vi.fn(async () => {
        pasos.push("leer cargo");
        return cargo("p-nueva");
      }),
      updateMany: vi.fn(async () => {
        pasos.push("baja del cargo");
        return { count: 1 };
      }),
    },
  };
  const prisma = {
    forestCtpEntry: {
      findFirst: vi.fn(async () => ({
        id: "c1",
        lineNo: 7,
        section: "produccion",
        status: "registrado",
        entryDate: new Date("2026-09-20T00:00:00.000Z"),
        duenoParteId: "p-vieja",
        aserrioDetalle: null,
      })),
    },
    /* Fuera de la transacción, la foto vieja. */
    forestCuentaMov: { findFirst: vi.fn(async () => cargo("p-vieja")) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { pasos, tx, prisma, audit: vi.fn() };
});

vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("@/lib/cache", () => ({
  getOrSet: async (_k: string, _ttl: number, fn: () => Promise<unknown>) => fn(),
  invalidate: vi.fn(),
  invalidateByPrefix: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: H.audit, auditCtpEsperando: vi.fn() }));

import { ForestAserrioDB, bloquearCorridaYPartesEnTx } from "@/lib/db/forest-aserrio.db";
import type { Prisma } from "@/lib/generated/prisma/client";

const T = "t1";
const lock = (parte: string) => `lock liq:${T}:parte:${parte}`;

beforeEach(() => {
  H.pasos.length = 0;
  vi.clearAllMocks();
});

describe("bloquearCorridaYPartesEnTx: corrida → cargo releído → personas", () => {
  it("en ese orden, y las personas ordenadas y sin repetir", async () => {
    const r = await bloquearCorridaYPartesEnTx(H.tx as unknown as Prisma.TransactionClient, T, "c1", ["p-extra", "p-nueva"]);
    expect(H.pasos).toEqual(["corrida", "leer corrida", "leer cargo", lock("p-extra"), lock("p-nueva")]);
    expect(r.vivo?.parteId).toBe("p-nueva");
    expect(r.duenoParteId).toBe("p-nueva");
  });
});

describe("dejar de cobrar (cobrarCorrida con dueño null)", () => {
  it("bloquea la corrida ANTES que la persona, y la persona del cargo releído (no la vieja)", async () => {
    const r = await ForestAserrioDB.cobrarCorrida(T, "c1", { duenoParteId: null }, "qa");
    expect(r.accion).toBe("baja");
    const iCorrida = H.pasos.indexOf("corrida");
    const iParte = H.pasos.findIndex((x) => x.startsWith("lock "));
    expect(iCorrida).toBeGreaterThanOrEqual(0);
    expect(iCorrida).toBeLessThan(iParte);
    expect(H.pasos).toContain(lock("p-nueva"));
    /* `p-vieja` es el dueño que se leyó ANTES (sigue bloqueado: es a quién se le deja de cobrar). */
    expect(H.pasos.indexOf("leer cargo")).toBeLessThan(iParte);
    expect(H.pasos.indexOf("escribir corrida")).toBeGreaterThan(iParte);
  });
});

describe("alAnular", () => {
  it("relee el cargo dentro de la transacción y bloquea su persona de AHORA, después de la corrida", async () => {
    expect(await ForestAserrioDB.alAnular(T, "c1", "qa")).toBe(true);
    expect(H.pasos).toEqual(["corrida", "leer corrida", "leer cargo", lock("p-nueva"), "baja del cargo"]);
    expect(H.pasos).not.toContain(lock("p-vieja"));
    expect(String(H.audit.mock.calls[0]?.[0]?.detail)).toContain("P-NUEVA");
  });

  it("sin cargo vivo no abre la transacción", async () => {
    H.prisma.forestCuentaMov.findFirst.mockResolvedValueOnce(null as never);
    expect(await ForestAserrioDB.alAnular(T, "c1", "qa")).toBe(false);
    expect(H.prisma.$transaction).not.toHaveBeenCalled();
  });
});
