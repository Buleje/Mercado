/**
 * ADR-457 · enchufe `forestal.guia-impresa`. La GTF es lo que se declara ante
 * SERFOR: con o sin piezas, las tres copias oficiales salen IDÉNTICAS; una
 * pieza sólo agrega hojas DESPUÉS, CSS encerrado en `@scope` y pie en texto.
 * Si la pieza falla, tarda o trae HTML/CSS que podría escaparse, la guía sale
 * como siempre y se avisa a Sentry.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";
import type { EntradaCliente, PiezaAsignada } from "@/extensiones/_contrato";

const H = vi.hoisted(() => ({
  piezas: [] as PiezaAsignada[],
  negocio: { tenantId: "main", slug: "main" } as { tenantId: string; slug: string } | null,
}));

vi.mock("@/hooks/use-enabled-specs", () => ({
  piezasDelNegocio: async (enchufe?: string) => ({
    negocio: H.piezas.length ? H.negocio : null,
    piezas: H.piezas.filter((p) => !enchufe || p.enchufe === enchufe),
  }),
}));
vi.mock("qrcode", () => ({ default: { toDataURL: async () => "data:image/png;base64,QR" } }));

// Al registro real se le suman piezas «malas» para probar las barreras.
vi.mock("@/extensiones/registro.cliente", async (real) => {
  const { z } = await import("zod");
  const reales = (await real<typeof import("@/extensiones/registro.cliente")>()).PIEZAS_CLIENTE;
  const manifiesto = (id: string) => ({
    id,
    nombre: id,
    descripcion: id,
    version: "1.0.0",
    enchufes: ["forestal.guia-impresa"] as const,
    opciones: z.object({}).strict(),
  });
  const conAgregado = (id: string, agregado: unknown): EntradaCliente => ({
    manifiesto: manifiesto(id),
    guia: async () => ({ agregar: () => agregado as never }),
  });
  return {
    PIEZAS_CLIENTE: {
      ...reales,
      "pieza-tira": { manifiesto: manifiesto("pieza-tira"), guia: async () => ({ agregar: () => { throw new Error("boom"); } }) },
      "pieza-script": conAgregado("pieza-script", { hojasExtra: ["<p>hola</p><script>alert(1)</script>"] }),
      "pieza-onerror": conAgregado("pieza-onerror", { hojasExtra: ['<img src="x" onerror="alert(1)">'] }),
      "pieza-css-escapa": conAgregado("pieza-css-escapa", { hojasExtra: ["<p>x</p>"], cssExtra: "} .gs-tira { display:none } .x {" }),
      "pieza-css-style": conAgregado("pieza-css-style", { cssExtra: "</style><script>alert(1)</script>" }),
      "pieza-lenta": { manifiesto: manifiesto("pieza-lenta"), guia: () => new Promise<never>(() => {}) },
      "pieza-pie": conAgregado("pieza-pie", { pieExtra: "  Control   interno  " }),
    } satisfies Record<string, EntradaCliente>,
  };
});

import { aplicarPiezasGuia, cssEncerrado } from "@/lib/extensiones/guia-impresa";
import { documentoGtfSalida, type GtfDespacho } from "@/lib/forestal/ctp-gtf-print";
import { faltantesGtf, leerGtfDatos } from "@/lib/forestal/ctp-gtf-datos";

const asignada = (piezaId: string, opciones: Record<string, unknown> = {}): PiezaAsignada => ({
  piezaId,
  enchufe: "forestal.guia-impresa",
  opciones,
  version: "1.0.0",
  orden: 0,
});

const despacho: GtfDespacho = {
  id: "desp-1",
  lineNo: 63,
  entryDate: "2026-08-08",
  productType: "Madera aserrada",
  speciesCommon: "Tornillo",
  speciesScientific: "Cedrelinga cateniformis",
  cites: false,
  quantity: "12.345",
  unitLabel: "m³",
  pieces: 140,
  gtfNumber: "QA-LOTE-SALIDA-5",
  destino: "Lima",
};

const datos = leerGtfDatos({
  propietario: { nombre: "Aserradero QA", esElCtp: true },
  destinatario: { nombre: '<img src=x onerror="alert(1)">Maderas Lima', direccion: "Av. Argentina 123" },
  transportista: { nombre: "Transportes Selva" },
  vehiculo: { placa: "ABC-123", conductor: "Juan Pérez", licencia: "Q12345678" },
  traslado: { puntoPartida: "Pucallpa", puntoLlegada: "Lima", fechaInicio: "2026-08-08", fechaFin: "2026-08-12" },
  titulos: ["25-UCA/C-OPP-A-001-18"],
});

const ficha = { nombreCtp: "CTP QA", razonSocial: "Aserradero QA SAC", ruc: "20123456789" };
const cadena = { corridas: [{ lineNo: 40, quantity: 12.345, guias: ["019-001-000123", "019-001-000124"] }] };

const docBase = () => ({ cuerpos: ["A", "B", "C"], css: ".oficial{}", titulo: "GTF X", pieCorrido: "GTF X · pie" });
const entradaBase = {
  numeroGtf: "X",
  emitida: { fecha: "1 de octubre de 2026", hora: "10:00" },
  despacho,
  ficha: { nombreCtp: "CTP QA", razonSocial: "", ruc: "", codigoCtp: "" },
  datos,
  lineas: [],
  guiasDeIngreso: ["019-001-000123"],
};

beforeEach(() => {
  vi.clearAllMocks();
  H.piezas = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T15:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("documentoGtfSalida con el enchufe", () => {
  it("los datos de prueba arman una guía completa (si no, el test no prueba nada)", () => {
    expect(faltantesGtf(datos)).toEqual([]);
  });

  it("sin piezas: 3 copias, como siempre", async () => {
    const d = await documentoGtfSalida(despacho, ficha, cadena, datos);
    expect(d.cuerpos).toHaveLength(3);
    expect(d.css).not.toContain("@scope");
  });

  it("con la hoja de control: las 3 copias oficiales IDÉNTICAS + una 4ª hoja interna", async () => {
    const sin = await documentoGtfSalida(despacho, ficha, cadena, datos);
    H.piezas = [asignada("gtf-hoja-de-control", { nota: "Avisar <b>al dueño</b>" })];
    const con = await documentoGtfSalida(despacho, ficha, cadena, datos);

    expect(con.cuerpos).toHaveLength(4);
    expect(con.cuerpos.slice(0, 3)).toEqual(sin.cuerpos);
    expect(con.titulo).toBe(sin.titulo);
    expect(con.pieCorrido).toBe(sin.pieCorrido);
    expect(con.css.startsWith(sin.css)).toBe(true);
    expect(con.css).toContain("@scope (.pz-gtf-hoja-de-control)");

    const hoja = con.cuerpos[3];
    expect(hoja).toContain('class="pz-hoja pz-gtf-hoja-de-control"');
    expect(hoja).toContain("Uso interno");
    expect(hoja).toContain("QA-LOTE-SALIDA-5");
    expect(hoja).toContain("ABC-123");
    // La cantidad, escrita igual que en la copia oficial (fmtM3), no con otro formato.
    expect(sin.cuerpos[0]).toContain("12.345");
    expect(hoja).toContain("12.345 m³");
    expect(hoja).toContain("019-001-000123 · 019-001-000124");
    expect(hoja).toContain("Encargado del patio");
    // Todo texto de datos u opciones va escapado.
    // (DOMPurify re-serializa el texto: las comillas de un nodo de texto no se escapan.)
    expect(hoja).toContain('&lt;img src=x onerror="alert(1)"&gt;Maderas Lima');
    expect(hoja).not.toContain("<img src=x");
    expect(hoja).toContain("Avisar &lt;b&gt;al dueño&lt;/b&gt;");
  });

  it("mostrarOrigen=false no imprime las guías de ingreso", async () => {
    H.piezas = [asignada("gtf-hoja-de-control", { mostrarOrigen: false })];
    const con = await documentoGtfSalida(despacho, ficha, cadena, datos);
    expect(con.cuerpos[3]).not.toContain("019-001-000124");
  });
});

describe("las barreras del enchufe", () => {
  it("opciones que no pasan el Zod de la pieza → no se imprime y se avisa", async () => {
    H.piezas = [asignada("gtf-hoja-de-control", { firmas: [] })];
    const doc = docBase();
    expect(await aplicarPiezasGuia(doc, entradaBase)).toEqual(docBase());
    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it.each([
    ["pieza-tira", "una pieza que tira"],
    ["pieza-script", "una hoja con <script>"],
    ["pieza-onerror", "una hoja con on*="],
    ["pieza-css-escapa", "CSS que cierra el @scope antes de tiempo"],
    ["pieza-css-style", "CSS que intenta cerrar el <style>"],
    ["pieza-que-no-existe", "una pieza que el navegador no conoce"],
  ])("%s (%s) → la guía sale como siempre", async (id) => {
    H.piezas = [asignada(id)];
    expect(await aplicarPiezasGuia(docBase(), entradaBase)).toEqual(docBase());
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("una pieza mala no se lleva a las buenas", async () => {
    H.piezas = [asignada("pieza-tira"), asignada("gtf-hoja-de-control")];
    const r = await aplicarPiezasGuia(docBase(), entradaBase);
    expect(r.cuerpos).toHaveLength(4);
    expect(r.cuerpos.slice(0, 3)).toEqual(["A", "B", "C"]);
  });

  it("el pie extra es texto plano compactado al final del pie corrido", async () => {
    H.piezas = [asignada("pieza-pie")];
    const r = await aplicarPiezasGuia(docBase(), entradaBase);
    expect(r.pieCorrido).toBe("GTF X · pie · Control interno");
    expect(r.cuerpos).toEqual(["A", "B", "C"]);
  });

  it("una pieza que tarda más de 2 s → la guía sale como siempre", async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    H.piezas = [asignada("pieza-lenta")];
    const p = aplicarPiezasGuia(docBase(), entradaBase);
    await vi.advanceTimersByTimeAsync(2001);
    expect(await p).toEqual(docBase());
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("la pieza recibe una copia congelada", async () => {
    H.piezas = [asignada("gtf-hoja-de-control")];
    const entrada = structuredClone(entradaBase);
    await aplicarPiezasGuia(docBase(), entrada);
    expect(Object.isFrozen(entrada)).toBe(false);
  });
});

describe("cssEncerrado", () => {
  it("encierra en @scope y quita comentarios", async () => {
    const css = await cssEncerrado(".a{color:red} /* } */", "mi-pieza");
    expect(css).toContain("@scope (.pz-mi-pieza) {");
    expect(css).not.toContain("/*");
  });
  it.each(["} body{display:none}", ".a{", "@import url(x.css);", "a<b{}"])("rechaza %s", async (css) => {
    await expect(cssEncerrado(css, "p")).rejects.toThrow();
  });
});
