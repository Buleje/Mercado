/**
 * Guardar el plano del Libro TH sin pisar lo que guardó otro (29-09-2026).
 *
 * El PUT reemplaza el documento entero: dos personas con el mapa abierto
 * —o el planificador agregando mientras alguien edita una referencia— se
 * pisaban sin enterarse. Con `baseUpdatedAt` el segundo recibe la versión
 * actual y no escribe. La clave del KV se lee y escribe bajo su lock
 * (`actualizar`), así que dos PUT con la misma base no pasan los dos: acá el
 * falso de `actualizar` los pone en fila igual que el advisory lock.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  guardado: null as unknown,
  escrituras: 0,
  fila: Promise.resolve() as Promise<unknown>,
  payload: null as null | { username: string; role: string; tenantId: string },
}));

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/forestal/loth-audit", () => ({ auditLoth: vi.fn() }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
vi.mock("@/lib/session", async (real) => ({ ...(await real<typeof import("@/lib/session")>()), getSessionPayload: async () => H.payload }));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PREFIJO_INTERNO: "interno:",
  PlatformSettingsDB: {
    getFresco: async () => H.guardado,
    /** Como el advisory lock: cada `actualizar` espera al anterior, lee y escribe. */
    actualizar: (_key: string, cambio: (actual: unknown) => Promise<{ valor?: unknown; resultado: unknown }> | { valor?: unknown; resultado: unknown }) => {
      const turno = H.fila.then(async () => {
        await new Promise((r) => setTimeout(r, 5));
        const r = await cambio(H.guardado);
        if (r.valor !== undefined) {
          H.guardado = JSON.parse(JSON.stringify(r.valor));
          H.escrituras++;
        }
        return r.resultado;
      });
      H.fila = turno.catch(() => undefined);
      return turno;
    },
  },
}));

import { CartografiaCambioError, ForestLothCartografiaDB } from "@/lib/db/forest-loth-cartografia.db";
import { PUT } from "@/app/api/admin/forestal/loth/cartografia/route";

const ref = (id: string, nombre: string) => ({ id, nombre, tipo: "hito", lat: -9.8, lng: -74.8, nota: "" });

beforeEach(() => {
  H.guardado = null;
  H.escrituras = 0;
  H.fila = Promise.resolve();
  H.payload = { username: "qa-admin", role: "admin", tenantId: "t1" };
});

describe("ForestLothCartografiaDB.set — control optimista", () => {
  it("la carrera: A y B leyeron la misma versión; guarda A, y B recibe la de A sin escribir", async () => {
    const v1 = await ForestLothCartografiaDB.set("t1", { referencias: [ref("r1", "Caserío")] }, "u", "2026-09-29T15:00:00.000Z");
    const base = v1.updatedAt;
    const [a, b] = await Promise.allSettled([
      ForestLothCartografiaDB.set("t1", { referencias: [ref("r1", "Caserío"), ref("r2", "De A")] }, "a", "2026-09-29T15:01:00.000Z", { baseUpdatedAt: base }),
      ForestLothCartografiaDB.set("t1", { referencias: [ref("r1", "Caserío"), ref("r3", "De B")] }, "b", "2026-09-29T15:01:00.500Z", { baseUpdatedAt: base }),
    ]);
    expect(a.status).toBe("fulfilled");
    expect(b.status).toBe("rejected");
    const err = (b as PromiseRejectedResult).reason;
    expect(err).toBeInstanceOf(CartografiaCambioError);
    expect((err as CartografiaCambioError).actual.referencias.map((r) => r.nombre)).toEqual(["Caserío", "De A"]);
    // Lo de A sigue guardado: B no lo pisó.
    expect(((H.guardado as { referencias: { nombre: string }[] }).referencias ?? []).map((r) => r.nombre)).toEqual(["Caserío", "De A"]);
    expect(H.escrituras).toBe(2);
  });

  it("sin base (clientes viejos) se guarda como siempre", async () => {
    await ForestLothCartografiaDB.set("t1", { referencias: [ref("r1", "Uno")] }, "u", "2026-09-29T15:00:00.000Z");
    await ForestLothCartografiaDB.set("t1", { referencias: [ref("r1", "Dos")] }, "u", "2026-09-29T15:05:00.000Z");
    expect((H.guardado as { referencias: { nombre: string }[] }).referencias[0].nombre).toBe("Dos");
  });

  it("base null = «nunca se guardó»: pasa sólo si de verdad no hay nada", async () => {
    await expect(ForestLothCartografiaDB.set("t1", { referencias: [] }, "u", undefined, { baseUpdatedAt: null })).resolves.toBeTruthy();
    await expect(ForestLothCartografiaDB.set("t1", { referencias: [] }, "u", undefined, { baseUpdatedAt: null })).rejects.toBeInstanceOf(CartografiaCambioError);
  });
});

describe("PUT /loth/cartografia", () => {
  const put = (cuerpo: unknown) =>
    PUT(
      new NextRequest("http://localhost/api/admin/forestal/loth/cartografia", {
        method: "PUT",
        headers: { cookie: "buleje-admin-sess=token-falso", "content-type": "application/json" },
        body: JSON.stringify(cuerpo),
      }),
    );

  it("base vieja → 409 cartografia_cambio con la versión actual, y no escribe", async () => {
    const primero = await (await put({ referencias: [ref("r1", "Caserío")], baseUpdatedAt: null })).json();
    const base = primero.cartografia.updatedAt as string;
    expect((await put({ referencias: [ref("r1", "Caserío"), ref("r2", "Nuevo")], baseUpdatedAt: base })).status).toBe(200);
    const escrituras = H.escrituras;
    const r = await put({ referencias: [ref("r9", "Pisaría")], baseUpdatedAt: base });
    expect(r.status).toBe(409);
    const j = await r.json();
    expect(j.error).toBe("cartografia_cambio");
    expect(j.cartografia.referencias.map((x: { nombre: string }) => x.nombre)).toEqual(["Caserío", "Nuevo"]);
    expect(H.escrituras).toBe(escrituras);
  });

  it("el almacenero no guarda (403): la misma regla que el planificador devuelve como `puedeGuardar`", async () => {
    H.payload = { username: "qa-alm", role: "almacenero", tenantId: "t1" };
    expect((await put({ referencias: [] })).status).toBe(403);
  });
});
