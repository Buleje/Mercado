/**
 * Las rutas de ADR-430: quién entra (403 por rol), qué se valida antes de tocar
 * la base (400 Zod), qué estado lleva cada error del negocio (404 parte de otro
 * tenant, 409 duplicado, 422 regla) y la forma de cada respuesta. Las DB
 * classes van simuladas: lo que escriben se prueba en
 * `forestal-precio-cliente-db.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  csrf: vi.fn((): unknown => null),
  spec: vi.fn(async () => true),
  tarifa: { listar: vi.fn(), guardar: vi.fn(), quitar: vi.fn() },
  vinculo: { listar: vi.fn(), crear: vi.fn(), quitar: vi.fn() },
  saldo: vi.fn(),
  especies: { get: vi.fn(), guardarGrupos: vi.fn() },
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: H.requireAdmin }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: H.csrf }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: H.spec }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/db/forest-parte-tarifa.db", async () => {
  class ParteNoEncontradaError extends Error {}
  class TarifaClienteError extends Error {}
  return { ForestParteTarifaDB: H.tarifa, ParteNoEncontradaError, TarifaClienteError };
});
vi.mock("@/lib/db/forest-parte-vinculo.db", async () => {
  class VinculoParteError extends Error {}
  class VinculoDuplicadoError extends Error {}
  return { ForestParteVinculoDB: H.vinculo, VinculoParteError, VinculoDuplicadoError };
});
vi.mock("@/lib/db/forest-cuenta.db", () => ({ ForestCuentaDB: { saldoConsolidado: H.saldo } }));
vi.mock("@/lib/db/forest-especies.db", () => {
  class EspecieCatalogoError extends Error {}
  return { ForestEspeciesDB: H.especies, EspecieCatalogoError };
});

import * as tarifas from "@/app/api/admin/forestal/tarifas-cliente/route";
import * as vinculos from "@/app/api/admin/forestal/directorio/vinculos/route";
import * as saldo from "@/app/api/admin/forestal/directorio/saldo/route";
import * as especies from "@/app/api/admin/forestal/especies/route";
import { ParteNoEncontradaError, TarifaClienteError } from "@/lib/db/forest-parte-tarifa.db";
import { VinculoDuplicadoError } from "@/lib/db/forest-parte-vinculo.db";
import type { TarifaCliente } from "@/lib/forestal/precio-cliente";

/* `requireAdmin` real: admin/owner/manager pasan por el bypass de gestión; el
   resto, sólo si su rol está en la lista que pide la ruta. Así el 403 del
   almacenero lo decide la LISTA de la ruta, no el mock. */
const GESTION = new Set(["admin", "owner", "manager"]);
function sesion(role: string, tenantId = "tenant-qa") {
  H.requireAdmin.mockImplementation(async (_req: NextRequest, roles: readonly string[]) =>
    GESTION.has(role) || roles.includes(role)
      ? { tenantId, username: `qa-${role}`, role }
      : NextResponse.json({ error: "forbidden" }, { status: 403 }),
  );
}

const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`https://host${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });

const TARIFA: TarifaCliente = {
  id: "tc-1",
  parteId: "p-cli",
  servicio: "aserrio",
  vigenteDesde: "2026-09-01",
  basePt: 0.5,
  grupos: [],
  especies: [],
  tipos: [],
  nota: null,
};
const CUERPO = { parteId: "p-cli", servicio: "aserrio", vigenteDesde: "2026-09-01", basePt: 0.5 };

beforeEach(() => {
  vi.clearAllMocks();
  H.csrf.mockReturnValue(null);
  H.spec.mockResolvedValue(true);
  sesion("admin");
});

describe("/api/admin/forestal/tarifas-cliente", () => {
  it("GET: el almacenero lee; sin parteId 400; parte de otro tenant 404", async () => {
    sesion("almacenero");
    H.tarifa.listar.mockResolvedValue([TARIFA]);
    const ok = await tarifas.GET(req("/api/admin/forestal/tarifas-cliente?parteId=p-cli"));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ tarifas: [TARIFA] });
    expect(H.tarifa.listar).toHaveBeenCalledWith("tenant-qa", "p-cli");

    expect((await tarifas.GET(req("/api/admin/forestal/tarifas-cliente"))).status).toBe(400);

    H.tarifa.listar.mockRejectedValue(new ParteNoEncontradaError("Esa parte no está en el Directorio."));
    const r404 = await tarifas.GET(req("/api/admin/forestal/tarifas-cliente?parteId=p-ajena"));
    expect(r404.status).toBe(404);
    expect(await r404.json()).toMatchObject({ error: "not_found", message: "Esa parte no está en el Directorio." });
  });

  it("POST: 201 con `{ tarifa }` al crear, 200 al corregir el mismo día; el tenant sale de la sesión", async () => {
    H.tarifa.guardar.mockResolvedValueOnce({ tarifa: TARIFA, corrigio: false }).mockResolvedValueOnce({ tarifa: TARIFA, corrigio: true });
    const creada = await tarifas.POST(req("/api/admin/forestal/tarifas-cliente", "POST", CUERPO));
    expect(creada.status).toBe(201);
    expect(await creada.json()).toEqual({ tarifa: TARIFA });
    expect(H.tarifa.guardar.mock.calls[0][0]).toBe("tenant-qa");
    expect(H.tarifa.guardar.mock.calls[0][1]).toMatchObject({ parteId: "p-cli", basePt: 0.5, grupos: [], especies: [], tipos: [] });
    expect((await tarifas.POST(req("/api/admin/forestal/tarifas-cliente", "POST", CUERPO))).status).toBe(200);
  });

  it("POST: el almacenero no pacta precios (403) y no se llega a la base", async () => {
    sesion("almacenero");
    const r = await tarifas.POST(req("/api/admin/forestal/tarifas-cliente", "POST", CUERPO));
    expect(r.status).toBe(403);
    expect(H.tarifa.guardar).not.toHaveBeenCalled();
  });

  it("POST: sin ningún precio o con precio 0 es 400 con el motivo, sin tocar la base", async () => {
    const vacio = await tarifas.POST(req("/api/admin/forestal/tarifas-cliente", "POST", { ...CUERPO, basePt: null }));
    expect(vacio.status).toBe(400);
    expect((await vacio.json()).message).toMatch(/al menos un precio/);
    expect((await tarifas.POST(req("/api/admin/forestal/tarifas-cliente", "POST", { ...CUERPO, basePt: 0 }))).status).toBe(400);
    expect((await tarifas.POST(req("/api/admin/forestal/tarifas-cliente", "POST", "{no es json"))).status).toBe(400);
    expect(H.tarifa.guardar).not.toHaveBeenCalled();
  });

  it("POST: parte de otro tenant 404; regla del trato 422; sin CSRF no pasa", async () => {
    H.tarifa.guardar.mockRejectedValueOnce(new ParteNoEncontradaError("Esa parte no está en el Directorio."));
    expect((await tarifas.POST(req("/api/admin/forestal/tarifas-cliente", "POST", { ...CUERPO, parteId: "p-ajena" }))).status).toBe(404);

    H.tarifa.guardar.mockRejectedValueOnce(new TarifaClienteError("El tipo «Tablita» no existe."));
    const r422 = await tarifas.POST(req("/api/admin/forestal/tarifas-cliente", "POST", CUERPO));
    expect(r422.status).toBe(422);
    expect(await r422.json()).toEqual({ error: "tarifa_invalida", message: "El tipo «Tablita» no existe." });

    H.csrf.mockReturnValueOnce(NextResponse.json({ error: "csrf" }, { status: 403 }));
    expect((await tarifas.POST(req("/api/admin/forestal/tarifas-cliente", "POST", CUERPO))).status).toBe(403);
  });

  it("DELETE: `{ ok: true }`; lo que no existe en este tenant 404; sin id 400", async () => {
    H.tarifa.quitar.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const ok = await tarifas.DELETE(req("/api/admin/forestal/tarifas-cliente?id=tc-1", "DELETE"));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
    expect(H.tarifa.quitar).toHaveBeenCalledWith("tenant-qa", "tc-1", "qa-admin");
    expect((await tarifas.DELETE(req("/api/admin/forestal/tarifas-cliente?id=ajena", "DELETE"))).status).toBe(404);
    expect((await tarifas.DELETE(req("/api/admin/forestal/tarifas-cliente", "DELETE"))).status).toBe(400);
  });
});

describe("/api/admin/forestal/directorio/vinculos", () => {
  const V = { parteId: "p-cli", relacion: "representa", vinculadaParteId: "p-rep" };

  it("POST: 201 `{ vinculo }`; con parte Y permiso a la vez 400 sin tocar la base", async () => {
    H.vinculo.crear.mockResolvedValue({ id: "v1", ...V, vinculadaNombre: "Juan", contratoId: null, contratoCodigo: null, desde: null, hasta: null, notas: null });
    const r = await vinculos.POST(req("/api/admin/forestal/directorio/vinculos", "POST", V));
    expect(r.status).toBe(201);
    expect((await r.json()).vinculo).toMatchObject({ id: "v1", vinculadaNombre: "Juan" });

    H.vinculo.crear.mockClear();
    const dos = await vinculos.POST(req("/api/admin/forestal/directorio/vinculos", "POST", { ...V, contratoId: "k-1" }));
    expect(dos.status).toBe(400);
    expect((await dos.json()).message).toMatch(/UNA parte del Directorio o con UN permiso/);
    expect(H.vinculo.crear).not.toHaveBeenCalled();
  });

  it("POST: almacenero 403; vinculada de otro tenant 404; repetido 409", async () => {
    sesion("almacenero");
    expect((await vinculos.POST(req("/api/admin/forestal/directorio/vinculos", "POST", V))).status).toBe(403);
    sesion("owner");
    H.vinculo.crear.mockRejectedValueOnce(new ParteNoEncontradaError("La parte a vincular no está en el Directorio."));
    expect((await vinculos.POST(req("/api/admin/forestal/directorio/vinculos", "POST", V))).status).toBe(404);
    H.vinculo.crear.mockRejectedValueOnce(new VinculoDuplicadoError());
    expect((await vinculos.POST(req("/api/admin/forestal/directorio/vinculos", "POST", V))).status).toBe(409);
  });

  it("GET `{ vinculos }` y DELETE `{ ok: true }` / 404", async () => {
    H.vinculo.listar.mockResolvedValue([]);
    const g = await vinculos.GET(req("/api/admin/forestal/directorio/vinculos?parteId=p-cli"));
    expect(await g.json()).toEqual({ vinculos: [] });
    H.vinculo.quitar.mockResolvedValueOnce(false);
    expect((await vinculos.DELETE(req("/api/admin/forestal/directorio/vinculos?id=x", "DELETE"))).status).toBe(404);
  });
});

describe("/api/admin/forestal/directorio/saldo", () => {
  it("devuelve el `SaldoConsolidado` tal cual; sin parteId 400; parte ajena 404", async () => {
    const S = { propio: { cargos: 136.5, abonos: 36.5, saldo: 100 }, vinculados: [], total: 100 };
    H.saldo.mockResolvedValueOnce(S);
    const r = await saldo.GET(req("/api/admin/forestal/directorio/saldo?parteId=p-cli"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(S);
    expect(H.saldo).toHaveBeenCalledWith("tenant-qa", "p-cli");
    expect((await saldo.GET(req("/api/admin/forestal/directorio/saldo"))).status).toBe(400);
    H.saldo.mockRejectedValueOnce(new ParteNoEncontradaError("Esa parte no está en el Directorio."));
    expect((await saldo.GET(req("/api/admin/forestal/directorio/saldo?parteId=p-ajena"))).status).toBe(404);
  });
});

describe("especies: `grupos.guardar`", () => {
  const CAT = { agregadas: [], ocultas: [], grupos: [{ id: "g1", nombre: "Duras", claves: ["anacaspi"] }] };
  const cuerpo = (grupos: unknown) => ({ accion: "grupos.guardar", grupos });

  it("admin guarda; la respuesta trae `grupos` suelto y dentro de `catalogo`", async () => {
    H.especies.guardarGrupos.mockResolvedValue({ catalogo: CAT, mensaje: "Quedaron 1 grupo con 1 especie." });
    H.especies.get.mockResolvedValue(CAT);
    const r = await especies.POST(req("/api/admin/forestal/especies", "POST", cuerpo([{ id: "g1", nombre: "Duras", especies: ["Anacaspi"] }])));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.grupos).toEqual(CAT.grupos);
    expect(j.catalogo.grupos).toEqual(CAT.grupos);
    expect(H.especies.guardarGrupos).toHaveBeenCalledWith("tenant-qa", [{ id: "g1", nombre: "Duras", especies: ["Anacaspi"] }], "qa-admin");
  });

  it("una especie en dos grupos se rechaza con el motivo; el almacenero no cambia grupos", async () => {
    const dos = await especies.POST(
      req("/api/admin/forestal/especies", "POST", cuerpo([
        { id: "g1", nombre: "Duras", especies: ["Anacaspi"] },
        { id: "g2", nombre: "Finas", especies: ["ANACASPI"] },
      ])),
    );
    expect(dos.status).toBe(422);
    expect((await dos.json()).message).toMatch(/está en dos grupos/);

    sesion("almacenero");
    const r = await especies.POST(req("/api/admin/forestal/especies", "POST", cuerpo([])));
    expect(r.status).toBe(403);
    expect((await r.json()).message).toMatch(/sólo el administrador, el dueño o el encargado/);
    expect(H.especies.guardarGrupos).not.toHaveBeenCalled();
  });

  it("dos grupos con el mismo id se rechazan: la especie quedaba en dos grupos", async () => {
    const r = await especies.POST(
      req("/api/admin/forestal/especies", "POST", cuerpo([
        { id: "g1", nombre: "Duras", especies: ["Anacaspi"] },
        { id: "g1", nombre: "Blandas", especies: ["Anacaspi", "Tornillo"] },
      ])),
    );
    expect(r.status).toBe(422);
    expect(H.especies.guardarGrupos).not.toHaveBeenCalled();
  });

  it("el encargado fija grupos, como fija los tratos (requireAdmin lo deja pasar)", async () => {
    sesion("manager");
    H.especies.guardarGrupos.mockResolvedValue({ catalogo: CAT, mensaje: "ok" });
    H.especies.get.mockResolvedValue(CAT);
    const r = await especies.POST(req("/api/admin/forestal/especies", "POST", cuerpo([{ id: "g1", nombre: "Duras", especies: ["Anacaspi"] }])));
    expect(r.status).toBe(200);
  });
});
