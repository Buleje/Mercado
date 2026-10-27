/**
 * «Con formato» (27-10): la guía y su lista en hoja blanca, con el formato
 * dibujado y cada valor en su ranura de fábrica, con aire contra rótulos y rayas.
 */
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import fichasJson from "./forestal-loth-importar-guia.fichas-blas.json";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import { gtfDatosConFicha } from "@/lib/forestal/loth-importar-guia";
import { CATALOGO, hojaDeFabrica } from "@/lib/forestal/gtf-matricial-disposicion";
import { entradasDeLaGuia } from "@/lib/forestal/gtf-matricial-valores";
import { MARCA_COPIA, emisorDeLaGuia, hojasConFormato, htmlFormatoCompleto } from "@/lib/forestal/gtf-formato-completo";
import type { LothGtfDoc } from "@/lib/forestal/loth-gtf-oficial";

const FICHA = (fichasJson as unknown as Record<string, GtfSerfor>)["1-10-0473187"];
const DATOS = JSON.parse(JSON.stringify(gtfDatosConFicha(FICHA, true))) as unknown;
const trozas = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ code: `T-${i + 1}`, species: i % 3 ? "Cumala" : "Tornillo", diamMayorM: 0.6, diamMenorM: 0.5, lengthM: 4, volumeM3: 0.95 }));
const doc = (n: number): LothGtfDoc => ({
  gtfNumber: "019-001-0000482", gtfDate: "2026-09-02", tipo: "trozas", titularName: "PEREZ MUÑOZ JUAN CARLOS",
  tituloHabilitante: null, parcelaCorta: null, transportista: null, transportistaDoc: null, conductor: null,
  conductorLicencia: null, placaVehiculo: null, origen: null, destino: null, observations: null, status: "emitida",
  annulledReason: null, volumenTotalM3: null, items: trozas(n), gtfDatos: DATOS,
});

describe("gtf-formato-completo", () => {
  it("guía primero y todas las hojas de la lista (45 trozas de a 20 = 3); cada hoja con su formato", () => {
    const hojas = hojasConFormato(["guia", "lista"], entradasDeLaGuia(doc(45), null));
    expect(hojas.map((h) => (h.cat.nombre === CATALOGO.guia.nombre ? "guia" : "lista"))).toEqual(["guia", "lista", "lista", "lista"]);
    expect(hojas.every((h) => h.plantilla.trazos.length > 50)).toBe(true);
    const html = htmlFormatoCompleto(["guia", "lista"], entradasDeLaGuia(doc(45), null), "GTF prueba");
    const negro = htmlFormatoCompleto(["guia"], entradasDeLaGuia(doc(3), null), "GTF prueba", { tinta: "negro" });
    expect(html.match(/data-con-formato/g)).toHaveLength(4);
    expect(html).toContain("@page { size: 210mm 297mm; margin: 0; }");
    /* Celeste = la imprenta; negro = sin un solo celeste ni el rojo del folio. */
    expect(html).toContain("#16759f");
    expect(negro).not.toMatch(/#16759f|#c2272d|#8cc7de/);
  });

  it("el PDF: una página A4 por hoja, con el formato y los valores", async () => {
    const { PDFDocument } = await import("pdf-lib");
    const { pdfConFormato } = await import("@/lib/forestal/gtf-formato-completo-pdf");
    const { ESTILO_CON_FORMATO } = await import("@/lib/forestal/gtf-talonario-plantilla-svg");
    const hojas = hojasConFormato(["guia", "lista"], entradasDeLaGuia(doc(25), null));
    const bytes = await pdfConFormato(hojas, "GTF prueba", ESTILO_CON_FORMATO.negro);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(hojas.length);
    const { width, height } = pdf.getPage(0).getSize();
    expect([Math.round((width * 25.4) / 72), Math.round((height * 25.4) / 72)]).toEqual([210, 297]);
  });

  it("sin trozas: la lista no sale junto a la guía, pero sí pedida sola", () => {
    const e = entradasDeLaGuia(doc(0), null);
    expect(hojasConFormato(["guia", "lista"], e).map((h) => (h.cat.nombre === CATALOGO.guia.nombre ? "guia" : "lista"))).toEqual(["guia"]);
    expect(hojasConFormato(["lista"], e)).toHaveLength(1);
  });

  it("la lista lleva su N° en el folio, nunca el «000000» de fábrica", () => {
    const [lista] = hojasConFormato(["lista"], entradasDeLaGuia(doc(3), null));
    const folio = lista.plantilla.trazos.find((t) => t.t === "texto" && t.s.startsWith("Nº "));
    expect(folio && folio.t === "texto" && folio.s).not.toBe("Nº 000000");
  });

  it("aire: renglones a 1,2 mm del rótulo y celdas a 1 mm de sus rayas", () => {
    const [guia] = hojasConFormato(["guia"], entradasDeLaGuia(doc(3), null));
    const fab = hojaDeFabrica("guia");
    expect(guia.hoja.campos["7"].x - fab.campos["7"].x).toBeCloseTo(0.6, 5);
    expect(guia.hoja.campos["5:concesion"]).toEqual(fab.campos["5:concesion"]);
    const [a, b] = [fab.tabla.columnas["37c"], guia.hoja.tabla.columnas["37c"]];
    expect(b.x - a.x).toBeCloseTo(0.9, 5);
    expect(a.anchoMm - b.anchoMm).toBeCloseTo(1.8, 5);
    /* La lista: de 0,6 a 1 mm por lado. */
    const [lista] = hojasConFormato(["lista"], entradasDeLaGuia(doc(3), null));
    expect(lista.hoja.tabla.columnas.comun.x - hojaDeFabrica("lista").tabla.columnas.comun.x).toBeCloseTo(0.4, 5);
  });

  it("emisor: el Rep. Legal y su DNI en (38)/(39) de la guía y (14)/(15)/(16) de la lista; sin Rep. Legal, a mano", () => {
    const e = entradasDeLaGuia(doc(3), null);
    const conRep = { ...e, cuerpo: { ...e.cuerpo, ficha: { ...e.cuerpo.ficha, representante: "DAMIAN ESPINOZA SEBASTIAN", representanteDni: "45831805" } } } as typeof e;
    expect(emisorDeLaGuia(conRep)).toEqual({ nombre: "DAMIAN ESPINOZA SEBASTIAN", documento: "DNI 45831805", cargo: "Representante legal" });
    const [guia, lista] = hojasConFormato(["guia", "lista"], conRep);
    expect(guia.pagina.campos["emisor:nombre"]).toBe("DAMIAN ESPINOZA SEBASTIAN");
    expect(guia.pagina.campos["emisor:documento"]).toBe("DNI 45831805");
    expect(guia.hoja.campos["emisor:nombre"]).toMatchObject({ x: 137, anchoMm: 56, alinea: "centro", visible: true });
    expect(lista.pagina.campos["emisor:cargo"]).toBe("Representante legal");
    expect(htmlFormatoCompleto(["guia"], conRep, "x")).toContain("DAMIAN ESPINOZA SEBASTIAN");
    /* Apagado, o sin representante: no se inventa. */
    expect(hojasConFormato(["guia"], conRep, { emisor: false })[0].pagina.campos["emisor:nombre"]).toBeUndefined();
    const sinRep = { ...e, cuerpo: { ...e.cuerpo, ficha: { ...e.cuerpo.ficha, representante: "" } } } as typeof e;
    expect(emisorDeLaGuia(sinRep)).toBeNull();
  });

  it("marca «COPIA»: cruzada y con su pie por defecto; apagada, no sale", () => {
    const e = entradasDeLaGuia(doc(3), null);
    const con = htmlFormatoCompleto(["guia", "lista"], e, "x");
    expect(con.match(/data-marca-copia/g)).toHaveLength(2);
    expect(con).toContain(MARCA_COPIA.pie);
    expect(htmlFormatoCompleto(["guia"], e, "x", { copia: false })).not.toContain("data-marca-copia");
  });

  it("el PDF lleva la marca (texto extraíble) y el emisor", async () => {
    const { pdfConFormato } = await import("@/lib/forestal/gtf-formato-completo-pdf");
    const { ESTILO_CON_FORMATO } = await import("@/lib/forestal/gtf-talonario-plantilla-svg");
    const e = entradasDeLaGuia(doc(3), null);
    const conRep = { ...e, cuerpo: { ...e.cuerpo, ficha: { ...e.cuerpo.ficha, representante: "DAMIAN ESPINOZA", representanteDni: "45831805" } } } as typeof e;
    const bytes = await pdfConFormato(hojasConFormato(["guia"], conRep), "x", ESTILO_CON_FORMATO.celeste, MARCA_COPIA);
    /* Los streams van comprimidos y las 14 fuentes estándar escriben el texto en hex dentro de <…>. */
    const textos: string[] = [];
    for (const m of Buffer.from(bytes).toString("latin1").matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
      let s: string;
      try {
        s = inflateSync(Buffer.from(m[1], "latin1")).toString("latin1");
      } catch {
        continue;
      }
      for (const t of s.matchAll(/<([0-9A-Fa-f]+)> Tj/g)) textos.push(Buffer.from(t[1], "hex").toString("latin1"));
    }
    expect(textos).toContain("COPIA");
    expect(textos).toContain("DAMIAN ESPINOZA");
    expect(textos.some((t) => t.startsWith("COPIA · No vale"))).toBe(true);
  });
});
