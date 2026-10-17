/**
 * ADR-458 · una página propia (`tienda.pagina`) es de UN negocio.
 *
 * · `TenantPiezaDB.guardar`: en una transacción con candado por pieza, mira si
 *   OTRO negocio ya tiene la fila —prendida o apagada— y entonces no escribe.
 *   Los demás enchufes siguen con el upsert de siempre (sin transacción).
 * · `PUT /api/superadmin/piezas/asignacion` lo traduce a 409
 *   `pagina_de_otro_negocio` con el nombre del dueño.
 * · `GET /api/superadmin/piezas`: cada página propia del catálogo dice de quién
 *   es (`duenoPagina`), sacado de la MISMA matriz.
 * · LIBERAR (`TenantPiezaDB.liberar` + `DELETE …/asignacion`): borra la fila
 *   sólo si está APAGADA, con el mismo candado; prendida → 409 `pagina_prendida`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  upsert: vi.fn(),
  txUpsert: vi.fn(),
  txFindFirst: vi.fn(),
  txFindUnique: vi.fn(),
  txDeleteMany: vi.fn(),
  executeRaw: vi.fn(),
  transaction: vi.fn(),
  revalidateTag: vi.fn(),
  logActivity: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    $executeRaw: (partes: TemplateStringsArray, ...valores: unknown[]) => H.executeRaw(partes.join("?"), ...valores),
    tenantPieza: { findFirst: H.txFindFirst, upsert: H.txUpsert, findUnique: H.txFindUnique, deleteMany: H.txDeleteMany },
  };
  return {
    prisma: {
      tenantPieza: { upsert: H.upsert, findMany: vi.fn() },
      $transaction: (fn: (t: typeof tx) => Promise<unknown>) => {
        H.transaction();
        return fn(tx);
      },
    },
  };
});
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn(), revalidateTag: H.revalidateTag }));

import { PaginaDeOtroNegocioError, TenantPiezaDB } from "@/lib/db/tenant-pieza.db";
import { conDuenoDePagina, type PiezaDelCatalogo } from "@/lib/extensiones/resolver";

const fila = { id: "f1", tenantId: "main", piezaId: "pagina-de-prueba", enchufe: "tienda.pagina", prendida: true };
const entrada = (enchufe: string, prendida = true) => ({
  piezaId: "pagina-de-prueba",
  enchufe,
  prendida,
  opciones: {},
  version: "1.0.0",
});

beforeEach(() => {
  vi.clearAllMocks();
  H.txFindFirst.mockResolvedValue(null);
  H.txUpsert.mockResolvedValue(fila);
  H.upsert.mockResolvedValue(fila);
  H.executeRaw.mockResolvedValue(1);
  H.txFindUnique.mockResolvedValue({ prendida: false });
  H.txDeleteMany.mockResolvedValue({ count: 1 });
});

describe("TenantPiezaDB.guardar · página propia", () => {
  it("libre → candado por pieza, busca OTRO negocio (prendida o apagada) y escribe en la transacción", async () => {
    await TenantPiezaDB.guardar("main", entrada("tienda.pagina"), "superadmin:root");
    expect(H.transaction).toHaveBeenCalledTimes(1);
    const [sql, clave] = H.executeRaw.mock.calls[0];
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(clave).toBe("tenant-pieza:tienda.pagina:pagina-de-prueba");
    // Sin `prendida` en el WHERE: una fila APAGADA de otro negocio también cuenta.
    expect(H.txFindFirst.mock.calls[0][0].where).toEqual({
      piezaId: "pagina-de-prueba",
      enchufe: "tienda.pagina",
      tenantId: { not: "main" },
    });
    expect(H.txUpsert.mock.calls[0][0].where).toEqual({
      tenantId_piezaId_enchufe: { tenantId: "main", piezaId: "pagina-de-prueba", enchufe: "tienda.pagina" },
    });
    expect(H.upsert).not.toHaveBeenCalled();
    expect(H.revalidateTag).toHaveBeenCalledWith("tenant:main:piezas", { expire: 0 });
  });

  it("de otro negocio (aunque esté apagada) → PaginaDeOtroNegocioError con su nombre, y NO escribe", async () => {
    H.txFindFirst.mockResolvedValue({ tenantId: "t-dorado", tenant: { name: "Pollería El Dorado", slug: "mi-pollo" } });
    const err = await TenantPiezaDB.guardar("main", entrada("tienda.pagina", false), "superadmin:root").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PaginaDeOtroNegocioError);
    expect((err as PaginaDeOtroNegocioError).dueno).toEqual({ tenantId: "t-dorado", nombre: "Pollería El Dorado" });
    expect(H.txUpsert).not.toHaveBeenCalled();
    expect(H.revalidateTag).not.toHaveBeenCalled();
  });

  it("negocio sin nombre → se usa su slug", async () => {
    H.txFindFirst.mockResolvedValue({ tenantId: "t2", tenant: { name: "", slug: "mi-pollo" } });
    const err = await TenantPiezaDB.guardar("main", entrada("tienda.pagina"), "x").catch((e: unknown) => e);
    expect((err as PaginaDeOtroNegocioError).dueno.nombre).toBe("mi-pollo");
  });

  it("los demás enchufes no cambian: upsert directo, sin transacción ni candado", async () => {
    await TenantPiezaDB.guardar("main", entrada("tienda.portada"), "superadmin:root");
    expect(H.transaction).not.toHaveBeenCalled();
    expect(H.executeRaw).not.toHaveBeenCalled();
    expect(H.upsert).toHaveBeenCalledTimes(1);
  });
});

describe("conDuenoDePagina (GET del superadmin)", () => {
  const cat = (id: string, enchufes: string[]) =>
    ({ id, nombre: id, descripcion: "", version: "1.0.0", enchufes, rubros: [], requiere: [], opcionesSchema: null, opcionesPorDefecto: {} }) as unknown as PiezaDelCatalogo;
  const m = (piezaId: string, enchufe: string, tenantId: string, tenantNombre: string) => ({
    piezaId,
    enchufe,
    tenantId,
    tenantNombre,
    tenantSlug: tenantId,
  });

  it("página con dueño → {tenantId, nombre}; libre → null; las demás piezas sin la clave", () => {
    const r = conDuenoDePagina(
      [cat("pagina-a", ["tienda.pagina"]), cat("pagina-b", ["tienda.pagina"]), cat("portada", ["tienda.portada"])],
      [m("pagina-a", "tienda.pagina", "main", "Buleje"), m("portada", "tienda.portada", "main", "Buleje")],
    );
    expect(r[0].duenoPagina).toEqual({ tenantId: "main", nombre: "Buleje" });
    expect(r[1].duenoPagina).toBeNull();
    expect(r[2]).not.toHaveProperty("duenoPagina");
  });

  it("una fila de la MISMA pieza en otro enchufe no la vuelve dueña", () => {
    const r = conDuenoDePagina([cat("doble", ["tienda.portada", "tienda.pagina"])], [m("doble", "tienda.portada", "main", "Buleje")]);
    expect(r[0].duenoPagina).toBeNull();
  });
});

describe("PUT /api/superadmin/piezas/asignacion · 409", () => {
  it("la página es de otro negocio → 409 pagina_de_otro_negocio con su nombre", async () => {
    vi.resetModules();
    vi.doMock("@/lib/superadmin-auth", () => ({ requirePlatformAPI: async () => ({ username: "root" }) }));
    vi.doMock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
    vi.doMock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
    vi.doMock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => undefined) }));
    vi.doMock("@/lib/db/tenants.db", () => ({ TenantsDB: { getBasicById: async (id: string) => ({ id, slug: id, name: id }) } }));
    vi.doMock("@/extensiones/registro.servidor", async () => {
      const { z } = await import("zod");
      return {
        PIEZAS_SERVIDOR: [
          {
            manifiesto: {
              id: "pagina-de-prueba",
              nombre: "Prueba",
              descripcion: "x",
              version: "1.0.0",
              enchufes: ["tienda.pagina"],
              opciones: z.object({}).strict(),
            },
            pagina: { Pagina: () => null },
          },
        ],
      };
    });
    H.txFindFirst.mockResolvedValue({ tenantId: "main", tenant: { name: "Buleje", slug: "main" } });
    const { PUT } = await import("@/app/api/superadmin/piezas/asignacion/route");
    const r = await PUT(
      new NextRequest("http://localhost/api/superadmin/piezas/asignacion", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: "otro", piezaId: "pagina-de-prueba", enchufe: "tienda.pagina", prendida: true, opciones: {} }),
      }),
    );
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "pagina_de_otro_negocio", mensaje: "Esta página es de «Buleje»." });
    expect(H.txUpsert).not.toHaveBeenCalled();
  });
});

describe("TenantPiezaDB.liberar", () => {
  it("apagada → mismo candado que la asignación, borra SÓLO esa fila apagada y vence la caché", async () => {
    expect(await TenantPiezaDB.liberar("main", "pagina-de-prueba", "tienda.pagina", "superadmin:root")).toEqual({ ok: true });
    expect(H.transaction).toHaveBeenCalledTimes(1);
    expect(H.executeRaw.mock.calls[0][1]).toBe("tenant-pieza:tienda.pagina:pagina-de-prueba");
    expect(H.txFindUnique.mock.calls[0][0].where).toEqual({
      tenantId_piezaId_enchufe: { tenantId: "main", piezaId: "pagina-de-prueba", enchufe: "tienda.pagina" },
    });
    expect(H.txDeleteMany.mock.calls[0][0].where).toEqual({
      tenantId: "main",
      piezaId: "pagina-de-prueba",
      enchufe: "tienda.pagina",
      prendida: false,
    });
    expect(H.revalidateTag).toHaveBeenCalledWith("tenant:main:piezas", { expire: 0 });
  });

  it("prendida → no borra (primero se apaga)", async () => {
    H.txFindUnique.mockResolvedValue({ prendida: true });
    expect(await TenantPiezaDB.liberar("main", "p", "tienda.portada", "x")).toEqual({ ok: false, motivo: "prendida" });
    expect(H.txDeleteMany).not.toHaveBeenCalled();
    expect(H.revalidateTag).not.toHaveBeenCalled();
  });

  it("se prendió entre leer y borrar (otro enchufe, sin candado) → tampoco borra", async () => {
    H.txDeleteMany.mockResolvedValue({ count: 0 });
    expect(await TenantPiezaDB.liberar("main", "p", "tienda.portada", "x")).toEqual({ ok: false, motivo: "prendida" });
    expect(H.revalidateTag).not.toHaveBeenCalled();
  });

  it("no existe → no_existe", async () => {
    H.txFindUnique.mockResolvedValue(null);
    expect(await TenantPiezaDB.liberar("main", "p", "tienda.pagina", "x")).toEqual({ ok: false, motivo: "no_existe" });
    expect(H.txDeleteMany).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/superadmin/piezas/asignacion", () => {
  const CSRF = "c".repeat(32);
  async function borrar(body: unknown, conCsrf = true) {
    vi.resetModules();
    // El CSRF y el registro, REALES (el describe del PUT los simula y `doMock` sobrevive a resetModules).
    vi.doUnmock("@/lib/auth/csrf");
    vi.doUnmock("@/extensiones/registro.servidor");
    vi.doMock("@/lib/superadmin-auth", () => ({ requirePlatformAPI: async () => ({ username: "root" }) }));
    vi.doMock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
    vi.doMock("@/lib/activity-logger", () => ({ logActivity: H.logActivity }));
    vi.doMock("@/lib/db/tenants.db", () => ({
      TenantsDB: { getBasicById: async (id: string) => (id === "no-existe" ? null : { id, slug: `slug-${id}`, name: id }) },
    }));
    const { DELETE } = await import("@/app/api/superadmin/piezas/asignacion/route");
    return DELETE(
      new NextRequest("http://localhost/api/superadmin/piezas/asignacion", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          ...(conCsrf ? { cookie: `csrf-token=${CSRF}`, "x-csrf-token": CSRF } : {}),
        },
        body: JSON.stringify(body),
      }),
    );
  }
  const cuerpo = { tenantId: "main", piezaId: "pagina-de-prueba", enchufe: "tienda.pagina" };

  it("sin CSRF → 403 y no toca la base", async () => {
    const r = await borrar(cuerpo, false);
    expect(r.status).toBe(403);
    expect(H.transaction).not.toHaveBeenCalled();
  });

  it("prendida → 409 pagina_prendida «Apágala antes de liberarla.»", async () => {
    H.txFindUnique.mockResolvedValue({ prendida: true });
    const r = await borrar(cuerpo);
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "pagina_prendida", mensaje: "Apágala antes de liberarla." });
  });

  it("apagada → 200 {ok:true} y ActivityLog «Liberó la página…»", async () => {
    const r = await borrar(cuerpo);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    const [accion, entidad, texto, , actor, , tenantId] = H.logActivity.mock.calls[0];
    expect([accion, entidad, actor, tenantId]).toEqual(["pieza_liberada", "TenantPieza", "superadmin:root", "main"]);
    expect(texto).toMatch(/^Liberó la página «pagina-de-prueba»/);
  });

  it("una pieza que ya no está en el código también se puede liberar (limpieza)", async () => {
    const r = await borrar({ tenantId: "main", piezaId: "borrada-del-codigo", enchufe: "enchufe-viejo" });
    expect(r.status).toBe(200);
    expect(H.logActivity.mock.calls[0][2]).toMatch(/^Liberó la pieza «borrada-del-codigo»/);
  });

  it("fila que no existe → 404; negocio que no existe → 404; campo de más → 400", async () => {
    H.txFindUnique.mockResolvedValue(null);
    expect((await borrar(cuerpo)).status).toBe(404);
    expect((await borrar({ ...cuerpo, tenantId: "no-existe" })).status).toBe(404);
    expect((await borrar({ ...cuerpo, prendida: false })).status).toBe(400);
  });
});
