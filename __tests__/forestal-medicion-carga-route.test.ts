// @vitest-environment node
/**
 * /api/admin/forestal/loth/medicion-carga (+ /[id]/fotos) — 16-10, F3.
 *
 * Corre las rutas reales y `ForestMedicionCargaDB` real sobre un KV falso
 * (un Map por clave), para ver lo guardado de cada negocio: roles, tenant ajeno
 * (permiso, guía, carga y foto de otro → 404, sin escribir), tope, 409 cuando
 * otra PC tiene la clave, y los estados usada / descartada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => {
  class ClaveOcupadaError extends Error {
    constructor(readonly key: string) {
      super(`La clave ${key} está tomada`);
      this.name = "ClaveOcupadaError";
    }
  }
  const kv = new Map<string, unknown>();
  return {
    kv,
    ClaveOcupadaError,
    ocupada: { valor: false },
    esperas: [] as (number | undefined)[],
    auth: { tenantId: "t1", username: "monte", role: "almacenero" } as { tenantId: string; username: string; role: string } | null,
    planes: [
      { id: "plan-1", tenantId: "t1", planType: "PO", planNumber: "PO-1", tituloHabilitante: "25-UCA/C-OPP-001", titularName: "Juan", isActive: true },
      { id: "plan-ajeno", tenantId: "t2", planType: "PO", planNumber: "PO-9", tituloHabilitante: null, titularName: "Otro", isActive: true },
    ],
    guias: [
      { tenantId: "t1", gtfNumber: "019-001-0000123" },
      { tenantId: "t1", gtfNumber: "019-001-0000124" },
      { tenantId: "t2", gtfNumber: "019-001-0000999" },
    ],
    pasarFotos: vi.fn(async () => ({ pasadas: 1, sinLugar: 0, fallidas: 0 })),
    guardarFoto: vi.fn(async () => ({ id: "doc-1" })),
    softDelete: vi.fn(async () => true),
    audit: vi.fn(),
  };
});

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: vi.fn(async () => true) }));
vi.mock("@/lib/require-admin", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireAdmin: vi.fn(async (_req: unknown, roles: readonly string[]) => {
      if (!H.auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      if (!roles.includes(H.auth.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      return H.auth;
    }),
  };
});
vi.mock("@/lib/db/platform-settings.db", () => ({
  PREFIJO_INTERNO: "interno:",
  ClaveOcupadaError: H.ClaveOcupadaError,
  PlatformSettingsDB: {
    getFresco: async (key: string) => structuredClone(H.kv.get(key) ?? null),
    actualizar: async (
      key: string,
      fn: (actual: unknown, tx: unknown) => Promise<{ valor?: unknown; resultado: unknown }> | { valor?: unknown; resultado: unknown },
      _user: string,
      opts?: { esperaMaxMs?: number },
    ) => {
      H.esperas.push(opts?.esperaMaxMs);
      if (H.ocupada.valor) throw new H.ClaveOcupadaError(key);
      const r = await fn(structuredClone(H.kv.get(key) ?? null), {});
      if (r.valor !== undefined) H.kv.set(key, structuredClone(r.valor));
      return r.resultado;
    },
  },
}));
vi.mock("@/lib/db/forest-plan.db", () => ({
  ForestPlanDB: {
    getPlan: async (tenantId: string, id: string) => H.planes.find((p) => p.tenantId === tenantId && p.id === id) ?? null,
    listPlans: async (tenantId: string) => H.planes.filter((p) => p.tenantId === tenantId),
  },
}));
vi.mock("@/lib/db/forest-loth.db", () => ({ ForestLothDB: { siguientesCorrelativos: async () => ({ "plan-1": 24 }) } }));
vi.mock("@/lib/db/ctp-guia-documentos.db", () => ({
  CtpGuiaDocumentosDB: {
    datosDeGuia: async (tenantId: string, gtf: string) => H.guias.find((g) => g.tenantId === tenantId && g.gtfNumber === gtf.trim()) ?? null,
  },
}));
vi.mock("@/lib/db/documents.db", () => ({ DocumentsDB: { softDelete: H.softDelete, getById: vi.fn(async () => null) } }));
vi.mock("@/lib/documents/storage", () => ({ esInlineSeguro: () => true, getSignedUrl: vi.fn(async () => "https://firmada") }));
vi.mock("@/lib/forestal/documentos-guia-server", () => ({
  prepararArchivo: vi.fn(async () => ({ ok: true, mime: "image/webp", buffer: Buffer.from("x"), nombre: "f.webp" })),
}));
vi.mock("@/lib/forestal/medicion-carga-server", () => ({
  pasarFotosALaGuia: H.pasarFotos,
  guardarFotoDeCarga: H.guardarFoto,
  esFotoDeLaCarga: () => true,
}));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: H.audit }));

import { GET, PATCH, POST } from "@/app/api/admin/forestal/loth/medicion-carga/route";
import { POST as POST_FOTO } from "@/app/api/admin/forestal/loth/medicion-carga/[id]/fotos/route";
import { MAX_CARGAS_VIVAS } from "@/lib/forestal/medicion-carga";

const URL_BASE = "http://localhost/api/admin/forestal/loth/medicion-carga";
const json = (method: string, body: unknown) =>
  new NextRequest(URL_BASE, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const fila = (codigo: string, d1 = 45) => ({ codigo, d1Cm: d1, d2Cm: d1 - 2, largoM: 3.2, especie: "Tornillo", medidoPorFoto: true });
const carga = (extra: Record<string, unknown> = {}) => ({ planId: "plan-1", desde: 24, fotosEsperadas: 2, filas: [fila("24"), fila("25")], ...extra });
const como = (tenantId: string, role = "almacenero") => {
  H.auth = { tenantId, username: `${role}@${tenantId}`, role };
};
const kvDe = (tenantId: string) => H.kv.get(`interno:medicion-carga:${tenantId}`) as { cargas: { id: string; estado: string }[] } | undefined;

async function guardar(body: unknown = carga()): Promise<{ status: number; data: { carga?: { id: string; trozas: number; volumenM3: number }; error?: string } }> {
  const res = await POST(json("POST", body));
  return { status: res.status, data: await res.json() };
}
const ctxFoto = (id: string) => ({ params: Promise.resolve({ id }) });
function foto(id: string) {
  const fd = new FormData();
  fd.set("tipo", "original");
  fd.set("file", new File([new Uint8Array([1, 2, 3])], "carga.webp", { type: "image/webp" }));
  return POST_FOTO(new NextRequest(`${URL_BASE}/${id}/fotos`, { method: "POST", body: fd }), ctxFoto(id));
}

beforeEach(() => {
  H.kv.clear();
  H.ocupada.valor = false;
  H.esperas.length = 0;
  como("t1");
  vi.clearAllMocks();
});

describe("quién entra", () => {
  it("sin sesión 401 y cajero 403, sin escribir nada", async () => {
    H.auth = null;
    expect((await guardar()).status).toBe(401);
    como("t1", "cajero");
    expect((await guardar()).status).toBe(403);
    expect((await GET(new NextRequest(URL_BASE))).status).toBe(403);
    expect(H.kv.size).toBe(0);
  });

  it("almacenero, admin y dueño guardan", async () => {
    for (const role of ["almacenero", "admin", "owner"]) {
      como("t1", role);
      expect((await guardar()).status).toBe(201);
    }
    expect(kvDe("t1")?.cargas).toHaveLength(3);
  });
});

describe("guardar", () => {
  it("201 con el volumen del servidor; el GET la devuelve con permisos y N° que sigue", async () => {
    const { status, data } = await guardar();
    expect(status).toBe(201);
    expect(data.carga).toMatchObject({ trozas: 2, estado: "medida", planId: "plan-1", creada: { por: "almacenero@t1" } });
    expect(data.carga?.volumenM3).toBeGreaterThan(0);
    expect(H.esperas).toEqual([3000]);
    expect(H.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t1", action: "loth_medicion_carga_guardar" }));

    const g = await (await GET(new NextRequest(URL_BASE))).json();
    expect(g.cargas.map((c: { id: string }) => c.id)).toEqual([data.carga?.id]);
    expect(g.planes.map((p: { id: string }) => p.id)).toEqual(["plan-1"]);
    expect(g.siguienteCorrelativo).toEqual({ "plan-1": 24 });
    const solo = await (await GET(new NextRequest(`${URL_BASE}?solo=cargas`))).json();
    expect(Object.keys(solo).sort()).toEqual(["cargas", "recientes"]);
  });

  it("fila fuera de rango → 422 con su N°; cuerpo malo → 400", async () => {
    const mala = await guardar(carga({ filas: [fila("24"), fila("25", 5000)] }));
    expect(mala.status).toBe(422);
    expect(mala.data).toMatchObject({ error: "fila_invalida", fila: "25" });
    expect((await guardar({ planId: "plan-1", filas: [] })).status).toBe(400);
    expect(H.kv.size).toBe(0);
  });

  it("con el tope de cargas sin usar → 409 tope", async () => {
    for (let i = 0; i < MAX_CARGAS_VIVAS; i++) expect((await guardar()).status).toBe(201);
    const r = await guardar();
    expect(r.status).toBe(409);
    expect(r.data.error).toBe("tope");
    expect(kvDe("t1")?.cargas).toHaveLength(MAX_CARGAS_VIVAS);
  });

  it("otra PC tiene la clave → 409 ocupado (POST, PATCH y foto), sin pisar", async () => {
    const { data } = await guardar();
    const id = data.carga!.id;
    H.ocupada.valor = true;
    const r = await guardar();
    expect(r.status).toBe(409);
    expect(r.data.error).toBe("ocupado");
    const p = await PATCH(json("PATCH", { id, accion: "descartar", motivo: "repetida" }));
    expect(p.status).toBe(409);
    const f = await foto(id);
    expect(f.status).toBe(409);
    expect(H.softDelete).toHaveBeenCalledWith("t1", "doc-1");
    H.ocupada.valor = false;
    expect(kvDe("t1")?.cargas.map((c) => c.estado)).toEqual(["medida"]);
  });
});

describe("tenant ajeno", () => {
  it("permiso de otro negocio → 404 y no guarda", async () => {
    const r = await guardar(carga({ planId: "plan-ajeno" }));
    expect(r.status).toBe(404);
    expect(r.data.error).toBe("plan_no_existe");
    expect(H.kv.size).toBe(0);
  });

  it("la carga de t1 no se ve, no se usa, no se descarta ni recibe fotos desde t2", async () => {
    const { data } = await guardar();
    const id = data.carga!.id;
    como("t2", "admin");
    const g = await (await GET(new NextRequest(`${URL_BASE}?solo=cargas`))).json();
    expect(g.cargas).toEqual([]);
    expect((await PATCH(json("PATCH", { id, accion: "descartar", motivo: "ajena" }))).status).toBe(404);
    expect((await PATCH(json("PATCH", { id, accion: "usada", gtfNumber: "019-001-0000999" }))).status).toBe(404);
    expect((await foto(id)).status).toBe(404);
    expect(H.guardarFoto).not.toHaveBeenCalled();
    expect(kvDe("t1")?.cargas.map((c) => c.estado)).toEqual(["medida"]);
    expect(kvDe("t2")).toBeUndefined();
  });

  it("usada con una guía de otro negocio → 404 guia_no_existe", async () => {
    const { data } = await guardar();
    como("t1", "admin");
    const r = await PATCH(json("PATCH", { id: data.carga!.id, accion: "usada", gtfNumber: "019-001-0000999" }));
    expect(r.status).toBe(404);
    expect((await r.json()).error).toBe("guia_no_existe");
    expect(kvDe("t1")?.cargas[0]?.estado).toBe("medida");
  });
});

describe("estados", () => {
  it("marcar usada a mano es de admin/dueño: el almacenero recibe 403 y no toca nada", async () => {
    const { data } = await guardar();
    const r = await PATCH(json("PATCH", { id: data.carga!.id, accion: "usada", gtfNumber: "019-001-0000123" }));
    expect(r.status).toBe(403);
    expect(kvDe("t1")?.cargas[0]?.estado).toBe("medida");
    expect(H.pasarFotos).not.toHaveBeenCalled();
    como("t1", "owner");
    expect((await PATCH(json("PATCH", { id: data.carga!.id, accion: "usada", gtfNumber: "019-001-0000123" }))).status).toBe(200);
  });

  it("usada: misma guía otra vez = 200 sin cambio y las fotos vuelven a pasar (salta las que ya están); otra guía = 409", async () => {
    const { data } = await guardar();
    const id = data.carga!.id;
    como("t1", "admin");
    const r1 = await PATCH(json("PATCH", { id, accion: "usada", gtfNumber: "019-001-0000123" }));
    expect(r1.status).toBe(200);
    expect(await r1.json()).toMatchObject({ carga: { estado: "usada", usada: { gtfNumber: "019-001-0000123" } }, fotos: { pasadas: 1 } });
    const r2 = await PATCH(json("PATCH", { id, accion: "usada", gtfNumber: "019-001-0000123" }));
    expect(r2.status).toBe(200);
    expect((await r2.json()).fotos).toEqual({ pasadas: 1, sinLugar: 0, fallidas: 0 });
    expect(H.pasarFotos).toHaveBeenCalledTimes(2);
    const r3 = await PATCH(json("PATCH", { id, accion: "usada", gtfNumber: "019-001-0000124" }));
    expect(r3.status).toBe(409);
    expect((await r3.json()).error).toBe("otra_guia");
    expect((await PATCH(json("PATCH", { id, accion: "descartar", motivo: "tarde" }))).status).toBe(409);
    expect(H.audit.mock.calls.filter(([a]) => (a as { action: string }).action === "loth_medicion_carga_usar")).toHaveLength(1);
  });

  it("descartar pide motivo; descartada ya no se usa ni recibe fotos; pasa a «recientes»", async () => {
    const { data } = await guardar();
    const id = data.carga!.id;
    expect((await PATCH(json("PATCH", { id, accion: "descartar", motivo: "x" }))).status).toBe(400);
    const r = await PATCH(json("PATCH", { id, accion: "descartar", motivo: "foto repetida" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ carga: { estado: "descartada", descartada: { motivo: "foto repetida" } } });
    como("t1", "admin");
    expect((await PATCH(json("PATCH", { id, accion: "usada", gtfNumber: "019-001-0000123" }))).status).toBe(409);
    expect((await foto(id)).status).toBe(409);
    const g = await (await GET(new NextRequest(`${URL_BASE}?solo=cargas`))).json();
    expect(g.cargas).toEqual([]);
    expect(g.recientes.map((c: { id: string }) => c.id)).toEqual([id]);
  });

  it("la foto subida queda atada a la carga; si la carga no existe, no se sube nada", async () => {
    const { data } = await guardar();
    const f = await foto(data.carga!.id);
    expect(f.status).toBe(201);
    expect((await f.json()).carga.fotos).toEqual([expect.objectContaining({ docId: "doc-1", tipo: "original" })]);
    expect((await foto("no-existe")).status).toBe(404);
    expect(H.guardarFoto).toHaveBeenCalledTimes(1);
  });
});
