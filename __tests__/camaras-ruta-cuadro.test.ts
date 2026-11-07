/**
 * Puente de pantalla (ADR-466) — las dos puertas:
 *  · GET /api/admin/camaras/[id]/cuadro con el `requireAdmin` REAL (sólo se
 *    simula el JWT): 401 sin sesión, 404 con la cámara de otro negocio, 204 sin
 *    cuadro, 200 con la imagen y sus cabeceras.
 *  · POST /api/webhooks/camara?modo=vivo: token inválido, modo desconocido,
 *    tamaño, formato y la respuesta `{ ok, guardada, motivo }`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  payload: null as null | { username: string; role: string; tenantId: string },
  camarasPorTenant: {} as Record<string, { id: string; token: string; activa: boolean }[]>,
  listaPedida: [] as string[],
  ultimo: vi.fn(),
  recibir: vi.fn(),
  porToken: vi.fn(),
}));

vi.mock("@/lib/session", async (real) => ({
  ...(await real<typeof import("@/lib/session")>()),
  getSessionPayload: async () => H.payload,
}));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/camaras/cruces.server", () => ({ procesarCapturaNueva: vi.fn() }));
vi.mock("@/lib/db/camaras.db", () => ({
  CamarasDB: {
    list: async (tenantId: string) => {
      H.listaPedida.push(tenantId);
      return H.camarasPorTenant[tenantId] ?? [];
    },
    porToken: (...a: unknown[]) => H.porToken(...a),
    registrarCaptura: vi.fn(),
  },
}));
vi.mock("@/lib/camaras/cuadro-vivo.server", () => {
  class CuadroIlegible extends Error {}
  return {
    CuadroIlegible,
    ultimoCuadro: (...a: unknown[]) => H.ultimo(...a),
    recibirCuadro: (...a: unknown[]) => H.recibir(...a),
  };
});

import { GET } from "@/app/api/admin/camaras/[id]/cuadro/route";
import { POST } from "@/app/api/webhooks/camara/route";

const TOKEN = "a".repeat(32);
const como = (role: string, tenantId = "t-main") => {
  H.payload = { username: `qa-${role}`, role, tenantId };
};
const pedirCuadro = (id: string, headers: Record<string, string> = {}) =>
  GET(new NextRequest(`http://localhost/api/admin/camaras/${id}/cuadro`, { headers: { cookie: "buleje-admin-sess=x", ...headers } }), {
    params: Promise.resolve({ id }),
  });
const mandar = (query: string, cuerpo: Uint8Array<ArrayBuffer>, tipo = "image/jpeg") =>
  POST(
    new NextRequest(`http://localhost/api/webhooks/camara?${query}`, {
      method: "POST",
      headers: { "content-type": tipo },
      body: cuerpo,
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  como("almacenero");
  H.listaPedida = [];
  H.camarasPorTenant = {
    "t-main": [{ id: "cam_main", token: TOKEN, activa: true }],
    "t-otro": [{ id: "cam_otro", token: "b".repeat(32), activa: true }],
  };
  H.ultimo.mockResolvedValue(null);
  H.porToken.mockImplementation(async (k: string) =>
    k === TOKEN ? { tenantId: "t-main", camara: H.camarasPorTenant["t-main"]![0] } : null,
  );
  H.recibir.mockResolvedValue({ guardada: false, motivo: "sin_cambio" });
});

describe("GET /api/admin/camaras/[id]/cuadro", () => {
  it("sin sesión → 401", async () => {
    H.payload = null;
    expect((await pedirCuadro("cam_main")).status).toBe(401);
  });

  it("un rol que no mira cámaras → 403", async () => {
    como("cajero");
    expect((await pedirCuadro("cam_main")).status).toBe(403);
  });

  it("la cámara de otro negocio → 404 (se busca en el de la sesión); con el header de ese negocio → 403; nunca lee su cuadro", async () => {
    const r = await pedirCuadro("cam_otro");
    expect(r.status).toBe(404);
    expect(H.listaPedida).toEqual(["t-main"]);
    /* requireAdmin corta el header que no coincide con el JWT antes de buscar nada */
    expect((await pedirCuadro("cam_otro", { "x-tenant-id": "t-otro" })).status).toBe(403);
    expect(H.listaPedida).toEqual(["t-main"]);
    expect(H.ultimo).not.toHaveBeenCalled();
  });

  it("sin cuadro en los últimos 60 s → 204 sin cuerpo", async () => {
    const r = await pedirCuadro("cam_main");
    expect(r.status).toBe(204);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(H.ultimo).toHaveBeenCalledWith("t-main", "cam_main");
  });

  it("con cuadro → 200 webp, no-store y X-Cuadro-Ts", async () => {
    const ts = Date.parse("2026-10-03T23:00:00.000Z");
    H.ultimo.mockResolvedValue({ ts, imagen: Buffer.from([1, 2, 3]) });
    const r = await pedirCuadro("cam_main");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/webp");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-cuadro-ts")).toBe("2026-10-03T23:00:00.000Z");
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe("POST /api/webhooks/camara?modo=vivo", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

  it("token inválido (corto o desconocido) → 401 sin datos", async () => {
    for (const q of ["k=corto&modo=vivo", `k=${"z".repeat(32)}&modo=vivo`, "modo=vivo"]) {
      const r = await mandar(q, jpeg);
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual({ ok: false });
    }
    expect(H.recibir).not.toHaveBeenCalled();
  });

  it("modo desconocido → 400 modo_invalido", async () => {
    const r = await mandar(`k=${TOKEN}&modo=video`, jpeg);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("modo_invalido");
  });

  it("un cuadro válido → { ok, guardada, motivo } con el tenant del token", async () => {
    H.recibir.mockResolvedValue({ guardada: true, motivo: "cambio" });
    const r = await mandar(`k=${TOKEN}&modo=vivo`, jpeg);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, guardada: true, motivo: "cambio" });
    expect(H.recibir).toHaveBeenCalledWith("t-main", H.camarasPorTenant["t-main"]![0], expect.any(Buffer), expect.any(Function));
  });

  it("más de 1 MB → 413; PNG → 415; sin imagen → 400", async () => {
    expect((await mandar(`k=${TOKEN}&modo=vivo`, new Uint8Array(1024 * 1024 + 20_000))).status).toBe(413);
    expect((await mandar(`k=${TOKEN}&modo=vivo`, jpeg, "image/png")).status).toBe(415);
    expect((await mandar(`k=${TOKEN}&modo=vivo`, new Uint8Array(0))).status).toBe(400);
    expect(H.recibir).not.toHaveBeenCalled();
  });
});
