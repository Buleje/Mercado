// @vitest-environment node
// @ts-nocheck — importa .mjs del MCP (sin tipos); el contrato vive en JSDoc (tools/mcp-buleje/src/tipos.mjs).
// 2.ª pasada de seguridad del MCP «buleje» (29-10): un test por hallazgo. 1 = clics inyectados (el gancho en
// dialogo-windows.test.ts; acá el confirmador y el servidor); 2 = /share; 3 = cambiar QUIÉN es sin OK; 4 = homoglifos;
// 5 = CTP por volumen, fila que espera el cierre y tope de 5 propuestas vivas.
import { describe, it, expect, vi, afterEach } from "vitest";
import { rutaLecturaPermitida } from "../../tools/mcp-buleje/src/lista-blanca.mjs";
import { esqueleto, letrasRaras, conMarca, MARCA_RARAS, claveNombre, sanearVentana, armarBotones } from "../../tools/mcp-buleje/src/clave-ok.mjs";
import { filaIdentidad, verificado, NO_VERIFICADO } from "../../tools/mcp-buleje/src/util-herramientas.mjs";
import { armarDatos } from "../../tools/mcp-buleje/src/dialogo-windows.mjs";
import { crearConfirmador, MAX_VIVAS, ESPERA_CIERRE_MS, VENTANA_MS, HOLGURA_VENTANA_MS, VIGENCIA_MS } from "../../tools/mcp-buleje/src/confirmaciones.mjs";
import { crearServidor, cargarHerramientas } from "../../tools/mcp-buleje/servidor.mjs";
import { Client } from "../../tools/mcp-buleje/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { InMemoryTransport } from "../../tools/mcp-buleje/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js";

const okResp = (datos = { id: "a1" }) => ({ ok: true, status: 200, ms: 5, datos });
const config = { base: "http://localhost:3000", porDefecto: "bodega", seco: false, negocios: { bodega: { slug: "main" }, blas: { slug: "inversiones-agroforestales-blas-sociedad-anonima" } } };
const { defs: CATALOGO } = await cargarHerramientas();
const def = (n) => CATALOGO.find((d) => d.nombre === n);

async function conectar(op = {}) {
  const pedir = vi.fn(op.pedir ?? (async (_n, p) => (p.metodo === "GET" ? okResp({}) : okResp({ id: "nuevo" }))));
  const preguntar = vi.fn(op.preguntar ?? (async () => "no"));
  const anotar = vi.fn();
  const { servidor } = crearServidor({ herramientas: CATALOGO, pedir, preguntar, config, seco: false, rutaLecturaPermitida, anotar });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const cliente = new Client({ name: "test", version: "1" });
  await Promise.all([servidor.connect(a), cliente.connect(b)]);
  const llamar = async (name, args = {}) => { const r = await cliente.callTool({ name, arguments: args }); return { ...r, texto: r.content.map((c) => c.text).join("\n") }; };
  return { pedir, preguntar, anotar, llamar };
}
const escrituras = (pedir) => pedir.mock.calls.filter(([, p]) => p.metodo !== "GET");
const RESUMEN = "Borrar la tarea t1";
const pedidoX = (i = 1) => ({ metodo: "DELETE", ruta: `/api/admin/tasks/t${i}` });

afterEach(() => { vi.useRealTimers(); });

describe("2.ª pasada · 1 · clics inyectados", () => {
  it("confirmador: preguntar con inyectados → no_confirmado con la cuenta; nunca envía (aunque diga «si»)", async () => {
    for (const resp of [{ respuesta: "no", inyectados: 2 }, { respuesta: "si", inyectados: 1 }]) {
      const enviar = vi.fn(async () => okResp());
      const c = crearConfirmador({ preguntar: async () => resp, enviar, seco: false });
      const p = c.proponer({ negocio: "bodega", herramienta: "tarea_borrar", pedidos: pedidoX(), resumen: RESUMEN });
      const r = await c.confirmar({ token: p.token, resumen: RESUMEN });
      expect(r).toMatchObject({ ok: false, respuesta: "no", inyectados: resp.inyectados, error: { codigo: "no_confirmado" } });
      expect(r.error.mensaje).toMatch(/inyectados por programa/);
      expect(enviar).not.toHaveBeenCalled();
    }
  });

  it("servidor: el error lo dice y el registro lo anota como intento", async () => {
    const { pedir, anotar, llamar } = await conectar({ preguntar: async () => ({ respuesta: "no", inyectados: 3 }) });
    const prop = JSON.parse((await llamar("tarea_borrar", { negocio: "bodega", id: "t1" })).texto);
    const r = await llamar("confirmar", { token: prop.token, resumen: prop.resumen });
    expect(r.isError).toBe(true);
    expect(r.texto).toMatch(/^no_confirmado/);
    expect(r.texto).toMatch(/"inyectados":\s*3/);
    expect(anotar.mock.calls.map(([e]) => e).find((e) => e.herramienta === "tarea_borrar" && "confirmado" in e)).toMatchObject({ confirmado: false, inyectados: 3, intento: "clics_inyectados" });
    expect(escrituras(pedir)).toHaveLength(0);
  });
});

describe("2.ª pasada · 2 · enlaces para compartir", () => {
  it.each([
    "/api/admin/documents/abc123/share",
    "/api/admin/documents/abc123/shares",
    "/api/admin/documents/abc123/share-link",
    "/api/admin/documents/abc123/link",
    "/api/admin/documents/abc123/links",
    "/api/admin/documents/abc123/token",
    "/api/admin/documents/tokens",
    "/api/admin/documents/abc123/public",
    "/api/admin/drive/compartidos",
    "/api/admin/documents/abc123/enlace",
  ])("rechaza %s", (r) => {
    const v = rutaLecturaPermitida(r);
    expect(v.ok).toBe(false);
    expect(v.motivo).toMatch(/compartir|token|prohibida/);
  });
  it("lo de siempre sigue pasando", () => {
    for (const r of ["/api/admin/documents", "/api/admin/documents/abc123", "/api/admin/forestal/ctp", "/api/sales"]) expect(rutaLecturaPermitida(r).ok, r).toBe(true);
  });
});

describe("2.ª pasada · 3 · cambiar QUIÉN es pide OK", () => {
  it("cliente_editar: nombre o documento → propuesta (sin PATCH) con antes → después y fila con los últimos 4 del documento", async () => {
    const { pedir, preguntar, llamar } = await conectar({ pedir: async (_n, p) => (p.metodo === "GET" ? okResp({ name: "Doña Rosa", documento: "45674321", phone: "987654321" }) : okResp()) });
    for (const args of [{ nombre: "Juan Pérez" }, { documento: "70001111" }]) {
      const prop = await llamar("cliente_editar", { negocio: "bodega", telefono: "987654321", ...args });
      const { token, resumen } = JSON.parse(prop.texto);
      expect(token).toMatch(/^[A-Z2-7]{26}$/);
      expect(resumen).toMatch(args.nombre ? /nombre «Doña Rosa» → «Juan Pérez»/ : /documento …4321 → 70001111/);
      await llamar("confirmar", { token, resumen });
      const filas = preguntar.mock.calls.at(-1)[0].ventana.filas;
      expect(filas).toContainEqual({ etiqueta: "DNI/doc. (últimos 4)", valor: "…4321" });
      expect(filas[0]).toEqual({ etiqueta: "Cliente (hoy)", valor: "Doña Rosa" });
    }
    expect(escrituras(pedir)).toHaveLength(0);
    // dirección o correo siguen directos
    await llamar("cliente_editar", { negocio: "bodega", telefono: "987654321", direccion: "Jr. Lima 1" });
    expect(escrituras(pedir)).toHaveLength(1);
  });

  it("proveedor_guardar: editar nombre/RUC/teléfono → propuesta; crear o cambiar solo el correo → directo", async () => {
    const { pedir, preguntar, llamar } = await conectar({ pedir: async (_n, p) => (p.metodo === "GET" ? okResp({ supplier: { name: "Maderera Sur", ruc: "20123456789", phone: "961000222" } }) : okResp({ id: "s9" })) });
    for (const cambio of [{ nombre: "Maderera Norte" }, { ruc: "20999999999" }, { telefono: "900111222" }]) {
      const prop = await llamar("proveedor_guardar", { negocio: "blas", id: "s1", ...cambio });
      const { token, resumen } = JSON.parse(prop.texto);
      expect(token, JSON.stringify(cambio)).toMatch(/^[A-Z2-7]{26}$/);
      expect(resumen).toMatch(/Editar al proveedor Maderera Sur/);
      await llamar("confirmar", { token, resumen });
      expect(preguntar.mock.calls.at(-1)[0].ventana.filas).toContainEqual({ etiqueta: "RUC (últimos 4)", valor: "…6789" });
    }
    expect(escrituras(pedir)).toHaveLength(0);
    await llamar("proveedor_guardar", { negocio: "blas", nombre: "Aserradero Nuevo" });
    await llamar("proveedor_guardar", { negocio: "blas", id: "s1", email: "x@y.pe" });
    expect(escrituras(pedir).map(([, p]) => p.metodo)).toEqual(["POST", "PATCH"]);
  });

  it("filaIdentidad: RUC > DNI/doc > teléfono, solo los últimos 4; sin previa = no verificado", () => {
    expect(filaIdentidad({ ruc: "20123456789", phone: "999" })).toEqual({ etiqueta: "RUC (últimos 4)", valor: "…6789" });
    expect(filaIdentidad({ dni: "45678912" })).toEqual({ etiqueta: "DNI/doc. (últimos 4)", valor: "…8912" });
    expect(filaIdentidad({ customer: { phone: "+51 987 654 321" } })).toEqual({ etiqueta: "Teléfono (últimos 4)", valor: "…4321" });
    expect(filaIdentidad({ beneficiario: { celular: "912345678" } }).valor).toBe("…5678");
    expect(filaIdentidad(undefined)).toEqual({ etiqueta: "DNI/RUC o tel.", valor: NO_VERIFICADO });
    expect(filaIdentidad({}).valor).toMatch(/no mostró/);
  });

  it("las ventanas que nombran a alguien llevan la fila de identidad", () => {
    const persona = { nombre: "Don Lucho", dni: "40001234" };
    const casos = [
      ["adelanto_dar", { beneficiarioId: "b1", monto: 150 }, { nombre: "Don Lucho", persona }],
      ["fiado_cobrar", { telefono: "987654321", monto: 20 }, { name: "Doña Rosa", phone: "987654321" }],
      ["pedido_estado", { id: "o1", estado: "entregado" }, { customerName: "Rosa", customerPhone: "987650000" }],
    ];
    for (const [n, a, previa] of casos) {
      const d = def(n);
      expect(d, n).toBeTruthy();
      const v = sanearVentana(d.ventana(a, previa));
      expect(JSON.stringify(v.filas), n).toMatch(/últimos 4\)","valor":"…\d{4}"/);
    }
  });
});

describe("2.ª pasada · 4 · homoglifos", () => {
  const JUAN_CIRILICO = "Juаn Pеrez"; // а y е cirílicas
  it("esqueleto: NFKC + cirílico/griego → latino + sin tildes", () => {
    expect(esqueleto(JUAN_CIRILICO)).toBe(esqueleto("Juan Pérez"));
    expect(esqueleto("ＪＵＡＮ")).toBe("juan"); // ancho completo
    expect(esqueleto("Μαrίa")).toBe("maria"); // Μ α griegas, ί con tilde
    expect(esqueleto("Rosa")).not.toBe(esqueleto("Rosita"));
  });
  it("claveNombre: un señuelo que es el mismo nombre con letras falsas no entra", () => {
    const c = claveNombre("Juan Pérez", [JUAN_CIRILICO, "Juan Perez", "Rosa Díaz", "Pedro Ruiz"], { aleatorio: () => 0 });
    expect(c.senuelos).toHaveLength(2);
    for (const s of c.senuelos) expect(esqueleto(s)).not.toBe(esqueleto("Juan Pérez"));
  });
  it("letras raras: marca en filas, etiqueta y verificado(); nunca en los botones; idempotente y ≤60", () => {
    expect(letrasRaras(JUAN_CIRILICO)).toBe(true);
    expect(letrasRaras("José Ñuñez Müller-O'Brien 123")).toBe(false);
    expect(conMarca(JUAN_CIRILICO)).toBe(`${JUAN_CIRILICO} ${MARCA_RARAS}`);
    expect(conMarca(conMarca(JUAN_CIRILICO))).toBe(conMarca(JUAN_CIRILICO));
    expect([...conMarca("а".repeat(80))].length).toBeLessThanOrEqual(60);
    expect(conMarca("Juan Pérez")).toBe("Juan Pérez");
    expect(verificado(JUAN_CIRILICO)).toContain(MARCA_RARAS);
    const clave = claveNombre(JUAN_CIRILICO, ["Rosa Díaz", "Pedro Ruiz"], { aleatorio: () => 0 });
    const v = sanearVentana({ clave, filas: [{ etiqueta: "A quién", valor: JUAN_CIRILICO }] });
    expect(v.filas[0].valor).toContain(MARCA_RARAS);
    const { datos } = armarDatos({ negocio: "bodega", resumen: "r", ventana: v, segundos: 60, aleatorio: () => 0 });
    expect(datos.valor).toContain(MARCA_RARAS);
    expect(datos.botones).toContain(JUAN_CIRILICO);
    expect(datos.botones.join("|")).not.toContain(MARCA_RARAS);
    expect(armarBotones(clave, () => 0).textos.join("|")).not.toContain(MARCA_RARAS);
  });
});

describe("2.ª pasada · 5 · CTP, fila y tope", () => {
  it("ctp_registrar: el dato clave es el volumen (PT primero, después m³)", () => {
    const v = (a) => def("ctp_registrar").ventana(a).clave;
    expect(v({ cantidad: 1200, unidad: "pt" })).toMatchObject({ etiqueta: "Volumen (PT)", valor: "1.200 PT" });
    expect(v({ cantidad: 3.5, unidad: "m3" })).toMatchObject({ etiqueta: "Volumen (m³)", valor: "3,50 m³" });
    expect(v({ volumenM3: 2.25, cantidad: 40, unidad: "unidad" })).toMatchObject({ etiqueta: "Volumen (m³)" });
    expect(v({ piezas: 40 })).toMatchObject({ etiqueta: "Piezas" });
  });

  it("ctp_anular: lee el asiento por id y pone su volumen en los botones; sin asiento, código y aviso", async () => {
    const d = def("ctp_anular");
    const entry = { quantity: "1500.00", unit: "pt", volumeInputM3: null, pieces: "30", section: "S2", speciesCommon: "Shihuahuaco", entryDate: "2026-10-20T00:00:00.000Z" };
    const leer = vi.fn(async () => okResp({ entry }));
    const previa = await d.previa({ id: "e1", motivo: "x" }, leer);
    expect(leer.mock.calls[0][0]).toMatchObject({ metodo: "GET", ruta: "/api/admin/forestal/ctp", query: { entryId: "e1" } });
    const v = sanearVentana(d.ventana({ id: "e1" }, previa));
    expect(v.clave).toMatchObject({ etiqueta: "Volumen (PT)", valor: "1.500 PT" });
    expect(v.filas.map((f) => f.valor)).toEqual(["S2", "Shihuahuaco", "2026-10-20"]);
    expect(d.resumen({ id: "e1", motivo: "x" }, previa)).toMatch(/S2 · Shihuahuaco · 1\.500,00 PT/);
    expect(d.resumen({ id: "e1", motivo: "x" }, null)).toMatch(/no se pudo leer el asiento/);
    expect(sanearVentana(d.ventana({ id: "e1" }, null)).clave.etiqueta).toBe("Código de esta operación");
  });

  it(`máximo ${MAX_VIVAS} propuestas vivas: la 6.ª da «limite»; confirmar, cancelar o vencer libera lugar`, async () => {
    vi.useFakeTimers();
    expect(MAX_VIVAS).toBe(5);
    const c = crearConfirmador({ preguntar: async () => "no", enviar: async () => okResp(), seco: false });
    const ps = Array.from({ length: 5 }, (_, i) => c.proponer({ negocio: "bodega", herramienta: "tarea_borrar", pedidos: pedidoX(i), resumen: `${RESUMEN} ${i}` }));
    let e;
    try { c.proponer({ negocio: "bodega", herramienta: "tarea_borrar", pedidos: pedidoX(9), resumen: RESUMEN }); } catch (x) { e = x; }
    expect(e?.codigo).toBe("limite");
    expect(e.message).toMatch(/5 propuestas/);
    await c.confirmar({ token: ps[0].token, resumen: `${RESUMEN} 0` });
    expect(() => c.proponer({ negocio: "bodega", herramienta: "tarea_borrar", pedidos: pedidoX(9), resumen: RESUMEN })).not.toThrow();
    vi.advanceTimersByTime(VIGENCIA_MS + 1);
    for (let i = 0; i < 5; i++) c.proponer({ negocio: "bodega", herramienta: "tarea_borrar", pedidos: pedidoX(i), resumen: `${RESUMEN} ${i}` });
  });

  it("servidor: la 6.ª propuesta devuelve error «limite» y no abre nada", async () => {
    const { preguntar, llamar } = await conectar();
    for (let i = 1; i <= 5; i++) expect((await llamar("tarea_borrar", { negocio: "bodega", id: `t${i}` })).isError).toBeFalsy();
    const r = await llamar("tarea_borrar", { negocio: "bodega", id: "t6" });
    expect(r.isError).toBe(true);
    expect(r.texto).toMatch(/^limite/);
    expect(preguntar).not.toHaveBeenCalled();
  });

  it("la fila espera a que la ventana vencida CIERRE (proceso muerto) antes de abrir la siguiente; tope 8 s", async () => {
    vi.useFakeTimers();
    const abiertas = [];
    let cierraEn = 3_000;
    const preguntar = vi.fn(({ signal }) => new Promise((res) => {
      abiertas.push(Date.now());
      const ms = cierraEn;
      signal.addEventListener("abort", () => { if (ms !== Infinity) setTimeout(() => res("no"), ms); }, { once: true });
    }));
    const c = crearConfirmador({ preguntar, enviar: async () => okResp(), seco: false });
    const prop = (i) => c.proponer({ negocio: "bodega", herramienta: "tarea_borrar", pedidos: pedidoX(i), resumen: `${RESUMEN} ${i}` });
    const [p1, p2] = [prop(1), prop(2)];
    const r1 = c.confirmar({ token: p1.token, resumen: `${RESUMEN} 1` });
    c.confirmar({ token: p2.token, resumen: `${RESUMEN} 2` });
    await vi.advanceTimersByTimeAsync(VENTANA_MS + HOLGURA_VENTANA_MS);
    expect((await r1).error.codigo).toBe("sin_respuesta");
    expect(preguntar).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_900);
    expect(preguntar).toHaveBeenCalledTimes(1); // la 1.ª sigue cerrándose
    await vi.advanceTimersByTimeAsync(200);
    expect(preguntar).toHaveBeenCalledTimes(2);
    // si nunca cierra, la fila sigue igual a los ESPERA_CIERRE_MS
    cierraEn = Infinity;
    const p3 = prop(3);
    c.confirmar({ token: p3.token, resumen: `${RESUMEN} 3` });
    await vi.advanceTimersByTimeAsync(VENTANA_MS + HOLGURA_VENTANA_MS); // vence la 2.ª (que cierra en 3 s)
    await vi.advanceTimersByTimeAsync(3_100);
    expect(preguntar).toHaveBeenCalledTimes(3);
    const p4 = prop(4);
    c.confirmar({ token: p4.token, resumen: `${RESUMEN} 4` });
    await vi.advanceTimersByTimeAsync(VENTANA_MS + HOLGURA_VENTANA_MS + ESPERA_CIERRE_MS - 300);
    expect(preguntar).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(400);
    expect(preguntar).toHaveBeenCalledTimes(4);
  });
});
