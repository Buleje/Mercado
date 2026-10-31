/**
 * ADR-457 · la barrera de la guía contra los vectores de la auditoría de
 * seguridad del 01-10. La regla es «la pieza sólo AGREGA; las 3 copias
 * oficiales siguen visibles»:
 *
 * · cada vector deja la guía EXACTAMENTE como sin la pieza (3 copias, el CSS
 *   oficial y nada más) y se avisa a Sentry;
 * · la hoja buena va en un contenedor que la recorta (`contain:paint` +
 *   `overflow:clip`, en línea y `!important`): aunque algo pasara la revisión,
 *   no puede taparle nada a las copias.
 *
 * Cada vector fallaba con la barrera anterior (llaves contadas a mano y regex
 * sobre el HTML); el mutante que vuelve a esa versión pone este archivo en rojo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";
import type { EntradaCliente, PiezaAsignada } from "@/extensiones/_contrato";

const H = vi.hoisted(() => ({
  piezas: [] as { piezaId: string }[],
  agregado: {} as unknown,
}));

vi.mock("@/hooks/use-enabled-specs", () => ({
  piezasDelNegocio: async () => ({
    negocio: H.piezas.length ? { tenantId: "main", slug: "main" } : null,
    piezas: H.piezas.map((p) => ({ ...p, enchufe: "forestal.guia-impresa", opciones: {}, version: "1.0.0", orden: 0 })),
  }),
}));

// Una pieza «eco» devuelve lo que el test le pone en H.agregado.
vi.mock("@/extensiones/registro.cliente", async (real) => {
  const { z } = await import("zod");
  const reales = (await real<typeof import("@/extensiones/registro.cliente")>()).PIEZAS_CLIENTE;
  return {
    PIEZAS_CLIENTE: {
      ...reales,
      "pieza-eco": {
        manifiesto: {
          id: "pieza-eco",
          nombre: "eco",
          descripcion: "eco",
          version: "1.0.0",
          enchufes: ["forestal.guia-impresa"] as const,
          opciones: z.object({}).strict(),
        },
        guia: async () => ({ agregar: () => H.agregado as never }),
      },
    } satisfies Record<string, EntradaCliente>,
  };
});

import { aplicarPiezasGuia, cssEncerrado, ESTILO_CONTENEDOR, hojaSana } from "@/lib/extensiones/guia-impresa";

const COPIAS = ['<div class="gs-tira">ORIGINAL</div>', '<div class="gs-tira">COPIA 1</div>', '<div class="gs-tira">COPIA 2</div>'];
const docBase = () => ({ cuerpos: [...COPIAS], css: ".gs-tira{display:flex}", titulo: "GTF X", pieCorrido: "GTF X · pie" });
const entrada = {
  numeroGtf: "X",
  emitida: { fecha: "1 de octubre de 2026", hora: "10:00" },
  despacho: {
    id: "d1", lineNo: 1, entryDate: "2026-10-01", productType: null, speciesCommon: "Tornillo", speciesScientific: null,
    cites: false, quantity: "1", unitLabel: "m³", pieces: 1, gtfNumber: "X", destino: null,
  },
  ficha: { nombreCtp: "", razonSocial: "", ruc: "", codigoCtp: "" },
  datos: {} as never,
  lineas: [],
  guiasDeIngreso: [],
};

const conEco = async (agregado: unknown) => {
  H.piezas = [{ piezaId: "pieza-eco" } satisfies Pick<PiezaAsignada, "piezaId">];
  H.agregado = agregado;
  return aplicarPiezasGuia(docBase(), entrada);
};

beforeEach(() => {
  vi.clearAllMocks();
  H.piezas = [];
});

describe("vectores de la auditoría: la guía sale como sin la pieza", () => {
  it.each([
    // P2 · una `{` dentro de un texto CSS rompía el conteo de llaves y el
    // resto del CSS quedaba FUERA del @scope: ocultaba las 3 copias.
    ["llave dentro de un texto CSS", { hojasExtra: ["<p>x</p>"], cssExtra: 'a{content:"{"}} .doc-parte, .gs-tira{display:none}' }],
    // P2 · sin escaparse del scope, el contenedor fijo tapaba la página entera.
    ["`:scope{position:fixed}`", { hojasExtra: ["<p>x</p>"], cssExtra: ":scope{position:fixed;inset:0;background:white}" }],
    ["position con escape CSS (`pos\\69tion`)", { hojasExtra: ["<p>x</p>"], cssExtra: ".x{pos\\69tion:fixed}" }],
    ["transform", { hojasExtra: ["<p>x</p>"], cssExtra: ".x{transform:translateY(-300mm)}" }],
    ["z-index", { hojasExtra: ["<p>x</p>"], cssExtra: ".x{z-index:9999}" }],
    ["margen negativo", { hojasExtra: ["<p>x</p>"], cssExtra: ".x{margin-top:-300mm}" }],
    ["top negativo con calc", { hojasExtra: ["<p>x</p>"], cssExtra: ".x{top:calc(0px - 300mm)}" }],
    ["display sobre el documento", { hojasExtra: ["<p>x</p>"], cssExtra: "body .gs-tira{display:none}" }],
    ["selector :root", { hojasExtra: ["<p>x</p>"], cssExtra: ":root{--tinta:white}" }],
    ["@import", { hojasExtra: ["<p>x</p>"], cssExtra: '@import "https://evil.example/x.css";' }],
    ["@layer (para ganarle a los !important)", { hojasExtra: ["<p>x</p>"], cssExtra: "@layer a{.x{color:red}}" }],
    ["url() externo", { hojasExtra: ["<p>x</p>"], cssExtra: ".x{background:url(https://evil.example/p.png)}" }],
    ["image-set externo", { hojasExtra: ["<p>x</p>"], cssExtra: '.x{background:image-set("https://evil.example/p.png" 1x)}' }],
    ["CSS que no parsea", { hojasExtra: ["<p>x</p>"], cssExtra: ".x{color:red" }],
    ["`</style>` dentro de un texto CSS", { hojasExtra: ["<p>x</p>"], cssExtra: '.x::after{content:"</style><script>alert(1)</script>"}' }],
    // P2 · un `style=` en la hoja tapaba las copias.
    ["`style=` en la hoja", { hojasExtra: ['<div style="position:fixed;inset:0;background:white">x</div>'] }],
    // P3 · el regex dejaba pasar `/onerror` y la entidad `&#106;`.
    ["`<img src=x/onerror>`", { hojasExtra: ['<img src="x"/onerror=alert(1)>'] }],
    ["`&#106;avascript:` en un enlace", { hojasExtra: ['<a href="&#106;avascript:alert(1)">x</a>'] }],
    ["<script>", { hojasExtra: ["<p>hola</p><script>alert(1)</script>"] }],
    ["<style> en la hoja", { hojasExtra: ["<style>.gs-tira{display:none}</style><p>x</p>"] }],
    ["<iframe>", { hojasExtra: ['<iframe src="https://evil.example"></iframe>'] }],
    ["imagen externa (se carga al imprimir)", { hojasExtra: ['<img src="https://evil.example/pixel.png" alt="">'] }],
    ["svg (puede traer script)", { hojasExtra: ["<svg><script>alert(1)</script></svg>"] }],
    // DOMPurify antepone su propio `<remove>` (FORCE_BODY): uno de la pieza no se confunde con ése.
    ["un `<remove>` propio al principio", { hojasExtra: ['<remove></remove><p style="position:fixed">x</p>'] }],
  ])("%s → rechazada", async (_nombre, agregado) => {
    const r = await conEco(agregado);
    expect(r).toEqual(docBase());
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});

describe("la hoja buena: se agrega recortada a su caja", () => {
  it("contenedor con contain:paint + overflow:clip + position:relative, en línea y !important", async () => {
    const r = await conEco({ hojasExtra: ['<p class="x">hola <b>mundo</b></p>'], cssExtra: ".x{font-size:9pt;margin:0 0 2mm}" });
    expect(r.cuerpos).toHaveLength(4);
    expect(r.cuerpos.slice(0, 3)).toEqual(COPIAS);
    const hoja = r.cuerpos[3];
    expect(hoja).toContain('class="pz-hoja pz-pieza-eco"');
    for (const d of ["contain:paint !important", "overflow:clip !important", "position:relative !important", "isolation:isolate !important", "margin:0 !important", "transform:none !important"]) {
      expect(ESTILO_CONTENEDOR).toContain(d);
      expect(hoja).toContain(d);
    }
    expect(hoja).toContain('<p class="x">hola <b>mundo</b></p>');
    // El CSS oficial queda primero e intacto; el de la pieza, encerrado.
    expect(r.css.startsWith(".gs-tira{display:flex}")).toBe(true);
    expect(r.css).toContain("@scope (.pz-pieza-eco) {");
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("imagen embebida (data:image) y texto CSS con escapes dentro de comillas sí pasan", async () => {
    const r = await conEco({
      hojasExtra: ['<img src="data:image/png;base64,iVBORw0KGgo=" alt="logo">'],
      cssExtra: '.x::before{content:"\\201C"} @media print{.x{color:black}}',
    });
    expect(r.cuerpos).toHaveLength(4);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("sin DOM no se revisa nada: se rechaza (nunca pasa sin sanitizar)", async () => {
    await expect(hojaSana("<p>x</p>", null)).rejects.toThrow(/Sin DOM/);
  });

  it("el CSS se re-escribe desde el árbol del parser (no se copia el texto crudo)", async () => {
    const css = await cssEncerrado(".x { color : red } /* nota */", "p");
    expect(css).not.toContain("nota");
    expect(css.trim().endsWith("}")).toBe(true);
  });
});
