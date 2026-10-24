/**
 * «Anular el día» de la tira de producción (Brandon, 2026-09-23: «al pasar el
 * mouse sobre el día tenga opción para eliminar esa cubicación de ese día»).
 *
 * Lo que se fija acá es lo que ningún tipo ve:
 *  · qué impide anular en bloque (materia prima, trozas, reproceso, despacho,
 *    lotes, apartado, aserrío cobrado) y cómo se dice, con N.º y especie;
 *  · que el servidor anula TODAS o NINGUNA: si el día cambió entre la previa
 *    y el clic, o si una corrida tiene algo colgando, no se escribe nada;
 *  · que cada línea se anula con `ForestCtpDB.anularLineaEn` —la misma
 *    escritura del botón «Anular» de una fila— dentro de UNA transacción, y
 *    queda auditada;
 *  · la ruta: roles, CSRF, Zod y el estado HTTP de cada error.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    forestCtpEntry: { findMany: vi.fn() },
    forestLoteAserrio: { findMany: vi.fn(async () => []) },
    forestCuentaMov: { findMany: vi.fn(async () => []) },
  };
  return {
    tx,
    prisma: {
      forestCtpEntry: { findFirst: vi.fn(), findMany: vi.fn() },
      forestLoteAserrio: { findMany: vi.fn(async () => []) },
      forestCuentaMov: { findMany: vi.fn(async () => []) },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
    anularLineaEn: vi.fn(),
    jornadas: vi.fn(),
    cerrado: vi.fn(async (): Promise<unknown> => null),
    audit: vi.fn(),
    requireAdmin: vi.fn(),
    csrf: vi.fn((): unknown => null),
    previa: vi.fn(),
    anular: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: H.prisma }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: H.audit }));
vi.mock("@/lib/db/forest-ctp.db", () => ({
  ForestCtpDB: { anularLineaEn: H.anularLineaEn, jornadasDeProduccion: H.jornadas },
}));
vi.mock("@/lib/db/forest-ctp-cierre.db", () => ({
  ForestCtpCierreDB: { closedPeriodOf: H.cerrado },
}));
vi.mock("@/lib/db/forest-ctp-consumo.db", () => ({
  CTP_TX_OPTS: { timeout: 20_000 },
  CtpInvariantError: class extends Error {},
}));

import {
  anularDiaSchema,
  bloqueosDe,
  motivoDeLaLinea,
  renglonesDeBloqueo,
  resumenParaConfirmar,
  type HechosDeCorrida,
} from "@/lib/forestal/anular-dia-produccion";
import { ForestCtpAnularDiaDB } from "@/lib/db/forest-ctp-anular-dia.db";

const limpia = (x: Partial<HechosDeCorrida> = {}): HechosDeCorrida => ({
  id: "c1",
  lineNo: 30,
  especie: "Panguana",
  consumoM3: 0,
  consumoCongelado: false,
  trozas: 0,
  reprocesosEntrada: 0,
  reprocesadaEn: [],
  despachos: [],
  lotesComerciales: 0,
  lotesAserrio: [],
  apartados: [],
  cargoAserrio: null,
  ...x,
});

describe("qué impide anular una corrida en bloque", () => {
  it("una corrida sin nada colgando se puede anular", () => {
    expect(bloqueosDe(limpia())).toEqual([]);
  });

  it("dice cada motivo con su dato", () => {
    const m = bloqueosDe(
      limpia({
        consumoM3: 2.5,
        consumoCongelado: true,
        trozas: 12,
        reprocesosEntrada: 1,
        reprocesadaEn: [41, 42],
        despachos: [{ lineNo: 7, gtf: "001-000123" }],
        lotesComerciales: 1,
        lotesAserrio: ["LA-2609-001"],
        apartados: ["WASACO"],
        cargoAserrio: { monto: 1619.45, parte: "WASACO" },
      }),
    );
    expect(m).toEqual([
      "tiene 2.500 m³ de materia prima atribuida, con el costo ya congelado",
      "tiene 12 trozas vinculadas",
      "sale de un reproceso",
      "se reprocesó en las corridas N.º 41 y 42",
      "salió en el despacho N.º 7 (GTF 001-000123)",
      "está en un lote comercial",
      "cerró el lote de aserrío LA-2609-001",
      "está apartada para WASACO",
      expect.stringMatching(
        /^tiene cobrado el aserrío \(S\/\s?1,619\.45 a WASACO\): quita primero ese cargo de su cuenta$/,
      ),
    ]);
  });

  it("un renglón por corrida bloqueada, con N.º y especie", () => {
    expect(
      renglonesDeBloqueo([
        { id: "a", lineNo: 30, especie: "Panguana", bloqueos: ["tiene 1 troza vinculada"] },
        {
          id: "b",
          lineNo: 31,
          especie: null,
          bloqueos: ["sale de un reproceso", "está en un lote comercial"],
        },
      ]),
    ).toEqual([
      "N.º 30 · Panguana: tiene 1 troza vinculada",
      "N.º 31 · sin especie: sale de un reproceso; está en un lote comercial",
    ]);
  });
});

describe("lo que se confirma", () => {
  it("PT primero, después m³, piezas y el dueño sin «De tercero ·»", () => {
    expect(
      resumenParaConfirmar({
        total: { corridas: 6, pt: 3239, m3: 7.639, piezas: 111 },
        duenos: ["De tercero · WASACO"],
      }),
    ).toBe("6 corridas · 3,239 PT · 7.639 m³ · 111 pza · WASACO");
  });

  it("una corrida chica no dice «0 PT»", () => {
    expect(
      resumenParaConfirmar({ total: { corridas: 1, pt: 0, m3: 0.001, piezas: 0 }, duenos: [] }),
    ).toBe("1 corrida · 0.001 m³");
  });

  it("el motivo de cada línea dice de qué día salió", () => {
    expect(motivoDeLaLinea("  Cargado dos veces ", "lunes 07/09", 6)).toBe(
      "Cargado dos veces · anulada con el resto del lunes 07/09 (6 corridas)",
    );
  });

  it("el pedido sin motivo o sin corridas no pasa Zod", () => {
    expect(anularDiaSchema.safeParse({ dia: "2026-09-07", ids: ["a"], motivo: "  " }).success).toBe(
      false,
    );
    expect(anularDiaSchema.safeParse({ dia: "2026-09-07", ids: [], motivo: "error" }).success).toBe(
      false,
    );
    expect(
      anularDiaSchema.safeParse({ dia: "07/09/2026", ids: ["a"], motivo: "error" }).success,
    ).toBe(false);
    expect(
      anularDiaSchema.safeParse({ dia: "2026-09-07", ids: ["a"], motivo: "error" }).success,
    ).toBe(true);
  });
});

/* ── La transacción ────────────────────────────────────────────────────────── */

const FILA = (
  id: string,
  lineNo: number,
  especie: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  lineNo,
  speciesCommon: especie,
  consumos: [],
  _count: { trozasConsumidas: 0, reprocesosEntrada: 0 },
  reprocesosSalida: [],
  salidas: [],
  loteMiembros: [],
  apartados: [],
  ...extra,
});

describe("ForestCtpAnularDiaDB.anular", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.prisma.forestCtpEntry.findFirst.mockResolvedValue({
      entryDate: new Date("2026-09-07T00:00:00.000Z"),
    });
    H.jornadas.mockResolvedValue([
      {
        dia: "2026-09-07",
        corridas: 2,
        m3: 1.5,
        pt: 636,
        piezas: 20,
        detalle: { duenos: [{ etiqueta: "De tercero · WASACO", corridas: 2 }] },
      },
    ]);
    H.tx.$queryRaw.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    H.tx.forestCtpEntry.findMany.mockResolvedValue([
      FILA("a", 30, "Panguana"),
      FILA("b", 31, "Cumala"),
    ]);
    H.anularLineaEn.mockImplementation(async (_db: unknown, _t: string, id: string) => ({
      id,
      lineNo: id === "a" ? 30 : 31,
      speciesCommon: id === "a" ? "Panguana" : "Cumala",
    }));
  });

  const pedido = { dia: "2026-09-07", ids: ["b", "a"], motivo: "Cargado dos veces" };

  it("anula todas con la MISMA escritura de una fila, en la transacción, y audita cada una", async () => {
    const r = await ForestCtpAnularDiaDB.anular("t1", pedido, "brandon");
    expect(H.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(H.anularLineaEn).toHaveBeenCalledTimes(2);
    for (const call of H.anularLineaEn.mock.calls) {
      expect(call[0]).toBe(H.tx);
      expect(call[1]).toBe("t1");
      expect(call[3]).toBe("Cargado dos veces · anulada con el resto del lunes 07/09 (2 corridas)");
    }
    /* En orden de id (el mismo del lock), para no abrazarse con otro pedido. */
    expect(H.anularLineaEn.mock.calls.map((c) => c[2])).toEqual(["a", "b"]);
    expect(r.anuladas.map((a) => a.lineNo)).toEqual([30, 31]);
    expect(r.total).toEqual({ corridas: 2, pt: 636, m3: 1.5, piezas: 20 });
    expect(H.audit).toHaveBeenCalledTimes(2);
    expect(H.audit.mock.calls[0]![0]).toMatchObject({
      tenantId: "t1",
      action: "ctp_linea_annul",
      user: "brandon",
    });
    expect(H.audit.mock.calls[0]![0].detail).toContain("WASACO");
  });

  it("si el día cambió desde la previa, no anula nada", async () => {
    H.tx.$queryRaw.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
    await expect(ForestCtpAnularDiaDB.anular("t1", pedido)).rejects.toMatchObject({
      code: "DIA_CAMBIO",
    });
    expect(H.anularLineaEn).not.toHaveBeenCalled();
    expect(H.audit).not.toHaveBeenCalled();
  });

  it("si UNA corrida tiene algo colgando, no anula ninguna y dice cuál", async () => {
    H.tx.forestCtpEntry.findMany.mockResolvedValue([
      FILA("a", 30, "Panguana"),
      FILA("b", 31, "Cumala", { _count: { trozasConsumidas: 4, reprocesosEntrada: 0 } }),
    ]);
    const e = await ForestCtpAnularDiaDB.anular("t1", pedido).catch((x: unknown) => x);
    expect(e).toMatchObject({ code: "CON_MOVIMIENTOS" });
    expect((e as Error).message).toContain("N.º 31 · Cumala: tiene 4 trozas vinculadas");
    expect(H.anularLineaEn).not.toHaveBeenCalled();
  });

  it("el aserrío cobrado a un tercero también frena (es plata en la cuenta de otro)", async () => {
    H.tx.forestCuentaMov.findMany.mockResolvedValue([
      { ctpEntryId: "a", monto: 120, parteNombre: "WASACO" },
    ] as never);
    await expect(ForestCtpAnularDiaDB.anular("t1", pedido)).rejects.toMatchObject({
      code: "CON_MOVIMIENTOS",
    });
    expect(H.anularLineaEn).not.toHaveBeenCalled();
  });

  it("un mes cerrado no abre la transacción", async () => {
    H.cerrado.mockResolvedValueOnce({ label: "setiembre 2026", periodKey: "2026-09" });
    await expect(ForestCtpAnularDiaDB.anular("t1", pedido)).rejects.toMatchObject({
      code: "PERIODO_CERRADO",
    });
    expect(H.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("un día sin corridas vivas es 404, no un éxito vacío", async () => {
    H.prisma.forestCtpEntry.findFirst.mockResolvedValueOnce(null);
    await expect(ForestCtpAnularDiaDB.anular("t1", pedido)).rejects.toMatchObject({
      code: "SIN_CORRIDAS",
    });
  });
});

/* ── La ruta ───────────────────────────────────────────────────────────────── */

describe("POST /api/admin/forestal/ctp/anular-dia", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/lib/require-admin", () => ({ requireAdmin: H.requireAdmin }));
    vi.doMock("@/lib/auth/csrf", () => ({ assertCsrf: H.csrf }));
    vi.doMock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
    vi.doMock("@/lib/specializations", () => ({
      isSpecializationEnabled: vi.fn(async () => true),
    }));
    vi.doMock("@/lib/api-handler", () => ({ withApiHandler: (_n: string, fn: unknown) => fn }));
    vi.doMock("@/lib/db/forest-ctp-anular-dia.db", () => ({
      ForestCtpAnularDiaDB: { previa: H.previa, anular: H.anular },
    }));
    H.requireAdmin.mockReset();
    H.requireAdmin.mockResolvedValue({ tenantId: "t1", username: "brandon" });
    H.anular.mockReset();
  });

  const post = (body: unknown) =>
    new NextRequest("http://x/api/admin/forestal/ctp/anular-dia", {
      method: "POST",
      body: JSON.stringify(body),
    });

  it("pide admin u owner, como anular una fila del libro", async () => {
    const { POST } = await import("@/app/api/admin/forestal/ctp/anular-dia/route");
    H.requireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: "forbidden" }, { status: 403 }),
    );
    const r = await POST(post({ dia: "2026-09-07", ids: ["a"], motivo: "error" }));
    expect(r.status).toBe(403);
    expect(H.requireAdmin.mock.calls[0]![1]).toEqual(["admin", "owner"]);
    expect(H.anular).not.toHaveBeenCalled();
  });

  it("valida con Zod antes de tocar la base", async () => {
    const { POST } = await import("@/app/api/admin/forestal/ctp/anular-dia/route");
    const r = await POST(post({ dia: "2026-09-07", ids: [], motivo: "" }));
    expect(r.status).toBe(400);
    expect(H.anular).not.toHaveBeenCalled();
  });

  it("cada error del negocio con su estado", async () => {
    const { POST } = await import("@/app/api/admin/forestal/ctp/anular-dia/route");
    const { AnularDiaError } = await import("@/lib/forestal/anular-dia-produccion");
    for (const [code, estado] of [
      ["CON_MOVIMIENTOS", 409],
      ["DIA_CAMBIO", 409],
      ["PERIODO_CERRADO", 422],
      ["SIN_CORRIDAS", 404],
    ] as const) {
      H.anular.mockRejectedValueOnce(new AnularDiaError(code, "x"));
      const r = await POST(post({ dia: "2026-09-07", ids: ["a"], motivo: "error" }));
      expect(r.status).toBe(estado);
      expect(await r.json()).toMatchObject({ error: code, message: "x" });
    }
  });

  it("el tenant sale de la sesión, no del cuerpo", async () => {
    const { POST } = await import("@/app/api/admin/forestal/ctp/anular-dia/route");
    H.anular.mockResolvedValueOnce({ dia: "2026-09-07", anuladas: [], total: {} });
    await POST(post({ dia: "2026-09-07", ids: ["a"], motivo: "error", tenantId: "otro" }));
    expect(H.anular.mock.calls[0]![0]).toBe("t1");
  });
});

describe("el día tiene que existir en el calendario (security 23-09)", () => {
  it("«2026-13-45» y «2026-02-30» se rechazan; «2026-09-07» pasa", async () => {
    const { previaAnularDiaSchema, anularDiaSchema } = await import("@/lib/forestal/anular-dia-produccion");
    expect(previaAnularDiaSchema.safeParse({ dia: "2026-13-45" }).success).toBe(false);
    expect(previaAnularDiaSchema.safeParse({ dia: "2026-02-30" }).success).toBe(false);
    expect(previaAnularDiaSchema.safeParse({ dia: "2026-09-07" }).success).toBe(true);
    expect(anularDiaSchema.safeParse({ dia: "2026-02-30", ids: ["x"], motivo: "Cargada por error" }).success).toBe(false);
  });
});
