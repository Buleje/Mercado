// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- importa .mjs del MCP (sin tipos); el contrato vive en JSDoc.
// @ts-nocheck
// @vitest-environment node
/**
 * Comando del bot de Telegram para PEDIR un papel (31-10): la sesión del MCP
 * sólo viaja a un panel de esta PC, un papel con claves no se baja, y lo que se
 * baja queda en una carpeta privada (0600) para que el buzón lo mande y lo borre.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pedirPapel, RUTA } from "../../tools/mcp-buleje/pedir-papel-telegram.mjs";

const config = {
  base: "http://localhost:3000",
  porDefecto: "bodega",
  seco: false,
  negocios: {
    bodega: { slug: "main", usuario: "claude", clave: "x" },
    blas: { slug: "inversiones-agroforestales-blas", usuario: "claude", clave: "x" },
  },
};
const PDF = Buffer.from("%PDF-1.4 prueba");

let dir, salida, sesiones;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "tg-pedir-"));
  salida = join(dir, "salida");
  sesiones = join(dir, "sesiones");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });

/** Panel de mentira: el login responde con cookies y lo demás según `rutas`. */
function panel(rutas) {
  const pedidos = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    pedidos.push({ url: u, init });
    if (u.pathname.startsWith("/api/auth/")) {
      return new Response(JSON.stringify({ ok: true, authenticated: true }), {
        status: 200,
        headers: { "content-type": "application/json", "set-cookie": "buleje-admin-sess=s1; Path=/; HttpOnly" },
      });
    }
    return rutas(u, init);
  };
  return { fetch, pedidos, alPanel: () => pedidos.filter((p) => p.url.pathname === RUTA) };
}

const correr = (args, deps = {}) =>
  pedirPapel(args, { config, carpetaSalida: salida, carpetaSesiones: sesiones, puertoAbierto: async () => true, base: "", ...deps });

describe("pedir-papel-telegram.mjs", () => {
  it("la sesión sólo viaja a un panel de esta PC", async () => {
    const p = panel(() => json({ esPedido: false }));
    for (const base of ["https://evil.example", "http://127.0.0.1.evil.com:3000", "http://localhost:3001/x"]) {
      const r = await correr(["buscar", "--negocio=blas", "--frase=DNI"], { fetch: p.fetch, base });
      expect(r, base).toMatchObject({ ok: false, error: "argumentos" });
    }
    expect(p.pedidos).toHaveLength(0);
  });

  it("buscar pasa la frase y devuelve lo que dice el panel", async () => {
    const p = panel(() => json({ esPedido: true, total: 1, elegido: "d1", papeles: [{ id: "d1", nombre: "DNI.pdf" }] }));
    const r = await correr(["buscar", "--negocio=blas", "--frase=DNI del jefe\nde Shinshiguani"], { fetch: p.fetch });
    expect(r).toMatchObject({ ok: true, negocio: "blas", esPedido: true, elegido: "d1" });
    const [pedido] = p.alPanel();
    expect(pedido.url.searchParams.get("frase")).toBe("DNI del jefe de Shinshiguani");
  });

  it("un papel con claves no se baja", async () => {
    const p = panel((u) => (u.searchParams.get("que") === "datos" ? json({ id: "c1", nombre: "credencial.jpg", clave: true, grande: false, enlace: "/admin?doc=c1" }) : new Response(PDF)));
    const r = await correr(["bajar", "--negocio=blas", "--id=c1"], { fetch: p.fetch });
    expect(r).toMatchObject({ ok: false, error: "con_clave", nombre: "credencial.jpg", enlace: "/admin?doc=c1" });
    expect(p.alPanel()).toHaveLength(1);
  });

  it("bajar deja el archivo en la carpeta privada, 0600", async () => {
    const p = panel((u) =>
      u.searchParams.get("que") === "datos"
        ? json({ id: "d1", nombre: "DNI JEFE.pdf", archivo: "DNI JEFE.pdf", carpeta: "CCNN › Jefe", codigo: "DOC-000442", mime: "application/pdf", clave: false, grande: false })
        : new Response(PDF, { status: 200, headers: { "content-type": "application/pdf", "content-length": String(PDF.length) } }),
    );
    const r = await correr(["bajar", "--negocio=blas", "--id=d1"], { fetch: p.fetch, ahora: () => 1000 });
    expect(r).toMatchObject({ ok: true, archivo: "DNI JEFE.pdf", codigo: "DOC-000442", bytes: PDF.length });
    expect(r.ruta).toBe(join(salida, "d1-1000.pdf"));
    expect((await readFile(r.ruta)).equals(PDF)).toBe(true);
    expect((await stat(r.ruta)).mode & 0o777).toBe(0o600);
    expect((await stat(salida)).mode & 0o777).toBe(0o700);
  });

  it("salio manda el id, el mensaje y el envío; valida los números", async () => {
    const p = panel(() => json({ ok: true }, 201));
    const r = await correr(["salio", "--negocio=main", "--id=d1", "--mensaje=8123456:77", "--enviado=78"], { fetch: p.fetch });
    expect(r).toEqual({ ok: true, negocio: "bodega", duplicado: false });
    const [pedido] = p.alPanel();
    expect(pedido.init.method).toBe("POST");
    expect(JSON.parse(pedido.init.body)).toEqual({ id: "d1", mensajeId: "8123456:77", enviadoId: 78 });
    for (const malos of [["--mensaje=../x", "--enviado=1"], ["--mensaje=1:2", "--enviado=-3"], ["--mensaje=1:2", "--enviado=abc"]]) {
      expect(await correr(["salio", "--negocio=main", "--id=d1", ...malos], { fetch: p.fetch })).toMatchObject({ ok: false, error: "argumentos" });
    }
  });

  it("órdenes y negocios que no existen", async () => {
    expect(await correr(["borrar", "--negocio=blas"])).toMatchObject({ ok: false, error: "argumentos" });
    expect(await correr(["buscar", "--negocio=otro", "--frase=x"])).toMatchObject({ ok: false, error: "argumentos" });
    expect(await correr(["bajar", "--negocio=blas", "--id=../../etc"])).toMatchObject({ ok: false, error: "argumentos" });
  });
});
