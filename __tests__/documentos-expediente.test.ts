// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import sharp from "sharp";
import { extractText, getDocumentProxy } from "unpdf";
import {
  carpetasEnOrden,
  hojasDelIndice,
  nombreDelExpediente,
  numerarExpediente,
  ordenarPorCarpeta,
  ordenDeSeleccion,
  rutaDeCarpeta,
  tipoDePapel,
} from "@/lib/documents/expediente-indice";
import { armarPdfExpediente } from "@/lib/documents/expediente-pdf";
import { mergeToPdf } from "@/lib/documents/pdf-merge";

const carpetas = [
  { id: "raiz", parentId: null, name: "CCNN Santa Rosa" },
  { id: "tit", parentId: "raiz", name: "Títulos" },
  { id: "gtf10", parentId: "raiz", name: "GTF 10" },
  { id: "gtf2", parentId: "raiz", name: "GTF 2" },
  { id: "nieta", parentId: "gtf2", name: "Anexos" },
  { id: "otra", parentId: null, name: "Otra" },
];

describe("expediente: orden", () => {
  it("recorre la carpeta y sus hijas en profundidad, por nombre con números", () => {
    expect(carpetasEnOrden("raiz", carpetas, true)).toEqual(["raiz", "gtf2", "nieta", "gtf10", "tit"]);
    expect(carpetasEnOrden("raiz", carpetas, false)).toEqual(["raiz"]);
  });

  it("ordena por carpeta y adentro por nombre; la selección respeta el orden elegido", () => {
    const docs = [
      { id: "a", name: "b.pdf", folderId: "tit" },
      { id: "b", name: "a.pdf", folderId: "tit" },
      { id: "c", name: "z.pdf", folderId: "raiz" },
      { id: "d", name: "guía 10.pdf", folderId: "gtf2" },
      { id: "e", name: "guía 9.pdf", folderId: "gtf2" },
    ];
    const orden = carpetasEnOrden("raiz", carpetas, true);
    expect(ordenarPorCarpeta(docs, orden).map((d) => d.id)).toEqual(["c", "e", "d", "b", "a"]);
    expect(ordenDeSeleccion(docs, ["d", "a", "d", "zz", "c"]).map((d) => d.id)).toEqual(["d", "a", "c"]);
  });

  it("nombra la ruta desde la carpeta del expediente", () => {
    const porId = new Map(carpetas.map((c) => [c.id, c]));
    expect(rutaDeCarpeta("nieta", porId, "raiz")).toBe("CCNN Santa Rosa › GTF 2 › Anexos");
    expect(rutaDeCarpeta("nieta", porId)).toBe("Anexos");
    expect(rutaDeCarpeta(null, porId)).toBe("Archivo");
  });

  it("Word y Excel no se unen; PDF e imágenes sí", () => {
    expect(tipoDePapel("application/pdf", "x.pdf")).toBe("pdf");
    expect(tipoDePapel("image/jpeg", "dni.jpg")).toBe("imagen");
    expect(tipoDePapel("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "solicitud.docx")).toBe("no-imprimible");
    expect(tipoDePapel("application/vnd.ms-excel", "censo.xls")).toBe("no-imprimible");
    expect(nombreDelExpediente("CCNN Santa Rosa")).toBe("Expediente CCNN Santa Rosa");
    expect(nombreDelExpediente("expediente OSINFOR")).toBe("expediente OSINFOR");
  });
});

describe("expediente: números de página del índice", () => {
  it("portada + índice + páginas anteriores; los que no entran quedan sin número", () => {
    expect(numerarExpediente([2, 0, 1, 3])).toEqual({ inicio: [3, null, 5, 6], hojasIndice: 1, total: 8 });
  });

  it("un índice de dos hojas corre todos los papeles una página", () => {
    const n = numerarExpediente(Array.from({ length: 27 }, () => 1), 26);
    expect(n.hojasIndice).toBe(2);
    expect(n.inicio[0]).toBe(4);
    expect(n.inicio[26]).toBe(30);
    expect(n.total).toBe(30);
    expect(hojasDelIndice(0)).toBe(1);
  });
});

async function pdfDe(paginas: number, giro = 0): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  for (let i = 0; i < paginas; i++) d.addPage([400, 600]).setRotation(degrees(giro));
  // Sin `addDefaultPage: false`, pdf-lib le pone una hoja en blanco al de 0 páginas.
  return d.save({ addDefaultPage: false });
}

describe("expediente: el PDF armado", () => {
  it("total = portada + índice + papeles, y el índice dice dónde empieza cada uno", async () => {
    const png = await sharp({ create: { width: 40, height: 60, channels: 3, background: { r: 200, g: 200, b: 200 } } }).png().toBuffer();
    const membrete = { nombre: "Agroforestal Blas", logoUrl: null, telefono: "999", direccion: "Pucallpa", ruc: "20123456789", pie: null };
    const r = await armarPdfExpediente({
      titulo: "Expediente CCNN Santa Rosa de Chivis",
      membrete,
      fecha: new Date("2026-10-22T15:00:00Z"),
      papeles: [
        { nombre: "Título de propiedad", carpeta: "Títulos", vence: null, tipo: "pdf", mimeType: "application/pdf", bytes: await pdfDe(2) },
        { nombre: "Solicitud firmada", carpeta: "Solicitudes", vence: null, tipo: "no-imprimible", mimeType: "application/msword", bytes: null },
        { nombre: "DNI del jefe", carpeta: "DNI", vence: "12/03/2027", tipo: "imagen", mimeType: "image/png", bytes: new Uint8Array(png) },
        { nombre: "GTF escaneada", carpeta: "GTF", vence: null, tipo: "pdf", mimeType: "application/pdf", bytes: await pdfDe(3, 90) },
        { nombre: "PDF roto", carpeta: "GTF", vence: null, tipo: "pdf", mimeType: "application/pdf", bytes: new Uint8Array([1, 2, 3]) },
      ],
    });
    expect(r.paginas).toBe(1 + 1 + 2 + 1 + 3);
    expect(r.indice.map((f) => f.pagina)).toEqual([3, null, 5, 6, null]);
    expect(r.indice.map((f) => f.motivo)).toEqual([null, "no-imprimible", null, null, "no-se-pudo-leer"]);

    const leido = await PDFDocument.load(r.bytes);
    expect(leido.getPageCount()).toBe(r.paginas);

    const { text } = await extractText(await getDocumentProxy(new Uint8Array(r.bytes)), { mergePages: false });
    expect(text[0]).toContain("Agroforestal Blas");
    expect(text[0]).toContain("5 papeles");
    expect(text[1]).toContain("Índice");
    expect(text[1]).toContain("No imprimible: pedir el original");
    expect(text[1]).toContain("No se pudo leer: pedir el original");
    // El pie en todas, incluidas las hojas giradas de la GTF.
    text.forEach((t, i) => expect(t).toContain(`pág. ${i + 1} de 8`));
  });
});

// Casos del revisor (22-10): índice de 2 hojas con papeles rotos, vacíos y nombres larguísimos.
describe("expediente: bordes", () => {
  const membrete = { nombre: "X", logoUrl: null, telefono: null, direccion: null, ruc: null, pie: null };

  it("30 papeles: 2 hojas de índice, cada papel empieza donde dice y los rotos quedan sin número", async () => {
    const papeles = [];
    for (let i = 0; i < 30; i++) {
      const roto = i === 3;
      const vacio = i === 10;
      papeles.push({
        nombre: i === 5 ? "Un nombre larguísimo ".repeat(30) : `Papel ${i + 1} ñandú ✓`,
        carpeta: "Carpeta ".repeat(i === 7 ? 40 : 1),
        vence: null,
        tipo: i === 12 ? ("no-imprimible" as const) : ("pdf" as const),
        mimeType: "application/pdf",
        bytes: i === 12 ? null : roto ? new Uint8Array([1, 2, 3]) : vacio ? await pdfDe(0) : await pdfDe(1 + (i % 3)),
      });
    }
    const r = await armarPdfExpediente({ titulo: "Expediente T", membrete, fecha: new Date(), papeles });
    const suma = r.indice.reduce((s, f) => s + f.paginas, 0);
    expect(r.hojasIndice).toBe(2);
    expect(r.paginas).toBe(1 + 2 + suma);
    const leido = await PDFDocument.load(r.bytes);
    expect(leido.getPageCount()).toBe(r.paginas);
    expect(r.indice.find((f) => f.pagina !== null)?.pagina).toBe(4);

    const { text } = await extractText(await getDocumentProxy(new Uint8Array(r.bytes)), { mergePages: false });
    expect(text[2]).toContain("continuación");
    expect(text[1]).toContain("Papel 1 ");
    expect(text[2]).toContain("Papel 30");
    // Portada e índice en A4; los papeles conservan su tamaño (400 × 600).
    const anchos = leido.getPages().map((p) => Math.round(p.getWidth()));
    expect(anchos.slice(0, 3)).toEqual([595, 595, 595]);
    expect(anchos[3]).toBe(400);
    expect(r.indice[3].pagina).toBeNull();
    expect(r.indice[10].pagina).toBeNull();
    expect(r.indice[10].motivo).toBe("no-se-pudo-leer");
    const p12 = r.indice[11].pagina ?? 0;
    expect(anchos[p12 - 1]).toBe(400);
    expect(anchos[p12 - 2]).toBe(400);
  });

  it("Combinar: un PDF de 0 páginas cuenta como saltado", async () => {
    const r = await mergeToPdf([
      { bytes: await pdfDe(0), mimeType: "application/pdf", name: "vacio" },
      { bytes: await pdfDe(2), mimeType: "application/pdf", name: "ok" },
    ]);
    expect(r.skipped).toEqual(["vacio"]);
    expect(r.pageCount).toBe(2);
  });

  it("una foto de 12 MP entra achicada a A4 300 ppp: el PDF pesa menos de 3 MB", async () => {
    // Degradado con un poco de ruido: comprime como una foto real (≈4 MB en JPEG).
    const w = 4000;
    const h = 3000;
    const crudo = Buffer.alloc(w * h * 3);
    let semilla = 7;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        semilla = (semilla * 1103515245 + 12345) & 0x7fffffff;
        const ruido = (semilla >> 16) % 24;
        const i = (y * w + x) * 3;
        crudo[i] = ((x * 255) / w + ruido) & 255;
        crudo[i + 1] = ((y * 255) / h + ruido) & 255;
        crudo[i + 2] = (((x + y) % 256) + ruido) & 255;
      }
    }
    const foto = await sharp(crudo, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 88 }).toBuffer();
    expect(foto.length).toBeGreaterThan(2 * 1024 * 1024);
    const r = await mergeToPdf([{ bytes: new Uint8Array(foto), mimeType: "image/jpeg", name: "foto" }]);
    expect(r.pageCount).toBe(1);
    // En PNG la misma foto pesaba 32 MB dentro del PDF.
    expect(r.bytes.length).toBeLessThan(3 * 1024 * 1024);
  }, 20_000);
});
