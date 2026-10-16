// @vitest-environment node
/**
 * La guía para el talonario SIN navegador (16-10): perfiles de impresora,
 * PDF a la medida exacta y ESC/P directo para la Epson del monte.
 *
 * Lo que se prueba es lo que importa en el papel: cada valor cae a ±0,5 mm de
 * donde lo puso la pantalla (el HTML de la matricial), con el perfil aplicado;
 * y los bytes ESC/P son los del manual de Epson, redondeados sin arrastrar error.
 */
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PDFDocument, PrintScaling } from "pdf-lib";
import fichasJson from "./forestal-loth-importar-guia.fichas-blas.json";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import { gtfDatosConFicha } from "@/lib/forestal/loth-importar-guia";
import { CATALOGO, hojaDeFabrica, mmPorCaracter, type DisposicionHoja } from "@/lib/forestal/gtf-matricial-disposicion";
import { INTERLINEA } from "@/lib/forestal/gtf-matricial-edicion";
import {
  agregarPerfil,
  borrarPerfil,
  buscarPerfil,
  cambiarPerfil,
  listaPerfiles,
  normalizarPerfiles,
  perfilesDeFabrica,
  PERFIL_MONTE_ID,
  PERFIL_OFICINA_ID,
  transformacionDe,
} from "@/lib/forestal/gtf-matricial-perfiles";
import { almacenVacio, normalizarAlmacen } from "@/lib/forestal/gtf-matricial-titulares";
import { entradasDeLaGuia, paginasGuia, paginasLista } from "@/lib/forestal/gtf-matricial-valores";
import { codificarTexto, escpTalonario, largoDePagina, pasoPara, renglonesPruebaEscp } from "@/lib/forestal/gtf-salida-escp";
import { BASE_EM, partirRenglones, renglonesDeLaPagina, xInicio, type RenglonSalida } from "@/lib/forestal/gtf-salida-geometria";
import { pdfPrueba, pdfTalonario, PT_POR_MM, sanearParaFuente } from "@/lib/forestal/gtf-salida-pdf";
import type { LothGtfDoc } from "@/lib/forestal/loth-gtf-oficial";

const FICHA = (fichasJson as unknown as Record<string, GtfSerfor>)["1-10-0473187"];
const DATOS = JSON.parse(JSON.stringify(gtfDatosConFicha(FICHA, true))) as unknown;
const trozas = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ code: `T-${i + 1}`, species: i % 3 ? "Cumala" : "Tornillo", diamMayorM: 0.6, diamMenorM: 0.5, lengthM: 4, volumeM3: 0.95 }));
const doc = (): LothGtfDoc => ({
  gtfNumber: "019-001-0000482", gtfDate: "2026-09-02", tipo: "trozas", titularName: "PEREZ MUÑOZ JUAN CARLOS",
  tituloHabilitante: null, parcelaCorta: null, transportista: null, transportistaDoc: null, conductor: null,
  conductorLicencia: null, placaVehiculo: null, origen: null, destino: null, observations: null, status: "emitida",
  annulledReason: null, volumenTotalM3: null, items: trozas(27), gtfDatos: DATOS,
});
const ACT = { en: "2026-10-16T12:00:00.000Z", por: "qa" };
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

/** Los textos del PDF con su punto de inserción (Tm) en mm desde ARRIBA a la izquierda. */
async function textosDelPdf(bytes: Uint8Array): Promise<{ texto: string; xMm: number; baseMm: number; pagina: number }[]> {
  const pdf = await PDFDocument.load(bytes);
  const crudo = Buffer.from(bytes).toString("latin1");
  const out: { texto: string; xMm: number; baseMm: number; pagina: number }[] = [];
  const altos = pdf.getPages().map((p) => p.getHeight());
  let pagina = 0;
  for (const m of crudo.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    let s: string;
    try {
      s = inflateSync(Buffer.from(m[1], "latin1")).toString("latin1");
    } catch {
      continue;
    }
    if (!/\bBT\b/.test(s)) continue;
    for (const t of s.matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) Tm\s*<([0-9A-Fa-f]*)> Tj/g)) {
      const texto = Buffer.from(t[7], "hex").toString("latin1");
      out.push({ texto, xMm: Number(t[5]) / PT_POR_MM, baseMm: (altos[pagina] - Number(t[6])) / PT_POR_MM, pagina });
    }
    pagina++;
  }
  return out;
}

describe("perfiles de impresora", () => {
  it("sin nada guardado: Oficina + Monte de fábrica; lo guardado antes (v1 y v2 sin perfiles) también", () => {
    expect(Object.keys(normalizarPerfiles(undefined))).toEqual([PERFIL_OFICINA_ID, PERFIL_MONTE_ID]);
    expect(Object.keys(almacenVacio().perfiles)).toEqual([PERFIL_OFICINA_ID, PERFIL_MONTE_ID]);
    const v1 = normalizarAlmacen({ guia: hojaDeFabrica("guia"), lista: hojaDeFabrica("lista") });
    expect(v1.empresa).not.toBeNull();
    expect(listaPerfiles(v1.perfiles).map((p) => p.id)).toEqual(["oficina", "monte"]);
    const v2 = normalizarAlmacen({ version: 2, empresa: null, porTitular: {} });
    expect(listaPerfiles(v2.perfiles).map((p) => p.nombre)).toEqual(["Oficina", "Monte"]);
  });

  it("lo guardado se acota; Oficina no lleva corrimiento propio; ids raros (__proto__) no entran", () => {
    const raw = JSON.parse(
      '{"__proto__":{"nombre":"x"},"oficina":{"nombre":"Oficina","corrimientoXmm":7,"escalaX":1.02},' +
        '"monte":{"nombre":"Monte","corrimientoXmm":80,"corrimientoYmm":-1.234,"escalaY":3},"Mal Id":{"nombre":"y"}}',
    ) as unknown;
    const p = normalizarPerfiles(raw);
    expect(Object.keys(p).sort()).toEqual(["monte", "oficina"]);
    expect(p.oficina).toMatchObject({ corrimientoXmm: 0, escalaX: 1.02 });
    expect(p.monte).toMatchObject({ corrimientoXmm: 50, corrimientoYmm: -1.23, escalaY: 1.1 });
    expect(buscarPerfil(p, "constructor")).toBeNull();
    expect(buscarPerfil(p, "toString")).toBeNull();
  });

  it("agregar, renombrar, calibrar y borrar; Oficina no se borra ni toma corrimiento; nombres sin repetir", () => {
    const a = agregarPerfil(perfilesDeFabrica(), { nombre: "Monte – Epson LX-350", corrimientoXmm: 2.345 }, ACT);
    expect(a.ok && a.perfil).toMatchObject({ id: "monte-epson-lx-350", corrimientoXmm: 2.35, escalaX: 1 });
    if (!a.ok) throw new Error("alta");
    expect(agregarPerfil(a.perfiles, { nombre: "  monte " }, ACT)).toEqual({ ok: false, error: "repetido" });
    const ren = cambiarPerfil(a.perfiles, { id: "monte", nombre: "Monte viejo", escalaY: 1.01 }, ACT);
    expect(ren.ok && ren.perfil).toMatchObject({ nombre: "Monte viejo", escalaY: 1.01 });
    expect(cambiarPerfil(a.perfiles, { id: "oficina", corrimientoXmm: 3 }, ACT)).toEqual({ ok: false, error: "oficina" });
    expect(cambiarPerfil(a.perfiles, { id: "oficina", nombre: "Oficina Pucallpa" }, ACT).ok).toBe(true);
    expect(cambiarPerfil(a.perfiles, { id: "nada" }, ACT)).toEqual({ ok: false, error: "no-existe" });
    expect(borrarPerfil(a.perfiles, "oficina")).toEqual({ ok: false, error: "oficina" });
    const b = borrarPerfil(a.perfiles, "monte");
    expect(b.ok && Object.keys(b.perfiles).sort()).toEqual(["monte-epson-lx-350", "oficina"]);
  });

  it("Oficina usa el X/Y de la hoja; otra impresora, el suyo EN LUGAR del de la hoja", () => {
    const hoja = { offsetXMm: 1.5, offsetYMm: -2 };
    const p = perfilesDeFabrica();
    expect(transformacionDe(hoja, p.oficina)).toMatchObject({ dx: 1.5, dy: -2, sx: 1, sy: 1 });
    const monte = { ...p.monte, corrimientoXmm: 3, corrimientoYmm: 4, escalaX: 1.01 };
    expect(transformacionDe(hoja, monte)).toMatchObject({ dx: 3, dy: 4, sx: 1.01, sy: 1, perfil: { id: "monte", nombre: "Monte" } });
  });
});

describe("geometría compartida", () => {
  it("parte como pre-wrap: en el espacio, y la palabra que no entra donde caiga", () => {
    expect(partirRenglones("JUAN CARLOS PEREZ", 11)).toEqual(["JUAN CARLOS", "PEREZ"]);
    expect(partirRenglones("ABCDEFGHIJ", 4)).toEqual(["ABCD", "EFGH", "IJ"]);
  });
  it("alinea con el ancho de letra de quien imprime; lo que no entra, al inicio", () => {
    const r: RenglonSalida = { texto: "AB", letraPt: 10, alinea: "der", izqMm: 50, derMm: 70, arribaMm: 0, baseMm: 3 };
    expect(xInicio(r, 2)).toBe(66);
    expect(xInicio({ ...r, alinea: "centro" }, 2)).toBe(58);
    expect(xInicio({ ...r, texto: "X".repeat(30) }, 2)).toBe(50);
  });
});

describe("PDF exacto", () => {
  const e = entradasDeLaGuia(doc(), null);
  const hoja: DisposicionHoja = { ...hojaDeFabrica("guia"), offsetXMm: 1.5, offsetYMm: -1 };
  const [pg] = paginasGuia(e, hoja);

  it("la página mide el talonario, el título lo dice y el visor no lo escala", async () => {
    const t = transformacionDe(hoja, perfilesDeFabrica().oficina);
    const bytes = await pdfTalonario(hoja, [renglonesDeLaPagina(hoja, CATALOGO.guia, pg, t)], "GTF 019-001-0000482 — imprimir a tamaño real");
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    const [page] = pdf.getPages();
    expect(page.getWidth() / PT_POR_MM).toBeCloseTo(hoja.anchoMm, 2);
    expect(page.getHeight() / PT_POR_MM).toBeCloseTo(hoja.altoMm, 2);
    expect(pdf.getTitle()).toBe("GTF 019-001-0000482 — imprimir a tamaño real");
    expect(pdf.catalog.getViewerPreferences()?.getPrintScaling()).toBe(PrintScaling.None);
  });

  it("cada valor cae a ±0,5 mm de donde lo pone la pantalla, con Oficina (X/Y de la hoja) y con Monte (corrimiento + escala)", async () => {
    const monte = { ...perfilesDeFabrica().monte, corrimientoXmm: 3, corrimientoYmm: 2, escalaX: 1.01, escalaY: 0.99 };
    for (const [perfil, X, Y] of [
      [perfilesDeFabrica().oficina, (x: number) => x + 1.5, (y: number) => y - 1],
      [monte, (x: number) => x * 1.01 + 3, (y: number) => y * 0.99 + 2],
    ] as const) {
      const t = transformacionDe(hoja, perfil);
      const textos = await textosDelPdf(await pdfTalonario(hoja, [renglonesDeLaPagina(hoja, CATALOGO.guia, pg, t)], "x"));
      // (7) titular: caja izquierda; la base es la del navegador (Courier New, interlineado 1,15).
      const pos = hoja.campos["7"];
      const titular = textos.find((s) => s.texto === "PEREZ MUÑOZ JUAN CARLOS");
      expect(titular, perfil.id).toBeDefined();
      const baseNavegador = pos.y + (pos.letraPt * 25.4) / 72 * ((INTERLINEA - 2320 / 2048) / 2 + 1705 / 2048);
      expect(Math.abs((titular?.xMm ?? 0) - X(pos.x)), perfil.id).toBeLessThanOrEqual(0.5);
      expect(Math.abs((titular?.baseMm ?? 0) - Y(baseNavegador)), perfil.id).toBeLessThanOrEqual(0.5);
      // Cada texto del PDF es un renglón de la geometría, en su X/base (sin nada de más).
      const renglones = renglonesDeLaPagina(hoja, CATALOGO.guia, pg, t);
      expect(textos).toHaveLength(renglones.length);
      renglones.forEach((r, i) => {
        expect(Math.abs(textos[i].xMm - xInicio(r, mmPorCaracter(r.letraPt)))).toBeLessThanOrEqual(0.5);
        expect(Math.abs(textos[i].baseMm - r.baseMm)).toBeLessThanOrEqual(0.5);
      });
    }
    expect(BASE_EM).toBeCloseTo(0.8411, 3);
  });

  it("la lista sigue en hojas siguientes; lo vacío no se imprime", async () => {
    const hl = hojaDeFabrica("lista");
    const paginas = paginasLista(entradasDeLaGuia({ ...doc(), items: trozas(70) }, null), hl);
    expect(paginas.length).toBeGreaterThan(1);
    const t = transformacionDe(hl, null);
    const bytes = await pdfTalonario(hl, paginas.map((p) => renglonesDeLaPagina(hl, CATALOGO.lista, p, t)), "x");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(paginas.length);
    const textos = await textosDelPdf(bytes);
    expect(textos.every((s) => s.texto.trim() !== "")).toBe(true);
    expect(textos.some((s) => s.pagina === 1)).toBe(true);
  });

  it("la prueba en PDF lleva la cruz a 10 mm y dice qué impresora y qué corrimiento", async () => {
    const t = transformacionDe(hoja, { ...perfilesDeFabrica().monte, corrimientoXmm: 2, escalaY: 1.004 });
    const textos = await textosDelPdf(await pdfPrueba(hoja, t, "Prueba"));
    // 100,4 %, no «1 × 1»: la escala se lee como se escribe en Calibrar.
    expect(textos.map((s) => s.texto).join(" ")).toMatch(/Impresora: Monte · corrimiento X 2 mm · Y 0 mm · escala X 100 % · Y 100,4 %/);
  });
});

describe("ESC/P directo (manual Epson escp2ref.pdf)", () => {
  it("el paso más angosto que no ensancha lo de pantalla (Courier 0,6 em)", () => {
    expect([12, 10, 8, 7, 6, 5].map((pt) => Math.round(pasoPara(pt).cpi * 100) / 100)).toEqual([10, 12, 15, 17.14, 20, 20]);
  });

  it("tildes y ñ en lo común a PC437/PC850; mayúsculas con tilde sin tilde; sin códigos de control", () => {
    expect(hex(Uint8Array.from(codificarTexto("áéíóúñÑüÜÉ°º¿¡")))).toBe("a082a1a2a3a4a5819a90f8a7a8ad");
    expect(String.fromCharCode(...codificarTexto("ÁÍÓÚ³\tx"))).toBe("AIOU3 x");
    expect(codificarTexto("A\u001b@B\u000c€")).toEqual([0x41, 0x40, 0x42, 0x3f]);
  });

  it("la tilde aparte (NFD, como llega pegada de un PDF) se une antes: «JOSÉ PEÑA», no «JOSE? PEN?A»", () => {
    const separado = "JOSE\u0301 PEN\u0303A";
    expect(codificarTexto(separado)).toEqual(codificarTexto("JOSÉ PEÑA"));
    expect(codificarTexto(separado)).not.toContain(0x3f);
    const latin1 = (cp: number) => cp >= 0x20 && cp <= 0xff;
    expect(sanearParaFuente(separado, latin1)).toBe("JOSÉ PEÑA");
  });

  it("largo de página: el más cercano al alto EXACTO (A4 en 9 agujas = 101 × 25 / 216″, 0,08 mm por hoja)", () => {
    expect(largoDePagina(297, 216)).toEqual({ s: 101, L: 25 });
    expect(largoDePagina(100, 216)).toEqual({ s: 170, L: 5 });
    for (const [alto, u] of [[297, 216], [297, 180], [279.4, 216], [140, 180], [215.9, 216]] as const) {
      const { s, L } = largoDePagina(alto, u);
      expect(s).toBeLessThanOrEqual(255);
      expect(L).toBeLessThanOrEqual(127);
      expect(Math.abs((s * L * 25.4) / u - alto), `${alto} mm en 1/${u}″`).toBeLessThan(0.2);
    }
  });

  it("snapshot: dos hojas, X absoluta en 1/60″, avance en 1/216″ partido en ≤255, recortes contados", () => {
    const pagina1: RenglonSalida[] = [
      { texto: "AB", letraPt: 10, alinea: "der", izqMm: 50, derMm: 70, arribaMm: 17, baseMm: 20 },
      { texto: "Ñandú 1°", letraPt: 12, alinea: "izq", izqMm: 10, derMm: 60, arribaMm: 10, baseMm: 13 },
    ];
    const pagina2: RenglonSalida[] = [
      { texto: "ABCDE", letraPt: 12, alinea: "izq", izqMm: 200, derMm: 230, arribaMm: 77, baseMm: 80 },
      { texto: "X", letraPt: 12, alinea: "izq", izqMm: 0, derMm: 10, arribaMm: 77, baseMm: 80 },
      { texto: "fuera", letraPt: 12, alinea: "izq", izqMm: 0, derMm: 10, arribaMm: 98, baseMm: 101 },
    ];
    const r = escpTalonario({ altoMm: 100 }, [pagina1, pagina2], 9);
    const esperado = [
      "1b40", "1b5200", "1b7401", "1b36", "1b5501", "1b33aa", "1b4305", "1b32", "1b45", "1b47",
      // hoja 1: Ñandú arriba (10,53 mm de cabezal = 90/216″), X 10 mm = 24/60″; AB a la derecha de 70 mm a 12 cpi.
      "1b4a5a", "1b5012", "1b241800", "a5616e64a32031f8", "1b4a3b", "1b4d12", "1b249b00", "4142", "0c",
      // hoja 2: 659/216″ = 255 + 255 + 149; «ABCDE» desde 200 mm sólo entra la A (8″ de carro).
      "1b4aff", "1b4aff", "1b4a95", "1b5012", "1b240000", "58", "1b24d801", "41", "0c",
    ].join("");
    expect(hex(r.bytes)).toBe(esperado);
    expect(r).toMatchObject({ paginas: 2, recortados: 2 });
  });

  it("el avance se calcula desde el tope de hoja: 40 renglones a 1/6″ no arrastran error de redondeo", () => {
    const renglones: RenglonSalida[] = Array.from({ length: 40 }, (_, i) => ({
      texto: "x", letraPt: 12, alinea: "izq", izqMm: 0, derMm: 10, arribaMm: 0, baseMm: 10 + i * 4.2333,
    }));
    const b = Array.from(escpTalonario({ altoMm: 297 }, [renglones], 24).bytes);
    let suma = 0;
    for (let i = 0; i < b.length - 2; i++) if (b[i] === 0x1b && b[i + 1] === 0x4a) suma += b[i + 2];
    const ultimo = 10 + 39 * 4.2333 - (18 / 180) * 25.4;
    expect(suma).toBe(Math.round((ultimo / 25.4) * 180));
  });

  it("la prueba ESC/P pone una + a 10 mm de cada borde y rotula el perfil", () => {
    const t = transformacionDe({ offsetXMm: 0, offsetYMm: 0 }, { ...perfilesDeFabrica().monte, corrimientoXmm: 1.5 });
    const r = renglonesPruebaEscp({ anchoMm: 210, altoMm: 297 }, t, 9);
    const cruces = r.filter((x) => x.texto === "+");
    expect(cruces).toHaveLength(5);
    const w = 25.4 / pasoPara(12).cpi;
    expect(xInicio(cruces[0], w) + w / 2).toBeCloseTo(11.5, 5);
    expect(r.some((x) => x.texto === "Impresora: Monte")).toBe(true);
    const bytes = escpTalonario({ altoMm: 297 }, [r], 9);
    expect(bytes.recortados).toBe(0);
  });
});
