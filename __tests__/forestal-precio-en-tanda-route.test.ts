/**
 * /api/admin/forestal/wood-entries/precio — quién entra, qué se valida antes
 * de tocar la base y qué estado lleva cada respuesta. La DB class va simulada:
 * lo que escribe se prueba en `forestal-precio-en-tanda-db.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  vista: vi.fn(),
  poner: vi.fn(),
  csrf: vi.fn((): unknown => null),
  spec: vi.fn(async () => true),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: H.requireAdmin }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: H.csrf }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: H.spec }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/db/wood-entries-precio.db", () => ({
  WoodEntriesPrecioDB: { vista: H.vista, ponerPrecio: H.poner },
}));

import { GET, POST } from "@/app/api/admin/forestal/wood-entries/precio/route";

const GESTION = new Set(["admin", "owner", "manager"]);
function sesion(role: string | null, tenantId = "tenant-qa") {
  H.requireAdmin.mockImplementation(async (_req: NextRequest, roles: readonly string[]) =>
    role == null
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : GESTION.has(role) || roles.includes(role)
        ? { tenantId, username: `qa-${role}`, role }
        : NextResponse.json({ error: "forbidden" }, { status: 403 }),
  );
}

const URL_API = "https://host/api/admin/forestal/wood-entries/precio";
const get = () => GET(new NextRequest(URL_API));
const post = (body: unknown) =>
  POST(
    new NextRequest(URL_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const CUERPO = {
  precios: [{ proveedor: "SANTOS MUÑOZ JOSE HORD", especie: "Cachimbo", precioM3: 180 }],
  vistos: [{ id: "w1", antes: null }],
};

beforeEach(() => {
  vi.clearAllMocks();
  H.csrf.mockImplementation(() => null);
  H.spec.mockImplementation(async () => true);
  H.vista.mockResolvedValue({ filas: [], grupos: [], referencias: {}, truncada: false });
  H.poner.mockResolvedValue({ estado: "hecho", cambios: [], saltadas: [], totales: { filas: 1, m3: 7, soles: 1260, pisadas: 0 } });
  sesion("admin");
});

describe("GET", () => {
  it("sin sesión → 401 (nunca 404: sacaría del panel)", async () => {
    sesion(null);
    expect((await get()).status).toBe(401);
    expect(H.vista).not.toHaveBeenCalled();
  });

  it("el almacenero no ve la plata → 403", async () => {
    sesion("almacenero");
    expect((await get()).status).toBe(403);
  });

  it("lee SIEMPRE del tenant de la sesión", async () => {
    sesion("owner", "tenant-blas");
    const r = await get();
    expect(r.status).toBe(200);
    expect(H.vista).toHaveBeenCalledWith("tenant-blas");
  });

  it("sin el módulo CTP → 403", async () => {
    H.spec.mockImplementation(async () => false);
    expect((await get()).status).toBe(403);
  });
});

describe("POST", () => {
  it("sin sesión → 401 y no escribe", async () => {
    sesion(null);
    expect((await post(CUERPO)).status).toBe(401);
    expect(H.poner).not.toHaveBeenCalled();
  });

  it("CSRF inválido corta antes de escribir", async () => {
    H.csrf.mockImplementation(() => NextResponse.json({ error: "csrf" }, { status: 403 }));
    expect((await post(CUERPO)).status).toBe(403);
    expect(H.poner).not.toHaveBeenCalled();
  });

  it("precio 0 o de menos de un céntimo → 400: se redondearía a S/ 0 (sin factura es null, nunca 0)", async () => {
    for (const precioM3 of [0, 0.004]) {
      const r = await post({ ...CUERPO, precios: [{ ...CUERPO.precios[0], precioM3 }] });
      expect(r.status).toBe(400);
    }
    expect(H.poner).not.toHaveBeenCalled();
  });

  it("sin filas vistas → 400 (la tanda escribe sólo lo que la vista previa mostró)", async () => {
    expect((await post({ ...CUERPO, vistos: [] })).status).toBe(400);
  });

  it("JSON roto → 400", async () => {
    expect((await post("{no")).status).toBe(400);
  });

  it("aplica con el tenant y el usuario de la sesión, defaults explícitos", async () => {
    sesion("admin", "tenant-qa");
    const r = await post(CUERPO);
    expect(r.status).toBe(200);
    expect(H.poner).toHaveBeenCalledWith(
      "tenant-qa",
      { ...CUERPO, tambienConPrecio: false, confirmarAvisos: false },
      "qa-admin",
    );
  });

  it("un precio que huele a dedazo sin confirmar → 409 con los avisos", async () => {
    H.poner.mockResolvedValue({
      estado: "avisos",
      avisos: [{ proveedor: "SANTOS MUÑOZ JOSE HORD", especie: "Cachimbo", precioM3: 1800, avisos: ["¿Sobra un cero?"] }],
    });
    const r = await post({ ...CUERPO, precios: [{ ...CUERPO.precios[0], precioM3: 1800 }] });
    expect(r.status).toBe(409);
    const j = await r.json();
    expect(j.error).toBe("precio_fuera_de_rango");
    expect(j.avisos[0].avisos).toEqual(["¿Sobra un cero?"]);
  });
});
