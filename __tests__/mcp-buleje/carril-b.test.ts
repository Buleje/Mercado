// @vitest-environment node
// @ts-nocheck — importa .mjs del MCP (sin tipos); el contrato vive en JSDoc (tools/mcp-buleje/src/tipos.mjs).
// Carril B (forestal satélites, 29-10): gtf, cubicaciones-trozas y directorio. Cada `confirmar` nuevo: no escribe antes de
// `confirmar` y su ventana usa datos de la previa (panel), no lo que escribió el modelo. Cada pedido() arma su ruta/cuerpo.
import { describe, it, expect, vi } from "vitest";
import { rutaLecturaPermitida } from "../../tools/mcp-buleje/src/lista-blanca.mjs";
import { crearServidor, cargarHerramientas } from "../../tools/mcp-buleje/servidor.mjs";
import { Client } from "../../tools/mcp-buleje/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { InMemoryTransport } from "../../tools/mcp-buleje/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js";

const okResp = (datos = {}) => ({ ok: true, status: 200, ms: 5, datos });
const config = { base: "http://localhost:3000", porDefecto: "qa-forestal", seco: false, negocios: { "qa-forestal": { slug: "qa-forestal", rubro: "forestal" }, bodega: { slug: "main" } } };
const { defs: CATALOGO } = await cargarHerramientas();
const def = (n) => CATALOGO.find((d) => d.nombre === n);
const F = "/api/admin/forestal";

/** `lecturas`: ruta → datos del GET. Cualquier no-GET devuelve ok. */
async function conectar(lecturas = {}) {
  const pedir = vi.fn(async (_n, p) => {
    if (p.metodo !== "GET") return okResp({ id: "nuevo" });
    const k = Object.keys(lecturas).find((r) => p.ruta === r);
    return okResp(k ? lecturas[k] : {});
  });
  const preguntar = vi.fn(async () => "no");
  const { servidor } = crearServidor({ herramientas: CATALOGO, pedir, preguntar, config, seco: false, rutaLecturaPermitida, anotar: vi.fn() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const cliente = new Client({ name: "test", version: "1" });
  await Promise.all([servidor.connect(a), cliente.connect(b)]);
  const llamar = async (name, args = {}) => { const r = await cliente.callTool({ name, arguments: args }); return { ...r, texto: r.content.map((c) => c.text).join("\n") }; };
  return { pedir, llamar };
}
const escrituras = (pedir) => pedir.mock.calls.filter(([, p]) => p.metodo !== "GET");
const leer = (lecturas) => async (p) => { const d = lecturas[p.ruta]; return d === undefined ? { ok: false } : okResp(d); };

const CUB = { id: "c1", version: 3, codigo: "CUB-2026-0007", sentido: "compra", estado: "borrador", personaNombre: "MADERERA DEL ORIENTE SAC", volumen: 2, unidad: "m³", trozas: [{ especie: "Cedro", volumen: 2 }] };
const FLETE = { id: "f1", transportistaNombre: "TRANSPORTES REAL", gtfNumber: "001-0456", placa: "W2D853", monto: 850, estadoPago: "pendiente" };
const PARTE = { id: "p1", nombre: "PARTE REAL SAC", roles: ["transportista"], documento: "20123456789" };

describe("carril B · confirmar no escribe antes de confirmar y la ventana sale de la previa", () => {
  const casos = [
    { n: "cubicacion_trozas_aplicar", args: { id: "c1", precioGeneral: 300 }, lect: { [`${F}/cubicaciones-trozas/c1`]: { cubicacion: CUB } }, nombre: /CUB-2026-0007/, metodo: "POST", ruta: `${F}/cubicaciones-trozas/c1/aplicar` },
    { n: "cubicacion_trozas_anular", args: { id: "c1", motivo: "error de carga" }, lect: { [`${F}/cubicaciones-trozas/c1`]: { cubicacion: CUB } }, nombre: /CUB-2026-0007/, metodo: "POST", ruta: `${F}/cubicaciones-trozas/c1/anular` },
    { n: "cubicacion_trozas_borrar", args: { id: "c1" }, lect: { [`${F}/cubicaciones-trozas/c1`]: { cubicacion: CUB } }, nombre: /CUB-2026-0007/, metodo: "DELETE", ruta: `${F}/cubicaciones-trozas/c1` },
    { n: "flete_pago", args: { id: "f1", estadoPago: "pagado" }, lect: { [`${F}/fletes`]: [FLETE] }, nombre: /TRANSPORTES REAL.*850/, metodo: "PATCH", ruta: `${F}/fletes` },
    { n: "flete_borrar", args: { id: "f1" }, lect: { [`${F}/fletes`]: [FLETE] }, nombre: /TRANSPORTES REAL.*850/, metodo: "DELETE", ruta: `${F}/fletes` },
    { n: "parte_borrar", args: { id: "p1" }, lect: { [`${F}/directorio`]: [PARTE] }, nombre: /PARTE REAL SAC/, metodo: "DELETE", ruta: `${F}/directorio` },
    { n: "anexo04_emitir", args: { numero: "0012", gtf: "001-0456", piezas: [{ cantidad: 10, espesor: 2, ancho: 8, largo: 10 }] }, lect: {}, nombre: /0012/, metodo: "POST", ruta: `${F}/anexos` },
    { n: "gtf_crear", args: { gtfNumber: "001-0456", transportista: "T", conductor: "C", placaVehiculo: "W2D-853", items: [{ species: "Cedro", volumeM3: 12.5, pieces: 20 }] }, lect: {}, nombre: /001-0456/, metodo: "POST", ruta: `${F}/gtf` },
  ];
  it.each(casos)("$n: propone sin escribir; al confirmar manda $metodo $ruta", async ({ n, args, lect, nombre, metodo, ruta }) => {
    expect(def(n).tipo).toBe("confirmar");
    expect(def(n).soloEn).toEqual(["forestal"]);
    const { pedir, llamar } = await conectar(lect);
    const r = await llamar(n, { negocio: "qa-forestal", ...args });
    expect(r.isError).toBeFalsy();
    const prop = JSON.parse(r.texto.split("\n\nDatos del panel")[0]);
    expect(prop.token).toBeTruthy();
    expect(prop.resumen).toMatch(nombre);
    expect(escrituras(pedir)).toHaveLength(0);
    // el pedido que se enviará está bien armado
    const p = def(n).pedido({ ...args }, lect[Object.keys(lect)[0]] ?? null);
    expect(p.metodo).toBe(metodo);
    expect(p.ruta).toBe(ruta);
  });

  it("aplicar: monto de la ventana sale del panel (2 m³ × 300), y se manda como montoVisto con la versión del panel", async () => {
    const d = def("cubicacion_trozas_aplicar");
    const previa = CUB;
    const v = d.ventana({ id: "c1", precioGeneral: 300 }, previa);
    expect(v.clave).toBeTruthy();
    expect(JSON.stringify(v)).toMatch(/600/);
    const p = d.pedido({ id: "c1", precioGeneral: 300 }, previa);
    expect(p.cuerpo.montoVisto).toBe(600);
    expect(p.cuerpo.version).toBe(3);
    expect(p.cuerpo.idempotencyKey).toBe("mcp-aplicar-c1-3");
    // lo que el modelo escribió para «montoVisto» no existe en la entrada
    expect(Object.keys(d.entrada)).not.toContain("montoVisto");
  });

  it("flete_pago: la clave de la ventana es el monto del panel (850), no algo escrito", () => {
    const v = def("flete_pago").ventana({ id: "f1", estadoPago: "pagado" }, FLETE);
    expect(JSON.stringify(v)).toMatch(/850/);
  });

  it("sin previa (id inexistente) el aviso dice que no pudo verificar, no inventa nombres", () => {
    const r = def("flete_borrar").resumen({ id: "zz" }, null);
    expect(r).toMatch(/NO PUDE VERIFICAR/);
  });
});

describe("carril B · escrituras: ruta y cuerpo", () => {
  it("cubicacion_trozas_guardar → POST", () => {
    const p = def("cubicacion_trozas_guardar").pedido({ fecha: "2026-10-28", trozas: [{ especie: "Cedro", volumen: 1 }] });
    expect(p.metodo).toBe("POST");
    expect(p.ruta).toBe(`${F}/cubicaciones-trozas`);
    expect(p.cuerpo.trozas).toHaveLength(1);
  });
  it("cubicacion_trozas_editar → PATCH con version", () => {
    const p = def("cubicacion_trozas_editar").pedido({ id: "c1", version: 2, notas: "x", trozas: [{ especie: "Cedro", d1: 30, largo: 3 }] });
    expect(p).toMatchObject({ metodo: "PATCH", ruta: `${F}/cubicaciones-trozas/c1` });
    expect(p.cuerpo.version).toBe(2);
  });
  it("las 3 herramientas de la tabla vieja lo dicen", () => {
    for (const n of ["cubicaciones_ver", "cubicacion_guardar", "cubicacion_borrar"]) expect(def(n).descripcion).toMatch(/VIEJA/);
  });
  it("permiso_crear → POST contratos; permiso_editar → PATCH contratos/[id]", () => {
    expect(def("permiso_crear").pedido({ codigo: "ABC-123", titularNombre: "T", tipo: "otro" })).toMatchObject({ metodo: "POST", ruta: `${F}/contratos` });
    expect(def("permiso_editar").pedido({ id: "k1", estado: "suspendido" })).toMatchObject({ metodo: "PATCH", ruta: `${F}/contratos/k1` });
  });
  it("flete_anotar → POST, siempre pendiente y sin id (no puede pisar un pago)", () => {
    expect(Object.keys(def("flete_anotar").entrada)).not.toContain("id");
    const p = def("flete_anotar").pedido({ fecha: "2026-10-28", tipo: "ingreso", monto: 100 });
    expect(p).toMatchObject({ metodo: "POST", ruta: `${F}/fletes` });
    expect(p.cuerpo.estadoPago ?? "pendiente").toBe("pendiente");
  });
  it("parte_guardar → POST directorio", () => {
    expect(def("parte_guardar").pedido({ nombre: "X", roles: ["transportista"] })).toMatchObject({ metodo: "POST", ruta: `${F}/directorio` });
  });
});

describe("carril B · parte_guardar y permiso_editar piden OK solo cuando toca identidad/estado", () => {
  it("parte_guardar: editar una existente o tocar contacto pide OK; un alta sin datos sensibles no", () => {
    const d = def("parte_guardar");
    expect(d.confirmarSi({ id: "p1", nombre: "X", roles: ["cliente"] })).toBeTruthy();
    expect(d.confirmarSi({ nombre: "X", roles: ["cliente"], telefono: "999999999" })).toBeTruthy();
    expect(d.confirmarSi({ nombre: "X", roles: ["cliente"] })).toBeFalsy();
  });
  it("permiso_editar: estado pide OK, un alias no", () => {
    const d = def("permiso_editar");
    expect(d.confirmarSi({ id: "k1", estado: "suspendido" })).toBeTruthy();
    expect(d.confirmarSi({ id: "k1", alias: "algo" })).toBeFalsy();
  });
});

describe("carril B · lecturas: rutas", () => {
  it.each([
    ["cubicaciones_trozas_ver", {}, `${F}/cubicaciones-trozas`],
    ["cubicaciones_trozas_ver", { id: "c1" }, `${F}/cubicaciones-trozas/c1`],
    ["directorio_ver", {}, `${F}/directorio`],
    ["fletes_ver", {}, `${F}/fletes`],
    ["especies_ver", {}, `${F}/especies`],
    ["tramites_ver", {}, `${F}/tramites`],
    ["plantaciones_ver", {}, `${F}/plantaciones`],
    ["planes_ver", {}, `${F}/plan`],
  ])("%s %j → GET %s", (n, args, ruta) => {
    expect(def(n).tipo).toBe("lectura");
    const p = def(n).pedido(args);
    expect(p.metodo).toBe("GET");
    expect(p.ruta).toBe(ruta);
  });
});

describe("carril B · trámites, especies y plantaciones", () => {
  it("tramite_borrar: confirmar; no escribe antes y el asunto sale del panel", async () => {
    const lect = { [`${F}/tramites`]: { tramites: [{ id: "t1", asunto: "ASUNTO REAL", autoridad: "osinfor", estado: "borrador" }] } };
    const { pedir, llamar } = await conectar(lect);
    const r = await llamar("tramite_borrar", { negocio: "qa-forestal", id: "t1" });
    expect(JSON.parse(r.texto.split("\n\nDatos del panel")[0]).resumen).toMatch(/ASUNTO REAL/);
    expect(escrituras(pedir)).toHaveLength(0);
    expect(def("tramite_borrar").pedido({ id: "t1" })).toMatchObject({ metodo: "DELETE", ruta: `${F}/tramites`, query: { id: "t1" } });
  });
  it("tramite_guardar: POST; emitir o cambiar estado de uno existente pide OK, un borrador no", () => {
    const d = def("tramite_guardar");
    expect(d.pedido({ formatoId: "f", autoridad: "arffs" })).toMatchObject({ metodo: "POST", ruta: `${F}/tramites` });
    expect(d.confirmarSi({ formatoId: "f", autoridad: "arffs", emitir: true })).toBe(true);
    expect(d.confirmarSi({ id: "t1", formatoId: "f", autoridad: "arffs", estado: "resuelto" })).toBe(true);
    expect(d.confirmarSi({ formatoId: "f", autoridad: "arffs", estado: "borrador" })).toBe(false);
  });
  it("especie_guardar: POST sin clave, PATCH con clave", () => {
    const d = def("especie_guardar");
    expect(d.pedido({ nombre: "X" })).toMatchObject({ metodo: "POST", ruta: `${F}/especies` });
    expect(d.pedido({ clave: "x", nombre: "Y" })).toMatchObject({ metodo: "PATCH", ruta: `${F}/especies` });
  });
  it("plantacion_guardar: solo alta (sin id), bloques vacíos; completo/listo_presentar pide OK", () => {
    const d = def("plantacion_guardar");
    expect(Object.keys(d.entrada)).not.toContain("id");
    const p = d.pedido({ negocio: "x", tipoTramite: "inscripcion", predioNombre: "P" });
    expect(p).toMatchObject({ metodo: "POST", ruta: `${F}/plantaciones` });
    expect(p.cuerpo.bloques).toEqual([]);
    expect(p.cuerpo.negocio).toBeUndefined();
    expect(d.confirmarSi({ tipoTramite: "inscripcion", estado: "listo_presentar" })).toBe(true);
    expect(d.confirmarSi({ tipoTramite: "inscripcion", estado: "borrador" })).toBe(false);
  });
});

describe("carril B · ronda de revisores", () => {
  it("1 · permiso_crear siempre pide OK y el plan sale del panel", async () => {
    const d = def("permiso_crear");
    expect(d.confirmarSi({ codigo: "ABC-1", titularNombre: "T" })).toBe(true);
    expect(d.confirmarSi({ codigo: "ABC-1", titularNombre: "T", estado: "vigente", planId: "pl1" })).toBe(true);
    const { pedir, llamar } = await conectar({ [`${F}/plan`]: { plan: { planType: "DEMA", planNumber: "PLAN-REAL-9" } } });
    const r = await llamar("permiso_crear", { negocio: "qa-forestal", codigo: "ABC-1", titularNombre: "T", planId: "pl1" });
    expect(JSON.parse(r.texto.split("\n\nDatos del panel")[0]).resumen).toMatch(/PLAN-REAL-9/);
    expect(escrituras(pedir)).toHaveLength(0);
    expect(d.resumen({ codigo: "ABC-1", titularNombre: "T", planId: "pl1" }, { plan: undefined })).toMatch(/NO PUDE VERIFICAR/);
  });

  it("2 · tramite_guardar: crear en estado presentado pide OK; borrador no; sellar usa asunto y formato del panel", async () => {
    const d = def("tramite_guardar");
    expect(d.confirmarSi({ formatoId: "f", autoridad: "arffs", estado: "presentado" })).toBe(true);
    expect(d.confirmarSi({ formatoId: "f", autoridad: "arffs", estado: "borrador" })).toBe(false);
    const lect = { [`${F}/tramites`]: { tramites: [{ id: "t1", asunto: "ASUNTO DEL PANEL", formatoId: "descargo-osinfor", estado: "borrador" }] } };
    const { pedir, llamar } = await conectar(lect);
    const r = await llamar("tramite_guardar", { negocio: "qa-forestal", id: "t1", formatoId: "descargo-osinfor", autoridad: "osinfor", asunto: "ASUNTO INVENTADO", emitir: true });
    const res = JSON.parse(r.texto.split("\n\nDatos del panel")[0]).resumen;
    expect(res).toMatch(/ASUNTO DEL PANEL/);
    expect(res).not.toMatch(/INVENTADO/);
    expect(escrituras(pedir)).toHaveLength(0);
    const v = d.ventana({ id: "t1", autoridad: "osinfor", emitir: true }, null);
    expect(JSON.stringify(v)).toMatch(/NO PUDE VERIFICAR/);
    expect(JSON.stringify(d.ventana({ autoridad: "osinfor", emitir: true }, null))).toMatch(/NO PUDE VERIFICAR/);
  });

  it("3 · aplicar: manda especiesConVariosPrecios, el general no cubre la marcada y el desglose se ve", () => {
    const d = def("cubicacion_trozas_aplicar");
    const previa = { ...CUB, version: 3, trozas: [{ especie: "Cedro", volumen: 2 }, { especie: "Tornillo", volumen: 1 }] };
    const marcas = [{ clave: "Cedro", cuantos: 2 }];
    // la marcada sin precio propio: el general no la cubre → no hay monto verificable y el general no viaja
    const a1 = { id: "c1", precioGeneral: 300, especiesConVariosPrecios: marcas };
    const p1 = d.pedido(a1, previa);
    expect(p1.cuerpo.especiesConVariosPrecios).toEqual(marcas);
    expect(p1.cuerpo.precioGeneral).toBeUndefined();
    expect(d.resumen(a1, previa)).toMatch(/monto NO VERIFICADO/);
    // con precio propio sí: 2×350 + 1×300 = 1000
    const a2 = { id: "c1", precioGeneral: 300, precios: [{ clave: "cedro", precio: 350 }], especiesConVariosPrecios: marcas };
    const p2 = d.pedido(a2, previa);
    expect(p2.cuerpo.montoVisto).toBe(1000);
    expect(p2.cuerpo.precioGeneral).toBe(300);
    const res = d.resumen(a2, previa);
    expect(res).toMatch(/cedro.*2,00.*350/i);
    expect(res).toMatch(/tornillo.*1,00.*300/i);
    const v = d.ventana(a2, previa);
    expect(v.filas.length).toBeLessThanOrEqual(4);
    expect(JSON.stringify(v.filas)).toMatch(/350/);
    // 5 especies: la ventana sigue en 4 filas
    const mucha = { ...CUB, trozas: ["a", "b", "c", "d", "e"].map((e) => ({ especie: e, volumen: 1 })) };
    expect(d.ventana({ id: "c1", precioGeneral: 10 }, mucha).filas.length).toBeLessThanOrEqual(4);
  });
});
