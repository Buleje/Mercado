/**
 * Buleje IA (ADR-528), carril 4 — el servidor MCP de punta a punta (sin base).
 *
 * initialize/ping/notificaciones, tools/list con y sin «puede anotar», lectura,
 * escritura → pendiente → confirmar, confirmar desde otro negocio u otra
 * conexión, rol re-leído en cada llamada, era moderna (2026-07-28) y Origin.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  autenticar: vi.fn(),
  marcarUso: vi.fn(async () => undefined),
  getByUsername: vi.fn(),
  executeSync: vi.fn(),
  logActivity: vi.fn(async () => undefined),
  cupoOk: { ip: true, conexion: true },
}));

vi.mock("@/lib/db/asistente-conexiones.db", () => ({
  AsistenteConexionesDB: { autenticar: m.autenticar, marcarUso: m.marcarUso },
}));
vi.mock("@/lib/db/admin-users.db", () => ({ AdminUsersDB: { getByUsername: m.getByUsername } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: m.logActivity }));
vi.mock("@/lib/rate-limit", () => ({
  getClientIp: () => "200.1.1.1",
  createDistributedRateLimiter: ({ key }: { key: string }) => ({
    windowMs: 60_000,
    check: async () => (key === "mcp:ip" ? m.cupoOk.ip : m.cupoOk.conexion),
  }),
}));

const herramienta = vi.hoisted(() => (name: string, requiresApproval = false) => ({
  type: "function",
  function: { name, description: `hace ${name}`, parameters: { type: "object", properties: {} } },
  ...(requiresApproval ? { requiresApproval: true } : {}),
}));
vi.mock("@/lib/agents", () => ({
  ALL_AGENT_TOOLS: [
    herramienta("ver_ventas"),
    herramienta("anotar_gasto", true),
    herramienta("marcar_visto"),
    herramienta("sin_permiso_mapeado"),
  ],
  ensureAgentsRegistered: async () => undefined,
  orchestrator: { executeSync: m.executeSync },
  resolveToolCall: (n: string) =>
    ({
      ver_ventas: { domain: "ventas", action: "listar" },
      anotar_gasto: { domain: "gastos", action: "anotar" },
      marcar_visto: { domain: "avisos", action: "marcar" },
      sin_permiso_mapeado: { domain: "nada", action: "nada" },
    })[n],
}));
vi.mock("@/lib/agents/permissions", () => ({
  AGENT_ACTION_PERMISSIONS: {
    ventas: { listar: { resource: "sales", action: "read" } },
    gastos: { anotar: { resource: "expenses", action: "write" } },
    avisos: { marcar: { resource: "alerts", action: "write" } },
  },
}));
// owner puede todo; cajero solo leer.
vi.mock("@/lib/auth/role-permissions", () => ({
  checkPermission: (rol: string, _res: string, accion: string) => rol === "owner" || accion === "read",
}));

import { atenderMcp } from "@/lib/mcp-servidor/servidor";
import { GET as getMcp } from "@/app/api/mcp/route";

const TOKEN_A = `bul_mcp_${"A".repeat(43)}`;
const TOKEN_A_LECTURA = `bul_mcp_${"L".repeat(43)}`;
const TOKEN_A_OTRA = `bul_mcp_${"O".repeat(43)}`;
const TOKEN_B = `bul_mcp_${"B".repeat(43)}`;

const CONEXIONES: Record<string, Record<string, unknown>> = {
  [TOKEN_A]: { id: "cxA", tenantId: "t-a", nombre: "ChatGPT", usuario: "dueno", rol: "owner", permiteEscribir: true },
  [TOKEN_A_LECTURA]: { id: "cxL", tenantId: "t-a", nombre: "Gemini", usuario: "dueno", rol: "owner", permiteEscribir: false },
  [TOKEN_A_OTRA]: { id: "cxO", tenantId: "t-a", nombre: "Cursor", usuario: "dueno", rol: "owner", permiteEscribir: true },
  [TOKEN_B]: { id: "cxB", tenantId: "t-b", nombre: "Claude", usuario: "otro", rol: "owner", permiteEscribir: true },
};

let rolDelPanel: { role: string; active: boolean } | null;

beforeEach(() => {
  vi.clearAllMocks();
  m.cupoOk.ip = true;
  m.cupoOk.conexion = true;
  rolDelPanel = { role: "owner", active: true };
  m.autenticar.mockImplementation(async (t: string) => CONEXIONES[t] ?? null);
  m.getByUsername.mockImplementation(async (_tenant: string, usuario: string) =>
    rolDelPanel ? { id: "u1", name: usuario, ...rolDelPanel } : null,
  );
  m.executeSync.mockImplementation(async ({ action, payload }: { action: string; payload: Record<string, unknown> }) =>
    action === "anotar" && payload.__validar
      ? { success: true, data: { resumen: "Gasto S/ 50 en combustible" } }
      : { success: true, data: { confirmacion: `${action} ok`, filas: 3 } },
  );
});

let n = 0;
function pedir(
  method: string,
  params?: Record<string, unknown>,
  opts: { token?: string | null; headers?: Record<string, string>; notificacion?: boolean } = {},
): Promise<Response> {
  const token = opts.token === undefined ? TOKEN_A : opts.token;
  const cuerpo: Record<string, unknown> = { jsonrpc: "2.0", method };
  if (!opts.notificacion) cuerpo.id = ++n;
  if (params) cuerpo.params = params;
  return atenderMcp(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...opts.headers,
      },
      body: JSON.stringify(cuerpo),
    }),
  );
}
async function resultado(r: Response): Promise<Record<string, unknown>> {
  const j = (await r.json()) as { result?: Record<string, unknown>; error?: unknown };
  if (!j.result) throw new Error(`sin result: ${JSON.stringify(j)}`);
  return j.result;
}
const nombres = async (token: string) =>
  ((await resultado(await pedir("tools/list", undefined, { token }))).tools as { name: string }[]).map((t) => t.name);
const llamar = async (name: string, args: Record<string, unknown>, token = TOKEN_A) =>
  (await resultado(await pedir("tools/call", { name, arguments: args }, { token }))) as {
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
  };

describe("era legada (ChatGPT, Claude, Gemini y Cursor de hoy)", () => {
  it("initialize negocia la versión y anuncia tools, sin Mcp-Session-Id", async () => {
    const r = await pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "x", version: "1" } });
    expect(r.status).toBe(200);
    expect(r.headers.get("mcp-session-id")).toBeNull();
    const res = await resultado(r);
    expect(res.protocolVersion).toBe("2025-06-18");
    expect(res.capabilities).toEqual({ tools: { listChanged: false } });
    expect((res.serverInfo as { name: string }).name).toBe("buleje");
    expect(res.resultType).toBeUndefined();
    const nueva = await resultado(await pedir("initialize", { protocolVersion: "2099-01-01" }));
    expect(nueva.protocolVersion).toBe("2025-11-25");
  });

  it("notifications/initialized → 202 sin cuerpo; ping → {}; GET → 405", async () => {
    const r = await pedir("notifications/initialized", undefined, { notificacion: true });
    expect(r.status).toBe(202);
    expect(await r.text()).toBe("");
    expect(await resultado(await pedir("ping"))).toEqual({});
    const g = getMcp();
    expect(g.status).toBe(405);
    expect(g.headers.get("allow")).toBe("POST");
  });

  it("JSON-RPC: cuerpo roto → -32700, lote → -32600, método desconocido → -32601, sin name → -32602", async () => {
    const roto = await atenderMcp(
      new Request("http://localhost/api/mcp", { method: "POST", headers: { authorization: `Bearer ${TOKEN_A}` }, body: "{no" }),
    );
    expect(roto.status).toBe(400);
    expect(((await roto.json()) as { error: { code: number } }).error.code).toBe(-32700);
    const lote = await atenderMcp(
      new Request("http://localhost/api/mcp", { method: "POST", headers: { authorization: `Bearer ${TOKEN_A}` }, body: "[]" }),
    );
    expect(((await lote.json()) as { error: { code: number } }).error.code).toBe(-32600);
    expect(((await (await pedir("resources/list")).json()) as { error: { code: number } }).error.code).toBe(-32601);
    expect(((await (await pedir("tools/call", { arguments: {} })).json()) as { error: { code: number } }).error.code).toBe(-32602);
    expect(((await (await pedir("tools/call", { name: "no_existe" })).json()) as { error: { code: number } }).error.code).toBe(-32602);
  });

  it("sin clave, clave mala o revocada → 401 con WWW-Authenticate (nunca 404)", async () => {
    for (const token of [null, `bul_mcp_${"Z".repeat(43)}`]) {
      const r = await pedir("ping", undefined, { token });
      expect(r.status).toBe(401);
      expect(r.headers.get("www-authenticate")).toContain("Bearer");
    }
  });
});

describe("herramientas según la conexión", () => {
  it("solo consulta: tools/list sin escrituras ni confirmar; anotar → isError, confirmar → -32602", async () => {
    expect(await nombres(TOKEN_A_LECTURA)).toEqual(["ver_ventas"]);
    const anotar = await llamar("anotar_gasto", { monto: 50 }, TOKEN_A_LECTURA);
    expect(anotar.isError).toBe(true);
    expect(m.executeSync).not.toHaveBeenCalled();
    const conf = await pedir("tools/call", { name: "confirmar_operacion", arguments: { aprobacionId: "x" } }, { token: TOKEN_A_LECTURA });
    expect(((await conf.json()) as { error: { code: number } }).error.code).toBe(-32602);
  });

  it("puede anotar: lista lectura + escrituras + confirmar/cancelar; lo sin permiso mapeado nunca sale", async () => {
    const lista = await nombres(TOKEN_A);
    expect(lista).toEqual(["ver_ventas", "anotar_gasto", "marcar_visto", "confirmar_operacion", "cancelar_operacion"]);
    const r = await resultado(await pedir("tools/list"));
    const anotar = (r.tools as { name: string; annotations: Record<string, boolean> }[]).find((t) => t.name === "anotar_gasto");
    expect(anotar?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  it("lectura: corre con el tenant de la clave y el rol del panel; las claves `__` del modelo se descartan", async () => {
    const r = await llamar("ver_ventas", { dia: "hoy", __validar: false, __tenant: "t-b" });
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent).toMatchObject({ filas: 3 });
    expect(m.executeSync).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t-a", actorRole: "owner", actorUsuario: "dueno", payload: { dia: "hoy" } }),
    );
    expect(m.marcarUso).toHaveBeenCalledWith("t-a", "cxA");
  });

  it("escritura con OK: ensayo → pendiente (no anota) → confirmar ejecuta UNA vez", async () => {
    const p = await llamar("anotar_gasto", { monto: 50, __validar: false });
    expect(p.structuredContent).toMatchObject({ pendiente: true, resumen: "Gasto S/ 50 en combustible" });
    expect(m.executeSync).toHaveBeenCalledTimes(1);
    expect(m.executeSync.mock.calls[0][0].payload).toEqual({ monto: 50, __validar: true });
    const id = p.structuredContent?.aprobacionId as string;

    const ok = await llamar("confirmar_operacion", { aprobacionId: id });
    expect(ok.structuredContent).toMatchObject({ hecho: true });
    expect(m.executeSync).toHaveBeenCalledTimes(2);
    expect(m.executeSync.mock.calls[1][0]).toMatchObject({ tenantId: "t-a", action: "anotar", payload: { monto: 50 } });
    expect(m.logActivity).toHaveBeenCalledWith("mcp_confirmar", "asistente_conexion", expect.any(String), "cxA", "dueno", undefined, "t-a");

    const otraVez = await llamar("confirmar_operacion", { aprobacionId: id });
    expect(otraVez.isError).toBe(true);
    expect(m.executeSync).toHaveBeenCalledTimes(2);
  });

  it("confirmar desde OTRO negocio u otra conexión del mismo negocio → rechazado, no ejecuta", async () => {
    const p = await llamar("anotar_gasto", { monto: 50 });
    const id = p.structuredContent?.aprobacionId as string;
    const ajeno = await llamar("confirmar_operacion", { aprobacionId: id }, TOKEN_B);
    expect(ajeno.isError).toBe(true);
    const otra = await llamar("confirmar_operacion", { aprobacionId: id }, TOKEN_A_OTRA);
    expect(otra.isError).toBe(true);
    expect(m.executeSync).toHaveBeenCalledTimes(1); // solo el ensayo
    // sigue pendiente para la conexión que lo propuso
    expect((await llamar("cancelar_operacion", { aprobacionId: id })).structuredContent).toMatchObject({ cancelada: true });
  });

  it("escritura directa se ejecuta y queda en la auditoría", async () => {
    await llamar("marcar_visto", { id: "a1" });
    expect(m.logActivity).toHaveBeenCalledWith("mcp_escritura", "asistente_conexion", expect.stringContaining("marcar_visto"), "cxA", "dueno", undefined, "t-a");
  });
});

describe("rol re-leído en cada llamada", () => {
  it("usuario borrado o desactivado → 401 aunque la clave siga viva", async () => {
    rolDelPanel = null;
    expect((await pedir("tools/list")).status).toBe(401);
    rolDelPanel = { role: "owner", active: false };
    expect((await pedir("tools/list")).status).toBe(401);
    rolDelPanel = { role: "superadmin", active: true };
    expect((await pedir("tools/list")).status).toBe(401);
    expect(m.getByUsername).toHaveBeenCalledWith("t-a", "dueno");
  });

  it("le bajaron el rol a cajero: la conexión (creada como owner) pierde las escrituras al toque", async () => {
    rolDelPanel = { role: "cajero", active: true };
    expect(await nombres(TOKEN_A)).toEqual(["ver_ventas", "confirmar_operacion", "cancelar_operacion"]);
    await llamar("ver_ventas", {});
    expect(m.executeSync.mock.calls[0][0].actorRole).toBe("cajero");
  });
});

describe("era moderna 2026-07-28", () => {
  const meta = { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } };
  const cab = (metodo: string, extra: Record<string, string> = {}) => ({
    "mcp-protocol-version": "2026-07-28",
    "mcp-method": metodo,
    ...extra,
  });

  it("server/discover y tools/call con cabeceras → resultType complete", async () => {
    const d = await resultado(await pedir("server/discover", meta, { headers: cab("server/discover") }));
    expect(d.resultType).toBe("complete");
    expect(d.supportedVersions).toContain("2026-07-28");
    const c = await resultado(
      await pedir("tools/call", { ...meta, name: "ver_ventas", arguments: {} }, { headers: cab("tools/call", { "mcp-name": "ver_ventas" }) }),
    );
    expect(c.resultType).toBe("complete");
  });

  it("cabecera que falta o no coincide → 400 -32020; versión desconocida → 400 -32022; método desconocido → 404", async () => {
    const sinMetodo = await pedir("tools/list", meta, { headers: { "mcp-protocol-version": "2026-07-28" } });
    expect(sinMetodo.status).toBe(400);
    expect(((await sinMetodo.json()) as { error: { code: number } }).error.code).toBe(-32020);
    const nombreDistinto = await pedir(
      "tools/call",
      { ...meta, name: "anotar_gasto", arguments: {} },
      { headers: cab("tools/call", { "mcp-name": "ver_ventas" }) },
    );
    expect(((await nombreDistinto.json()) as { error: { code: number } }).error.code).toBe(-32020);
    const version = await pedir("ping", { _meta: { "io.modelcontextprotocol/protocolVersion": "2030-01-01" } }, { headers: cab("ping") });
    expect(version.status).toBe(400);
    expect(((await version.json()) as { error: { code: number; data: { requested: string } } }).error).toMatchObject({
      code: -32022,
      data: { requested: "2030-01-01" },
    });
    const desconocido = await pedir("initialize", meta, { headers: cab("initialize") });
    expect(desconocido.status).toBe(404);
  });
});

describe("bordes de transporte", () => {
  it("Origin ajeno → 403; Origin de ChatGPT pasa", async () => {
    expect((await pedir("ping", undefined, { headers: { origin: "https://malo.example" } })).status).toBe(403);
    expect((await pedir("ping", undefined, { headers: { origin: "https://chatgpt.com" } })).status).toBe(200);
  });

  it("cupo de la conexión agotado → 429 con Retry-After", async () => {
    m.cupoOk.conexion = false;
    const r = await pedir("ping");
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("60");
  });
});
