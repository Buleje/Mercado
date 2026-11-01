// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- importa .mjs del MCP (sin tipos); el contrato vive en JSDoc.
// @ts-nocheck
// @vitest-environment node
/** Sesión compartida entre procesos (01-11): 1 login para varios procesos; 429 en el login espera y reintenta 1 vez. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, statSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Sesion } from "../../tools/mcp-buleje/src/sesion.mjs";

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ses-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });
const cred = { slug: "qa", usuario: "claude", clave: "x" };
function panel(op = {}) {
  const c = { logins: 0, cola429: op.cola429 ?? 0 };
  c.fetch = async (url, init) => {
    const u = new URL(url);
    if (u.pathname === "/api/auth/login") {
      c.logins++;
      if (c.cola429-- > 0) return new Response("{}", { status: 429, headers: { "retry-after": "1" } });
      return new Response("{}", { status: 200, headers: [["set-cookie", "buleje-admin-sess=S1; Path=/"], ["set-cookie", "csrf-token=C; Path=/"]] });
    }
    return new Response("{}", { status: 200 });
  };
  return c;
}
const nueva = (p, archivo) => new Sesion({ negocio: "qa", cred, base: "http://localhost:3000", fetch: p.fetch, archivo, esperar: async () => undefined });

describe("sesión compartida", () => {
  it("5 «procesos» seguidos = 1 login; el archivo queda 0600", async () => {
    const p = panel(); const archivo = join(dir, "sesion-qa.json");
    for (let i = 0; i < 5; i++) expect((await nueva(p, archivo).asegurar()).ok).toBe(true);
    expect(p.logins).toBe(1);
    expect(statSync(archivo).mode & 0o777).toBe(0o600);
  });
  it("5 a la vez = 1 login (candado)", async () => {
    const p = panel(); const archivo = join(dir, "sesion-qa.json");
    const r = await Promise.all(Array.from({ length: 5 }, () => nueva(p, archivo).asegurar()));
    expect(r.every((x) => x.ok)).toBe(true);
    expect(p.logins).toBe(1);
  });
  it("la sesión que el panel rechazó no se vuelve a cargar del disco", async () => {
    const p = panel(); const archivo = join(dir, "sesion-qa.json");
    const s = nueva(p, archivo); await s.asegurar();
    s.descartar();
    expect(s.cargarDeDisco()).toBe(false);
    expect((await s.entrarCompartido()).ok).toBe(true);
    expect(p.logins).toBe(2);
  });
  it("panel corta la sesión (refresh rechazado borra las cookies): no recarga la muerta, hace login nuevo", async () => {
    let n = 0;
    const p = { logins: 0 };
    p.fetch = async (url) => {
      const u = new URL(url);
      if (u.pathname === "/api/auth/login") { p.logins++; n++; return new Response("{}", { status: 200, headers: [["set-cookie", `buleje-admin-sess=S${n}; Path=/`], ["set-cookie", `buleje-admin-refresh=R${n}; Path=/`]] }); }
      if (u.pathname === "/api/auth/refresh") return new Response("{}", { status: 401, headers: [["set-cookie", "buleje-admin-sess=; Max-Age=0"], ["set-cookie", "buleje-admin-refresh=; Max-Age=0"]] });
      return new Response("{}", { status: 200 });
    };
    const archivo = join(dir, "sesion-qa.json");
    const s = nueva(p, archivo); await s.asegurar();
    const firma = s.firmaJar();
    expect(await s.refrescar()).toBe(false);
    s.descartar(firma);
    expect((await s.entrarCompartido()).ok).toBe(true);
    expect(p.logins).toBe(2);
    expect(s.jar.get("buleje-admin-sess")).toBe("S2");
    // otro proceso ve la nueva, no la muerta
    const otro = nueva(p, archivo); await otro.asegurar();
    expect(otro.jar.get("buleje-admin-sess")).toBe("S2");
    expect(p.logins).toBe(2);
  });
  it("sin archivo: solo memoria, como antes", async () => {
    const p = panel();
    await nueva(p).asegurar(); await nueva(p).asegurar();
    expect(p.logins).toBe(2);
  });
  it("429 en el login: espera y reintenta 1 vez (sin bloqueo de 15 min); dos 429 = falla sin bloquear", async () => {
    const p = panel({ cola429: 1 });
    expect((await nueva(p).asegurar()).ok).toBe(true);
    const q = panel({ cola429: 5 });
    const s = nueva(q);
    const r = await s.asegurar();
    expect(r).toMatchObject({ ok: false, status: 429 });
    // 60 s sin reintentar (no los 15 min de una clave mala)
    expect(s.bloqueadoHasta - Date.now()).toBeLessThanOrEqual(60_000);
    expect(s.bloqueadoHasta - Date.now()).toBeGreaterThan(50_000);
  });
});
