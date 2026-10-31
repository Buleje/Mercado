// @vitest-environment node
// @ts-nocheck — importa .mjs del MCP (sin tipos); el contrato vive en JSDoc (tools/mcp-buleje/src/tipos.mjs).
// Revisión de seguridad del MCP «buleje» (29-10): un test por hallazgo. 1 = leer_get evadía con %3F; 2 = doc_subir
// leía cualquier archivo; 3 = los nombres del aviso los escribía Claude; 4 = «Sí» se apretaba sin leer; 6 = medios.
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, truncateSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { revisarArchivo, MAX_ARCHIVO_BYTES } from "../../tools/mcp-buleje/src/archivos.mjs";
import { taparPersonales, taparTexto } from "../../tools/mcp-buleje/src/tapar.mjs";
import { claveMonto, claveCantidad, claveNombre, claveCodigo, sanearVentana, armarBotones, linea60, lineaInstruccion } from "../../tools/mcp-buleje/src/clave-ok.mjs";
import { crearCliente } from "../../tools/mcp-buleje/src/cliente.mjs";
import { rutaLecturaPermitida } from "../../tools/mcp-buleje/src/lista-blanca.mjs";
import { NO_VERIFICADO } from "../../tools/mcp-buleje/src/util-herramientas.mjs";
import { crearServidor, cargarHerramientas } from "../../tools/mcp-buleje/servidor.mjs";
import { Client } from "../../tools/mcp-buleje/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { InMemoryTransport } from "../../tools/mcp-buleje/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js";
import { z } from "../../tools/mcp-buleje/node_modules/zod/index.js";

const okResp = (datos = { id: "a1" }) => ({ ok: true, status: 200, ms: 5, datos });
const fallaResp = () => ({ ok: false, status: 500, ms: 5, error: { codigo: "servidor", mensaje: "500" } });
const sha = (s) => createHash("sha256").update(s).digest("hex");
const config = { base: "http://localhost:3000", porDefecto: "bodega", seco: false, negocios: { bodega: { slug: "main" }, blas: { slug: "inversiones-agroforestales-blas-sociedad-anonima" } } };
const { defs: CATALOGO } = await cargarHerramientas();

async function conectar(op = {}) {
  const pedir = vi.fn(op.pedir ?? (async (_n, p) => (p.metodo === "GET" ? okResp({}) : okResp({ id: "nuevo" }))));
  const preguntar = vi.fn(op.preguntar ?? (async () => "si"));
  const { servidor } = crearServidor({ herramientas: op.herramientas ?? CATALOGO, pedir, preguntar, config, seco: false, rutaLecturaPermitida, ...(op.extra ?? {}) });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const cliente = new Client({ name: "test", version: "1" });
  await Promise.all([servidor.connect(a), cliente.connect(b)]);
  const llamar = async (name, args = {}) => { const r = await cliente.callTool({ name, arguments: args }); return { ...r, texto: r.content.map((c) => c.text).join("\n") }; };
  return { pedir, preguntar, llamar };
}
const escrituras = (pedir) => pedir.mock.calls.filter(([, p]) => p.metodo !== "GET");

// ── Cliente HTTP falso (para pedir() de verdad) ──
function falso() {
  const llamadas = [];
  const fetch = vi.fn(async (url, init) => {
    llamadas.push({ url, metodo: init.method, headers: init.headers, body: init.body });
    const k = `${init.method} ${new URL(url).pathname}`;
    const h = new Headers({ "content-type": "application/json" });
    if (k === "GET /api/health") h.append("set-cookie", "csrf-token=CSRF1; Path=/");
    if (k === "POST /api/auth/login") { h.append("set-cookie", "buleje-admin-sess=S1; Path=/; HttpOnly"); h.append("set-cookie", "buleje-admin-refresh=R1; Path=/; HttpOnly"); }
    return new Response(JSON.stringify({ ok: true, id: "x" }), { status: 200, headers: h });
  });
  return { fetch, llamadas };
}
const cfgCliente = { base: "http://localhost:3000", porDefecto: "bodega", seco: true, negocios: { bodega: { slug: "main", usuario: "claude", clave: "x" } } };
const clienteDe = (f, extra = {}) => crearCliente({ config: cfgCliente, fetch: f.fetch, dirEstado: null, puertoAbierto: async () => true, esperar: async () => {}, ...extra });

describe("hallazgo 1 · ruta de leer_get y de pedir()", () => {
  it.each(["/api/sales%3F/../../api/admin/export-all", "/api/sales/./x", "/api/sales/../auth/me", "/api/sales?today=1", "/api/sales#x", "/api/sales%2F..%2F..%2Fauth"])(
    "pedir() no manda %j (cambia al normalizarse o trae query/hash): ni siquiera abre sesión",
    async (ruta) => {
      const f = falso();
      const r = await clienteDe(f).pedir("bodega", { metodo: "GET", ruta });
      expect(r.ok).toBe(false);
      expect(r.error.codigo).toBe("ruta_no_permitida");
      expect(f.fetch).not.toHaveBeenCalled();
    },
  );

  it("leer_get manda EXACTAMENTE la ruta revisada, la query aparte y la respuesta con DNI/celular tapados", async () => {
    const { pedir, llamar } = await conectar({ pedir: async () => okResp({ cliente: "Ana", dni: "45678912", telefono: "987654321", nota: "DNI 70123456" }) });
    const r = await llamar("leer_get", { ruta: "/api/sales", query: { today: 1, from: "2026-10-01" } });
    expect(r.isError).toBeFalsy();
    expect(pedir).toHaveBeenCalledTimes(1);
    expect(pedir.mock.calls[0][1]).toEqual({ metodo: "GET", ruta: "/api/sales", query: { today: 1, from: "2026-10-01" } });
    expect(r.texto).not.toMatch(/45678912|987654321|70123456/);
    expect(r.texto).toContain("••••8912");
  });

  it("leer_get: «%3F», «?» en la ruta o una clave de query rara → error sin pedir nada", async () => {
    const { pedir, llamar } = await conectar();
    expect((await llamar("leer_get", { ruta: "/api/sales%3F/../../api/admin/export-all" })).texto).toMatch(/^ruta_no_permitida/);
    expect((await llamar("leer_get", { ruta: "/api/sales?x=/../../admin-users" })).texto).toMatch(/^ruta_no_permitida/);
    expect((await llamar("leer_get", { ruta: "/api/sales", query: { "a&b=": 1 } })).isError).toBe(true);
    expect(pedir).not.toHaveBeenCalled();
  });
});

describe("hallazgo 2 · qué archivos sube doc_subir", () => {
  let dir, raiz, casa, fuera;
  const op = () => ({ raices: [raiz], casa });
  beforeAll(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), "mcp-arch-")));
    raiz = join(dir, "Semana actual");
    casa = join(dir, "casa");
    fuera = join(dir, "fuera");
    for (const d of [raiz, fuera, join(raiz, ".oculta"), join(casa, ".ssh"), join(casa, ".config", "buleje-mcp")]) mkdirSync(d, { recursive: true });
    writeFileSync(join(raiz, "guia.pdf"), "PDF-1");
    writeFileSync(join(fuera, "secreto.txt"), "clave");
    for (const n of [".env", ".env.local", "prod.env", ".oculto.pdf"]) writeFileSync(join(raiz, n), "X=1");
    writeFileSync(join(raiz, ".oculta", "a.pdf"), "x");
    writeFileSync(join(casa, ".ssh", "id_ed25519"), "KEY");
    writeFileSync(join(casa, ".config", "buleje-mcp", "credenciales.json"), "{}");
    symlinkSync(join(fuera, "secreto.txt"), join(raiz, "enlace.pdf"));
    symlinkSync(join(casa, ".ssh"), join(raiz, "llaves"));
    writeFileSync(join(raiz, "grande.pdf"), "");
    truncateSync(join(raiz, "grande.pdf"), MAX_ARCHIVO_BYTES + 1);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("un archivo de la carpeta permitida sale con su sha256 y tamaño", async () => {
    const r = await revisarArchivo(join(raiz, "guia.pdf"), op());
    expect(r).toMatchObject({ ok: true, nombre: "guia.pdf", bytes: 5, sha256: sha("PDF-1") });
  });

  it.each([
    ["fuera de las carpetas", (d) => join(d.fuera, "secreto.txt")],
    ["enlace que sale de la carpeta", (d) => join(d.raiz, "enlace.pdf")],
    ["enlace a ~/.ssh", (d) => join(d.raiz, "llaves", "id_ed25519")],
    [".env", (d) => join(d.raiz, ".env")],
    [".env.local", (d) => join(d.raiz, ".env.local")],
    ["prod.env", (d) => join(d.raiz, "prod.env")],
    ["oculto", (d) => join(d.raiz, ".oculto.pdf")],
    ["en carpeta oculta", (d) => join(d.raiz, ".oculta", "a.pdf")],
    ["> 25 MB", (d) => join(d.raiz, "grande.pdf")],
    ["una carpeta", (d) => d.raiz],
    ["ruta relativa", () => "guia.pdf"],
    ["no existe", (d) => join(d.raiz, "no-hay.pdf")],
  ])("rechaza: %s", async (_n, ruta) => {
    const r = await revisarArchivo(ruta({ raiz, fuera, casa }), op());
    expect(r.ok).toBe(false);
  });

  it("aunque una raíz fuera la casa entera, ~/.ssh y ~/.config quedan afuera", async () => {
    for (const p of [join(casa, ".ssh", "id_ed25519"), join(casa, ".config", "buleje-mcp", "credenciales.json")]) {
      expect((await revisarArchivo(p, { raices: [casa], casa })).ok).toBe(false);
    }
  });

  it("pedir() solo sube el MISMO archivo que se selló: sin sello o con otro sha256 no sale", async () => {
    const f = falso();
    const c = clienteDe(f, { raicesArchivos: [raiz], casa });
    const subir = (archivo) => c.pedir("bodega", { metodo: "POST", ruta: "/api/documents/upload", archivo, cuerpo: { carpeta: "x" } });
    const ruta = join(raiz, "guia.pdf");
    expect((await subir({ ruta, campo: "file", sha256: "", bytes: 5 })).error.codigo).toBe("ruta_no_permitida");
    expect((await subir({ ruta, campo: "file", sha256: sha("otro"), bytes: 5 })).error.codigo).toBe("datos_invalidos");
    expect((await subir({ ruta: join(fuera, "secreto.txt"), campo: "file", sha256: sha("clave"), bytes: 5 })).error.codigo).toBe("ruta_no_permitida");
    expect(f.llamadas.filter((l) => l.url.includes("/api/documents/upload"))).toHaveLength(0);
    expect((await subir({ ruta, campo: "file", sha256: sha("PDF-1"), bytes: 5 })).ok).toBe(true);
    const sub = f.llamadas.filter((l) => l.url.includes("/api/documents/upload"));
    expect(sub).toHaveLength(1);
    expect(sub[0].body).toBeInstanceOf(FormData);
  });

  it("doc_subir es «confirmar» y con un archivo no permitido el aviso dice por qué", async () => {
    const def = CATALOGO.find((d) => d.nombre === "doc_subir");
    expect(def.tipo).toBe("confirmar");
    const previa = await def.previa({ ruta: "/home/usuario/.ssh/id_ed25519", carpetaId: "c1" }, async () => fallaResp());
    expect(def.resumen({ ruta: "/home/usuario/.ssh/id_ed25519" }, previa)).toMatch(/NO se puede/);
  });
});

describe("hallazgo 3 · el nombre del aviso sale del panel, nunca de Claude", () => {
  const personas = [{ id: "b1", nombre: "Don Lucho" }, { id: "b2", nombre: "Doña Rosa" }, { id: "b3", nombre: "Juan Pérez" }];
  const pedirAdelantos = async (_n, p) => (p.metodo !== "GET" ? okResp({ id: "a1" }) : p.ruta === "/api/adelantos/beneficiarios" ? okResp(personas) : okResp([]));

  it("adelanto_dar: nombre por id desde la lista, botones con el monto real y la fila «A quién»", async () => {
    const { pedir, preguntar, llamar } = await conectar({ pedir: pedirAdelantos });
    const prop = await llamar("adelanto_dar", { negocio: "blas", beneficiarioId: "b1", monto: 150, modalidad: "CUENTA_CORRIENTE" });
    expect(prop.isError).toBeFalsy();
    const { token, resumen } = JSON.parse(prop.texto);
    expect(resumen).toContain("Don Lucho");
    expect(resumen).toContain("S/ 150,00");
    expect(resumen).toMatch(/aprieta el botón con el monto correcto\.$/);
    expect(pedir.mock.calls.find(([, p]) => p.ruta === "/api/adelantos/beneficiarios")[1].sinRecorte).toBe(true);
    await llamar("confirmar", { token, resumen });
    const v = preguntar.mock.calls[0][0].ventana;
    expect(v.clave).toMatchObject({ valor: "S/ 150,00", palabra: "monto" });
    expect(v.clave.senuelos).toEqual(["S/ 1.500,00", "S/ 15,00"]);
    expect(v.filas).toContainEqual({ etiqueta: "A quién", valor: "Don Lucho" });
    expect(escrituras(pedir)[0][1].cuerpo).toMatchObject({ beneficiarioId: "b1", montoAdelantado: 150 });
  });

  it("un id que no está en la lista → «NO PUDE VERIFICAR A QUIÉN», no un nombre inventado", async () => {
    const { llamar } = await conectar({ pedir: pedirAdelantos });
    const { resumen } = JSON.parse((await llamar("adelanto_dar", { negocio: "blas", beneficiarioId: "zz9", monto: 50 })).texto);
    expect(resumen).toContain(NO_VERIFICADO);
    expect(resumen).not.toMatch(/Don Lucho|Doña Rosa|Juan Pérez/);
  });

  /** Args mínimos de ejemplo a partir del schema de entrada. */
  function ejemplo(s) {
    if (s.enum) return s.enum[0];
    if (s.anyOf) return ejemplo(s.anyOf.find((x) => x.type !== "null") ?? s.anyOf[0]);
    switch (s.type) {
      case "string": return (s.pattern ?? "").includes("\\d{4}-\\d{2}-\\d{2}") ? "2026-10-29" : (s.pattern ?? "").includes("[01]\\d|2[0-3]") ? "08:00" : (s.pattern ?? "").includes("\\d{1,9}(\\.") ? "1500.00" : "abc123";
      case "number": case "integer": return s.minimum !== undefined && s.minimum > 0 ? s.minimum : 500;
      case "boolean": return true;
      case "array": return [ejemplo(s.items ?? { type: "string" })];
      case "object": return Object.fromEntries((s.required ?? []).map((k) => [k, ejemplo(s.properties[k])]));
      default: return "x";
    }
  }
  const argsDe = (d) => {
    const js = z.toJSONSchema(z.object(d.entrada), { io: "input" });
    const a = Object.fromEntries((js.required ?? []).map((k) => [k, ejemplo(js.properties[k])]));
    if (d.confirmarSi) a.limiteCredito = 500;
    return { ...a, negocio: d.soloEn && !d.soloEn.includes("forestal") ? "bodega" : "blas" };
  };
  const QUIEN = ["adelanto_dar", "adelanto_anular", "caja_movimiento", "tesoreria_movimiento", "tesoreria_transferir", "fiado_cobrar", "cliente_editar", "cubicacion_borrar", "doc_papelera", "gtf_anular", "stock_ajustar", "stock_ajustar_lote", "stock_movimiento", "pedido_estado", "asistencia_marcar", "pago_semana_pagar", "tarea_borrar", "nota_borrar", "reporte_diario_enviar"];

  it("si el GET de la previa falla, cada herramienta que nombra a alguien lo dice en el aviso Y en la ventana; ninguna escribe", async () => {
    const { pedir, preguntar, llamar } = await conectar({ pedir: async (_n, p) => (p.metodo === "GET" ? fallaResp() : okResp()), preguntar: async () => "no" });
    for (const nombre of QUIEN) {
      const def = CATALOGO.find((d) => d.nombre === nombre);
      expect(def, nombre).toBeTruthy();
      const prop = await llamar(nombre, argsDe(def));
      expect(prop.isError, `${nombre}: ${prop.texto}`).toBeFalsy();
      const { token, resumen } = JSON.parse(prop.texto);
      expect(resumen, nombre).toContain(NO_VERIFICADO);
      await llamar("confirmar", { token, resumen });
      const v = preguntar.mock.calls.at(-1)[0].ventana;
      expect(JSON.stringify(v.filas), nombre).toContain(NO_VERIFICADO);
    }
    expect(escrituras(pedir)).toHaveLength(0);
  });

  it("toda herramienta que pide OK arma ventana válida (3 botones distintos, ≤4 filas de ≤60) aunque la previa no traiga nada", async () => {
    const confirmables = CATALOGO.filter((d) => d.tipo === "confirmar" || d.confirmarSi);
    expect(confirmables.length).toBeGreaterThanOrEqual(25);
    for (const d of confirmables) {
      const a = argsDe(d);
      const previa = d.previa ? await d.previa(a, async () => fallaResp()) : undefined;
      for (const p of [previa, null]) {
        const v = sanearVentana(typeof d.ventana === "function" ? d.ventana(a, p) : undefined);
        expect(new Set([v.clave.valor, ...v.clave.senuelos]).size, d.nombre).toBe(3);
        expect(v.filas.length).toBeLessThanOrEqual(4);
        for (const f of v.filas) expect([...f.valor].length).toBeLessThanOrEqual(60);
        expect(d.resumen(a, p), d.nombre).not.toMatch(/undefined|NaN|\[object/);
        expect(() => d.pedido(a, p), d.nombre).not.toThrow();
      }
    }
  });
});

describe("hallazgo 4 · botones con señuelo (lógica)", () => {
  it("monto: real + ×10 + ÷10; cantidad con unidad; inválido → null", () => {
    expect(claveMonto(150)).toEqual({ etiqueta: "Monto", valor: "S/ 150,00", senuelos: ["S/ 1.500,00", "S/ 15,00"], palabra: "monto" });
    expect(claveCantidad(30, { unidad: "u" })).toMatchObject({ valor: "30 u", senuelos: ["300 u", "3 u"], palabra: "número" });
    expect(claveMonto(Number.NaN)).toBeNull();
    expect(claveMonto(0).senuelos).toHaveLength(2);
  });

  it("nombre: señuelos de la misma lista (nunca el real); sin lista, parecidos; vacío → null", () => {
    const c = claveNombre("Don Lucho", ["Doña Rosa", "don lucho", "Juan Pérez"], { aleatorio: () => 0 });
    expect(c.valor).toBe("Don Lucho");
    expect(c.senuelos).toHaveLength(2);
    for (const s of c.senuelos) expect(["Doña Rosa", "Juan Pérez"]).toContain(s);
    expect(claveNombre("Luis Fernández").senuelos).toEqual(["Fernández Luis", "Leis Fernández"]);
    expect(claveNombre("  ")).toBeNull();
  });

  it("sin clave (o con señuelos iguales al real) → código de 3 cifras distintas; un azar constante no cuelga", () => {
    const v = sanearVentana({ clave: { etiqueta: "Monto", valor: "S/ 5,00", senuelos: ["S/ 5,00", "s/ 5,00"] } });
    expect(v.clave.palabra).toBe("código");
    expect(new Set([v.clave.valor, ...v.clave.senuelos]).size).toBe(3);
    const fijo = claveCodigo(() => 7);
    expect(new Set([fijo.valor, ...fijo.senuelos]).size).toBe(3);
    expect(lineaInstruccion(v)).toBe("Para hacerlo, aprieta el botón con el código correcto.");
    expect(sanearVentana(v)).toEqual(v);
  });

  it("orden al azar: el real cae en las 3 posiciones y `correcto` siempre lo señala", () => {
    const clave = claveMonto(150);
    const posiciones = new Set();
    for (let i = 0; i < 200; i++) {
      const { textos, correcto } = armarBotones(clave);
      expect(textos[correcto]).toBe("S/ 150,00");
      expect([...textos].sort()).toEqual([clave.valor, ...clave.senuelos].sort());
      posiciones.add(correcto);
    }
    expect(posiciones.size).toBe(3);
  });

  it("linea60: saltos, bidi y ancho cero fuera; corta a 60 con «…»", () => {
    expect(linea60("Don\nLucho‮​")).toBe("Don Lucho");
    const largo = linea60("x".repeat(100));
    expect([...largo].length).toBe(60);
    expect(largo.endsWith("…")).toBe(true);
  });
});

describe("hallazgo 6 · medios", () => {
  it("cliente_editar: tocar limiteCredito pide OK (propuesta, sin escribir); sin limiteCredito escribe directo", async () => {
    const { pedir, llamar } = await conectar({ pedir: async (_n, p) => (p.metodo === "GET" ? okResp({ name: "Doña Rosa", creditLimit: 100 }) : okResp()) });
    const prop = await llamar("cliente_editar", { telefono: "987654321", limiteCredito: 900 });
    const { token, resumen } = JSON.parse(prop.texto);
    expect(token).toMatch(/^[A-Z2-7]{26}$/);
    expect(resumen).toMatch(/Doña Rosa.*S\/ 100,00 → S\/ 900,00/);
    expect(escrituras(pedir)).toHaveLength(0);
    const directo = await llamar("cliente_editar", { telefono: "987654321", direccion: "Jr. Lima 123" });
    expect(directo.isError).toBeFalsy();
    expect(escrituras(pedir)).toHaveLength(1);
    expect(escrituras(pedir)[0][1].cuerpo).toEqual({ direccion: "Jr. Lima 123" });
  });

  it("cliente_crear con límite de crédito y asistencia_marcar piden OK", () => {
    const crear = CATALOGO.find((d) => d.nombre === "cliente_crear");
    expect(crear.confirmarSi({ limiteCredito: 0 })).toBe(true);
    expect(crear.confirmarSi({})).toBe(false);
    expect(CATALOGO.find((d) => d.nombre === "asistencia_marcar").tipo).toBe("confirmar");
  });

  it("fila de ventanas: dos confirmar a la vez → las ventanas salen una después de otra", async () => {
    let activas = 0;
    let maximo = 0;
    const preguntar = async () => { activas++; maximo = Math.max(maximo, activas); await new Promise((r) => setTimeout(r, 30)); activas--; return "no"; };
    const { llamar } = await conectar({ preguntar });
    const p1 = JSON.parse((await llamar("tarea_borrar", { negocio: "bodega", id: "t1" })).texto);
    const p2 = JSON.parse((await llamar("tarea_borrar", { negocio: "bodega", id: "t2" })).texto);
    const [r1, r2] = await Promise.all([llamar("confirmar", { token: p1.token, resumen: p1.resumen }), llamar("confirmar", { token: p2.token, resumen: p2.resumen })]);
    expect(maximo).toBe(1);
    expect(r1.texto).toMatch(/^no_confirmado/);
    expect(r2.texto).toMatch(/^no_confirmado/);
  });

  it("taparPersonales: DNI, celular y sueldo por clave y por forma; neto, decimales y códigos quedan; no toca el original", () => {
    const original = { dni: "45678912", telefono: "+51 987 654 321", sueldoBase: 1500, neto: 420.5, monto: "12345678.50", guia: "GTF-12345678", nota: "llamar al 987654321 o DNI 70123456", equipo: [{ documento: "70123456" }] };
    const t = taparPersonales(original);
    expect(t).toEqual({ dni: "••••8912", telefono: "••• ••• 321", sueldoBase: "(oculto: sueldo)", neto: 420.5, monto: "12345678.50", guia: "GTF-12345678", nota: "llamar al 9•• ••• 321 o DNI ••••3456", equipo: [{ documento: "••••3456" }] });
    expect(original.dni).toBe("45678912");
    expect(taparTexto("total 1500.25 y 12345678")).toBe("total 1500.25 y ••••5678");
  });

  it("las herramientas de RRHH devuelven DNI, celular y sueldo tapados", async () => {
    const { llamar } = await conectar({ pedir: async () => okResp({ colaboradores: [{ id: "c1", nombre: "Ana Ruiz", dni: "45678912", telefono: "987654321", sueldoBase: 1500, cargo: "Ayudante" }] }) });
    const r = await llamar("rrhh_ver", { negocio: "blas", vista: "colaboradores" });
    expect(r.isError).toBeFalsy();
    expect(r.texto).not.toMatch(/45678912|987654321/);
  });

  it("x-tenant-id solo en el login: ni GET ni escrituras lo llevan", async () => {
    const f = falso();
    const c = clienteDe(f);
    expect((await c.pedir("bodega", { metodo: "GET", ruta: "/api/sales" })).ok).toBe(true);
    expect((await c.pedir("bodega", { metodo: "POST", ruta: "/api/tasks", cuerpo: { t: 1 } })).ok).toBe(true);
    for (const l of f.llamadas) {
      const esLogin = l.url.endsWith("/api/auth/login");
      expect(l.headers["x-tenant-id"], l.url).toBe(esLogin ? "main" : undefined);
    }
  });
});
