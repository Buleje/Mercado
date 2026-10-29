// @vitest-environment node
// @ts-nocheck — importa .mjs del MCP (sin tipos); el contrato vive en JSDoc (tools/mcp-buleje/src/tipos.mjs).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { crearConfirmador, jsonCanonico, sha256, base32, normalizarResumen, VIGENCIA_MS, VENTANA_MS } from "../../tools/mcp-buleje/src/confirmaciones.mjs";
import { crearServidor, cargarHerramientas, secoInicial, rubroDe, RESERVADAS } from "../../tools/mcp-buleje/servidor.mjs";
import { registroDeHoy, diaLima } from "../../tools/mcp-buleje/src/recursos.mjs";
import { textoPrompt, PROMPTS } from "../../tools/mcp-buleje/src/prompts.mjs";
import { Client } from "../../tools/mcp-buleje/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { InMemoryTransport } from "../../tools/mcp-buleje/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js";
import { z } from "../../tools/mcp-buleje/node_modules/zod/index.js";

const T0 = Date.UTC(2026, 9, 29, 15, 0, 0);
const pedidoAdelanto = { metodo: "POST", ruta: "/api/adelantos", cuerpo: { beneficiarioId: "b1", montoAdelantado: 150 } };
const RESUMEN = "Dar adelanto de S/ 150,00 a Don Lucho\nsale de caja: efectivo";
const okResp = (datos = { id: "a1" }) => ({ ok: true, status: 200, ms: 5, datos });

function armar(op = {}) {
  const preguntar = vi.fn(op.preguntar ?? (async () => "si"));
  const enviar = vi.fn(op.enviar ?? (async () => okResp()));
  const c = crearConfirmador({ preguntar, enviar, seco: op.seco ?? false });
  return { c, preguntar, enviar };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); });
afterEach(() => { vi.useRealTimers(); });

describe("confirmaciones · token", () => {
  it("proponer no toca la red ni abre ventana; token de 128 bits en base32, vence a los 120 s", () => {
    const { c, preguntar, enviar } = armar();
    const p = c.proponer({ negocio: "blas", herramienta: "adelanto_dar", pedidos: pedidoAdelanto, resumen: RESUMEN });
    expect(p.token).toMatch(/^[A-Z2-7]{26}$/);
    expect(p.vence).toBe(T0 + VIGENCIA_MS);
    expect(VIGENCIA_MS).toBe(120_000);
    expect(enviar).not.toHaveBeenCalled();
    expect(preguntar).not.toHaveBeenCalled();
    expect(base32(new Uint8Array(16).fill(255))).toBe("7".repeat(25) + "4") // 128 bits = 25×5 + 3 bits «111» rellenos a «11100» = 28 = «4»;
  });

  it("«si» manda el pedido; la ventana recibe el resumen guardado, el negocio y su propio vencimiento", async () => {
    const { c, preguntar, enviar } = armar();
    const p = c.proponer({ negocio: "blas", herramienta: "adelanto_dar", pedidos: pedidoAdelanto, resumen: RESUMEN });
    vi.setSystemTime(T0 + 60_000);
    const r = await c.confirmar({ token: p.token, resumen: RESUMEN });
    expect(r).toMatchObject({ ok: true, respuesta: "si", negocio: "blas", herramienta: "adelanto_dar" });
    expect(preguntar).toHaveBeenCalledTimes(1);
    expect(preguntar.mock.calls[0][0]).toMatchObject({ negocio: "blas", resumen: RESUMEN, vence: T0 + 60_000 + VENTANA_MS });
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar.mock.calls[0][0]).toBe("blas");
    expect(enviar.mock.calls[0][1]).toMatchObject({ metodo: "POST", ruta: "/api/adelantos", cuerpo: { beneficiarioId: "b1", montoAdelantado: 150 } });
  });

  it("un solo uso: el segundo confirmar da token_usado y no manda nada", async () => {
    const { c, enviar } = armar();
    const p = c.proponer({ negocio: "blas", herramienta: "adelanto_dar", pedidos: pedidoAdelanto, resumen: RESUMEN });
    expect((await c.confirmar({ token: p.token, resumen: RESUMEN })).ok).toBe(true);
    const r2 = await c.confirmar({ token: p.token, resumen: RESUMEN });
    expect(r2.error.codigo).toBe("token_usado");
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("vence a los 120 s: a 119,999 s sirve, a 120,001 s token_vencido", async () => {
    const { c } = armar();
    const a = c.proponer({ negocio: "blas", herramienta: "x_y", pedidos: pedidoAdelanto, resumen: RESUMEN });
    const b = c.proponer({ negocio: "blas", herramienta: "x_y", pedidos: pedidoAdelanto, resumen: RESUMEN });
    vi.advanceTimersByTime(VIGENCIA_MS - 1);
    expect((await c.confirmar({ token: a.token, resumen: RESUMEN })).ok).toBe(true);
    vi.advanceTimersByTime(2);
    expect((await c.confirmar({ token: b.token, resumen: RESUMEN })).error.codigo).toBe("token_vencido");
  });

  it("token inventado o con otra forma → token_vencido, sin ventana", async () => {
    const { c, preguntar } = armar();
    expect((await c.confirmar({ token: "A".repeat(26), resumen: RESUMEN })).error.codigo).toBe("token_vencido");
    expect((await c.confirmar({ token: "abc", resumen: RESUMEN })).error.codigo).toBe("token_vencido");
    expect(preguntar).not.toHaveBeenCalled();
  });

  it("resumen_distinto no consume el token; \\r\\n y espacios al final no cuentan como otro resumen", async () => {
    const { c, enviar } = armar();
    const p = c.proponer({ negocio: "blas", herramienta: "adelanto_dar", pedidos: pedidoAdelanto, resumen: RESUMEN });
    const mal = await c.confirmar({ token: p.token, resumen: "Dar adelanto de S/ 15,00 a Don Lucho\nsale de caja: efectivo" });
    expect(mal.error.codigo).toBe("resumen_distinto");
    expect(enviar).not.toHaveBeenCalled();
    const bien = await c.confirmar({ token: p.token, resumen: "Dar adelanto de S/ 150,00 a Don Lucho  \r\nsale de caja: efectivo\n" });
    expect(bien.ok).toBe(true);
    expect(normalizarResumen("a \r\nb\n")).toBe("a\nb");
  });

  it("token_otro_negocio si confirmar trae otro negocio", async () => {
    const { c, preguntar } = armar();
    const p = c.proponer({ negocio: "blas", herramienta: "adelanto_dar", pedidos: pedidoAdelanto, resumen: RESUMEN });
    expect((await c.confirmar({ token: p.token, resumen: RESUMEN, negocio: "bodega" })).error.codigo).toBe("token_otro_negocio");
    expect(preguntar).not.toHaveBeenCalled();
    expect((await c.confirmar({ token: p.token, resumen: RESUMEN, negocio: "blas" })).ok).toBe(true);
  });

  it("pedidos distintos → hash distinto; mismo pedido con claves en otro orden → mismo hash", () => {
    const h = (v) => sha256(jsonCanonico(v));
    expect(h([{ metodo: "POST", ruta: "/api/x", cuerpo: { a: 1, b: 2 } }])).toBe(h([{ ruta: "/api/x", cuerpo: { b: 2, a: 1 }, metodo: "POST" }]));
    expect(h([{ metodo: "POST", ruta: "/api/x", cuerpo: { monto: 150 } }])).not.toBe(h([{ metodo: "POST", ruta: "/api/x", cuerpo: { monto: 1500 } }]));
  });

  it("los pedidos guardados no se pueden cambiar después de proponer", async () => {
    const { c, enviar } = armar();
    const original = structuredClone(pedidoAdelanto);
    const p = c.proponer({ negocio: "blas", herramienta: "adelanto_dar", pedidos: original, resumen: RESUMEN });
    original.cuerpo.montoAdelantado = 99999; // el que llamó cambia su objeto: la propuesta guardó una copia
    await c.confirmar({ token: p.token, resumen: RESUMEN });
    expect(enviar.mock.calls[0][1].cuerpo.montoAdelantado).toBe(150);
  });
});

describe("confirmaciones · ventana de OK (§10)", () => {
  it("dos confirmar en paralelo → una sola ventana y un solo envío", async () => {
    const { c, preguntar, enviar } = armar();
    const p = c.proponer({ negocio: "blas", herramienta: "adelanto_dar", pedidos: pedidoAdelanto, resumen: RESUMEN });
    const [a, b] = await Promise.all([c.confirmar({ token: p.token, resumen: RESUMEN }), c.confirmar({ token: p.token, resumen: RESUMEN })]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect([a, b].find((x) => !x.ok).error.codigo).toBe("token_usado");
    expect(preguntar).toHaveBeenCalledTimes(1);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("«no» → no_confirmado; «vencio» → sin_respuesta; ventana rota → no_confirmado; en los tres no se manda nada", async () => {
    for (const [resp, codigo] of [["no", "no_confirmado"], ["vencio", "sin_respuesta"], ["cualquier-cosa", "no_confirmado"]]) {
      const { c, enviar } = armar({ preguntar: async () => resp });
      const p = c.proponer({ negocio: "blas", herramienta: "adelanto_dar", pedidos: pedidoAdelanto, resumen: RESUMEN });
      expect((await c.confirmar({ token: p.token, resumen: RESUMEN })).error.codigo).toBe(codigo);
      expect(enviar).not.toHaveBeenCalled();
    }
    const { c, enviar } = armar({ preguntar: async () => { throw new Error("powershell.exe no existe"); } });
    const p = c.proponer({ negocio: "blas", herramienta: "adelanto_dar", pedidos: pedidoAdelanto, resumen: RESUMEN });
    expect((await c.confirmar({ token: p.token, resumen: RESUMEN })).error.codigo).toBe("no_confirmado");
    expect(enviar).not.toHaveBeenCalled();
  });

  it("si la ventana nunca contesta, a los 120 s + holgura da sin_respuesta y el token queda gastado", async () => {
    const { c, enviar } = armar({ preguntar: () => new Promise(() => {}) });
    const p = c.proponer({ negocio: "blas", herramienta: "adelanto_dar", pedidos: pedidoAdelanto, resumen: RESUMEN });
    const prom = c.confirmar({ token: p.token, resumen: RESUMEN });
    await vi.advanceTimersByTimeAsync(VENTANA_MS + 20_000);
    expect((await prom).error.codigo).toBe("sin_respuesta");
    expect(enviar).not.toHaveBeenCalled();
    expect((await c.confirmar({ token: p.token, resumen: RESUMEN })).error.codigo).toBe("token_usado");
  });

  it("llamada cancelada (AbortSignal) mientras espera → aunque llegue «si», no se manda", async () => {
    const ctl = new AbortController();
    const { c, enviar } = armar({ preguntar: async () => { ctl.abort(); return "si"; } });
    const p = c.proponer({ negocio: "blas", herramienta: "adelanto_dar", pedidos: pedidoAdelanto, resumen: RESUMEN });
    expect((await c.confirmar({ token: p.token, resumen: RESUMEN, signal: ctl.signal })).error.codigo).toBe("no_confirmado");
    expect(enviar).not.toHaveBeenCalled();
  });

  it("si un paso falla, corta y dice cuáles se hicieron", async () => {
    const enviar = vi.fn(async (_n, p) => (p.ruta === "/api/b" ? { ok: false, status: 400, ms: 1, error: { codigo: "datos_invalidos", mensaje: "monto" } } : okResp()));
    const { c } = armar({ enviar });
    const pedidos = ["/api/a", "/api/b", "/api/c"].map((ruta) => ({ metodo: "POST", ruta, cuerpo: {} }));
    const p = c.proponer({ negocio: "bodega", herramienta: "x_y", pedidos, resumen: "tres pasos" });
    const r = await c.confirmar({ token: p.token, resumen: "tres pasos" });
    expect(r.ok).toBe(false);
    expect(r.error.codigo).toBe("datos_invalidos");
    expect(r.error.mensaje).toMatch(/paso 2 de 3.*1 anteriores SÍ se hicieron.*1 siguientes no se mandaron/s);
    expect(enviar).toHaveBeenCalledTimes(2);
  });
});

describe("confirmaciones · a seco, idempotencia, pendientes", () => {
  it("modo a seco (global, en la propuesta o en confirmar): ni ventana ni red, devuelve los pedidos", async () => {
    for (const caso of [{ seco: true }, { prop: true }, { conf: true }]) {
      const { c, preguntar, enviar } = armar({ seco: caso.seco ?? false });
      const p = c.proponer({ negocio: "blas", herramienta: "adelanto_dar", pedidos: pedidoAdelanto, resumen: RESUMEN, seco: caso.prop });
      const r = await c.confirmar({ token: p.token, resumen: RESUMEN, seco: caso.conf });
      expect(r).toMatchObject({ ok: true, seco: true });
      expect(r.pedidos[0]).toMatchObject({ metodo: "POST", ruta: "/api/adelantos" });
      expect(preguntar).not.toHaveBeenCalled();
      expect(enviar).not.toHaveBeenCalled();
    }
  });

  it("mete idempotencyKey en los POST que la aceptan, no pisa la que viene y no la pone donde no va", async () => {
    const { c, enviar } = armar();
    const pedidos = [
      pedidoAdelanto,
      { metodo: "POST", ruta: "/api/sales", cuerpo: { items: [], idempotencyKey: "propia-123" } },
      { metodo: "PATCH", ruta: "/api/adelantos/abc", cuerpo: { notas: "x" } },
      { metodo: "POST", ruta: "/api/cash-registers/movements", cuerpo: { monto: 1 } },
    ];
    const p = c.proponer({ negocio: "bodega", herramienta: "x_y", pedidos, resumen: "cuatro" });
    await c.confirmar({ token: p.token, resumen: "cuatro" });
    const cuerpos = enviar.mock.calls.map((x) => x[1].cuerpo);
    expect(cuerpos[0].idempotencyKey).toMatch(/^mcp-[A-Z2-7]{24}$/);
    expect(cuerpos[1].idempotencyKey).toBe("propia-123");
    expect(cuerpos[2].idempotencyKey).toBeUndefined();
    expect(cuerpos[3].idempotencyKey).toBeUndefined();
  });

  it("proponer rechaza pedidos mal armados y resumen vacío", () => {
    const { c } = armar();
    expect(() => c.proponer({ negocio: "b", herramienta: "x", pedidos: { metodo: "POST", ruta: "/api/../admin-users" }, resumen: "r" })).toThrow(/ruta/);
    expect(() => c.proponer({ negocio: "b", herramienta: "x", pedidos: { metodo: "TRACE", ruta: "/api/x" }, resumen: "r" })).toThrow(/método/);
    expect(() => c.proponer({ negocio: "b", herramienta: "x", pedidos: { metodo: "POST", ruta: "/api/x" }, resumen: "  " })).toThrow(/resumen/);
  });

  it("pendientes lista solo las vivas; cancelar la anula", async () => {
    const { c, preguntar } = armar();
    const a = c.proponer({ negocio: "blas", herramienta: "adelanto_dar", pedidos: pedidoAdelanto, resumen: RESUMEN });
    const b = c.proponer({ negocio: "bodega", herramienta: "venta_registrar", pedidos: { metodo: "POST", ruta: "/api/sales", cuerpo: {} }, resumen: "venta" });
    expect(c.pendientes().map((x) => x.token)).toEqual([a.token, b.token]);
    expect(c.cancelar({ token: a.token }).ok).toBe(true);
    expect(c.pendientes().map((x) => x.token)).toEqual([b.token]);
    expect((await c.confirmar({ token: a.token, resumen: RESUMEN })).error.codigo).toBe("token_usado");
    expect(preguntar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(VIGENCIA_MS + 1);
    expect(c.pendientes()).toEqual([]);
  });
});

// ── Servidor por el protocolo MCP real (SDK en memoria) ──
const defPrueba = {
  nombre: "adelanto_prueba", grupo: "adelantos", tipo: "confirmar", descripcion: "Da un adelanto (S/).",
  entrada: { negocio: z.string().optional(), monto: z.number().positive() },
  pedido: (a) => ({ metodo: "POST", ruta: "/api/adelantos", cuerpo: { beneficiarioId: "b1", montoAdelantado: a.monto } }),
  previa: async (_a, leer) => (await leer({ metodo: "GET", ruta: "/api/adelantos/resumen" })).datos,
  resumen: (a, previa) => `Dar S/ ${a.monto} a Don Lucho (saldo antes: S/ ${previa?.saldo ?? "?"})`,
};
const defLectura = { nombre: "ver_prueba", grupo: "hoy", tipo: "lectura", descripcion: "Lee.", entrada: { negocio: z.string().optional() }, pedido: () => ({ metodo: "GET", ruta: "/api/admin/today-summary" }) };
const defForestal = { ...defLectura, nombre: "solo_forestal", soloEn: ["forestal"] };
const config = { base: "http://localhost:3000", porDefecto: "bodega", seco: false, negocios: { bodega: { slug: "main" }, blas: { slug: "inversiones-agroforestales-blas-sociedad-anonima" } } };

async function conectar(op = {}) {
  const pedir = vi.fn(async (_n, p) => (p.metodo === "GET" ? okResp({ saldo: 40, ventas: 12 }) : okResp({ id: "nuevo" })));
  const preguntar = vi.fn(op.preguntar ?? (async () => "si"));
  const { servidor } = crearServidor({ herramientas: op.herramientas ?? [defPrueba, defLectura, defForestal], pedir, preguntar, config, seco: op.seco ?? false, ...(op.extra ?? {}) });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const cliente = new Client({ name: "test", version: "1" });
  await Promise.all([servidor.connect(a), cliente.connect(b)]);
  const llamar = async (name, args = {}) => { const r = await cliente.callTool({ name, arguments: args }); return { ...r, texto: r.content.map((c) => c.text).join("\n") }; };
  return { cliente, pedir, preguntar, llamar };
}
const escrituras = (pedir) => pedir.mock.calls.filter(([, p]) => p.metodo !== "GET");

describe("servidor MCP", () => {
  beforeEach(() => { vi.useRealTimers(); });

  it("una herramienta «confirmar» solo propone (GET de la previa sí, escritura no); confirmar abre la ventana y recién ahí escribe", async () => {
    const { pedir, preguntar, llamar } = await conectar();
    const prop = await llamar("adelanto_prueba", { negocio: "blas", monto: 150 });
    expect(prop.isError).toBeFalsy();
    const { token, resumen } = JSON.parse(prop.texto);
    // Sin `ventana` en la def → la clave es un código de 3 cifras y el resumen lo dice.
    expect(resumen).toBe("Dar S/ 150 a Don Lucho (saldo antes: S/ 40)\n\nPara hacerlo, aprieta el botón con el código correcto.");
    expect(escrituras(pedir)).toHaveLength(0);
    expect(preguntar).not.toHaveBeenCalled();

    const hecho = await llamar("confirmar", { token, resumen });
    expect(hecho.isError).toBeFalsy();
    expect(hecho.texto).toMatch(/apretó el botón correcto/);
    expect(preguntar).toHaveBeenCalledTimes(1);
    expect(preguntar.mock.calls[0][0]).toMatchObject({ negocio: "blas", resumen });
    expect(preguntar.mock.calls[0][0].ventana.clave).toMatchObject({ palabra: "código", valor: expect.stringMatching(/^\d{3}$/) });
    expect(escrituras(pedir)).toHaveLength(1);
    expect(escrituras(pedir)[0][1].cuerpo).toMatchObject({ montoAdelantado: 150, idempotencyKey: expect.stringMatching(/^mcp-/) });

    const otra = await llamar("confirmar", { token, resumen });
    expect(otra.isError).toBe(true);
    expect(otra.texto).toMatch(/^token_usado/);
  });

  it("Brandon dice «No» → no_confirmado y nada escrito", async () => {
    const { pedir, llamar } = await conectar({ preguntar: async () => "no" });
    const { token, resumen } = JSON.parse((await llamar("adelanto_prueba", { monto: 10 })).texto);
    const r = await llamar("confirmar", { token, resumen });
    expect(r.texto).toMatch(/^no_confirmado/);
    expect(escrituras(pedir)).toHaveLength(0);
  });

  it("modo a seco: confirmar devuelve el pedido sin ventana ni red", async () => {
    const { pedir, preguntar, llamar } = await conectar({ seco: true });
    const { token, resumen, seco } = JSON.parse((await llamar("adelanto_prueba", { monto: 10 })).texto);
    expect(seco).toBe(true);
    const r = JSON.parse((await llamar("confirmar", { token, resumen })).texto);
    expect(r.pedidos[0]).toMatchObject({ metodo: "POST", ruta: "/api/adelantos" });
    expect(preguntar).not.toHaveBeenCalled();
    expect(escrituras(pedir)).toHaveLength(0);
  });

  it("descripción de confirmar: ventana en la PC de Brandon y Claude NUNCA la contesta", async () => {
    const { cliente } = await conectar();
    const { tools } = await cliente.listTools();
    const conf = tools.find((t) => t.name === "confirmar");
    expect(conf.description).toMatch(/ventana/);
    expect(conf.description).toMatch(/NUNCA contesta esa ventana/);
    expect(tools.find((t) => t.name === "adelanto_prueba").description).toMatch(/Pide OK de Brandon/);
    for (const n of ["confirmar", "pendientes", "cancelar", "leer_get", "panel_prender", "negocios", "panel_estado"]) expect(tools.map((t) => t.name)).toContain(n);
  });

  it("soloEn: lo forestal en la bodega avisa en vez de un 404 mudo", async () => {
    const { pedir, llamar } = await conectar();
    const r = await llamar("solo_forestal", { negocio: "bodega" });
    expect(r.texto).toMatch(/solo de forestal/);
    expect(pedir).not.toHaveBeenCalled();
    expect((await llamar("solo_forestal", { negocio: "blas" })).isError).toBeFalsy();
  });

  it("leer_get pasa por la lista blanca: %252e%252e → ruta_no_permitida sin pedir nada", async () => {
    const { rutaLecturaPermitida } = await import("../../tools/mcp-buleje/src/lista-blanca.mjs");
    const { pedir, llamar } = await conectar({ extra: { rutaLecturaPermitida } });
    const r = await llamar("leer_get", { ruta: "/api/%252e%252e/admin-users" });
    expect(r.texto).toMatch(/^ruta_no_permitida/);
    expect(pedir).not.toHaveBeenCalled();
    const sinLista = await conectar();
    expect((await sinLista.llamar("leer_get", { ruta: "/api/sales" })).texto).toMatch(/^ruta_no_permitida/);
  });

  it("recursos y prompts del contrato §5", async () => {
    const { cliente, llamar } = await conectar();
    const { resources } = await cliente.listResources();
    expect(resources.map((r) => r.uri)).toEqual(expect.arrayContaining(["buleje://negocios", "buleje://pendientes", "buleje://registro/hoy", "buleje://bodega/hoy", "buleje://blas/hoy"]));
    await llamar("adelanto_prueba", { monto: 5 });
    const pend = JSON.parse((await cliente.readResource({ uri: "buleje://pendientes" })).contents[0].text);
    expect(pend).toHaveLength(1);
    const neg = JSON.parse((await cliente.readResource({ uri: "buleje://negocios" })).contents[0].text);
    expect(neg.negocios.map((n) => n.rubro)).toEqual(["bodega", "forestal"]);
    expect(JSON.stringify(neg)).not.toMatch(/clave/);
    const { prompts } = await cliente.listPrompts();
    expect(prompts.map((p) => p.name)).toEqual(["hoy_en_tu_negocio", "cierre_del_dia", "adelantos_abiertos", "cuadre_ctp"]);
    expect(textoPrompt("cuadre_ctp", {})).toMatch(/A\) \+ ingresos \(B\) \+ producido \(D\) − consumos \(C\) − salidas \(E\)/);
    for (const p of PROMPTS) expect(p.texto({})).not.toMatch(/confirmar` con/);
  });

  it("el catálogo real de src/herramientas registra entero en el SDK (sin nombres repetidos ni defs rotas)", async () => {
    const { defs, avisos } = await cargarHerramientas();
    expect(avisos).toEqual([]);
    expect(defs.length).toBeGreaterThan(30);
    for (const d of defs) expect(RESERVADAS).not.toContain(d.nombre);
    const { cliente } = await conectar({ herramientas: defs });
    const { tools } = await cliente.listTools();
    expect(tools.length).toBe(defs.length + RESERVADAS.length + (defs.some((d) => d.nombre === "panel_estado") ? 0 : 1));
  });
});

describe("piezas sueltas", () => {
  it("seco: lo prende la config o BULEJE_MCP_SECO=1; solo la config lo apaga", () => {
    expect(secoInicial({ seco: false }, {})).toBe(false);
    expect(secoInicial({ seco: false }, { BULEJE_MCP_SECO: "1" })).toBe(true);
    expect(secoInicial({ seco: true }, { BULEJE_MCP_SECO: "0" })).toBe(true);
    expect(secoInicial({}, {})).toBe(true);
  });
  it("rubro por negocio", () => {
    expect(rubroDe(config, "bodega")).toBe("bodega");
    expect(rubroDe(config, "blas")).toBe("forestal");
    expect(rubroDe({ negocios: { "qa-forestal": { slug: "inversiones-agroforestales-blas-sociedad-op-qa-ui" } } }, "qa-forestal")).toBe("forestal");
  });
  it("registro de hoy = día de Lima (las 23:30 de Lima del 28 son 04:30 UTC del 29 y NO son de hoy 29)", () => {
    const ahora = new Date("2026-10-29T20:00:00Z");
    const ev = [{ ts: "2026-10-29T04:30:00Z", n: 1 }, { ts: "2026-10-29T05:10:00Z", n: 2 }, { ts: "basura" }, {}];
    expect(diaLima("2026-10-29T04:30:00Z")).toBe("2026-10-28");
    expect(registroDeHoy(ev, ahora).map((e) => e.n)).toEqual([2]);
  });
});
