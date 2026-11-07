import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** «Quién miró el video»: registro deduplicado a 5 min, sin secretos, y quién lo lee. */
const H = vi.hoisted(() => ({
  payload: null as null | { username: string; role: string; tenantId: string },
  filas: [] as {
    tenantId: string;
    action: string;
    entityId: string;
    user: string;
    detail: string;
    createdAt: Date;
  }[],
  escritos: [] as {
    action: string;
    detail: string;
    user: string;
    entityId?: string;
    tenantId?: string;
  }[],
  consultas: [] as unknown[],
}));

vi.mock("@/lib/session", async (real) => ({
  ...(await real<typeof import("@/lib/session")>()),
  getSessionPayload: async () => H.payload,
}));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: () => null,
  createRateLimiter: () => ({ check: () => true, windowMs: 60_000 }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/activity-logger", () => ({
  logActivity: async (
    action: string,
    _e: string,
    detail: string,
    entityId: string,
    user: string,
    _r: unknown,
    tenantId: string,
  ) => {
    H.escritos.push({ action, detail, user, entityId, tenantId });
    H.filas.push({ tenantId, action, entityId, user, detail, createdAt: new Date() });
  },
}));
vi.mock("@/lib/db/activity-log.db", () => ({
  ActivityLogDB: {
    existeDesde: async (
      t: string,
      q: { action: string; entityId: string; user: string; desde: Date },
    ) =>
      H.filas.some(
        (f) =>
          f.tenantId === t &&
          f.action === q.action &&
          f.entityId === q.entityId &&
          f.user === q.user &&
          f.createdAt >= q.desde,
      ),
    listWithCursor: async (t: string, o: Record<string, unknown>) => {
      H.consultas.push({ t, ...o });
      return {
        items: H.filas
          .filter((f) => f.tenantId === t)
          .map((f, i) => ({ id: `m${i}`, entity: "camara", ...f })),
        nextCursor: null,
      };
    },
  },
}));

import { registrarMirada, VENTANA_MIRADA_MS } from "@/lib/camaras/registro-miradas";
import { GET } from "@/app/api/admin/camaras/miradas/route";

const cam = { id: "c1", nombre: "Patio" };
const quien = { usuario: "ana", rol: "almacenero" };

beforeEach(() => {
  H.payload = null;
  H.filas = [];
  H.escritos = [];
  H.consultas = [];
});

describe("registrarMirada", () => {
  it("anota una sola vez en 5 min por persona y cámara, y otra después", async () => {
    const t0 = new Date();
    await registrarMirada("t1", quien, cam, { tipo: "vivo", calidad: "sd" }, t0);
    await registrarMirada("t1", quien, cam, { tipo: "vivo", calidad: "hd" }, t0);
    expect(H.escritos).toHaveLength(1);
    await registrarMirada(
      "t1",
      { usuario: "luis", rol: "admin" },
      cam,
      { tipo: "vivo", calidad: "sd" },
      t0,
    );
    await registrarMirada(
      "t1",
      quien,
      { id: "c2", nombre: "Puerta" },
      { tipo: "vivo", calidad: "sd" },
      t0,
    );
    expect(H.escritos).toHaveLength(3);
    const despues = new Date(t0.getTime() + VENTANA_MIRADA_MS + 1000);
    H.filas.forEach((f) => (f.createdAt = new Date(t0.getTime() - VENTANA_MIRADA_MS - 1)));
    await registrarMirada("t1", quien, cam, { tipo: "vivo", calidad: "sd" }, despues);
    expect(H.escritos).toHaveLength(4);
  });

  it("guarda quién, cámara y qué; nada de permisos ni códigos", async () => {
    await registrarMirada("t1", quien, cam, {
      tipo: "grabacion",
      calidad: "hd",
      desde: "2026-10-05 08:00:00",
      hasta: "2026-10-05 08:10:00",
    });
    const e = H.escritos[0];
    expect(e).toMatchObject({
      action: "camara.video_nube_ver",
      user: "ana",
      entityId: "c1",
      tenantId: "t1",
    });
    expect(JSON.parse(e.detail)).toEqual({
      rol: "almacenero",
      camara: "Patio",
      tipo: "grabacion",
      calidad: "hd",
      desde: "2026-10-05 08:00:00",
      hasta: "2026-10-05 08:10:00",
    });
    expect(e.detail).not.toMatch(/token|codigo|code|appToken|url/i);
  });

  it("si el registro falla, no tira", async () => {
    const { ActivityLogDB } = await import("@/lib/db/activity-log.db");
    const orig = ActivityLogDB.existeDesde;
    ActivityLogDB.existeDesde = async () => {
      throw new Error("db caída");
    };
    await expect(
      registrarMirada("t1", quien, cam, { tipo: "vivo", calidad: "sd" }),
    ).resolves.toBeUndefined();
    ActivityLogDB.existeDesde = orig;
  });
});

describe("GET /api/admin/camaras/miradas", () => {
  const get = (qs = "") =>
    GET(
      new NextRequest(`http://localhost/api/admin/camaras/miradas${qs}`, {
        headers: { cookie: "buleje-admin-sess=x" },
      }),
    );
  const como = (role: string, tenantId = "t1") => {
    H.payload = { username: `qa-${role}`, role, tenantId };
  };

  it("sin sesión 401", async () => {
    expect((await get()).status).toBe(401);
  });

  it.each(["almacenero", "manager", "cajero"])("%s no entra (401/403)", async (role) => {
    como(role);
    expect([401, 403]).toContain((await get()).status);
  });

  it.each(["admin", "owner"])("%s ve la lista", async (role) => {
    como(role);
    await registrarMirada("t1", quien, cam, { tipo: "vivo", calidad: "sd" });
    const r = await get("?camaraId=c1&persona=ana");
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.miradas[0]).toMatchObject({
      persona: "ana",
      rol: "almacenero",
      camara: "Patio",
      tipo: "vivo",
    });
    expect(H.consultas[0]).toMatchObject({ t: "t1", entityId: "c1", user: "ana", limit: 50 });
  });

  it("no mezcla negocios", async () => {
    await registrarMirada("t1", quien, cam, { tipo: "vivo", calidad: "sd" });
    como("admin", "t2");
    const j = await (await get()).json();
    expect(j.miradas).toHaveLength(0);
  });

  it("filtro inválido 400", async () => {
    como("admin");
    expect((await get(`?persona=${"x".repeat(100)}`)).status).toBe(400);
  });
});
