// @ts-nocheck — importa .mjs del MCP (sin tipos); el contrato vive en JSDoc.
import { describe, it, expect, vi } from "vitest";
import { crearCliente, recortarDatos } from "../../tools/mcp-buleje/src/cliente.mjs";

const config = { base: "http://localhost:3000", porDefecto: "bodega", seco: true, negocios: { bodega: { slug: "main", usuario: "claude", clave: "x" } } };

type Llamada = { url: string; metodo: string; headers: Record<string, string>; body?: string };
function falso(rutas: Record<string, (n: number, l: Llamada) => Response>) {
  const llamadas: Llamada[] = [];
  const cuenta: Record<string, number> = {};
  const fetch = vi.fn(async (url: string, init: any) => {
    const l = { url, metodo: init.method, headers: init.headers, body: init.body };
    llamadas.push(l);
    const ruta = new URL(url).pathname;
    const k = `${init.method} ${ruta}`;
    cuenta[k] = (cuenta[k] ?? 0) + 1;
    const h = rutas[k];
    if (!h) return new Response("{}", { status: 404 });
    return h(cuenta[k], l);
  });
  return { fetch, llamadas, cuenta };
}
const json = (o: unknown, status = 200, extra: Record<string, string | string[]> = {}) => {
  const h = new Headers({ "content-type": "application/json" });
  for (const [k, v] of Object.entries(extra)) for (const x of [v].flat()) h.append(k, x);
  return new Response(JSON.stringify(o), { status, headers: h });
};
const health = () => json({ ok: true }, 200, { "set-cookie": "csrf-token=CSRF1; Path=/" });
const login = () => json({ ok: true }, 200, { "set-cookie": ["buleje-admin-sess=S1; Path=/; HttpOnly", "buleje-admin-refresh=R1; Path=/; HttpOnly"] });
const cliente = (f: any, extra = {}) => crearCliente({ config, fetch: f.fetch, dirEstado: null, puertoAbierto: async () => true, esperar: async () => {}, ...extra });

describe("cliente MCP", () => {
  it("siembra csrf de /api/health, hace login con x-tenant-id y manda x-csrf-token solo en escrituras", async () => {
    const f = falso({
      "GET /api/health": health,
      "POST /api/auth/login": login,
      "GET /api/sales": () => json([{ id: 1 }]),
      "POST /api/tasks": () => json({ id: 9 }, 201),
    });
    const c = cliente(f);
    const r1 = await c.pedir("bodega", { metodo: "GET", ruta: "/api/sales", query: { today: 1 } });
    expect(r1.ok).toBe(true);
    const r2 = await c.pedir("bodega", { metodo: "POST", ruta: "/api/tasks", cuerpo: { t: "x" } });
    expect(r2.ok).toBe(true);
    expect(f.llamadas[0].url).toContain("/api/health");
    const lg = f.llamadas.find((l) => l.url.includes("/api/auth/login"))!;
    expect(lg.headers["x-tenant-id"]).toBe("main");
    expect(JSON.parse(lg.body!)).toEqual({ username: "claude", password: "x", tenantSlug: "main" });
    const get = f.llamadas.find((l) => l.url.includes("/api/sales"))!;
    expect(get.url).toContain("today=1");
    expect(get.headers["x-csrf-token"]).toBeUndefined();
    expect(get.headers.cookie).toContain("buleje-admin-sess=S1");
    expect(get.headers["user-agent"]).toBe("BulejeMCP/1.0 (Claude)");
    const post = f.llamadas.find((l) => l.url.includes("/api/tasks"))!;
    expect(post.headers["x-csrf-token"]).toBe("CSRF1");
  });

  it("401 -> refresh -> reintento una sola vez", async () => {
    const f = falso({
      "GET /api/health": health,
      "POST /api/auth/login": login,
      "POST /api/auth/refresh": () => json({ ok: true }, 200, { "set-cookie": "buleje-admin-sess=S2; Path=/" }),
      "GET /api/orders": (n) => (n === 1 ? json({ error: "session expired" }, 401) : json([])),
    });
    const r = await cliente(f).pedir("bodega", { metodo: "GET", ruta: "/api/orders" });
    expect(r.ok).toBe(true);
    expect(f.cuenta["GET /api/orders"]).toBe(2);
    expect(f.cuenta["POST /api/auth/refresh"]).toBe(1);
    expect(f.cuenta["POST /api/auth/login"]).toBe(1);
  });

  it("si el 401 persiste tras refresh y login: sin_sesion, sin bucle", async () => {
    const f = falso({
      "GET /api/health": health,
      "POST /api/auth/login": login,
      "POST /api/auth/refresh": () => json({}, 401),
      "GET /api/orders": () => json({ error: "session expired" }, 401),
    });
    const r = await cliente(f).pedir("bodega", { metodo: "GET", ruta: "/api/orders" });
    expect(r.error?.codigo).toBe("sin_sesion");
    expect(f.cuenta["GET /api/orders"]).toBe(2);
    expect(f.cuenta["POST /api/auth/login"]).toBe(2); // el inicial + 1 tras el refresh fallido
    expect(f.cuenta["POST /api/auth/refresh"]).toBe(1);
  });

  it("login fallido no se repite (lockout): segunda llamada ni toca /login", async () => {
    const f = falso({ "GET /api/health": health, "POST /api/auth/login": () => json({ error: "Credenciales inválidas" }, 401) });
    const c = cliente(f);
    const a = await c.pedir("bodega", { metodo: "GET", ruta: "/api/sales" });
    const b = await c.pedir("bodega", { metodo: "GET", ruta: "/api/sales" });
    expect(a.error?.codigo).toBe("sin_sesion");
    expect(b.error?.codigo).toBe("sin_sesion");
    expect(f.cuenta["POST /api/auth/login"]).toBe(1);
  });

  it("429 con Retry-After espera 1 vez y reintenta; sin Retry-After -> limite", async () => {
    const esperar = vi.fn(async () => {});
    const f = falso({
      "GET /api/health": health, "POST /api/auth/login": login,
      "GET /api/sales": (n) => (n === 1 ? json({}, 429, { "retry-after": "3" }) : json([])),
      "GET /api/orders": () => json({ message: "Demasiados" }, 429),
    });
    const c = cliente(f, { esperar });
    expect((await c.pedir("bodega", { metodo: "GET", ruta: "/api/sales" })).ok).toBe(true);
    expect(esperar).toHaveBeenCalledWith(3000);
    expect((await c.pedir("bodega", { metodo: "GET", ruta: "/api/orders" })).error?.codigo).toBe("limite");
  });

  it("500 con HTML -> compilando nombrando el archivo", async () => {
    const f = falso({
      "GET /api/health": health, "POST /api/auth/login": login,
      "GET /api/sales": () => new Response("<!DOCTYPE html><html>Error ./lib/db/x.db.ts:12 roto</html>", { status: 500 }),
    });
    const r = await cliente(f).pedir("bodega", { metodo: "GET", ruta: "/api/sales" });
    expect(r.error?.codigo).toBe("compilando");
    expect(r.error?.mensaje).toContain("lib/db/x.db.ts:12");
  });

  it("mapea 400/403/404", async () => {
    const f = falso({
      "GET /api/health": health, "POST /api/auth/login": login,
      "GET /api/a": () => json({ issues: [{ path: ["q"] }] }, 400),
      "GET /api/b": () => json({ message: "Sin permiso de caja" }, 403),
      "GET /api/c": () => json({}, 404),
    });
    const c = cliente(f);
    const a = await c.pedir("bodega", { metodo: "GET", ruta: "/api/a" });
    expect(a.error?.codigo).toBe("datos_invalidos");
    expect(a.error?.detalle).toEqual([{ path: ["q"] }]);
    const b = await c.pedir("bodega", { metodo: "GET", ruta: "/api/b" });
    expect(b.error).toMatchObject({ codigo: "sin_permiso", mensaje: "Sin permiso de caja" });
    expect((await c.pedir("bodega", { metodo: "GET", ruta: "/api/c" })).error?.codigo).toBe("no_existe");
  });

  it("puerto cerrado -> panel_apagado en <2 s sin llamar a fetch", async () => {
    const f = falso({});
    const t0 = Date.now();
    const r = await cliente(f, { puertoAbierto: async () => false }).pedir("bodega", { metodo: "GET", ruta: "/api/sales" });
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(r.error?.codigo).toBe("panel_apagado");
    expect(r.error?.mensaje).toContain("panel");
    expect(f.fetch).not.toHaveBeenCalled();
  });

  it("puerto realmente cerrado (socket) tarda <2 s", async () => {
    const { puertoAbierto } = await import("../../tools/mcp-buleje/src/panel-local.mjs");
    const t0 = Date.now();
    expect(await puertoAbierto(1, "127.0.0.1", 1500)).toBe(false);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it("negocio desconocido y ruta no /api/ se rechazan", async () => {
    const f = falso({});
    const c = cliente(f);
    expect((await c.pedir("nada", { metodo: "GET", ruta: "/api/x" })).ok).toBe(false);
    expect((await c.pedir("bodega", { metodo: "GET", ruta: "/login" })).error?.codigo).toBe("ruta_no_permitida");
  });

  it("límite de 5 escrituras por minuto", async () => {
    const f = falso({ "GET /api/health": health, "POST /api/auth/login": login, "POST /api/tasks": () => json({}, 201) });
    const c = cliente(f);
    const rs = [];
    for (let i = 0; i < 6; i++) rs.push(await c.pedir("bodega", { metodo: "POST", ruta: "/api/tasks", cuerpo: {} }));
    expect(rs.slice(0, 5).every((r) => r.ok)).toBe(true);
    expect(rs[5].error?.codigo).toBe("limite");
  });

  it("recorta a 50 filas y avisa", () => {
    const r = recortarDatos(Array.from({ length: 120 }, (_, i) => ({ i })));
    expect(r.truncado).toBe(true);
    expect((r.datos as unknown[]).length).toBe(50);
    expect(recortarDatos({ items: [1, 2] }).truncado).toBe(false);
  });
});
