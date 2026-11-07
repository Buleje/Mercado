// @vitest-environment node
// @ts-nocheck — importa .mjs del MCP (sin tipos)
// doc_mirar (31-10): baja el archivo real a una carpeta privada para abrirlo con Read.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, statSync, readFileSync, writeFileSync, utimesSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearCliente } from "../../tools/mcp-buleje/src/cliente.mjs";
import { sanearBase, extensionDeMime, guardarBinario, limpiarViejos } from "../../tools/mcp-buleje/src/mirar.mjs";
import { herramientas, ajustes } from "../../tools/mcp-buleje/src/herramientas/documentos-mirar.mjs";

const def = herramientas.find((h) => h.nombre === "doc_mirar")!;
const config = { base: "http://localhost:3000", porDefecto: "bodega", seco: true, negocios: { bodega: { slug: "main", usuario: "claude", clave: "x" } } };
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "mirar-")); ajustes.carpeta = join(dir, "m"); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); ajustes.carpeta = undefined; });

const PNG = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);
function cli(rutas: Record<string, () => Response>) {
  const fetch = vi.fn(async (url: string, init: any) => {
    const k = `${init.method} ${new URL(url).pathname}`;
    if (k === "GET /api/health") return new Response("{}", { status: 200, headers: { "set-cookie": "csrf-token=C; Path=/" } });
    if (k === "POST /api/auth/login") { const h = new Headers(); h.append("set-cookie", "buleje-admin-sess=S; Path=/"); return new Response("{}", { status: 200, headers: h }); }
    return (rutas[k] ?? (() => new Response("{}", { status: 404 })))();
  });
  return crearCliente({ config, fetch, dirEstado: null, puertoAbierto: async () => true, esperar: async () => {} });
}

describe("doc_mirar", () => {
  it("existe, es de lectura, grupo documentos, y solo arma GET", () => {
    expect(def.tipo).toBe("lectura");
    expect(def.grupo).toBe("documentos");
    const ps = [def.pedido({ id: "abc123" })].flat();
    expect(ps.every((p) => p.metodo === "GET" && p.ruta.startsWith("/api/admin/documents/abc123"))).toBe(true);
  });

  it("el id con '../' no entra (idRuta) y la base del archivo se sanea", () => {
    expect(def.entrada.id.safeParse("../etc/passwd").success).toBe(false);
    expect(sanearBase("../../etc/pa ss/wd.png")).toBe("etcpasswdpng");
    expect(sanearBase("///")).toBe("");
    expect(extensionDeMime("image/jpeg; charset=x")).toBe("jpg");
    expect(extensionDeMime("application/x-evil")).toBe("bin");
  });

  it("guarda con permisos 0600/0700 y respeta el tope de tamaño", async () => {
    const carpeta = join(dir, "g");
    const g = await guardarBinario({ carpeta, base: "doc1", contentType: "image/png", bytes: PNG });
    expect(g.guardado && g.ruta).toBe(join(carpeta, "doc1.png"));
    expect(statSync(join(carpeta, "doc1.png")).mode & 0o777).toBe(0o600);
    expect(statSync(carpeta).mode & 0o777).toBe(0o700);
    const grande = await guardarBinario({ carpeta, base: "doc2", contentType: "application/pdf", bytes: PNG, tope: 4 });
    expect(grande).toMatchObject({ guardado: false, motivo: "tamano", bytes: 8 });
    expect(existsSync(join(carpeta, "doc2.pdf"))).toBe(false);
    expect(await guardarBinario({ carpeta, base: "..", bytes: PNG })).toMatchObject({ guardado: false, motivo: "base_invalida" });
  });

  it("limpia lo de más de 2 horas y deja lo reciente", async () => {
    const viejo = join(dir, "v.png"), nuevo = join(dir, "n.png");
    writeFileSync(viejo, "x"); writeFileSync(nuevo, "x");
    const hace3h = new Date(Date.now() - 3 * 3600_000);
    utimesSync(viejo, hace3h, hace3h);
    expect(await limpiarViejos(dir)).toBe(1);
    expect(existsSync(viejo)).toBe(false);
    expect(existsSync(nuevo)).toBe(true);
  });

  it("de punta a punta con el cliente: baja el binario intacto y el texto sale tapado", async () => {
    const c = cli({
      "GET /api/admin/documents/d1": () => new Response(JSON.stringify({ document: { name: "dni.png", mimeType: "image/png", size: 8, category: "legal", ocrText: "DNI 12345678 cel 987654321", ocrMetadata: { description: "Foto de un DNI" } }, signedUrl: "https://secreto" }), { status: 200 }),
      "GET /api/admin/documents/d1/preview-image": () => new Response("{}", { status: 415 }),
      "GET /api/admin/documents/d1/raw": () => new Response(PNG, { status: 200, headers: { "content-type": "image/png", "content-length": "8" } }),
    });
    const rs = [];
    for (const p of [def.pedido({ id: "d1" })].flat()) rs.push(await c.pedir("", p));
    expect(rs.every((r) => r.ok)).toBe(true);
    const ruta = join(ajustes.carpeta!, "d1.png");
    expect(rs[2].datos).toMatchObject({ guardado: true, ruta, bytes: 8 });
    expect(Array.from(readFileSync(ruta))).toEqual(Array.from(PNG));
    const txt = def.formatear(rs.map((r) => r.datos), {});
    expect(txt).toContain(`Archivo local: ${ruta}`);
    expect(txt).toContain("Foto de un DNI");
    expect(txt).not.toContain("12345678");
    expect(txt).not.toContain("secreto");
  });

  it("archivo sobre el tope por content-length: no baja nada y lo dice", async () => {
    const c = cli({
      "GET /api/admin/documents/d2/raw": () => new Response(PNG, { status: 200, headers: { "content-type": "application/pdf", "content-length": String(31 * 1024 * 1024) } }),
    });
    const r = await c.pedir("", [def.pedido({ id: "d2" })].flat()[2]);
    expect(r.datos).toMatchObject({ guardado: false, motivo: "tamano" });
    expect(existsSync(join(ajustes.carpeta!, "d2.pdf"))).toBe(false);
    const txt = def.formatear([{ document: { name: "gordo.pdf" } }, { guardado: false }, r.datos], {});
    expect(txt).toContain("NO bajado");
  });
});
