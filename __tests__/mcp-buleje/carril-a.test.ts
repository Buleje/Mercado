// @vitest-environment node
// @ts-nocheck — importa .mjs del MCP (sin tipos); el contrato vive en JSDoc (tools/mcp-buleje/src/tipos.mjs).
// Carril A (forestal libros, 29-10): loth, ingresos, lotes y lo nuevo de ctp. Cada `confirmar` nuevo: no escribe antes de
// `confirmar`, su resumen trae el nombre del panel y la clave de la ventana sale del panel (o de la cantidad NUEVA que se
// manda, atada al pedido). Cada pedido() arma su ruta y su cuerpo.
import { describe, it, expect, vi } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { rutaLecturaPermitida } from "../../tools/mcp-buleje/src/lista-blanca.mjs";
import { crearServidor, cargarHerramientas } from "../../tools/mcp-buleje/servidor.mjs";
import { Client } from "../../tools/mcp-buleje/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { InMemoryTransport } from "../../tools/mcp-buleje/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js";

const okResp = (datos = {}) => ({ ok: true, status: 200, ms: 5, datos });
const config = { base: "http://localhost:3000", porDefecto: "qa-forestal", seco: false, negocios: { "qa-forestal": { slug: "qa-forestal", rubro: "forestal" }, bodega: { slug: "main" } } };
const { defs: CATALOGO } = await cargarHerramientas();
const def = (n) => CATALOGO.find((d) => d.nombre === n);
const MIOS = CATALOGO.filter((d) => ["loth", "ingresos", "lotes"].includes(d.grupo) || ["ctp_marcar_usado", "ctp_declarar_produccion", "ctp_corregir_linea"].includes(d.nombre));
const F = "/api/admin/forestal";
/** Opciones de un enum, aunque venga envuelto en .default(). */
const opciones = (s) => s?.options ?? s?.unwrap?.()?.options ?? s?._zod?.def?.innerType?.options;

// Lo que «tiene el panel» (nombres que el modelo nunca escribió).
const LINEA = { id: "l1", section: "tala", lineNo: 906, treeCode: "ARB-REAL-7", speciesCommon: "Shihuahuaco", volumeM3: "5.63", entryDate: "2026-10-20", status: "registrado" };
const INGRESO = { id: "w1", libroNro: 14, gtfNumber: "001-REAL", providerName: "MADERERA REAL SAC", speciesCommonName: "Cedro", volumeM3: "12.5", pieces: 20, status: "pendiente" };
const HISTORIA = { lote: { id: "L1", code: "L-REAL-31", speciesCommon: "Shihuahuaco", status: "abierto" }, armado: { trozas: [{ id: "t1", codificacion: "T-01", volumenM3: "1.5", consumidaEnId: null }, { id: "t2", codificacion: "T-02", volumenM3: "2.25", consumidaEnId: null }] } };
const PATIO = { trozas: [{ id: "t9", codificacion: "P-09", volumenM3: 3.1 }], total: 1 };
const CORRIDA = { id: "c1", section: "produccion", lineNo: 12, speciesCommon: "Shihuahuaco", productType: "tablas", quantity: "850", unit: "pt", volumeInputM3: "3.2", status: "registrado", duenoMadera: "tercero" };
const PLAN = { plan: { id: "p1", tituloHabilitante: "TH-REAL-0042", titularName: "COMUNIDAD REAL" } };

/** GET según ruta + query, como el panel. */
function panel(p) {
  const q = p.query ?? {};
  if (p.ruta === `${F}/loth`) return q.trace ? { trace: { code: q.trace, chain: [] } } : { entries: [LINEA], total: 1 };
  if (p.ruta === `${F}/plan`) return PLAN;
  if (p.ruta === `${F}/wood-entries/w1`) return { entry: INGRESO };
  if (p.ruta === `${F}/lotes-aserrio` && q.historia === "L1") return { historia: HISTORIA };
  if (p.ruta === `${F}/trozas/patio`) return PATIO;
  if (p.ruta === `${F}/trozas` && q.woodEntryId === "w1") return { trozas: [{ id: "p1", volumenM3: "6", retrozos: [] }, { id: "p2", volumenM3: "4.5", retrozos: [{ id: "p2a", volumenM3: "2.25" }] }] };
  if (p.ruta === `${F}/ctp` && q.entryId === "c1") return { entry: CORRIDA };
  return undefined;
}
async function conectar() {
  const pedir = vi.fn(async (_n, p) => {
    if (p.metodo !== "GET") return okResp({ id: "nuevo" });
    const d = panel(p);
    return d === undefined ? { ok: false, status: 404, ms: 5, error: { codigo: "no_existe", mensaje: "404" } } : okResp(d);
  });
  const preguntar = vi.fn(async () => "no");
  const { servidor } = crearServidor({ herramientas: CATALOGO, pedir, preguntar, config, seco: false, rutaLecturaPermitida, anotar: vi.fn() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const cliente = new Client({ name: "test", version: "1" });
  await Promise.all([servidor.connect(a), cliente.connect(b)]);
  const llamar = async (name, args = {}) => { const r = await cliente.callTool({ name, arguments: args }); return { ...r, texto: r.content.map((c) => c.text).join("\n") }; };
  return { pedir, preguntar, llamar };
}
const escrituras = (pedir) => pedir.mock.calls.filter(([, p]) => p.metodo !== "GET");

describe("carril A · confirmar: propone sin escribir, resumen con el nombre del panel y clave del panel", () => {
  const casos = [
    { n: "loth_linea_anotar", args: { seccion: "tala", arbol: "85", especie: "Shihuahuaco", volumenM3: 4.2, planId: "p1" }, nombre: /TH-REAL-0042/, clave: /4,2/, metodo: "POST", ruta: `${F}/loth`, cuerpo: { section: "tala", treeCode: "85", volumeM3: 4.2, planId: "p1" } },
    { n: "loth_linea_anular", args: { id: "l1", codigo: "ARB-REAL-7", motivo: "medida mal tipeada" }, nombre: /ARB-REAL-7/, clave: /5,63/, metodo: "PATCH", ruta: `${F}/loth/l1`, cuerpo: { action: "annul", reason: "medida mal tipeada" } },
    { n: "loth_linea_borrar", args: { id: "l1", codigo: "ARB-REAL-7" }, nombre: /ARB-REAL-7/, clave: /5,63/, metodo: "DELETE", ruta: `${F}/loth/l1` },
    { n: "ingreso_trozas_cargar", args: { id: "w1", trozas: [{ codigo: "T-01", volumenM3: 1.19 }, { codigo: "T-02", volumenM3: 0.81 }] }, nombre: /MADERERA REAL SAC/, clave: /^2 m³$/, metodo: "PATCH", ruta: `${F}/wood-entries/w1` },
    { n: "ingreso_validar", args: { id: "w1" }, nombre: /MADERERA REAL SAC/, clave: /12,5/, metodo: "PATCH", ruta: `${F}/wood-entries/w1`, cuerpo: { action: "validate" } },
    { n: "ingreso_recepcionar", args: { id: "w1", fecha: "2026-10-29" }, nombre: /MADERERA REAL SAC/, clave: /12,5/, metodo: "PATCH", ruta: `${F}/wood-entries/w1`, cuerpo: { action: "recepcionar", fecha: "2026-10-29" } },
    { n: "ingreso_rechazar", args: { id: "w1", motivo: "otra especie" }, nombre: /MADERERA REAL SAC/, clave: /12,5/, metodo: "PATCH", ruta: `${F}/wood-entries/w1`, cuerpo: { action: "reject", reason: "otra especie" } },
    { n: "ingreso_anular", args: { id: "w1", motivo: "guía duplicada" }, nombre: /MADERERA REAL SAC/, clave: /12,5/, metodo: "PATCH", ruta: `${F}/wood-entries/w1`, cuerpo: { action: "annul", reason: "guía duplicada" } },
    { n: "ingreso_borrar", args: { id: "w1" }, nombre: /MADERERA REAL SAC/, clave: /12,5/, metodo: "PATCH", ruta: `${F}/wood-entries/w1`, cuerpo: { action: "delete" } },
    { n: "ingreso_costo", args: { id: "w1", costoTotal: 4500 }, nombre: /MADERERA REAL SAC/, clave: /4\.500/, metodo: "PATCH", ruta: `${F}/wood-entries/w1`, cuerpo: { action: "set_costo", costoTotal: 4500 } },
    { n: "ingreso_cuadrar", args: { id: "w1", lado: "lista", motivo: "guía mal sumada" }, nombre: /MADERERA REAL SAC.*12,750 m³ \(suma de 3 pieza.*1 pedazo/, clave: /^12,75 m³$/, metodo: "PATCH", ruta: `${F}/wood-entries/w1`, cuerpo: { action: "cuadrar", lado: "lista" } },
    { n: "lote_trozas_agregar", args: { loteId: "L1", trozaIds: ["t9", "tX"] }, nombre: /L-REAL-31.*|P-09/, clave: /3,1/, metodo: "PATCH", ruta: `${F}/lotes-aserrio`, cuerpo: { accion: "agregar", loteId: "L1", trozaIds: ["t9", "tX"] } },
    { n: "lote_consumir", args: { loteId: "L1" }, nombre: /L-REAL-31/, clave: /3,75/, metodo: "PATCH", ruta: `${F}/lotes-aserrio`, cuerpo: { accion: "consumir", loteId: "L1" } },
    { n: "lote_jornada_registrar", args: { loteId: "L1", trozaIds: ["t1"], produccionM3: 0.6, piezas: 48 }, nombre: /L-REAL-31.*rendimiento 40,0 %/, clave: /1,5/, metodo: "PATCH", ruta: `${F}/lotes-aserrio`, cuerpo: { accion: "registrar-jornada", loteId: "L1", trozaIds: ["t1"], produccion: { quantity: 0.6, unit: "m3", pieces: 48 } } },
    { n: "lote_troza_quitar", args: { loteId: "L1", trozaId: "t2" }, nombre: /T-02/, clave: /2,25/, metodo: "PATCH", ruta: `${F}/lotes-aserrio`, cuerpo: { accion: "quitar", loteId: "L1", trozaId: "t2" } },
    { n: "lote_cerrar", args: { loteId: "L1", motivo: "lote terminado" }, nombre: /L-REAL-31/, clave: /3,75/, metodo: "PATCH", ruta: `${F}/lotes-aserrio`, cuerpo: { accion: "cerrar", motivo: "lote terminado" } },
    { n: "lote_reabrir", args: { loteId: "L1" }, nombre: /L-REAL-31/, clave: /3,75/, metodo: "PATCH", ruta: `${F}/lotes-aserrio`, cuerpo: { accion: "reabrir" } },
    { n: "lote_borrar", args: { loteId: "L1" }, nombre: /L-REAL-31/, clave: /3,75/, metodo: "DELETE", ruta: `${F}/lotes-aserrio`, query: { id: "L1" } },
    { n: "ctp_marcar_usado", args: { id: "c1", usado: true, motivo: "se usó en la casa" }, nombre: /N\.º 12.*Shihuahuaco/, clave: /850 PT/, metodo: "PATCH", ruta: `${F}/ctp`, cuerpo: { id: "c1", action: "marcar_usado", usado: true } },
    { n: "ctp_declarar_produccion", args: { id: "c1", cantidad: 900, unidad: "pt", piezas: 48 }, nombre: /N\.º 12.*tercero.*recalcula/, clave: /900 PT/, metodo: "PATCH", ruta: `${F}/ctp`, cuerpo: { id: "c1", action: "declarar_produccion", quantity: 900, unit: "pt" } },
  ];
  it.each(casos)("$n: sin escribir; ventana con clave del panel; pedido $metodo $ruta", async ({ n, args, nombre, clave, metodo, ruta, cuerpo, query }) => {
    const d = def(n);
    expect(d.tipo).toBe("confirmar");
    expect(d.soloEn).toEqual(["forestal"]);
    const { pedir, preguntar, llamar } = await conectar();
    const r = await llamar(n, { negocio: "qa-forestal", ...args });
    expect(r.isError, r.texto).toBeFalsy();
    const prop = JSON.parse(r.texto.split("\n\nDatos del panel")[0]);
    expect(prop.token).toBeTruthy();
    expect(prop.resumen).toMatch(nombre);
    expect(prop.resumen).not.toMatch(/NO PUDE VERIFICAR|undefined|NaN|\[object/);
    expect(escrituras(pedir)).toHaveLength(0);
    // las previas leen la lista entera (sin recorte) para encontrar el registro
    for (const [, p] of pedir.mock.calls) expect(p.metodo).toBe("GET");
    // al confirmar (Brandon dice «no»): la ventana recibe la clave del panel y no sale ninguna escritura
    await llamar("confirmar", { token: prop.token, resumen: prop.resumen });
    const v = preguntar.mock.calls.at(-1)[0].ventana;
    expect(v.clave?.valor, JSON.stringify(v)).toMatch(clave);
    expect(escrituras(pedir)).toHaveLength(0);
    // el pedido que se enviará
    const previa = await d.previa({ ...args }, async (p) => { const x = panel(p); return x === undefined ? { ok: false } : okResp(x); });
    const p = d.pedido({ ...args }, previa);
    expect(p.metodo).toBe(metodo);
    expect(p.ruta).toBe(ruta);
    if (cuerpo) expect(p.cuerpo).toMatchObject(cuerpo);
    if (query) expect(p.query).toEqual(query);
  });

  it("sin previa (id que el panel no tiene): el resumen dice NO PUDE VERIFICAR y la clave no se inventa", () => {
    for (const n of ["loth_linea_anular", "loth_linea_borrar", "ingreso_validar", "ingreso_anular", "lote_consumir", "lote_borrar", "lote_troza_quitar", "ctp_marcar_usado"]) {
      const d = def(n);
      const a = { id: "zz", codigo: "X", motivo: "algo", loteId: "zz", trozaId: "zz", usado: false };
      expect(d.resumen(a, null), n).toMatch(/NO PUDE VERIFICAR/);
      expect(d.ventana(a, null).clave, n).toBeNull();
    }
  });

  it("lote_trozas_agregar: la clave suma solo las trozas libres del patio (no lo que pidió el modelo) y avisa las que faltan", () => {
    const d = def("lote_trozas_agregar");
    const previa = { lote: HISTORIA, hay: [PATIO.trozas[0]], faltan: 1 };
    expect(d.ventana({ loteId: "L1", trozaIds: ["t9", "tX"] }, previa).clave.valor).toBe("3,10 m³");
    expect(d.resumen({ loteId: "L1", trozaIds: ["t9", "tX"] }, previa)).toMatch(/1 de las pedidas no están libres/);
  });

  it("ingreso_costo en dólares: la clave va en US$; costo null usa el volumen del panel", () => {
    const d = def("ingreso_costo");
    expect(d.ventana({ id: "w1", costoTotal: 1200, moneda: "USD" }, INGRESO).clave.valor).toMatch(/US\$/);
    expect(d.ventana({ id: "w1", costoTotal: null }, INGRESO).clave.valor).toMatch(/12,50 m³/);
  });

  it("ctp_marcar_usado: sin motivo el pedido se arma igual pero el resumen avisa que el panel lo rechaza", () => {
    expect(() => def("ctp_marcar_usado").pedido({ id: "c1", usado: true })).not.toThrow();
    expect(def("ctp_marcar_usado").resumen({ id: "c1", usado: true }, CORRIDA)).toMatch(/OJO: sin motivo/);
    expect(def("ctp_marcar_usado").resumen({ id: "c1", usado: true, motivo: "venta 12" }, CORRIDA)).not.toMatch(/OJO/);
    expect(def("ctp_marcar_usado").pedido({ id: "c1", usado: false }).cuerpo).toEqual({ id: "c1", action: "marcar_usado", usado: false });
  });
});

describe("carril A · escrituras con OK solo cuando mueven madera o identidad", () => {
  it("ingreso_editar: notas directo; volumen/proveedor/especie piden OK con el volumen del panel", () => {
    const d = def("ingreso_editar");
    expect(d.confirmarSi({ id: "w1", notas: "lluvia" })).toBe(false);
    for (const k of [{ volumenM3: 13 }, { proveedor: "OTRO" }, { especie: "Tornillo" }, { piezas: 21 }]) expect(d.confirmarSi({ id: "w1", ...k })).toBe(true);
    expect(d.ventana({ id: "w1", volumenM3: 13 }, INGRESO).clave.valor).toBe("13 m³");
    expect(d.resumen({ id: "w1", volumenM3: 13 }, INGRESO)).toMatch(/volumen 12,500 m³ → 13,000 m³/);
    expect(d.pedido({ id: "w1", notas: "lluvia" })).toEqual({ metodo: "PATCH", ruta: `${F}/wood-entries/w1`, cuerpo: { action: "update", fields: { notes: "lluvia" } } });
    expect(d.pedido({ id: "w1" }).cuerpo).toEqual({ action: "update", fields: {} });
  });
  it("lote_crear: abierto directo (POST modo=abierto); inventario pide OK con el m³ consumido", () => {
    const d = def("lote_crear");
    expect(d.confirmarSi({ modo: "abierto", especie: "Cedro" })).toBe(false);
    expect(d.confirmarSi({ modo: "inventario", especie: "Cedro", volumenConsumidoM3: 3 })).toBe(true);
    expect(d.pedido({ modo: "abierto", especie: "Cedro", codigo: "L-1" })).toEqual({ metodo: "POST", ruta: `${F}/lotes-aserrio`, cuerpo: { modo: "abierto", code: "L-1", speciesCommon: "Cedro" } });
    const p = d.pedido({ modo: "inventario", especie: "Cedro", volumenConsumidoM3: 3, paquetes: [{ codigo: "P1", cantidad: 10, volumenM3: 1.2 }] });
    expect(p.cuerpo).toMatchObject({ modo: "inventario", volumenConsumidoM3: 3, paquetes: [{ codigo: "P1", cantidad: 10, volumenM3: 1.2 }] });
    expect(d.ventana({ modo: "inventario", especie: "Cedro", volumenConsumidoM3: 3 }).clave.valor).toBe("3 m³");
  });
  it("lote_editar → PATCH accion=editar; ctp_corregir_linea manda los decimales como texto y pide OK si toca cantidad", () => {
    expect(def("lote_editar").pedido({ loteId: "L1", notas: "x" })).toEqual({ metodo: "PATCH", ruta: `${F}/lotes-aserrio`, cuerpo: { accion: "editar", loteId: "L1", notes: "x" } });
    const c = def("ctp_corregir_linea");
    expect(c.confirmarSi({ id: "c1", observaciones: "x" })).toBe(false);
    expect(c.confirmarSi({ id: "c1", cantidad: 900 })).toBe(true);
    expect(c.pedido({ id: "c1", cantidad: 900.12345, volumenEntradaM3: 3.2 }).cuerpo).toEqual({ id: "c1", action: "corregir_linea", campos: { quantity: "900.1235", volumeInputM3: "3.2" } });
    expect(c.ventana({ id: "c1", cantidad: 900 }, CORRIDA).clave.valor).toBe("900 PT");
  });
  it("ingreso_trozas_cargar manda TODAS las claves de cada pieza (null si falta), como exige el panel", () => {
    const p = def("ingreso_trozas_cargar").pedido({ id: "w1", trozas: [{ codigo: "T-01", volumenM3: 1 }] });
    expect(p.cuerpo.trozas[0]).toEqual({ codificacion: "T-01", especieComun: null, especieCientifica: null, dimensiones: null, largoM: null, diametroCm: null, d1Cm: null, d2Cm: null, cantidad: null, volumenM3: 1 });
  });
});

describe("carril A · lecturas", () => {
  it.each([
    ["loth_ver", {}, `${F}/loth`, { limit: 10 }],
    ["loth_ver", { vista: "resumen", planId: "p1", soloDelPermiso: true }, `${F}/loth`, { stats: "1", planId: "p1", solo: "1" }],
    ["loth_ver", { vista: "traza", codigo: "85-A" }, `${F}/loth`, { trace: "85-A" }],
    ["loth_ver", { vista: "disponibles", seccion: "trozado" }, `${F}/loth`, { available: "trozado" }],
    ["loth_ver", { vista: "lista", seccion: "tala", buscar: "85", conAnuladas: true, limite: 5, offset: 10 }, `${F}/loth`, { section: "tala", search: "85", includeAnnulled: "1", limit: 5, offset: 10 }],
    ["lotes_ver", {}, `${F}/lotes-aserrio`, { limite: 5 }],
    ["lotes_ver", { estado: "abierto", especie: "Cedro", limite: 20 }, `${F}/lotes-aserrio`, { status: "abierto", especie: "Cedro", limite: 20 }],
    ["lotes_ver", { vista: "historia", loteId: "L1" }, `${F}/lotes-aserrio`, { historia: "L1" }],
    ["lotes_ver", { vista: "patio" }, `${F}/trozas/patio`, {}],
    ["ingreso_ver", { id: "w1" }, `${F}/wood-entries/w1`, undefined],
  ])("%s %j → GET %s", (n, args, ruta, query) => {
    const p = def(n).pedido(args);
    expect(p.metodo).toBe("GET");
    expect(p.ruta).toBe(ruta);
    if (query) expect(p.query ?? {}).toEqual(query);
  });
  it("ingreso_ver piezas=true lee también las trozas del ingreso", () => {
    expect(def("ingreso_ver").pedido({ id: "w1", piezas: true })).toEqual([{ metodo: "GET", ruta: `${F}/wood-entries/w1` }, { metodo: "GET", ruta: `${F}/trozas`, query: { woodEntryId: "w1" } }]);
  });
  it("traza/historia sin código caen a la lista y lo avisan (pedido nunca tira); la vista «lotes» vieja ya no existe", () => {
    expect(def("loth_ver").pedido({ vista: "traza" }).query).toEqual({ limit: 10 });
    expect(def("loth_ver").formatear({ entries: [] }, { vista: "traza" })).toMatch(/^Para la traza pasá codigo/);
    expect(def("lotes_ver").pedido({ vista: "historia" }).query).toEqual({ limite: 5 });
    expect(def("lotes_ver").formatear({ lotes: [] }, { vista: "historia" })).toMatch(/^Para la historia pasá loteId/);
    expect(opciones(def("lotes_ver").entrada.vista)).toEqual(["aserrio", "historia", "patio"]);
    expect(CATALOGO.filter((d) => d.nombre === "lotes_ver")).toHaveLength(1);
    expect(def("lotes_ver").grupo).toBe("lotes");
  });
  it("lotes_ver con la respuesta recortada a 20 KB lo dice y muestra los códigos que alcanzó", () => {
    const t = def("lotes_ver").formatear({ _recortadoA: "20000 caracteres", texto: '{"lotes":[{"id":"a","code":"L-7"},{"id":"b","code":"L-8"' }, {});
    expect(t).toMatch(/20 KB/);
    expect(t).toMatch(/L-7, L-8/);
  });
});

describe("carril A · contrato del catálogo para los grupos nuevos", () => {
  const API = join(process.cwd(), "app", "api");
  /** ¿existe la ruta bajo app/api (aceptando segmentos dinámicos)? */
  function existe(ruta) {
    const partes = ruta.replace(/^\/api\//, "").split("/");
    let dir = API;
    for (const p of partes) {
      if (existsSync(join(dir, p))) { dir = join(dir, p); continue; }
      const din = readdirSync(dir).find((f) => /^\[.+\]$/.test(f));
      if (!din) return false;
      dir = join(dir, din);
    }
    return existsSync(join(dir, "route.ts"));
  }
  const ejemplo = { id: "w1", loteId: "L1", trozaId: "t1", codigo: "X", motivo: "algo", seccion: "tala", usado: false, trozaIds: ["t1"], produccionM3: 1, cantidad: 1, unidad: "pt", costoTotal: 1, lado: "lista", trozas: [{ volumenM3: 1 }], especie: "Cedro", notas: "x", modo: "abierto" };
  it.each(MIOS.map((d) => [d.nombre, d]))("%s: forestal, campos con describe, ejemplo en la descripción, ruta real y resumen limpio", (_n, d) => {
    expect(d.soloEn).toEqual(["forestal"]);
    expect(d.descripcion).toMatch(/Ej\.: /);
    for (const [k, s] of Object.entries(d.entrada)) expect(s.description, `${d.nombre}.${k} sin describe`).toBeTruthy();
    const vistas = opciones(d.entrada.vista) ?? [undefined];
    for (const vista of vistas) {
      let ps;
      try { ps = [d.pedido({ ...ejemplo, vista, codigo: "X" }, null)].flat(); } catch { continue; }
      for (const p of ps) {
        expect(existe(p.ruta), `${d.nombre} ${p.ruta}`).toBe(true);
        expect(p.ruta).toMatch(/^\/api\/[A-Za-z0-9_\-./]+$/);
        if (d.tipo === "lectura") expect(p.metodo).toBe("GET");
      }
    }
    if (d.tipo === "confirmar" || d.confirmarSi) {
      const r = d.resumen({ ...ejemplo }, null);
      expect(r.length).toBeGreaterThan(15);
      expect(r).not.toMatch(/undefined|NaN|\[object/);
    }
    // pedido() es pura: mismo resultado dos veces
    try { expect(JSON.stringify(d.pedido({ ...ejemplo }, null))).toBe(JSON.stringify(d.pedido({ ...ejemplo }, null))); } catch { /* pide un campo que el ejemplo no trae */ }
    // la entrada arma un objeto Zod válido
    expect(z.object(d.entrada).safeParse({}).success !== undefined).toBe(true);
  });
});

describe("carril A · 2.ª ronda de revisores (29-10)", () => {
  it("1 · cambiar el permiso al que se atribuye la madera pide OK y la ventana muestra antes (panel) → después", () => {
    expect(def("ctp_corregir_linea").confirmarSi({ id: "c1", origen: "TH-NUEVO" })).toBe(true);
    for (const k of ["permiso", "serieGuia", "tipoDoc", "especieCientifica", "registroSerfor", "tipoOrigen"]) expect(def("ingreso_editar").confirmarSi({ id: "w1", [k]: "GTF" }), k).toBe(true);
    expect(def("lote_editar").confirmarSi({ loteId: "L1", permiso: "P-2" })).toBe(true);
    expect(def("lote_editar").confirmarSi({ loteId: "L1", contratoId: "k2" })).toBe(true);
    expect(def("lote_editar").confirmarSi({ loteId: "L1", notas: "x" })).toBe(false);
    const filas = (v) => v.filas.map((f) => f.valor).join(" | ");
    expect(filas(def("ingreso_editar").ventana({ id: "w1", permiso: "TH-NUEVO" }, { ...INGRESO, originCode: "TH-VIEJO" }))).toMatch(/TH-VIEJO → TH-NUEVO/);
    expect(filas(def("ctp_corregir_linea").ventana({ id: "c1", origen: "TH-NUEVO" }, { ...CORRIDA, originCode: "TH-VIEJO" }))).toMatch(/TH-VIEJO → TH-NUEVO/);
    const h = { ...HISTORIA, lote: { ...HISTORIA.lote, permiso: "P-VIEJO" } };
    const v = def("lote_editar").ventana({ loteId: "L1", permiso: "P-NUEVO" }, h);
    expect(filas(v)).toMatch(/P-VIEJO → P-NUEVO/);
    expect(v.clave.valor).toBe("3,75 m³");
    expect(def("lote_editar").resumen({ loteId: "L1", permiso: "P-NUEVO" }, h)).toMatch(/L-REAL-31.*permiso P-VIEJO → P-NUEVO/);
  });
  it("2 · ctp_corregir_linea: la clave es la cantidad NUEVA, la de antes va en una fila y avisa el recálculo del aserrío del tercero", () => {
    const c = def("ctp_corregir_linea");
    const v = c.ventana({ id: "c1", cantidad: 900 }, CORRIDA);
    expect(v.clave.valor).toBe("900 PT");
    expect(v.filas[0]).toMatchObject({ etiqueta: "Antes (panel)" });
    expect(v.filas[0].valor).toMatch(/^850 pt/);
    expect(c.ventana({ id: "c1", volumenEntradaM3: 4 }, CORRIDA).clave.valor).toBe("4 m³");
    expect(c.resumen({ id: "c1", cantidad: 900 }, CORRIDA)).toMatch(/OJO: la madera es de un tercero.*cobro de aserrío se recalcula/);
    expect(c.resumen({ id: "c1", observaciones: "x" }, CORRIDA)).not.toMatch(/recalcula/);
    expect(c.resumen({ id: "c1", cantidad: 900 }, { ...CORRIDA, duenoMadera: "propia" })).not.toMatch(/recalcula/);
  });
  it("3 · ingreso_cuadrar (lista) e ingreso_editar: la clave es el volumen que va a QUEDAR", () => {
    const d = def("ingreso_cuadrar");
    const previa = { ...INGRESO, _suma: 12.75, _filas: 3, _retrozos: 1 };
    expect(d.ventana({ id: "w1", lado: "lista", motivo: "x" }, previa).clave.valor).toBe("12,75 m³");
    expect(d.ventana({ id: "w1", lado: "lista", motivo: "x" }, previa).filas.at(-1).valor).toMatch(/12,500 m³ → 12,750 m³/);
    expect(d.ventana({ id: "w1", lado: "lista", motivo: "x" }, { ...INGRESO, _suma: null }).clave).toBeNull();
    expect(d.resumen({ id: "w1", lado: "lista", motivo: "x" }, { ...INGRESO, _suma: 0, _filas: 2, _retrozos: 0 })).toMatch(/no declaran volumen/);
    const e = def("ingreso_editar");
    expect(e.ventana({ id: "w1", volumenM3: 13 }, INGRESO).clave.valor).toBe("13 m³");
    expect(e.ventana({ id: "w1", permiso: "TH-1" }, INGRESO).clave.valor).toBe("12,50 m³");
  });
  it("4 · ingreso_costo con null («quitar costo») manda el null; sin costo nuevo no inventa la clave", () => {
    expect(def("ingreso_costo").pedido({ id: "w1", costoTotal: null }).cuerpo).toEqual({ action: "set_costo", costoTotal: null });
    expect(def("ingreso_costo").pedido({ id: "w1", costoTotal: 10, moneda: "USD" }).cuerpo).toEqual({ action: "set_costo", costoTotal: 10, moneda: "USD" });
  });
  it("5 · lote_consumir con trozaIds no cuenta en la clave las trozas ya consumidas", () => {
    const [t1, t2] = HISTORIA.armado.trozas;
    const h = { ...HISTORIA, armado: { ...HISTORIA.armado, trozas: [t1, { ...t2, consumidaEnId: "c9" }] } };
    const d = def("lote_consumir");
    expect(d.ventana({ loteId: "L1", trozaIds: ["t1", "t2"] }, h).clave.valor).toBe("1,50 m³");
    expect(d.resumen({ loteId: "L1", trozaIds: ["t1", "t2"] }, h)).toMatch(/1 de las pedidas ya estaban consumidas/);
    expect(d.ventana({ loteId: "L1" }, h).clave.valor).toBe("1,50 m³");
  });
});
