// @vitest-environment node
// @ts-nocheck — importa .mjs del MCP (sin tipos)
// ADR-524 (30-10): subida en lote, parte_guardar parcial, administración (trámites/alquileres) y su lista blanca.
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearConfirmador } from "../../tools/mcp-buleje/src/confirmaciones.mjs";
import { sanearVentana } from "../../tools/mcp-buleje/src/clave-ok.mjs";
import { rutaLecturaPermitida } from "../../tools/mcp-buleje/src/lista-blanca.mjs";
import { herramientas as docs, ajustes } from "../../tools/mcp-buleje/src/herramientas/documentos.mjs";
import { herramientas as dir } from "../../tools/mcp-buleje/src/herramientas/directorio.mjs";
import { herramientas as adm } from "../../tools/mcp-buleje/src/herramientas/administracion.mjs";
import { z } from "../../tools/mcp-buleje/node_modules/zod/index.js";

const lote = docs.find((d) => d.nombre === "docs_subir_lote");
const parte = dir.find((d) => d.nombre === "parte_guardar");
const parsear = (def, a) => z.object(def.entrada).parse(a);

let raiz: string;
beforeAll(() => {
  raiz = realpathSync(mkdtempSync(join(tmpdir(), "lote-")));
  ajustes.raices = [raiz];
  ajustes.casa = join(raiz, "casa");
});
afterAll(() => { rmSync(raiz, { recursive: true, force: true }); ajustes.raices = undefined; ajustes.casa = undefined; });

const crear = (carpeta: string, archivos: string[]) => {
  const d = join(raiz, carpeta);
  mkdirSync(d, { recursive: true });
  for (const f of archivos) {
    const ruta = join(d, f);
    mkdirSync(join(ruta, ".."), { recursive: true });
    writeFileSync(ruta, `contenido de ${f}`);
  }
  return d;
};

describe("docs_subir_lote", () => {
  it("arma N pedidos con carpetaRuta y no toca la red hasta confirmar", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    try {
      const carpeta = crear("normal", ["a.pdf", "b.pdf", "c.docx"]);
      const a = parsear(lote, { carpeta, carpetaDrive: "Trámites/Agrobanco 2026-10", categoria: "legal", etiquetas: ["alquiler"], vinculoTipo: "alquiler", vinculoId: "alq1" });
      const previa = await lote.previa(a, async () => { throw new Error("no debe leer la red"); });
      expect(previa.ok).toBe(true);
      const pedidos = [].concat(lote.pedido(a, previa));
      expect(pedidos).toHaveLength(3);
      for (const p of pedidos) {
        expect(p.metodo).toBe("POST");
        expect(p.ruta).toBe("/api/admin/documents");
        expect(p.cuerpo).toMatchObject({ carpetaRuta: "Trámites/Agrobanco 2026-10", category: "legal", tags: '["alquiler"]', vinculoTipo: "alquiler", vinculoId: "alq1", siExiste: "saltar" });
        expect(p.archivo.sha256).toMatch(/^[0-9a-f]{64}$/);
      }
      const enviar = vi.fn();
      const c = crearConfirmador({ preguntar: vi.fn(), enviar, seco: false });
      const v = sanearVentana(lote.ventana(a, previa));
      c.proponer({ negocio: "blas", herramienta: "docs_subir_lote", pedidos, resumen: lote.resumen(a, previa), ventana: v });
      expect(enviar).not.toHaveBeenCalled();
      expect(f).not.toHaveBeenCalled();
      expect(v.clave.valor).toBe("3");
      expect(v.filas.length).toBeLessThanOrEqual(4);
    } finally { vi.unstubAllGlobals(); }
  });

  it("21 archivos: sube 20 y avisa «Son 21: van en 2 lotes» con desde=20", async () => {
    const carpeta = crear("muchos", Array.from({ length: 21 }, (_, i) => `doc-${String(i).padStart(2, "0")}.pdf`));
    const a = parsear(lote, { carpeta, carpetaDrive: "Varios" });
    const previa = await lote.previa(a);
    expect(previa.archivos).toHaveLength(20);
    expect(previa.siguiente).toBe(20);
    expect(lote.resumen(a, previa)).toMatch(/Son 21: van en 2 lotes, sigue con desde=20/);
    const b = parsear(lote, { carpeta, carpetaDrive: "Varios", desde: 20 });
    const previa2 = await lote.previa(b);
    expect(previa2.archivos).toHaveLength(1);
    expect(previa2.siguiente).toBeNull();
    expect([].concat(lote.pedido(a, previa))).toHaveLength(20);
  });

  it("un archivo «… (con clave).pdf», los ocultos y desktop.ini quedan fuera", async () => {
    const carpeta = crear("claves", ["Escritura.pdf", "SOL (con clave).pdf", "Contraseñas.txt", "mis-PASSWORD.xlsx", "desktop.ini", ".oculto.pdf", ".en-curso/x.pdf"]);
    const a = parsear(lote, { carpeta, carpetaDrive: "X", recursivo: true });
    const previa = await lote.previa(a);
    expect(previa.archivos.map((f) => f.nombre)).toEqual(["Escritura.pdf"]);
    expect(previa.noSubidos.map((x) => x.nombre).sort()).toEqual(["Contraseñas.txt", "SOL (con clave).pdf", "mis-PASSWORD.xlsx"]);
    expect(lote.resumen(a, previa)).toMatch(/parece tener una clave/);
  });

  it("recursivo arma las subcarpetas en carpetaRuta; sin recursivo no baja", async () => {
    const carpeta = crear("arbol", ["raiz.pdf", "Drucila/dni.pdf", "Drucila/Predio/partida.pdf", "Claves/x.pdf"]);
    const a = parsear(lote, { carpeta, carpetaDrive: "Trámites\\Agrobanco/", recursivo: true });
    const previa = await lote.previa(a);
    const rutas = [].concat(lote.pedido(a, previa)).map((p) => p.cuerpo.carpetaRuta).sort();
    expect(rutas).toEqual(["Trámites/Agrobanco", "Trámites/Agrobanco/Drucila", "Trámites/Agrobanco/Drucila/Predio"]);
    expect(previa.noSubidos.some((x) => /Claves/.test(x.nombre))).toBe(true);
    const plana = await lote.previa(parsear(lote, { carpeta, carpetaDrive: "T" }));
    expect(plana.archivos.map((f) => f.nombre)).toEqual(["raiz.pdf"]);
  });

  it("carpeta fuera de las raíces o con «..» en el destino: no sube nada", async () => {
    const mala = await lote.previa(parsear(lote, { carpeta: "/etc", carpetaDrive: "X" }));
    expect(mala.ok).toBe(false);
    expect(lote.resumen({ carpeta: "/etc", carpetaDrive: "X" }, mala)).toMatch(/NO se puede/);
    expect(lote.pedido({ carpeta: "/etc", carpetaDrive: "X" }, mala)[0].archivo.sha256).toBe("");
    expect(z.object(lote.entrada).safeParse({ carpeta: "/x", carpetaDrive: "A/../B" }).success).toBe(false);
  });
});

describe("parte_guardar parcial", () => {
  it("con id: PATCH solo con las claves que vinieron (null viaja como borrar)", () => {
    const a = parsear(parte, { id: "p1", ruc: "20123456789", rucEstado: "activo", parentesco: null, adjuntosAgregar: [{ documentId: "d1", rotulo: "DNI" }] });
    const p = parte.pedido(a);
    expect(p.metodo).toBe("PATCH");
    expect(p.ruta).toBe("/api/admin/forestal/directorio/p1");
    expect(p.cuerpo).toEqual({ ruc: "20123456789", rucEstado: "activo", parentesco: null, adjuntosAgregar: [{ documentId: "d1", rotulo: "DNI" }] });
    expect(Object.keys(p.cuerpo)).not.toContain("nombre");
    expect(parte.confirmarSi(a)).toBe(true);
  });
  it("sin id: POST como antes, con roles socio y arrendador", () => {
    const a = parsear(parte, { nombre: "Drucila Pérez", roles: ["socio", "arrendador"], docTipo: "DNI", docNumero: "12345678" });
    const p = parte.pedido(a);
    expect(p).toMatchObject({ metodo: "POST", ruta: "/api/admin/forestal/directorio", cuerpo: { nombre: "Drucila Pérez", roles: ["socio", "arrendador"] } });
    expect(z.object(parte.entrada).safeParse({ nombre: "X Y", roles: ["inventado"] }).success).toBe(false);
  });
});

describe("administración (trámites y alquileres)", () => {
  const por = (n: string) => adm.find((d) => d.nombre === n);
  it("los nombres no chocan con los oficios forestales y hay 6 herramientas", () => {
    expect(adm.map((d) => d.nombre)).toEqual(["tramites_admin_ver", "tramite_admin_guardar", "tramite_admin_requisitos", "alquileres_ver", "alquiler_guardar", "alquiler_pago"]);
    expect(dir.some((d) => d.nombre === "tramites_ver")).toBe(true);
  });
  it("tramite_admin_guardar: POST con plantilla; con id PATCH parcial", () => {
    const t = por("tramite_admin_guardar");
    expect(t.pedido(parsear(t, { entidad: "banco", asunto: "Alquiler", plantilla: "alquiler_banco" }))).toMatchObject({ metodo: "POST", ruta: "/api/admin/tramites", cuerpo: { entidad: "banco", plantilla: "alquiler_banco" } });
    const p = t.pedido(parsear(t, { id: "t1", estado: "enviado", venceEl: null }));
    expect(p).toMatchObject({ metodo: "PATCH", ruta: "/api/admin/tramites/t1", cuerpo: { estado: "enviado", venceEl: null } });
    expect(Object.keys(p.cuerpo)).toEqual(["estado", "venceEl"]);
  });
  it("tramite_admin_requisitos y alquiler_pago apuntan a su ruta; el pago pide OK con el monto como clave", () => {
    const r = por("tramite_admin_requisitos");
    expect(r.pedido(parsear(r, { id: "t1", cambiar: [{ id: "r1", estado: "hay" }] }))).toMatchObject({ metodo: "PATCH", ruta: "/api/admin/tramites/t1/requisitos", cuerpo: { cambiar: [{ id: "r1", estado: "hay" }] } });
    const pg = por("alquiler_pago");
    const a = parsear(pg, { id: "a1", periodo: "2026-11", monto: 1500, pagadoEl: "2026-11-05", medio: "transferencia" });
    expect(pg.pedido(a)).toMatchObject({ metodo: "POST", ruta: "/api/admin/alquileres/a1/pagos" });
    expect(pg.tipo).toBe("confirmar");
    const v = sanearVentana(pg.ventana(a, { nombre: "Local Constitución", moneda: "PEN", rentaMensual: 1500 }));
    expect(v.clave.valor).toMatch(/1\.500,00/);
    expect(z.object(pg.entrada).safeParse({ ...a, periodo: "2026-13" }).success).toBe(false);
  });
  it("alquiler_guardar es confirmar y con id no manda claves ausentes", () => {
    const g = por("alquiler_guardar");
    expect(g.tipo).toBe("confirmar");
    const p = g.pedido(parsear(g, { id: "a1", cuentaCci: "00212345678901234567" }));
    expect(p).toMatchObject({ metodo: "PATCH", ruta: "/api/admin/alquileres/a1", cuerpo: { cuentaCci: "00212345678901234567" } });
    expect(Object.keys(p.cuerpo)).toEqual(["cuentaCci"]);
  });
  it("leer_get permite /api/admin/tramites y /alquileres", () => {
    expect(rutaLecturaPermitida("/api/admin/tramites").ok).toBe(true);
    expect(rutaLecturaPermitida("/api/admin/alquileres/abc").ok).toBe(true);
  });
});

describe("administración · revisión de seguridad", () => {
  const g = adm.find((d) => d.nombre === "alquiler_guardar");
  const pg = adm.find((d) => d.nombre === "alquiler_pago");
  it("cambio de CCI sin renta: la clave son los últimos 4 dígitos; con renta, gana la renta y el resumen trae la CCI completa", () => {
    const sola = parsear(g, { id: "a1", cuentaCci: "00212345678901234567" });
    const v = sanearVentana(g.ventana(sola, { nombre: "Local", moneda: "PEN" }));
    expect(v.clave.valor).toBe("…4567");
    expect(v.clave.senuelos).not.toContain("…4567");
    const con = parsear(g, { id: "a1", cuentaCci: "00212345678901234567", rentaMensual: 1500 });
    expect(sanearVentana(g.ventana(con, { nombre: "Local", moneda: "PEN" })).clave.valor).toMatch(/1\.500,00/);
    expect(g.resumen(con, { nombre: "Local", moneda: "PEN" })).toContain("00212345678901234567");
  });
  it("si la lectura previa falla no asume PEN: no se propone", async () => {
    const falla = async () => ({ ok: false, status: 500 });
    const casos = [[g, { id: "a1", rentaMensual: 1500 }], [pg, { id: "a1", periodo: "2026-11", monto: 1500, pagadoEl: "2026-11-05", medio: "yape" }]];
    for (const [def, args] of casos) {
      const a = parsear(def, args);
      const previa = await def.previa(a, falla);
      expect([].concat(def.pedido(a, previa))).toHaveLength(0);
      expect(def.resumen(a, previa)).toMatch(/moneda sin confirmar/);
    }
  });
});
