/**
 * El pago del sábado y «Sus cuentas» son del nivel `completo` de RRHH (admin,
 * dueño). El encargado entra a RRHH pero `requireAdmin` lo deja pasar siempre
 * (management-tier): el 403 lo pone el segundo chequeo de nivel. El negocio
 * sale de la sesión, nunca del cuerpo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const m = vi.hoisted(() => {
  class PagoSemanaError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
      public extra: Record<string, unknown> = {},
    ) {
      super(message);
    }
  }
  return {
    PagoSemanaError,
    requireAdmin: vi.fn(),
    semana: vi.fn(),
    pagar: vi.fn(),
    deshacer: vi.fn(),
    otras: vi.fn(),
  };
});

vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: vi.fn(() => null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: m.requireAdmin }));
vi.mock("@/lib/db/rrhh-pagos.db", () => ({
  PagoSemanaError: m.PagoSemanaError,
  PagosSemanaDB: { semana: m.semana, pagar: m.pagar, deshacer: m.deshacer },
}));
vi.mock("@/lib/db/rrhh-cuentas.db", () => ({ CuentasColaboradorDB: { otras: m.otras } }));

const pago = await import("@/app/api/rrhh/pago-semana/route");
const cuentas = await import("@/app/api/rrhh/colaboradores/[id]/cuentas/route");

const URL_PAGO = "https://host/api/rrhh/pago-semana";
const PAGAR = { colaboradorId: "c1", desde: "2026-10-19", metodo: "efectivo", saleDeCaja: false, netoEsperado: 370 };

function req(method: string, body?: unknown, url = URL_PAGO): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const auth = (role: string) => ({ tenantId: "t1", username: "qauser", role });
const params = { params: Promise.resolve({ id: "c1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  m.semana.mockResolvedValue({ desde: "2026-10-19", filas: [] });
  m.pagar.mockResolvedValue({ gastoId: "g1", calculo: { neto: 370 }, caja: null });
  m.deshacer.mockResolvedValue({ gastoBorrado: true, adelantosReabiertos: 1, caja: { retiro: "no_salio", aviso: null } });
  m.otras.mockResolvedValue({ buscaPor: { documento: true, celular: false }, cuentas: [] });
});

describe("sin sesión", () => {
  it("el 401 de requireAdmin pasa tal cual (nunca un 404 que saque del panel)", async () => {
    m.requireAdmin.mockResolvedValue(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    expect((await pago.GET(req("GET"))).status).toBe(401);
    expect((await pago.POST(req("POST", PAGAR))).status).toBe(401);
    expect((await cuentas.GET(req("GET", undefined, "https://host/api/rrhh/colaboradores/c1/cuentas"), params)).status).toBe(401);
    expect(m.pagar).not.toHaveBeenCalled();
  });
});

describe.each(["manager", "almacenero", "cajero", "superadmin"])("rol %s", (role) => {
  it("403 en ver, pagar, deshacer y sus cuentas; no toca la DB", async () => {
    m.requireAdmin.mockResolvedValue(auth(role));
    for (const res of [
      await pago.GET(req("GET")),
      await pago.POST(req("POST", PAGAR)),
      await pago.DELETE(req("DELETE", { colaboradorId: "c1", desde: "2026-10-19" })),
      await cuentas.GET(req("GET", undefined, "https://host/api/rrhh/colaboradores/c1/cuentas"), params),
    ]) {
      expect(res.status).toBe(403);
    }
    expect(m.semana).not.toHaveBeenCalled();
    expect(m.pagar).not.toHaveBeenCalled();
    expect(m.deshacer).not.toHaveBeenCalled();
    expect(m.otras).not.toHaveBeenCalled();
  });
});

describe.each(["admin", "owner"])("rol %s", (role) => {
  beforeEach(() => m.requireAdmin.mockResolvedValue(auth(role)));

  it("GET normaliza cualquier día al lunes de su semana y usa el negocio de la sesión", async () => {
    const res = await pago.GET(req("GET", undefined, `${URL_PAGO}?semana=2026-10-23`));
    expect(res.status).toBe(200);
    expect(m.semana).toHaveBeenCalledWith("t1", "2026-10-19");
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  it("POST paga con el tenant de la sesión aunque el cuerpo traiga otro", async () => {
    const res = await pago.POST(req("POST", { ...PAGAR, tenantId: "ajeno" }));
    expect(res.status).toBe(201);
    expect(m.pagar).toHaveBeenCalledWith("t1", expect.not.objectContaining({ tenantId: "ajeno" }), "qauser");
  });

  it("el segundo clic devuelve 200 (repetido), no 201", async () => {
    m.pagar.mockResolvedValue({ repetido: true, gastoId: "g1", calculo: null, caja: null });
    expect((await pago.POST(req("POST", PAGAR))).status).toBe(200);
  });

  it("un colaborador de otro negocio → 404", async () => {
    m.pagar.mockResolvedValue(null);
    expect((await pago.POST(req("POST", PAGAR))).status).toBe(404);
  });

  it("el error de negocio sale con su estado, su código y los números nuevos", async () => {
    m.pagar.mockRejectedValue(new m.PagoSemanaError(409, "neto_cambio", "El neto cambió", { calculo: { neto: 340 } }));
    const res = await pago.POST(req("POST", PAGAR));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "neto_cambio", calculo: { neto: 340 } });
  });

  it("cuerpo inválido → 422 sin llamar a la DB", async () => {
    expect((await pago.POST(req("POST", { ...PAGAR, netoEsperado: -1 }))).status).toBe(422);
    expect((await pago.POST(req("POST", { ...PAGAR, metodo: "bitcoin" }))).status).toBe(422);
    expect(m.pagar).not.toHaveBeenCalled();
  });

  it("DELETE deshace con el tenant de la sesión", async () => {
    const res = await pago.DELETE(req("DELETE", { colaboradorId: "c1", desde: "2026-10-19" }));
    expect(res.status).toBe(200);
    expect(m.deshacer).toHaveBeenCalledWith("t1", "c1", "2026-10-19", "qauser");
  });

  it("Sus cuentas: tenant de la sesión; de otro negocio → 404", async () => {
    const url = "https://host/api/rrhh/colaboradores/c1/cuentas";
    expect((await cuentas.GET(req("GET", undefined, url), params)).status).toBe(200);
    expect(m.otras).toHaveBeenCalledWith("t1", "c1");
    m.otras.mockResolvedValue(null);
    expect((await cuentas.GET(req("GET", undefined, url), params)).status).toBe(404);
  });
});
