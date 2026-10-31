// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- importa .mjs del MCP (sin tipos); el contrato vive en JSDoc.
// @ts-nocheck
// @vitest-environment node
/**
 * CLI del buzón de Telegram → panel (31-10): sólo sube lo que está en el tmp del
 * buzón (realpath: un enlace no saca de ahí), no hace un login por foto (la
 * sesión queda en un archivo 0600) y sale con UNA línea JSON.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { archivarTelegram, negocioDeConfig, RUTA } from "../tools/mcp-buleje/archivar-telegram.mjs";

const config = {
  base: "http://localhost:3000",
  porDefecto: "bodega",
  seco: false,
  negocios: {
    bodega: { slug: "main", usuario: "claude", clave: "x" },
    "qa-forestal": { slug: "inversiones-agroforestales-blas-sociedad-op-qa-ui", usuario: "claude", clave: "x" },
  },
};
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1)]);

let dir, raiz, sesiones, foto;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "tg-cli-"));
  raiz = join(dir, "tmp");
  sesiones = join(dir, "sesiones");
  await mkdir(raiz);
  foto = join(raiz, "a1b2.jpg");
  await writeFile(foto, JPEG);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const correr = (args, deps = {}) =>
  archivarTelegram(args, { config, raiz, carpetaSesiones: sesiones, puertoAbierto: async () => true, ...deps });

describe("archivar-telegram.mjs", () => {
  it("«main» es la bodega de la config", () => {
    expect(negocioDeConfig(config, "main")).toBe("bodega");
    expect(negocioDeConfig(config, "qa-forestal")).toBe("qa-forestal");
    expect(negocioDeConfig(config, "blas")).toBeNull();
  });

  it("--seco dice qué mandaría sin llamar al panel", async () => {
    let llamadas = 0;
    const r = await correr(["--negocio", "main", "--archivo", foto, "--mensaje", "123:45", "--pie", "Guía\n0123", "--seco"], {
      fetch: async () => {
        llamadas++;
        throw new Error("no debía llamar");
      },
    });
    expect(llamadas).toBe(0);
    expect(r).toMatchObject({
      ok: true,
      seco: true,
      negocio: "bodega",
      pedido: { metodo: "POST", ruta: RUTA, campos: { mensajeId: "123:45", pie: "Guía 0123" }, archivo: { nombre: "a1b2.jpg", bytes: JPEG.length } },
    });
    expect(r.pedido.archivo.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("como lo llama el buzón (--x=valor): chat de grupo negativo y nombre que empieza con «-»", async () => {
    const r = await correr([`--negocio=main`, `--archivo=${foto}`, `--mensaje=-1001234:5`, `--pie=-Recibo`, "--seco"]);
    expect(r).toMatchObject({ ok: true, pedido: { campos: { mensajeId: "-1001234:5", pie: "-Recibo" } } });
  });

  it("no sube nada de afuera del tmp del buzón, ni por un enlace", async () => {
    const afuera = join(dir, "secreto.jpg");
    await writeFile(afuera, JPEG);
    const enlace = join(raiz, "enlace.jpg");
    await symlink(afuera, enlace);
    for (const ruta of [afuera, enlace, join(raiz, "..", "secreto.jpg")]) {
      const r = await correr(["--negocio", "main", "--archivo", ruta, "--mensaje", "1:2", "--seco"]);
      expect(r, ruta).toMatchObject({ ok: false, error: "archivo" });
    }
  });

  it("rechaza argumentos raros y negocios que no están en la config", async () => {
    expect(await correr(["--negocio", "main", "--archivo", foto, "--mensaje", "../x", "--seco"])).toMatchObject({ ok: false, error: "argumentos" });
    expect(await correr(["--negocio", "otro", "--archivo", foto, "--mensaje", "1:2", "--seco"])).toMatchObject({ ok: false, error: "argumentos" });
    expect(await correr(["--negocio", "main", "--archivo", foto, "--mensaje", "1:2", "--clave", "x"])).toMatchObject({ ok: false, error: "argumentos" });
  });

  it("con sesión guardada sube sin login: multipart con archivo, mensajeId y pie; la sesión queda 0600", async () => {
    await mkdir(sesiones);
    await writeFile(join(sesiones, "telegram-qa-forestal.json"), JSON.stringify([["buleje-admin-sess", "s1"], ["csrf-token", "c1"]]));
    const pedidos = [];
    const fetch = async (url, init) => {
      pedidos.push({ url, init });
      return new Response(
        JSON.stringify({ nombre: "Prueba.jpg", carpetaId: "f2", carpetaNombre: "2026-10-31", carpetaRaiz: "Llegó por Telegram", enlace: "/admin?carpeta=f2" }),
        { status: 201, headers: { "content-type": "application/json", "set-cookie": "buleje-admin-sess=s2; Path=/; HttpOnly" } },
      );
    };
    const r = await correr(["--negocio", "qa-forestal", "--archivo", foto, "--mensaje", "123:46", "--pie", "Prueba"], { fetch });
    expect(r).toEqual({
      ok: true,
      negocio: "qa-forestal",
      nombre: "Prueba.jpg",
      raiz: "Llegó por Telegram",
      carpeta: "2026-10-31",
      carpetaId: "f2",
      enlace: "/admin?carpeta=f2",
      duplicado: false,
    });
    expect(pedidos).toHaveLength(1);
    const [{ url, init }] = pedidos;
    expect(url).toBe(`http://localhost:3000${RUTA}`);
    expect(init.method).toBe("POST");
    expect(init.headers.cookie).toContain("buleje-admin-sess=s1");
    expect(init.headers["x-csrf-token"]).toBe("c1");
    expect(init.headers["x-tenant-id"]).toBeUndefined();
    const form = init.body;
    expect(form.get("mensajeId")).toBe("123:46");
    expect(form.get("pie")).toBe("Prueba");
    expect(Buffer.from(await form.get("archivo").arrayBuffer()).equals(JPEG)).toBe(true);
    const guardada = join(sesiones, "telegram-qa-forestal.json");
    expect((await stat(guardada)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(guardada, "utf8"))).toContainEqual(["buleje-admin-sess", "s2"]);
  });

  it("la re-entrega dice duplicado; un 415 del panel sale como fallo con su mensaje", async () => {
    await mkdir(sesiones);
    await writeFile(join(sesiones, "telegram-bodega.json"), JSON.stringify([["buleje-admin-sess", "s1"]]));
    const responder = (status, cuerpo) => async () => new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });
    const dup = await correr(["--negocio", "main", "--archivo", foto, "--mensaje", "1:2"], {
      fetch: responder(200, { duplicado: true, nombre: "X.jpg", carpetaId: "f1", carpetaNombre: "2026-10-30" }),
    });
    expect(dup).toMatchObject({ ok: true, duplicado: true, carpeta: "2026-10-30" });
    const no = await correr(["--negocio", "main", "--archivo", foto, "--mensaje", "1:3"], {
      fetch: responder(415, { error: "tipo", message: "Ese tipo de archivo no lo guardo en el Archivo" }),
    });
    expect(no).toMatchObject({ ok: false, mensaje: expect.stringContaining("no lo guardo") });
  });

  it("panel apagado: falla sin llamar", async () => {
    const r = await correr(["--negocio", "main", "--archivo", foto, "--mensaje", "1:2"], {
      puertoAbierto: async () => false,
      fetch: async () => {
        throw new Error("no debía llamar");
      },
    });
    expect(r).toMatchObject({ ok: false, error: "panel_apagado" });
  });
});
