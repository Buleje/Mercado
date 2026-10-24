/**
 * `POST /api/admin/forestal/trozas/medidas-guia` con el título de la ficha
 * (Brandon 05-10, «Completar Blas con el QR»).
 *
 *  · La vista previa dice qué título trae la ficha y si se declara.
 *  · Al aplicar: primero las medidas, después el título por `TituloGuiaDB.declarar`
 *    con el código y la resolución de la ficha. Si el rol no alcanza (almacenero)
 *    o la declaración falla, las medidas quedan y `aplicado.titulo.motivo` dice por qué.
 *  · La ficha de otra guía no escribe nada (422), ni medidas ni título.
 *
 * Sin base: las DB classes simuladas; la ficha es la REAL de 1-19-0313629.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { parsearConsultaGtf } from "@/lib/forestal/serfor-gtf";

const H = vi.hoisted(() => {
  class CtpInvariantError extends Error {
    constructor(message: string, readonly code = "VALIDACION") {
      super(message);
    }
  }
  return {
    CtpInvariantError,
    requireAdmin: vi.fn(),
    leerGuia: vi.fn(),
    aplicar: vi.fn(),
    declarar: vi.fn(),
    idPorCodigo: vi.fn(),
    consultar: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: H.requireAdmin }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: vi.fn(async () => true) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/db/forest-ctp-consumo.db", () => ({ CtpInvariantError: H.CtpInvariantError }));
vi.mock("@/lib/db/forest-medidas-guia.db", () => ({
  MedidasGuiaDB: { leerGuia: H.leerGuia, aplicar: H.aplicar, estadoDeGuias: vi.fn() },
}));
vi.mock("@/lib/db/forest-titulo-guia.db", () => ({ TituloGuiaDB: { declarar: H.declarar } }));
vi.mock("@/lib/db/forest-contrato.db", () => ({ ForestContratoDB: { idPorCodigo: H.idPorCodigo } }));
vi.mock("@/lib/forestal/serfor-gtf-fetch", () => ({ consultarGtfEnSerfor: H.consultar }));

const { POST } = await import("@/app/api/admin/forestal/trozas/medidas-guia/route");

const ficha = parsearConsultaGtf(
  readFileSync(join(__dirname, "fixtures", "serfor-gtf-encontrada.html"), "utf8"),
  "1-19-0313629",
).gtf!;
const TENANT = "cmpxiv6p4000bohvzwl6bnfpv";

const guia = (gtfNumber = "019-0000003") => ({
  gtfNumber,
  ingresos: 1,
  trozas: [{ id: "t1", codificacion: "26/A", d1Cm: null, d2Cm: null, largoM: null, periodoCerrado: null, anulada: false }],
  ficha: { numeroRegistro: "1-19-0313629", gtf: ficha },
  ingresosTitulo: [
    {
      id: "e1", especie: "Ana Caspi", status: "validado", anulado: false,
      originCode: null, originSourceNumber: null, contratoId: null, periodoCerrado: null,
    },
  ],
});

const pedir = (body: unknown) =>
  POST(
    new NextRequest("https://host/api/admin/forestal/trozas/medidas-guia", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );

const sesion = (role: string) =>
  H.requireAdmin.mockImplementation(async () => ({ tenantId: TENANT, role, username: `qa-${role}` }));

beforeEach(() => {
  vi.clearAllMocks();
  H.leerGuia.mockResolvedValue(guia());
  H.idPorCodigo.mockResolvedValue("ctr-blas");
  H.aplicar.mockImplementation(async () => ({
    plan: { llenar: [], yaTenian: [], sinCoincidencia: { libro: [], guia: [] }, ambiguas: [], sinDato: [], largoDistinto: [], bloqueadas: [] },
    escritas: [{ id: "t1", codificacion: "26/A" }],
    omitidas: [],
    fichaGuardadaEn: 0,
  }));
  H.declarar.mockResolvedValue({ originCode: ficha.numeroTitulo, actualizados: [{ id: "e1", especie: "Ana Caspi" }], omitidos: [] });
});

describe("medidas-guia + título de la ficha", () => {
  it("vista previa: dice el título y que se vincula; no escribe nada", async () => {
    sesion("admin");
    const r = await pedir({ gtfNumber: "019-0000003" });
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j.titulo).toMatchObject({ codigo: "19-SEC/PER-FMC-2024-008", estado: "declarar", vinculaPermiso: true, bloqueoRol: null });
    expect(j.plan.llenar.map((f: { codificacion: string }) => f.codificacion)).toEqual(["26/A"]);
    expect(H.leerGuia).toHaveBeenCalledWith(TENANT, "019-0000003");
    expect(H.idPorCodigo).toHaveBeenCalledWith(TENANT, "19-SEC/PER-FMC-2024-008");
    expect(H.aplicar).not.toHaveBeenCalled();
    expect(H.declarar).not.toHaveBeenCalled();
  });

  it("admin: medidas y después el título con el código y la resolución de la ficha", async () => {
    sesion("admin");
    const j = await (await pedir({ gtfNumber: "019-0000003", aplicar: true })).json();
    expect(H.aplicar).toHaveBeenCalledTimes(1);
    expect(H.declarar).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({
        gtfNumber: "019-0000003",
        originCode: "19-SEC/PER-FMC-2024-008",
        originSourceNumber: ficha.numeroResolucion,
        origen: "la ficha SERFOR (registro 1-19-0313629)",
      }),
      "qa-admin",
    );
    expect(H.aplicar.mock.invocationCallOrder[0]).toBeLessThan(H.declarar.mock.invocationCallOrder[0]);
    expect(j.aplicado.titulo).toEqual({ declarados: 1, codigo: "19-SEC/PER-FMC-2024-008", motivo: null });
  });

  it("almacenero: las medidas se guardan y el título queda afuera con el porqué", async () => {
    sesion("almacenero");
    const r = await pedir({ gtfNumber: "019-0000003", aplicar: true });
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(H.aplicar).toHaveBeenCalledTimes(1);
    expect(H.declarar).not.toHaveBeenCalled();
    expect(j.aplicado.escritas).toHaveLength(1);
    expect(j.aplicado.titulo).toMatchObject({ declarados: 0, motivo: expect.stringMatching(/administrador o el dueño/) });
  });

  it("encargado (manager, pasa requireAdmin por el bypass): tampoco declara el título", async () => {
    sesion("manager");
    await pedir({ gtfNumber: "019-0000003", aplicar: true });
    expect(H.aplicar).toHaveBeenCalledTimes(1);
    expect(H.declarar).not.toHaveBeenCalled();
  });

  it("si declarar falla (mes cerrado entre la vista y el guardado), las medidas quedan", async () => {
    sesion("owner");
    H.declarar.mockRejectedValueOnce(new H.CtpInvariantError("No hay ingresos con la guía 019-0000003."));
    const r = await pedir({ gtfNumber: "019-0000003", aplicar: true });
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j.aplicado.escritas).toHaveLength(1);
    expect(j.aplicado.titulo).toEqual({ declarados: 0, codigo: "19-SEC/PER-FMC-2024-008", motivo: "No hay ingresos con la guía 019-0000003." });
  });

  it("el libro ya declara el mismo título: no se llama a declarar", async () => {
    sesion("admin");
    const g = guia();
    g.ingresosTitulo[0] = { ...g.ingresosTitulo[0], originCode: "19-SEC/PER-FMC-2024-008", originSourceNumber: "x", contratoId: "ctr-blas" } as never;
    H.leerGuia.mockResolvedValue(g);
    const j = await (await pedir({ gtfNumber: "019-0000003", aplicar: true })).json();
    expect(j.titulo.estado).toBe("ya_tiene");
    expect(H.declarar).not.toHaveBeenCalled();
    expect(j.aplicado.titulo).toBeNull();
  });

  it("QR de OTRA guía: 422 y no se escribe nada (ni medidas ni título)", async () => {
    sesion("admin");
    H.leerGuia.mockResolvedValue({ ...guia("010-001-0000005"), ficha: null });
    H.consultar.mockResolvedValue({ ok: true, resultado: { estado: "encontrada", gtf: ficha } });
    const r = await pedir({ gtfNumber: "010-001-0000005", numeroRegistro: "1-19-0313629", aplicar: true });
    expect(r.status).toBe(422);
    expect((await r.json()).error).toBe("guia_distinta");
    expect(H.aplicar).not.toHaveBeenCalled();
    expect(H.declarar).not.toHaveBeenCalled();
  });

  it("sin sesión del negocio: 401 y no se lee ninguna guía", async () => {
    H.requireAdmin.mockImplementation(async () => NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    const r = await pedir({ gtfNumber: "019-0000003", aplicar: true });
    expect(r.status).toBe(401);
    expect(H.leerGuia).not.toHaveBeenCalled();
  });
});
