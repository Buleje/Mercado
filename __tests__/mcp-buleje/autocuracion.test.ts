// @vitest-environment node
// @ts-nocheck — importa .mjs del MCP (sin tipos); el contrato vive en JSDoc.
// 29-10 (Brandon: «que no se desactive»): la sesión y el CSRF se curan solos, `estado` lo dice en una llamada,
// y el vigía re-registra el MCP y solo avisa por lo que es del MCP.
import { describe, it, expect, vi } from "vitest";
import { crearCliente } from "../../tools/mcp-buleje/src/cliente.mjs";
import { crearServidor, cargarHerramientas } from "../../tools/mcp-buleje/servidor.mjs";
import { revisarRegistro, problemasDeEstado, ARRANQUE } from "../../tools/mcp-buleje/vigilar.mjs";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "../../tools/mcp-buleje/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { InMemoryTransport } from "../../tools/mcp-buleje/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js";

const config = { base: "http://localhost:3000", porDefecto: "bodega", seco: false, negocios: { bodega: { slug: "main", usuario: "claude", clave: "x" } } };
const json = (o: unknown, status = 200, extra: Record<string, string | string[]> = {}) => {
  const h = new Headers({ "content-type": "application/json" });
  for (const [k, v] of Object.entries(extra)) for (const x of [v].flat()) h.append(k, x);
  return new Response(JSON.stringify(o), { status, headers: h });
};
function falso(rutas: Record<string, (n: number) => Response>) {
  const cuenta: Record<string, number> = {};
  const fetch = vi.fn(async (url: string, init: any) => {
    const k = `${init.method} ${new URL(url).pathname}`;
    cuenta[k] = (cuenta[k] ?? 0) + 1;
    return rutas[k] ? rutas[k](cuenta[k]) : new Response("{}", { status: 404 });
  });
  return { fetch, cuenta };
}
const health = () => json({ ok: true }, 200, { "set-cookie": "csrf-token=C1; Path=/" });
const login = () => json({ ok: true }, 200, { "set-cookie": ["buleje-admin-sess=S1; Path=/", "buleje-admin-refresh=R1; Path=/"] });
const cliente = (f: any) => crearCliente({ config, fetch: f.fetch, puertoAbierto: async () => true, esperar: async () => {} });

describe("autocuración de la sesión", () => {
  it("/api/auth/me con authenticated:false (sesión vencida, 200) → refresh y reintento", async () => {
    const f = falso({
      "GET /api/health": health, "POST /api/auth/login": login,
      "GET /api/auth/me": (n) => (n === 1 ? json({ role: null, authenticated: false }) : json({ authenticated: true, username: "claude", role: "admin" })),
      "POST /api/auth/refresh": () => json({ ok: true }, 200, { "set-cookie": "buleje-admin-sess=S2; Path=/" }),
    });
    const r = await cliente(f).pedir("bodega", { metodo: "GET", ruta: "/api/auth/me" });
    expect(r.ok).toBe(true);
    expect(r.datos.authenticated).toBe(true);
    expect(f.cuenta["POST /api/auth/refresh"]).toBe(1);
    expect(f.cuenta["GET /api/auth/me"]).toBe(2);
  });

  it("refresh vencido → un solo login nuevo, nunca bucle", async () => {
    const f = falso({
      "GET /api/health": health, "POST /api/auth/login": login,
      "GET /api/sales": (n) => (n === 1 ? json({ error: "session expired" }, 401) : json([{ id: 1 }])),
      "POST /api/auth/refresh": () => json({ error: "refresh expired" }, 401),
    });
    const r = await cliente(f).pedir("bodega", { metodo: "GET", ruta: "/api/sales" });
    expect(r.ok).toBe(true);
    expect(f.cuenta["POST /api/auth/login"]).toBe(2); // el de arranque + el de la cura
  });

  it("403 de CSRF → cookie nueva y 1 reintento; un 403 de permiso NO se reintenta", async () => {
    let csrf = 0;
    const f = falso({
      "GET /api/health": () => json({ ok: true }, 200, { "set-cookie": `csrf-token=C${++csrf}; Path=/` }), "POST /api/auth/login": login,
      "POST /api/tasks": (n) => (n === 1 ? json({ error: "CSRF token invalido o ausente. Recarga la pagina e intenta de nuevo." }, 403) : json({ id: 9 }, 201)),
      "DELETE /api/admin/x": () => json({ error: "Requiere rol owner" }, 403),
    });
    const c = cliente(f);
    const r = await c.pedir("bodega", { metodo: "POST", ruta: "/api/tasks", cuerpo: { t: 1 } });
    expect(r.ok).toBe(true);
    expect(f.cuenta["POST /api/tasks"]).toBe(2);
    const r2 = await c.pedir("bodega", { metodo: "DELETE", ruta: "/api/admin/x" });
    expect(r2.error.codigo).toBe("sin_permiso");
    expect(f.cuenta["DELETE /api/admin/x"]).toBe(1);
  });
});

describe("herramienta estado", () => {
  async function llamarEstado(op: any) {
    const { defs } = await cargarHerramientas();
    const { servidor } = crearServidor({ herramientas: defs, config: op.config ?? config, seco: op.seco, pedir: op.pedir, estadoPanel: op.estadoPanel, preguntar: async () => "no" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const c = new Client({ name: "t", version: "1" });
    await Promise.all([servidor.connect(a), c.connect(b)]);
    const r = await c.callTool({ name: "estado", arguments: op.args ?? {} });
    return { r, texto: r.content.map((x) => x.text).join("\n") };
  }

  it("panel, sesión por negocio, negocio que falta activar y modo, en una llamada", async () => {
    const pedir = vi.fn(async () => ({ ok: true, status: 200, ms: 3, datos: { authenticated: true, username: "claude", role: "admin" } }));
    const { texto } = await llamarEstado({ pedir, seco: false, estadoPanel: async () => ({ abierto: true, saludable: true, ms: 12 }) });
    expect(texto).toMatch(/Panel: responde/);
    expect(texto).toMatch(/bodega: claude \(admin\)/);
    expect(texto).toMatch(/blas: falta activar/);
    expect(texto).toMatch(/Modo: real/);
    expect(pedir.mock.calls.every(([, p]) => p.metodo === "GET")).toBe(true);
  });

  it("panel apagado: lo dice en español y no intenta entrar", async () => {
    const pedir = vi.fn();
    const { texto } = await llamarEstado({ pedir, seco: true, estadoPanel: async () => ({ abierto: false, saludable: false, ms: 1500 }) });
    expect(texto).toMatch(/Panel: APAGADO/);
    expect(texto).toMatch(/panel_prender/);
    expect(texto).toMatch(/Modo: A SECO/);
    expect(pedir).not.toHaveBeenCalled();
  });

  it("sesión caída: SIN SESIÓN con el motivo", async () => {
    const pedir = vi.fn(async () => ({ ok: false, status: 401, ms: 3, error: { codigo: "sin_sesion", mensaje: "usuario desactivado" } }));
    const { texto } = await llamarEstado({ pedir, estadoPanel: async () => ({ abierto: true, saludable: true, ms: 5 }) });
    expect(texto).toMatch(/bodega: SIN SESIÓN — usuario desactivado/);
    expect(problemasDeEstado(texto)).toHaveLength(1);
  });
});

describe("vigía", () => {
  const conf = (o: unknown) => { const d = mkdtempSync(join(tmpdir(), "vigia-")); const f = join(d, "claude.json"); writeFileSync(f, JSON.stringify(o)); return f; };

  it("registro bien: no toca nada; apagado a mano en /mcp: lo cuenta sin editar", () => {
    const correr = vi.fn();
    const f = conf({ mcpServers: { buleje: { command: ARRANQUE, args: [] } }, projects: { "/p": { disabledMcpServers: ["buleje"] } } });
    expect(revisarRegistro({ config: f, correr })).toEqual({ ok: true, apagadoEn: ["/p"] });
    expect(correr).not.toHaveBeenCalled();
  });

  it("registro viejo (`node` suelto): lo re-registra con arrancar.sh en scope user", () => {
    const f = conf({ mcpServers: { buleje: { command: "node", args: ["servidor.mjs"] } } });
    const correr = vi.fn((_c, args) => { if (args[1] === "add") writeFileSync(f, JSON.stringify({ mcpServers: { buleje: { command: ARRANQUE, args: [] } } })); return { status: 0 }; });
    expect(revisarRegistro({ config: f, correr })).toMatchObject({ ok: true, arreglado: true });
    expect(correr.mock.calls.map(([, a]) => a.slice(0, 2).join(" "))).toEqual(["mcp remove", "mcp add"]);
    expect(correr.mock.calls[1][1]).toEqual(["mcp", "add", "buleje", "--scope", "user", "--", ARRANQUE]);
  });

  it("panel apagado o negocio sin activar no son problemas para avisar; sin sesión sí", () => {
    expect(problemasDeEstado("Panel: APAGADO en http://localhost:3000\nblas: falta activar")).toEqual([]);
    expect(problemasDeEstado("bodega: SIN SESIÓN — clave")).toHaveLength(1);
  });
});
