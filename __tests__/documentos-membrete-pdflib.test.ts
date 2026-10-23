/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { inflateSync } from "zlib";
import { PDFDocument } from "pdf-lib";
import { crearMembrete, dibujarMembrete, dibujarMembreteBreve, dibujarPies, limiteInferior } from "@/lib/documentos/membrete-pdflib";

/** Un PNG de 2×1 px, para no depender de archivos. */
const PNG = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAD0lEQVR4nGP4z8Dwn+E/AAAFAAH/0vpvVAAAAABJRU5ErkJggg==", "base64"),
);

function textoDelPdf(bytes: Uint8Array): string {
  const crudo = Buffer.from(bytes).toString("latin1");
  const partes: string[] = [];
  for (const m of crudo.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    let s: string;
    try {
      s = inflateSync(Buffer.from(m[1], "latin1")).toString("latin1");
    } catch {
      continue;
    }
    for (const t of s.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)) partes.push(Buffer.from(t[1], "hex").toString("latin1"));
  }
  return partes.join(" ");
}
const imagenes = (bytes: Uint8Array) => (Buffer.from(bytes).toString("latin1").match(/\/Subtype\s*\/Image/g) ?? []).length;

const negocio = { nombre: "Aserradero Blas", razonSocial: "Inversiones Blas S.A.C.", ruc: "20123456789", direccion: "Jr. Tarapacá 120, Pucallpa", telefono: "987 111 222", pie: "Gracias por su confianza" };
const documento = { tipo: "Estado de cuenta", codigo: "EC-0001", fecha: "jueves 08/10/2026" };

async function armar(logo: { bytes: Uint8Array; ancho: number; alto: number } | null, paginas = 2) {
  const doc = await PDFDocument.create();
  const mb = await crearMembrete(doc, negocio, logo, documento);
  const p1 = doc.addPage([595.28, 841.89]);
  const y = dibujarMembrete(mb, p1);
  for (let i = 1; i < paginas; i++) dibujarMembreteBreve(mb, doc.addPage([595.28, 841.89]), "Detalle");
  dibujarPies(mb);
  return { bytes: await doc.save(), y, alto: p1.getHeight() };
}

describe("membrete en pdf-lib", () => {
  it("cabecera: nombre, razón social, datos, tipo en mayúsculas, código y fecha", async () => {
    const { bytes } = await armar({ bytes: PNG, ancho: 2, alto: 1 });
    const t = textoDelPdf(bytes);
    for (const s of ["Aserradero Blas", "Inversiones Blas S.A.C.", "RUC 20123456789", "Pucallpa", "Tel. 987 111 222", "ESTADO DE CUENTA", "EC-0001", "jueves 08/10/2026"]) expect(t).toContain(s);
    expect(t).not.toContain("Buleje");
  });

  it("pie en cada página: «Página X de Y», emisión en Lima y el pie del negocio", async () => {
    const t = textoDelPdf((await armar(null, 3)).bytes);
    for (const s of ["Página 1 de 3", "Página 2 de 3", "Página 3 de 3", "(hora de Lima)", "Gracias por su confianza"]) expect(t).toContain(s);
  });

  it("el logo se embebe una sola vez; sin logo, monograma con la inicial y cero imágenes", async () => {
    // Un PNG con transparencia son 2 objetos (imagen + máscara); no crece con las páginas.
    const una = imagenes((await armar({ bytes: PNG, ancho: 2, alto: 1 }, 1)).bytes);
    expect(una).toBeGreaterThan(0);
    expect(una).toBeLessThanOrEqual(2);
    expect(imagenes((await armar({ bytes: PNG, ancho: 2, alto: 1 }, 4)).bytes)).toBe(una);
    const sin = await armar(null);
    expect(imagenes(sin.bytes)).toBe(0);
    expect(textoDelPdf(sin.bytes)).toContain("A");
  });

  it("un PNG ilegible no tumba el documento: sale el monograma", async () => {
    const roto = await armar({ bytes: Uint8Array.from([1, 2, 3]), ancho: 10, alto: 10 });
    expect(imagenes(roto.bytes)).toBe(0);
  });

  it("devuelve el y del cuerpo por debajo de la cabecera y sobre el pie", async () => {
    const { y, alto } = await armar(null);
    expect(y).toBeLessThan(alto - 40);
    expect(y).toBeGreaterThan(limiteInferior());
  });

  it("sin datos del negocio no inventa uno: título «Documento»", async () => {
    const doc = await PDFDocument.create();
    const mb = await crearMembrete(doc, null, null, { tipo: "Informe" });
    dibujarMembrete(mb, doc.addPage());
    const t = textoDelPdf(await doc.save());
    expect(t).toContain("Documento");
    expect(t).toContain("INFORME");
    expect(t).not.toContain("Buleje");
  });
});
