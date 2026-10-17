/**
 * La ruta del vaciado: qué pedidos se rechazan ANTES de tocar la base.
 *
 * Antes un alcance raro (o ninguno) caía en «todo» por defecto. Sobre una
 * operación que no se deshace, el valor por defecto tiene que ser «no hacer
 * nada»: desconocido, vacío o «todo» combinado → 400.
 *
 * Y sólo admin o dueño: `requireAdmin` deja pasar a `manager` por el management
 * tier, así que el test le da al mock el ROL de la sesión y mira la respuesta,
 * no el argumento con que se llamó a `requireAdmin`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  spec: vi.fn(),
  contar: vi.fn(),
  vaciar: vi.fn(),
  periodos: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: H.requireAdmin }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: H.spec }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/db/forest-ctp-purga.db", () => ({
  ForestCtpPurgaDB: { contar: H.contar, vaciar: H.vaciar, periodosQueBloquean: H.periodos },
}));

const { GET, POST } = await import("@/app/api/admin/forestal/ctp-purga/route");

const URL_BASE = "https://host/api/admin/forestal/ctp-purga";
const RESUMEN = {
  alcances: ["lotes"],
  conteo: { ingresos: 0, trozas: 0, produccion: 0, despachos: 0, consumos: 0, origenes: 0, lotes: 1, trozasAlPatio: 2, total: 1 },
  porAlcance: { lotes: { aserrio: 1, mixtos: 0, comerciales: 0, trozasAlPatio: 2, bloqueados: 0 } },
  lotesBloqueados: [],
};

/** Lo que la vista previa mostró: viaja de vuelta al confirmar. */
const ESPERADO = RESUMEN.conteo;
const sesion = (extra: Record<string, unknown> = {}) => ({ tenantId: "tenant-del-jwt", username: "dueno", role: "admin", ...extra });

const get = (qs: string) => GET(new NextRequest(`${URL_BASE}${qs}`));
const post = (body: unknown) =>
  POST(
    new NextRequest(URL_BASE, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  H.requireAdmin.mockResolvedValue(sesion());
  H.spec.mockResolvedValue(true);
  H.contar.mockResolvedValue(RESUMEN);
  H.periodos.mockResolvedValue([]);
  H.vaciar.mockResolvedValue({ ok: true, resumen: RESUMEN });
});

describe("GET: vista previa", () => {
  it("varios alcances separados por coma → cuenta la combinación, con el tenant del JWT", async () => {
    const r = await get("?scope=lotes,trozas_disponibles");
    expect(r.status).toBe(200);
    expect(H.contar).toHaveBeenCalledWith("tenant-del-jwt", ["trozas_disponibles", "lotes"]);
    const j = await r.json();
    expect(j).toMatchObject({ sePuede: true, palabra: "VACIAR LIBRO", porAlcance: RESUMEN.porAlcance });
  });

  it.each([
    ["alcance desconocido", "?scope=trozas_disponibles,cualquiera"],
    ["«todo» combinado", "?scope=todo,lotes"],
    ["sin alcance", ""],
  ])("%s → 400 sin tocar la base", async (_, qs) => {
    const r = await get(qs);
    expect(r.status).toBe(400);
    expect(H.contar).not.toHaveBeenCalled();
  });

  it("mes cerrado + alcances parciales → se puede (cada mes cerrado salva lo suyo); con «todo», no", async () => {
    H.periodos.mockResolvedValue(["agosto de 2026"]);
    const parcial = await (await get("?scope=trozas_disponibles,lotes")).json();
    expect(parcial).toMatchObject({ sePuede: true, periodos: ["agosto de 2026"] });
    const todo = await (await get("?scope=todo")).json();
    expect(todo).toMatchObject({ sePuede: false, periodos: ["agosto de 2026"] });
  });

  it("sin sesión → 401 (nunca 404)", async () => {
    H.requireAdmin.mockResolvedValue(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    const r = await get("?scope=lotes");
    expect(r.status).toBe(401);
    expect(H.contar).not.toHaveBeenCalled();
  });

  it("el encargado (manager) que pasó requireAdmin → 403 sin contar nada", async () => {
    H.requireAdmin.mockResolvedValue(sesion({ role: "manager", username: "encargado" }));
    const r = await get("?scope=lotes");
    expect(r.status).toBe(403);
    expect((await r.json()).message).toMatch(/administrador o el dueño/);
    expect(H.contar).not.toHaveBeenCalled();
  });

  it("el dueño (owner) ve la vista previa", async () => {
    H.requireAdmin.mockResolvedValue(sesion({ role: "owner" }));
    const r = await get("?scope=lotes");
    expect(r.status).toBe(200);
  });
});

describe("POST: vaciar", () => {
  it("borra la combinación elegida con el tenant del JWT", async () => {
    const r = await post({ confirmacion: "vaciar libro", scopes: ["lotes", "consumo"], esperado: ESPERADO });
    expect(r.status).toBe(200);
    expect(H.vaciar).toHaveBeenCalledWith("tenant-del-jwt", "dueno", ["consumo", "lotes"], ESPERADO);
  });

  it.each(["manager", "cajero", "almacenero"])("rol %s (aunque pase requireAdmin) → 403 sin borrar", async (role) => {
    H.requireAdmin.mockResolvedValue(sesion({ role }));
    const r = await post({ confirmacion: "VACIAR LIBRO", scopes: ["lotes"], esperado: ESPERADO });
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ error: "forbidden", message: expect.stringMatching(/vaciar el Libro de Operaciones/) });
    expect(H.vaciar).not.toHaveBeenCalled();
  });

  it("el dueño (owner) vacía, y el asiento lleva su usuario", async () => {
    H.requireAdmin.mockResolvedValue(sesion({ role: "owner", username: "brandon" }));
    const r = await post({ confirmacion: "VACIAR LIBRO", scopes: ["lotes"], esperado: ESPERADO });
    expect(r.status).toBe(200);
    expect(H.vaciar).toHaveBeenCalledWith("tenant-del-jwt", "brandon", ["lotes"], ESPERADO);
  });

  it("sesión sin username → el asiento lleva la sesión, nunca un «admin» inventado", async () => {
    H.requireAdmin.mockResolvedValue(sesion({ username: "", jti: "k9-ab12" }));
    await post({ confirmacion: "VACIAR LIBRO", scopes: ["lotes"], esperado: ESPERADO });
    expect(H.vaciar).toHaveBeenCalledWith("tenant-del-jwt", "sesión k9-ab12", ["lotes"], ESPERADO);
  });

  it("sesión que no dice quién es → 401 sin borrar", async () => {
    H.requireAdmin.mockResolvedValue(sesion({ username: undefined }));
    const r = await post({ confirmacion: "VACIAR LIBRO", scopes: ["lotes"], esperado: ESPERADO });
    expect(r.status).toBe(401);
    expect(H.vaciar).not.toHaveBeenCalled();
  });

  it("el libro no da lo que mostró la vista previa → 409 «libro_cambio» con el motivo", async () => {
    H.vaciar.mockResolvedValue({
      ok: false,
      codigo: "libro_cambio",
      motivo: "El libro cambió desde que lo revisaste: vuelve a mirar qué se borra.",
      periodos: [],
    });
    const r = await post({ confirmacion: "VACIAR LIBRO", scopes: ["lotes"], esperado: { ...ESPERADO, total: 99 } });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "libro_cambio", message: expect.stringMatching(/vuelve a mirar/) });
    expect(H.vaciar).toHaveBeenCalledWith("tenant-del-jwt", "dueno", ["lotes"], { ...ESPERADO, total: 99 });
  });

  it.each([
    ["alcance desconocido", { confirmacion: "VACIAR LIBRO", scopes: ["lotes", "todo_menos_guias"], esperado: ESPERADO }],
    ["«todo» combinado", { confirmacion: "VACIAR LIBRO", scopes: ["todo", "trozas_disponibles"], esperado: ESPERADO }],
    ["lista vacía", { confirmacion: "VACIAR LIBRO", scopes: [], esperado: ESPERADO }],
    [
      "el formato viejo (un solo `scope`) ya no vacía «todo» por defecto",
      { confirmacion: "VACIAR LIBRO", scope: "consumo", esperado: ESPERADO },
    ],
    ["sin la frase", { confirmacion: "si", scopes: ["lotes"], esperado: ESPERADO }],
    ["sin lo que mostró la vista previa", { confirmacion: "VACIAR LIBRO", scopes: ["lotes"] }],
    ["con la vista previa incompleta", { confirmacion: "VACIAR LIBRO", scopes: ["lotes"], esperado: { total: 1 } }],
  ])("%s → 400 sin tocar la base", async (_, body) => {
    const r = await post(body);
    expect(r.status).toBe(400);
    expect(H.vaciar).not.toHaveBeenCalled();
  });

  it("«Todo el libro» con un mes cerrado → 409 con el motivo", async () => {
    H.vaciar.mockResolvedValue({ ok: false, codigo: "periodo_cerrado", motivo: "Hay 1 período cerrado", periodos: ["Agosto 2026"] });
    const r = await post({ confirmacion: "VACIAR LIBRO", scopes: ["todo"], esperado: ESPERADO });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "periodo_cerrado", periodos: ["Agosto 2026"] });
  });

  it("sin sesión → 401", async () => {
    H.requireAdmin.mockResolvedValue(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    const r = await post({ confirmacion: "VACIAR LIBRO", scopes: ["lotes"], esperado: ESPERADO });
    expect(r.status).toBe(401);
    expect(H.vaciar).not.toHaveBeenCalled();
  });
});
