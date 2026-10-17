/**
 * El cierre de mes frente al vaciado del libro (security 2026-10-02).
 *
 *  · La fila de cierres se crea ANTES de tomar el candado (`INSERT … ON
 *    CONFLICT DO NOTHING`): sin fila, el `FOR SHARE` del vaciado no tenía qué
 *    bloquear y el primer cierre de un negocio se le colaba.
 *  · Cerrar y reabrir graban bajo el candado exclusivo (`actualizar`) con
 *    espera máxima: un vaciado largo da 409, no el 500 del timeout.
 *  · El acta se arma FUERA del candado: la huella del libro tomada al empezar
 *    se vuelve a medir bajo el candado; si cambió, 409 y no se graba.
 *
 * Sin base: `PlatformSettingsDB.actualizar` simulado (llama a `cambio` con el
 * valor guardado y una `tx` falsa) y los conteos del libro en `H.libro`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => {
  class ClaveOcupadaError extends Error {}
  const libro: Record<string, number> = {};
  const usos: string[] = [];
  const eventos: string[] = [];
  const modelos = (quien: string) => {
    const m = (k: string) => ({
      aggregate: async () => {
        usos.push(quien);
        return { _count: { _all: libro[k] }, _max: { updatedAt: new Date("2026-08-20T12:00:00Z") } };
      },
      count: async () => {
        usos.push(quien);
        return libro[k];
      },
    });
    return {
      woodEntry: m("woodEntry"),
      woodEntryTroza: m("woodEntryTroza"),
      forestCtpEntry: m("forestCtpEntry"),
      forestCtpConsumo: m("forestCtpConsumo"),
      forestCtpDespachoOrigen: m("forestCtpDespachoOrigen"),
    };
  };
  const estado: { valor: unknown } = { valor: null };
  return {
    ClaveOcupadaError,
    libro,
    usos,
    eventos,
    estado,
    tx: modelos("tx"),
    prisma: { ...modelos("prisma"), $executeRaw: vi.fn() },
    actualizar: vi.fn(),
    congelar: vi.fn(),
    requireAdmin: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: { actualizar: H.actualizar, get: async () => H.estado.valor },
  candadoDeClave: (k: string) => `platform-setting:${k}`,
  ClaveOcupadaError: H.ClaveOcupadaError,
}));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: H.requireAdmin }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: vi.fn(async () => true) }));
vi.mock("@/lib/db/forest-ctp-consumo.db", () => ({ ForestCtpConsumoDB: { congelarCosto: H.congelar } }));
vi.mock("@/lib/db/forest-ctp.db", () => ({
  ForestCtpDB: {
    saldos: vi.fn(async () => ({
      porEspecie: [],
      productos: [],
      materiaPrima: { ingresosCount: 0, ingresoM3: 0, especiesEnNegativo: 0 },
    })),
    list: vi.fn(async () => ({ entries: [{ id: "c1" }] })),
  },
}));

const { ForestCtpCierreDB } = await import("@/lib/db/forest-ctp-cierre.db");
const { LibroCambioAlCerrarError, monthRange } = await import("@/lib/forestal/ctp-cierre-types");
const { POST } = await import("@/app/api/admin/forestal/ctp/cierre/route");

const T = "t1";
const KEY = `ctp-cierre:${T}`;
const agosto = () => {
  const m = monthRange(2026, 7);
  return {
    periodKey: m.periodKey,
    from: m.from.toISOString(),
    to: m.to.toISOString(),
    label: m.label,
    closedAt: "2026-09-01T12:00:00.000Z",
    closedBy: "qa",
    saldoCierre: { materiaPrima: [], productos: [] },
    totales: { ingresosCount: 0, volumenIngresado: 0, corridas: 0, despachos: 0, corridasCongeladas: 0, corridasSinCostear: 0, especiesEnNegativo: 0 },
    reabierto: null,
  };
};
const post = (body: unknown) =>
  POST(new NextRequest("https://host/api/admin/forestal/ctp/cierre", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(H.libro, { woodEntry: 3, woodEntryTroza: 10, forestCtpEntry: 4, forestCtpConsumo: 5, forestCtpDespachoOrigen: 1 });
  H.usos.length = 0;
  H.eventos.length = 0;
  H.estado.valor = null;
  H.prisma.$executeRaw.mockImplementation(async () => {
    H.eventos.push("fila");
    return 0;
  });
  H.actualizar.mockImplementation(
    async (_key: string, cambio: (a: unknown, tx: unknown) => Promise<{ valor?: unknown; resultado: unknown }>) => {
      H.eventos.push("candado");
      const r = await cambio(H.estado.valor, H.tx);
      if (r.valor !== undefined) H.estado.valor = r.valor;
      return r.resultado;
    },
  );
  H.requireAdmin.mockResolvedValue({ tenantId: T, username: "dueno", role: "admin" });
  H.congelar.mockResolvedValue([]);
});

describe("ForestCtpCierreDB: candado y huella", () => {
  it("save crea la fila ANTES del candado, espera con tope y graba con la huella intacta", async () => {
    const huella = await ForestCtpCierreDB.huellaDelLibroHasta(T, new Date("2026-08-31T23:59:59Z"));
    H.usos.length = 0;
    await ForestCtpCierreDB.save(T, agosto(), "qa", { huella });

    expect(H.eventos).toEqual(["fila", "candado"]);
    const [strings, key] = H.prisma.$executeRaw.mock.calls[0] as [TemplateStringsArray, string];
    expect(strings.join("?")).toContain("ON CONFLICT (key) DO NOTHING");
    expect(key).toBe(KEY);
    expect(H.actualizar.mock.calls[0][0]).toBe(KEY);
    expect(H.actualizar.mock.calls[0][3]).toMatchObject({ esperaMaxMs: 32_000, timeout: 35_000 });
    // La huella se volvió a medir con la transacción del candado.
    expect(H.usos.length).toBeGreaterThan(0);
    expect(new Set(H.usos)).toEqual(new Set(["tx"]));
    expect(H.estado.valor).toEqual([expect.objectContaining({ periodKey: "2026-08" })]);
  });

  it("si el libro cambió entre el acta y el grabado → LibroCambioAlCerrarError y no se graba", async () => {
    const huella = await ForestCtpCierreDB.huellaDelLibroHasta(T, new Date("2026-08-31T23:59:59Z"));
    H.libro.woodEntryTroza -= 2; // un vaciado borró dos trozas
    await expect(ForestCtpCierreDB.save(T, agosto(), "qa", { huella })).rejects.toBeInstanceOf(LibroCambioAlCerrarError);
    expect(H.estado.valor).toBeNull();
  });

  it("reabrir también crea la fila primero y espera con tope", async () => {
    H.estado.valor = [agosto()];
    await ForestCtpCierreDB.reabrir(T, "2026-08", "corregir una guía", "qa");
    expect(H.eventos).toEqual(["fila", "candado"]);
    expect(H.actualizar.mock.calls[0][3]).toMatchObject({ esperaMaxMs: 32_000 });
    expect(H.estado.valor).toEqual([expect.objectContaining({ reabierto: expect.objectContaining({ motivo: "corregir una guía" }) })]);
  });
});

describe("ruta del cierre: las esperas son 409 en español, nunca 500", () => {
  it("cerrar sin cruces graba el acta", async () => {
    const r = await post({ action: "cerrar", year: 2026, month: 8 });
    expect(r.status).toBe(200);
    expect(H.estado.valor).toEqual([expect.objectContaining({ periodKey: "2026-08" })]);
  });

  it("un vaciado borra filas mientras se congelan los costos → 409 «libro_cambio», sin grabar", async () => {
    H.congelar.mockImplementation(async () => {
      H.libro.forestCtpEntry -= 1;
      return [];
    });
    const r = await post({ action: "cerrar", year: 2026, month: 8 });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "libro_cambio", message: expect.stringMatching(/cambió mientras se cerraba/) });
    expect(H.estado.valor).toBeNull();
  });

  it("cerrar con un vaciado que no suelta el candado → 409 «vaciado_en_curso»", async () => {
    H.actualizar.mockRejectedValueOnce(new H.ClaveOcupadaError(KEY));
    const r = await post({ action: "cerrar", year: 2026, month: 8 });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "vaciado_en_curso", message: expect.stringMatching(/vaciando el Libro/) });
  });

  it("reabrir con un vaciado que no suelta el candado → 409 «vaciado_en_curso»", async () => {
    H.estado.valor = [agosto()];
    H.actualizar.mockRejectedValueOnce(new H.ClaveOcupadaError(KEY));
    const r = await post({ action: "reabrir", periodKey: "2026-08", motivo: "corregir una guía" });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe("vaciado_en_curso");
  });
});
