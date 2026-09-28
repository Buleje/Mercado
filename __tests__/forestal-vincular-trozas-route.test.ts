/**
 * /api/admin/forestal/ctp/vincular-trozas — quién entra, qué se valida antes de
 * tocar la base y qué estado lleva cada «no» del libro. La DB class va simulada:
 * lo que escribe se prueba contra la base real en `forestal-vincular-trozas-db.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  csrf: vi.fn((): unknown => null),
  spec: vi.fn(async () => true),
  diagnostico: vi.fn(),
  diagnosticoDeCorrida: vi.fn(),
  propuesta: vi.fn(),
  vincular: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: H.requireAdmin }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: H.csrf }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: H.spec }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/db/forest-vincular-trozas.db", () => ({
  ForestVincularTrozasDB: {
    diagnostico: H.diagnostico,
    diagnosticoDeCorrida: H.diagnosticoDeCorrida,
    propuesta: H.propuesta,
    vincularTrozas: H.vincular,
  },
}));

import { GET, POST } from "@/app/api/admin/forestal/ctp/vincular-trozas/route";
import { CtpInvariantError } from "@/lib/db/forest-ctp-consumo.db";

/* Como el `requireAdmin` real: admin/owner/manager pasan por el bypass de
   gestión; el resto, sólo si su rol está en la lista que pide la ruta. */
const GESTION = new Set(["admin", "owner", "manager"]);
function sesion(role: string | null, tenantId = "tenant-qa") {
  H.requireAdmin.mockImplementation(async (_req: NextRequest, roles: readonly string[]) =>
    role == null
      ? NextResponse.json({ error: "unauthorized" }, { status: 401 })
      : GESTION.has(role) || roles.includes(role)
        ? { tenantId, username: `qa-${role}`, role }
        : NextResponse.json({ error: "forbidden" }, { status: 403 }),
  );
}

const URL_BASE = "https://host/api/admin/forestal/ctp/vincular-trozas";
const get = (qs: string) => GET(new NextRequest(`${URL_BASE}?${qs}`));
const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new NextRequest(URL_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
const PEDIDO = { corridaId: "c54", trozaIds: ["t1", "t2"] };

beforeEach(() => {
  vi.clearAllMocks();
  H.csrf.mockImplementation(() => null);
  H.spec.mockImplementation(async () => true);
  H.vincular.mockResolvedValue({
    corridaId: "c54",
    trozas: 2,
    m3: 1.2,
    lotesArmados: ["LA-2026-020"],
    rendimientoPct: 51.86,
    sobreElTope: false,
  });
  sesion("admin");
});

describe("quién entra", () => {
  it("sin sesión → 401 (nunca un 404 que saque del panel) y no toca la base", async () => {
    sesion(null);
    expect((await get("diagnostico=1")).status).toBe(401);
    expect((await post(PEDIDO)).status).toBe(401);
    expect(H.diagnostico).not.toHaveBeenCalled();
    expect(H.vincular).not.toHaveBeenCalled();
  });

  it("leer: los roles de Lotes de aserrío (el almacenero sí)", async () => {
    sesion("almacenero");
    H.diagnostico.mockResolvedValue({ corridas: [], porMotivo: {}, total: 0 });
    const res = await get("diagnostico=1");
    expect(res.status).toBe(200);
    expect(H.requireAdmin.mock.calls[0][1]).toEqual(["admin", "almacenero", "owner"]);
  });

  it("vincular: el almacenero se queda en 403", async () => {
    sesion("almacenero");
    const res = await post(PEDIDO);
    expect(res.status).toBe(403);
    expect(H.requireAdmin.mock.calls[0][1]).toEqual(["admin", "owner"]);
    expect(H.vincular).not.toHaveBeenCalled();
  });

  it("vincular: el manager entra por el bypass de gestión, pero el chequeo explícito lo frena", async () => {
    sesion("manager");
    const res = await post(PEDIDO);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, error: "forbidden" });
    expect(H.vincular).not.toHaveBeenCalled();
  });

  it("sin CSRF → 403 antes de leer el cuerpo; sin el módulo CTP → 403", async () => {
    H.csrf.mockImplementation(() => NextResponse.json({ error: "csrf" }, { status: 403 }));
    expect((await post(PEDIDO)).status).toBe(403);
    H.csrf.mockImplementation(() => null);
    H.spec.mockImplementation(async () => false);
    expect((await post(PEDIDO)).status).toBe(403);
    expect(H.vincular).not.toHaveBeenCalled();
  });

  it("el tenant sale de la SESIÓN, no del cuerpo ni del header", async () => {
    sesion("owner", "tenant-de-la-sesion");
    await post({ ...PEDIDO, tenantId: "ajeno" }, { "x-tenant-id": "ajeno" });
    expect(H.vincular).toHaveBeenCalledWith("tenant-de-la-sesion", PEDIDO, "qa-owner");
  });
});

describe("GET", () => {
  it("?corridaId de otro negocio → 404; con origen → 409", async () => {
    H.diagnosticoDeCorrida.mockResolvedValueOnce({ ok: false, error: "no_existe", message: "Esa corrida no existe en este negocio." });
    expect((await get("corridaId=ajena")).status).toBe(404);
    H.diagnosticoDeCorrida.mockResolvedValueOnce({ ok: false, error: "ya_tiene_origen", message: "ya dice" });
    expect((await get("corridaId=c1")).status).toBe(409);
    expect(H.diagnosticoDeCorrida).toHaveBeenCalledWith("tenant-qa", "c1");
  });

  it("?propuesta: `m3=` vacío es 400, no «0 m³ = toda la madera»", async () => {
    const res = await get("propuesta=1&especie=Cachimbo&fecha=2026-09-21&m3=");
    expect(res.status).toBe(400);
    expect(H.propuesta).not.toHaveBeenCalled();
  });

  it("?propuesta con fecha inventada → 400; bien armada llega a la DB class con números", async () => {
    expect((await get("propuesta=1&especie=Cachimbo&fecha=2026-02-31&m3=1")).status).toBe(400);
    H.propuesta.mockResolvedValue({ ok: true, motivo: "lista", detalle: "x", propuesta: [], m3Propuesto: 0 });
    const res = await get("propuesta=1&especie=Cachimbo&fecha=2026-09-21&m3=0.6223&contratoId=ctr_1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ motivo: "lista", detalle: "x", propuesta: [], m3Propuesto: 0 });
    expect(H.propuesta).toHaveBeenCalledWith("tenant-qa", {
      especie: "Cachimbo",
      fecha: "2026-09-21",
      m3: 0.6223,
      contratoId: "ctr_1",
      permiso: null,
    });
  });

  it("sin ninguna de las tres formas → 400 con el mensaje de cómo pedir", async () => {
    const res = await get("");
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/diagnostico=1/);
  });
});

describe("POST", () => {
  it("201 con el resultado", async () => {
    const res = await post(PEDIDO);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ok: true, corridaId: "c54", trozas: 2, lotesArmados: ["LA-2026-020"] });
  });

  it("400: JSON roto, sin trozas, o una troza repetida (VALIDACION del servidor)", async () => {
    expect((await post("{no")).status).toBe(400);
    const vacio = await post({ corridaId: "c54", trozaIds: [] });
    expect(vacio.status).toBe(400);
    expect(await vacio.json()).toEqual({ ok: false, error: "validation_error", message: "Elige al menos una troza." });
    H.vincular.mockRejectedValueOnce(new CtpInvariantError("Una misma troza aparece dos veces.", "VALIDACION"));
    expect((await post(PEDIDO)).status).toBe(400);
  });

  it("409: el libro dice que no (otro permiso, T3, ya consumida), con su frase", async () => {
    H.vincular.mockRejectedValueOnce(
      new CtpInvariantError("Esta troza no puede entrar a la corrida N° 54: A-1 (es del permiso X y la corrida es del Y).", "T1_TROZA_NO_CONSUMIBLE"),
    );
    const res = await post(PEDIDO);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      ok: false,
      error: "T1_TROZA_NO_CONSUMIBLE",
      message: "Esta troza no puede entrar a la corrida N° 54: A-1 (es del permiso X y la corrida es del Y).",
    });
    H.vincular.mockRejectedValueOnce(new CtpInvariantError("llegó después", "T3_ASERRADA_ANTES_DE_LLEGAR"));
    expect((await post(PEDIDO)).status).toBe(409);
  });

  it("404: corrida o troza de otro negocio", async () => {
    H.vincular.mockRejectedValueOnce(new CtpInvariantError("Esa corrida no existe en este negocio.", "TENANT_MISMATCH"));
    expect((await post(PEDIDO)).status).toBe(404);
  });

  it("409 con «vuelve a intentar» cuando dos personas chocan (deadlock de Postgres)", async () => {
    H.vincular.mockRejectedValueOnce(Object.assign(new Error("deadlock detected"), { code: "P2010" }));
    const res = await post(PEDIDO);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, error: "CHOQUE_DE_LOCKS" });
  });

  it("500 sin filtrar la base", async () => {
    H.vincular.mockRejectedValueOnce(new Error('relation "X" does not exist'));
    const res = await post(PEDIDO);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("relation");
  });
});
