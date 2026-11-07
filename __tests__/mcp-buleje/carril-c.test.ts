// @vitest-environment node
// @ts-nocheck — importa .mjs del MCP (sin tipos).
// Carril C (29-10): bodega y personas. Cada confirmar nuevo: no escribe antes del OK, y el aviso usa lo que dice el panel
// (no lo que escribió el modelo). Más la ruta/cuerpo de cada herramienta y que asistencia_marcar manda `motivo`.
import { describe, it, expect, vi } from "vitest";
import { rutaLecturaPermitida } from "../../tools/mcp-buleje/src/lista-blanca.mjs";
import { crearServidor, cargarHerramientas } from "../../tools/mcp-buleje/servidor.mjs";
import { Client } from "../../tools/mcp-buleje/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { InMemoryTransport } from "../../tools/mcp-buleje/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js";

const ok = (datos) => ({ ok: true, status: 200, ms: 5, datos });
const config = { base: "http://localhost:3000", porDefecto: "bodega", seco: false, negocios: { bodega: { slug: "main" }, blas: { slug: "blas" } } };
const { defs: CATALOGO } = await cargarHerramientas();
const def = (n) => CATALOGO.find((d) => d.nombre === n);

async function conectar(gets = {}) {
  const pedir = vi.fn(async (_n, p) => {
    if (p.metodo === "GET") {
      const k = Object.keys(gets).find((x) => p.ruta === x);
      return k ? ok(gets[k]) : ok({});
    }
    return ok({ id: "nuevo" });
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

const COLAB = { colaborador: { id: "c1", nombre: "Elena Ríos", documento: "12345678", estado: "ACTIVO", puesto: { nombre: "Cajera" } } };
const CASOS = [
  ["tarifa_guardar", { id: "c1", modalidad: "DIA", monto: 50, vigenteDesde: "2026-11-01" }, { "/api/rrhh/colaboradores/c1": COLAB }, "PUT", "/api/rrhh/colaboradores/c1/tarifas", "Elena Ríos"],
  ["trabajador_estado", { id: "c1", estado: "VACACIONES" }, { "/api/rrhh/colaboradores/c1": COLAB }, "PATCH", "/api/rrhh/colaboradores/c1", "Elena Ríos"],
  ["trabajador_cesar", { id: "c1", fechaCese: "2026-11-05", motivo: "Renunció" }, { "/api/rrhh/colaboradores/c1": COLAB }, "PATCH", "/api/rrhh/colaboradores/c1", "Elena Ríos"],
  ["trabajador_reingresar", { id: "c1", fecha: "2026-11-05" }, { "/api/rrhh/colaboradores/c1": COLAB }, "PATCH", "/api/rrhh/colaboradores/c1", "Elena Ríos"],
  ["pago_semana_deshacer", { colaboradorId: "c1", desde: "2026-10-26" }, { "/api/rrhh/colaboradores/c1": COLAB }, "DELETE", "/api/rrhh/pago-semana", "Elena Ríos"],
  ["agenda_actividad_borrar", { id: "a1" }, { "/api/admin/agenda/actividades": { actividades: [{ id: "a1", nombre: "Revisar caja", updatedAt: "2026-10-30T00:00:00.000Z" }] } }, "DELETE", "/api/admin/agenda/actividades/a1", "Revisar caja"],
  ["producto_borrar", { id: 77 }, { "/api/products/77": { product: { id: 77, name: "Arroz Costeño", stock: 12 } } }, "DELETE", "/api/products/77", "Arroz Costeño"],
  ["compra_cancelar", { id: "p1", motivo: "error de digitación" }, { "/api/purchases/p1": { purchase: { id: "p1", supplierName: "Frigorifico Amazonia", total: 600, status: "pendiente", items: [{}] } } }, "PATCH", "/api/purchases/p1", "Frigorifico Amazonia"],
  ["compra_recibir", { id: "p1", estado: "recibido" }, { "/api/purchases/p1": { purchase: { id: "p1", supplierName: "Frigorifico Amazonia", total: 600, status: "pendiente", items: [{}] } } }, "PATCH", "/api/purchases/p1", "Frigorifico Amazonia"],
  ["compra_borrar", { id: "p1" }, { "/api/purchases/p1": { purchase: { id: "p1", supplierName: "Frigorifico Amazonia", total: 600, status: "pendiente", items: [{}] } } }, "DELETE", "/api/purchases/p1", "Frigorifico Amazonia"],
  ["cliente_borrar", { telefono: "999111222" }, { "/api/customers/999111222": { customer: { name: "Doña Rosa", phone: "999111222" } } }, "DELETE", "/api/customers/999111222", "Doña Rosa"],
];

describe("carril C · confirmar nuevos", () => {
  it.each(CASOS)("%s: es confirmar, pide OK, no escribe antes y el aviso trae el nombre del PANEL", async (nombre, args, gets, metodo, ruta, quien) => {
    expect(def(nombre)?.tipo).toBe("confirmar");
    const { pedir, llamar } = await conectar(gets);
    const r = await llamar(nombre, { negocio: "bodega", ...args });
    const prop = JSON.parse(r.texto);
    expect(prop.token).toBeTruthy();
    expect(prop.resumen).toContain(quien);
    expect(escrituras(pedir)).toHaveLength(0);
    expect(def(nombre).pedido(args).metodo).toBe(metodo);
    expect(def(nombre).pedido(args).ruta).toBe(ruta);
  });

  it("sin dato del panel, el aviso dice que no pudo verificar (no usa lo tecleado)", async () => {
    const { pedir, llamar } = await conectar({});
    const r = await llamar("trabajador_cesar", { negocio: "bodega", id: "c1", fechaCese: "2026-11-05", motivo: "Renunció" });
    expect(JSON.parse(r.texto).resumen).toMatch(/NO PUDE VERIFICAR/);
    expect(escrituras(pedir)).toHaveLength(0);
  });

  it("trabajador_cesar solo manda confirmar:true si se pidió aceptarMarcasPosteriores", () => {
    const base = { id: "c1", fechaCese: "2026-11-05", motivo: "Renunció" };
    expect(def("trabajador_cesar").pedido(base).cuerpo).toEqual({ action: "cesar", fechaCese: "2026-11-05", motivo: "Renunció" });
    expect(def("trabajador_cesar").pedido({ ...base, aceptarMarcasPosteriores: true }).cuerpo.confirmar).toBe(true);
  });
});

describe("carril C · escrituras con OK condicional", () => {
  it("producto_editar: precio → propuesta; solo nombre → escribe directo", async () => {
    const gets = { "/api/products/77": { product: { id: 77, name: "Arroz Costeño", price: 24.9, stock: 10 } } };
    const a = await conectar(gets);
    const r1 = await a.llamar("producto_editar", { negocio: "bodega", id: 77, price: 20 });
    expect(JSON.parse(r1.texto).token).toBeTruthy();
    expect(escrituras(a.pedir)).toHaveLength(0);
    const b = await conectar(gets);
    await b.llamar("producto_editar", { negocio: "bodega", id: 77, description: "5 kg" });
    expect(escrituras(b.pedir).map(([, p]) => p.metodo)).toEqual(["PATCH"]);
  });

  it("trabajador_editar: documento → propuesta; apodo → escribe", async () => {
    const gets = { "/api/rrhh/colaboradores/c1": COLAB };
    const a = await conectar(gets);
    const r1 = await a.llamar("trabajador_editar", { negocio: "bodega", id: "c1", documento: "87654321" });
    expect(JSON.parse(r1.texto).token).toBeTruthy();
    expect(escrituras(a.pedir)).toHaveLength(0);
    const b = await conectar(gets);
    await b.llamar("trabajador_editar", { negocio: "bodega", id: "c1", apodo: "Ele" });
    expect(escrituras(b.pedir)).toHaveLength(1);
    expect(escrituras(b.pedir)[0][1]).toMatchObject({ metodo: "PATCH", ruta: "/api/rrhh/colaboradores/c1", cuerpo: expect.objectContaining({ action: "editar" }) });
  });

  it("trabajador_crear con tarifa inicial → propuesta; sin tarifa → POST", async () => {
    const a = await conectar({});
    const r1 = await a.llamar("trabajador_crear", { negocio: "bodega", nombre: "Nuevo Uno", tarifaInicial: { modalidad: "DIA", monto: 40, vigenteDesde: "2026-11-01" } });
    expect(JSON.parse(r1.texto).token).toBeTruthy();
    expect(escrituras(a.pedir)).toHaveLength(0);
    const b = await conectar({});
    await b.llamar("trabajador_crear", { negocio: "bodega", nombre: "Nuevo Dos" });
    expect(escrituras(b.pedir)[0][1]).toMatchObject({ metodo: "POST", ruta: "/api/rrhh/colaboradores" });
  });

  it("agenda_actividad_editar manda la versión y pasa por PATCH", async () => {
    const { pedir, llamar } = await conectar({});
    await llamar("agenda_actividad_editar", { negocio: "bodega", id: "a1", version: "2026-10-30T00:00:00.000Z", hora: "10:00" });
    const [, p] = escrituras(pedir)[0];
    expect(p).toMatchObject({ metodo: "PATCH", ruta: "/api/admin/agenda/actividades/a1" });
    expect(p.cuerpo.version).toBe("2026-10-30T00:00:00.000Z");
  });
});

describe("carril C · asistencia_marcar manda el motivo", () => {
  it("motivo al lado de marcas, refrigerioMin dentro, estado intacto", () => {
    const c = def("asistencia_marcar").pedido({ colaboradorId: "c1", fecha: "2026-10-28", estado: "PRESENTE", entrada: "07:30", salida: "16:00", refrigerioMin: 60, motivo: "olvidó marcar" });
    expect(c.metodo).toBe("PUT");
    expect(c.cuerpo.motivo).toBe("olvidó marcar");
    expect(c.cuerpo.marcas[0]).toMatchObject({ colaboradorId: "c1", fecha: "2026-10-28", entrada: "07:30", salida: "16:00", refrigerioMin: 60, estado: "PRESENTE" });
  });
});

// ── Ronda de revisores (29-10) ──────────────────────────────────────────────────────────
const resumenDe = async (nombre, args, gets) => {
  const { pedir, llamar } = await conectar(gets);
  const r = await llamar(nombre, { negocio: "bodega", ...args });
  expect(escrituras(pedir)).toHaveLength(0);
  return JSON.parse(r.texto);
};
const PROD = { "/api/products/77": { product: { id: 77, name: "Arroz Costeño", price: 24.9, stock: 10, barcode: "111", unit: "kg" } } };
const COMPRA = (status) => ({ "/api/purchases/p1": { purchase: { id: "p1", supplierName: "Frigorifico Amazonia", total: 600, status, items: [{}, {}] } } });

describe("ronda revisores · 1 producto_editar", () => {
  it.each([["barcode", { barcode: "222" }, "111"], ["name", { name: "Arroz Barato" }, "Arroz Costeño"], ["unit", { unit: "u" }, "kg"]])("%s pide OK y muestra antes → después", async (_k, cambio, antes) => {
    const p = await resumenDe("producto_editar", { id: 77, ...cambio }, PROD);
    expect(p.token).toBeTruthy();
    expect(p.resumen).toContain(`${antes} → `);
  });
  it("precio + stock: una fila por cambio y clave = precio", () => {
    const d = def("producto_editar");
    const prev = PROD["/api/products/77"].product;
    const v = d.ventana({ id: 77, price: 20, stock: 5, adjustReason: "conteo" }, prev);
    const et = v.filas.map((f) => f.etiqueta);
    expect(et).toEqual(expect.arrayContaining(["Precio", "Stock"]));
    expect(v.filas.find((f) => f.etiqueta === "Precio").valor).toBe(`${"S/ 24,90"} → ${"S/ 20,00"}`);
    expect(JSON.stringify(v.clave)).toMatch(/20/);
  });
});

describe("ronda revisores · 2 compra_recibir", () => {
  it("parcial NO dice que suma stock; recibido sí", async () => {
    const a = await resumenDe("compra_recibir", { id: "p1", estado: "parcial" }, COMPRA("pendiente"));
    expect(a.resumen).toMatch(/NO suma stock/);
    expect(a.resumen).not.toMatch(/Suma stock de/);
    const b = await resumenDe("compra_recibir", { id: "p1", estado: "recibido" }, COMPRA("pendiente"));
    expect(b.resumen).toMatch(/Suma stock de 2/);
  });
});

describe("ronda revisores · 3 compra_borrar", () => {
  it("avisa que stock y deuda no se revierten; recibida/parcial → OJO + cancelar", async () => {
    const a = await resumenDe("compra_borrar", { id: "p1" }, COMPRA("pendiente"));
    expect(a.resumen).toMatch(/stock y la deuda NO se revierten/);
    expect(a.resumen).not.toMatch(/OJO/);
    for (const st of ["recibido", "parcial"]) {
      const b = await resumenDe("compra_borrar", { id: "p1" }, COMPRA(st));
      expect(b.resumen).toMatch(/OJO/);
      expect(b.resumen).toMatch(/compra_cancelar/);
    }
  });
});

describe("ronda revisores · 4 pago_semana_deshacer", () => {
  it("lee el neto de pago-semana y lo usa como clave y en el resumen", async () => {
    const gets = { "/api/rrhh/colaboradores/c1": COLAB, "/api/rrhh/pago-semana": { filas: [{ colaboradorId: "c1", pagado: { neto: 345.5, salioDeCaja: true } }] } };
    const p = await resumenDe("pago_semana_deshacer", { colaboradorId: "c1", desde: "2026-10-26" }, gets);
    expect(p.resumen).toMatch(/345,50/);
    const v = def("pago_semana_deshacer").ventana({ colaboradorId: "c1", desde: "2026-10-26" }, { nombre: "Elena Ríos", pago: { leido: true, hayPago: true, neto: 345.5, salioDeCaja: true } });
    expect(JSON.stringify(v.clave)).toMatch(/345/);
  });
  it("sin neto legible dice OJO", async () => {
    const p = await resumenDe("pago_semana_deshacer", { colaboradorId: "c1", desde: "2026-10-26" }, { "/api/rrhh/colaboradores/c1": COLAB });
    expect(p.resumen).toMatch(/OJO/);
  });
});

describe("ronda revisores · 5 asistencia_masiva cuenta como el servidor", () => {
  it("salta eventuales, no ingresados y ya marcados", async () => {
    const gets = {
      "/api/rrhh/colaboradores": { colaboradores: [
        { id: "a", nombre: "Ana", estado: "ACTIVO", fechaIngreso: "2026-01-01" },
        { id: "b", nombre: "Beto", estado: "ACTIVO", eventual: true },
        { id: "c", nombre: "Cora", estado: "ACTIVO", fechaIngreso: "2026-12-01" },
        { id: "d", nombre: "Dino", estado: "ACTIVO" },
        { id: "e", nombre: "Eva", estado: "ACTIVO" },
      ] },
      "/api/rrhh/asistencia": { marcas: [{ colaboradorId: "d" }] },
    };
    const p = await resumenDe("asistencia_masiva", { fecha: "2026-10-28" }, gets);
    expect(p.resumen).toMatch(/a 2 trabajador/);
    expect(p.resumen).toMatch(/1 eventual/);
    expect(p.resumen).toMatch(/1 que aún no ingresaron/);
    expect(p.resumen).toMatch(/1 ya marcado/);
    const q = await resumenDe("asistencia_masiva", { fecha: "2026-10-28", sobrescribir: true }, gets);
    expect(q.resumen).toMatch(/a 3 trabajador/);
  });
});

describe("ronda revisores · 6 cesar y crear", () => {
  it("cesar con aceptarMarcasPosteriores lo dice", async () => {
    const base = { id: "c1", fechaCese: "2026-11-05", motivo: "Renunció" };
    expect((await resumenDe("trabajador_cesar", base, { "/api/rrhh/colaboradores/c1": COLAB })).resumen).not.toMatch(/marcas de asistencia posteriores/);
    expect((await resumenDe("trabajador_cesar", { ...base, aceptarMarcasPosteriores: true }, { "/api/rrhh/colaboradores/c1": COLAB })).resumen).toMatch(/marcas de asistencia posteriores/);
  });
  it("crear con beneficiarioId pide OK y no escribe", async () => {
    const p = await resumenDe("trabajador_crear", { nombre: "Nuevo Tres", beneficiarioId: "ben1" }, {});
    expect(p.token).toBeTruthy();
    expect(p.resumen).toMatch(/beneficiario/);
  });
});
