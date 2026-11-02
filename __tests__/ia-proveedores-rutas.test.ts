/**
 * Buleje IA (ADR-528) — la clave del negocio de punta a punta: rutas
 * `/api/admin/ia/proveedores/**` → `IaProveedoresDB` (sobre un prisma en
 * memoria) → `/models` del proveedor (fetch simulado). Cubre: cifrado ida y
 * vuelta, que la clave JAMÁS vuelva en una respuesta, principal único, id de
 * otro negocio = 404, la clave guardada no viaja a otra dirección y el router
 * del negocio cayendo a la plataforma.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

type FilaFalsa = Record<string, unknown> & { id: string; tenantId: string; updatedAt: Date; createdAt: Date };

const H = vi.hoisted(() => ({
  auth: { tenantId: "t-uno", username: "dueno", role: "admin" } as { tenantId: string; username: string; role: string } | null,
  filas: [] as FilaFalsa[],
  seq: 0,
  reloj: 1,
  plataforma: vi.fn(),
}));

function coincide(f: FilaFalsa, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === "NOT") return !coincide(f, v as Record<string, unknown>);
    return f[k] === v;
  });
}
function elegir(f: FilaFalsa, select?: Record<string, boolean>): Record<string, unknown> {
  if (!select) return { ...f };
  return Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, f[k]]));
}

vi.mock("@/lib/prisma", () => {
  const modelo = {
    findMany: async ({ where, select }: { where?: Record<string, unknown>; select?: Record<string, boolean> }) =>
      H.filas.filter((f) => coincide(f, where)).map((f) => elegir(f, select)),
    findFirst: async ({ where, select, orderBy }: { where?: Record<string, unknown>; select?: Record<string, boolean>; orderBy?: unknown }) => {
      let filas = H.filas.filter((f) => coincide(f, where));
      if (orderBy) filas = [...filas].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      return filas[0] ? elegir(filas[0], select) : null;
    },
    count: async ({ where }: { where?: Record<string, unknown> }) => H.filas.filter((f) => coincide(f, where)).length,
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const filas = H.filas.filter((f) => coincide(f, where));
      for (const f of filas) Object.assign(f, data, { updatedAt: new Date(H.reloj++) });
      return { count: filas.length };
    },
    create: async ({ data, select }: { data: Record<string, unknown>; select?: Record<string, boolean> }) => {
      const f = { ...data, id: `ia${++H.seq}`, createdAt: new Date(H.reloj), updatedAt: new Date(H.reloj++) } as FilaFalsa;
      H.filas.push(f);
      return elegir(f, select);
    },
    deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
      const antes = H.filas.length;
      H.filas = H.filas.filter((f) => !coincide(f, where));
      return { count: antes - H.filas.length };
    },
  };
  const tx = { tenantIaProveedor: modelo, $executeRaw: async () => 0 };
  return { prisma: { ...tx, $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) } };
});
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () => (H.auth ? H.auth : NextResponse.json({ error: "No autorizado" }, { status: 401 }))),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/llm-router", () => ({
  callLLM: H.plataforma,
  resolveLLMRoute: () => ({ provider: "groq", model: "openai/gpt-oss-120b" }),
}));

import { GET, POST } from "@/app/api/admin/ia/proveedores/route";
import { POST as PROBAR } from "@/app/api/admin/ia/proveedores/probar/route";
import { DELETE, PATCH } from "@/app/api/admin/ia/proveedores/[id]/route";
import { IaProveedoresDB } from "@/lib/db/ia-proveedores.db";
import { callLLMDelNegocio } from "@/lib/ia-proveedores/router-negocio";
import { descifrarSecreto } from "@/lib/cripto-secretos";
import { invalidate } from "@/lib/cache";

const CLAVE = "sk-proj-SECRETA-abcd1234";
const CLAVE2 = "sk-proj-OTRA-zzzz9876";
const URL_BASE = "http://localhost/api/admin/ia/proveedores";
const fetchOriginal = globalThis.fetch;
let pedidos: Array<{ url: string; auth: string }> = [];

function req(url: string, method = "GET", body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
/** Simula el `/models` de OpenAI: solo CLAVE y CLAVE2 son buenas. */
function proveedorFalso() {
  globalThis.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
    const auth = String((init?.headers as Record<string, string>)?.Authorization ?? "");
    pedidos.push({ url: String(u), auth });
    if (!auth.endsWith(CLAVE) && !auth.endsWith(CLAVE2)) {
      return new Response('{"error":{"message":"Incorrect API key provided"}}', { status: 401 });
    }
    if (String(u).endsWith("/models")) {
      return new Response(JSON.stringify({ data: [{ id: "gpt-5.5" }, { id: "gpt-5.5-mini" }] }), { status: 200 });
    }
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "hola del negocio" } }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } }),
      { status: 200 },
    );
  }) as typeof fetch;
}
async function alta(body: Record<string, unknown>) {
  const r = await POST(req(URL_BASE, "POST", { proveedor: "openai", modelo: "gpt-5.5", clave: CLAVE, ...body }), ctx(""));
  return { status: r.status, json: await r.json() };
}

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", "secreto-de-prueba-de-al-menos-32-caracteres!!");
  H.auth = { tenantId: "t-uno", username: "dueno", role: "admin" };
  H.filas = [];
  pedidos = [];
  H.plataforma.mockReset();
  H.plataforma.mockResolvedValue({ ok: true, content: "hola de la plataforma", provider: "groq", model: "openai/gpt-oss-120b", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, latencyMs: 1 });
  proveedorFalso();
  for (const t of ["t-uno", "t-otro"]) invalidate(`ia-proveedores:${t}`);
});
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  vi.unstubAllEnvs();
});

describe("alta y lectura: la clave nunca vuelve", () => {
  it("POST prueba, cifra y devuelve solo los últimos 4", async () => {
    const r = await alta({});
    expect(r.status).toBe(201);
    expect(JSON.stringify(r.json)).not.toContain(CLAVE);
    expect(r.json.proveedor).toMatchObject({ proveedor: "openai", modelo: "gpt-5.5", claveFinal: "1234", principal: true, ultimoEstado: "ok" });
    const guardada = String(H.filas[0].claveCifrada);
    expect(guardada).not.toContain(CLAVE);
    expect(descifrarSecreto(guardada)).toBe(CLAVE);
    expect(pedidos[0]).toEqual({ url: "https://api.openai.com/v1/models", auth: `Bearer ${CLAVE}` });

    const g = await GET(req(URL_BASE), ctx(""));
    const cuerpo = await g.text();
    expect(cuerpo).not.toContain(CLAVE);
    expect(cuerpo).not.toContain("claveCifrada");
    expect(JSON.parse(cuerpo)).toMatchObject({ plataforma: { disponible: expect.any(Boolean) }, configurados: [{ claveFinal: "1234" }] });
    expect(JSON.parse(cuerpo).catalogo).toHaveLength(12);
  });

  it("clave mala = 422 y no guarda nada", async () => {
    const r = await alta({ clave: "sk-mala-0000" });
    expect(r.status).toBe(422);
    expect(r.json.error).toBe("clave_invalida");
    expect(H.filas).toHaveLength(0);
  });

  it("modelo que no está en la cuenta = 422 modelo_no_disponible", async () => {
    const r = await alta({ modelo: "gpt-4-dado-de-baja" });
    expect(r.status).toBe(422);
    expect(r.json.error).toBe("modelo_no_disponible");
    expect(H.filas).toHaveLength(0);
  });

  it("sin sesión = 401 (nunca 404)", async () => {
    H.auth = null;
    expect((await GET(req(URL_BASE), ctx(""))).status).toBe(401);
    expect((await PROBAR(req(`${URL_BASE}/probar`, "POST", { proveedor: "openai", clave: CLAVE }), ctx(""))).status).toBe(401);
  });
});

describe("principal único", () => {
  it("el 1.º queda principal; uno nuevo con principal:true le quita la marca; PATCH y DELETE la mueven", async () => {
    const a = (await alta({})).json.proveedor;
    const b = (await alta({ modelo: "gpt-5.5-mini" })).json.proveedor;
    expect([a.principal, b.principal]).toEqual([true, false]);

    const c = (await alta({ clave: CLAVE2, principal: true })).json.proveedor;
    expect(H.filas.filter((f) => f.principal).map((f) => f.id)).toEqual([c.id]);

    const p = await PATCH(req(`${URL_BASE}/${b.id}`, "PATCH", { principal: true }), ctx(b.id));
    expect(p.status).toBe(200);
    expect(H.filas.filter((f) => f.principal).map((f) => f.id)).toEqual([b.id]);
    expect(await p.text()).not.toContain(CLAVE);

    const d = await DELETE(req(`${URL_BASE}/${b.id}`, "DELETE"), ctx(b.id));
    expect(d.status).toBe(200);
    expect(H.filas.filter((f) => f.principal)).toHaveLength(1);
    expect(H.filas.find((f) => f.id === b.id)).toBeUndefined();
  });

  it("el GET ve el cambio enseguida (caché invalidada tras cada escritura)", async () => {
    await alta({});
    const antes = (await (await GET(req(URL_BASE), ctx(""))).json()).configurados;
    expect(antes).toHaveLength(1);
    await alta({ clave: CLAVE2, principal: true });
    const despues = (await (await GET(req(URL_BASE), ctx(""))).json()).configurados;
    expect(despues).toHaveLength(2);
    expect(despues.filter((x: { principal: boolean }) => x.principal)).toHaveLength(1);
  });
});

describe("multi-tenant y la clave guardada", () => {
  it("un id de otro negocio = 404 en PATCH, DELETE y probar; su fila no se toca", async () => {
    const ajeno = (await alta({})).json.proveedor;
    H.auth = { tenantId: "t-otro", username: "intruso", role: "admin" };
    expect((await PATCH(req(`${URL_BASE}/${ajeno.id}`, "PATCH", { nombre: "mío" }), ctx(ajeno.id))).status).toBe(404);
    expect((await DELETE(req(`${URL_BASE}/${ajeno.id}`, "DELETE"), ctx(ajeno.id))).status).toBe(404);
    const pr = await PROBAR(req(`${URL_BASE}/probar`, "POST", { proveedor: "openai", configId: ajeno.id }), ctx(""));
    expect(pr.status).toBe(404);
    expect(H.filas).toHaveLength(1);
    expect(H.filas[0].nombre).toBe("");
    expect((await (await GET(req(URL_BASE), ctx(""))).json()).configurados).toEqual([]);
  });

  it("probar con configId usa la clave guardada y anota el estado; otra dirección exige pegar la clave", async () => {
    const p = (await alta({})).json.proveedor;
    const r = await PROBAR(req(`${URL_BASE}/probar`, "POST", { proveedor: "openai", configId: p.id }), ctx(""));
    const cuerpo = await r.text();
    expect(r.status).toBe(200);
    expect(cuerpo).not.toContain(CLAVE);
    expect(JSON.parse(cuerpo)).toMatchObject({ ok: true, estado: "ok" });

    pedidos = [];
    const robo = await PROBAR(
      req(`${URL_BASE}/probar`, "POST", { proveedor: "openai", configId: p.id, baseUrl: "https://atacante.example/v1" }),
      ctx(""),
    );
    expect(robo.status).toBe(200);
    expect(pedidos.every((x) => x.url.startsWith("https://api.openai.com/"))).toBe(true);

    const patch = await PATCH(req(`${URL_BASE}/${p.id}`, "PATCH", { baseUrl: "https://atacante.example/v1" }), ctx(p.id));
    expect(patch.status).toBe(400);
    expect((await patch.json()).error).toBe("falta_clave");
  });

  it("PATCH con clave nueva la re-cifra y vuelve a probar", async () => {
    const p = (await alta({})).json.proveedor;
    const r = await PATCH(req(`${URL_BASE}/${p.id}`, "PATCH", { clave: CLAVE2 }), ctx(p.id));
    expect(r.status).toBe(200);
    expect((await r.json()).proveedor.claveFinal).toBe("9876");
    expect(descifrarSecreto(String(H.filas[0].claveCifrada))).toBe(CLAVE2);
    const mala = await PATCH(req(`${URL_BASE}/${p.id}`, "PATCH", { clave: "sk-mala-1111" }), ctx(p.id));
    expect(mala.status).toBe(422);
    expect(descifrarSecreto(String(H.filas[0].claveCifrada))).toBe(CLAVE2);
  });

  it("PATCH rechaza campos desconocidos (strict)", async () => {
    const p = (await alta({})).json.proveedor;
    expect((await PATCH(req(`${URL_BASE}/${p.id}`, "PATCH", { tenantId: "t-otro" }), ctx(p.id))).status).toBe(400);
  });
});

describe("callLLMDelNegocio", () => {
  const opts = { messages: [{ role: "user" as const, content: "hola" }], temperature: 0 };

  it("sin modelo propio → plataforma", async () => {
    const r = await callLLMDelNegocio("t-uno", "balanced", opts);
    expect(r.content).toBe("hola de la plataforma");
    expect(r.modeloUsado).toEqual({ proveedor: "groq", modelo: "openai/gpt-oss-120b", deLaPlataforma: true });
  });

  it("con modelo propio → contesta el del negocio con su clave", async () => {
    await alta({});
    const r = await callLLMDelNegocio("t-uno", "balanced", opts);
    expect(r.content).toBe("hola del negocio");
    expect(r.modeloUsado).toEqual({ proveedor: "openai", modelo: "gpt-5.5", deLaPlataforma: false });
    expect(H.plataforma).not.toHaveBeenCalled();
    expect(pedidos.at(-1)).toEqual({ url: "https://api.openai.com/v1/chat/completions", auth: `Bearer ${CLAVE}` });
  });

  it("clave que dejó de servir → cae a la plataforma y anota clave_invalida en la tarjeta", async () => {
    await alta({});
    globalThis.fetch = vi.fn(async () => new Response('{"error":"Incorrect API key"}', { status: 401 })) as typeof fetch;
    const r = await callLLMDelNegocio("t-uno", "balanced", opts);
    expect(r.content).toBe("hola de la plataforma");
    expect(r.estadoPropio).toBe("clave_invalida");
    await vi.waitFor(() => expect(H.filas[0].ultimoEstado).toBe("clave_invalida"));
  });

  it("sin crédito y con foto → no cae (la plataforma no lee fotos): devuelve el error", async () => {
    await alta({});
    globalThis.fetch = vi.fn(async () => new Response('{"error":"Insufficient Balance"}', { status: 402 })) as typeof fetch;
    const r = await callLLMDelNegocio("t-uno", "balanced", opts, { imagenes: [{ documentoId: "doc1", nombre: "recibo.jpg", mime: "image/jpeg", base64: "QUJD" }] });
    expect(r.ok).toBe(false);
    expect(r.estadoPropio).toBe("sin_credito");
    expect(H.plataforma).not.toHaveBeenCalled();
  });

  it("foto sin modelo propio → sin_vision claro, sin llamar a nadie", async () => {
    const r = await callLLMDelNegocio("t-uno", "balanced", opts, { imagenes: [{ documentoId: "doc1", nombre: "recibo.jpg", mime: "image/jpeg", base64: "QUJD" }] });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/^sin_vision/);
    expect(H.plataforma).not.toHaveBeenCalled();
  });

  it("el modelo de otro negocio no se usa", async () => {
    await alta({});
    const r = await callLLMDelNegocio("t-otro", "balanced", opts);
    expect(r.modeloUsado?.deLaPlataforma).toBe(true);
  });
});
