/**
 * Editor de documentos de texto del drive (.docx / .txt / .md).
 *
 * Lo que se blinda: que editar UN párrafo no arruine el resto del documento.
 * Un contrato o una carta con membrete valen por su formato tanto como por su
 * texto; si al corregir una fecha se pierden los encabezados o la numeración,
 * el editor es peor que descargar el archivo.
 */
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  escribirDocx,
  esTextoEditable,
  formatoTextoDe,
  generarPlano,
  leerDocx,
  leerPlano,
  type BloqueTexto,
} from "@/lib/documentos/texto-docx";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Un .docx mínimo pero realista: título, párrafos, lista, tabla y sectPr. */
async function docxDePrueba(): Promise<ArrayBuffer> {
  const cuerpo = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Contrato de alquiler</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Primera cláusula</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>El plazo es de </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>12 meses</w:t></w:r></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Pago mensual</w:t></w:r></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Celda</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    <w:p><w:r><w:t>Firma del arrendatario</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>
  </w:body>
</w:document>`;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`);
  zip.file("word/document.xml", cuerpo);
  // Archivos que el editor NO debe tocar nunca.
  zip.file("word/styles.xml", "<styles>membrete de la empresa</styles>");
  zip.file("word/header1.xml", "<hdr>Bodega San Martín</hdr>");
  zip.file("word/numbering.xml", "<num>viñetas</num>");
  const buf = await zip.generateAsync({ type: "arraybuffer" });
  return buf;
}

async function reabrir(blob: Blob) {
  return leerDocx(await blob.arrayBuffer());
}

describe("qué se puede abrir", () => {
  it("acepta docx, txt y md", () => {
    expect(esTextoEditable(DOCX_MIME)).toBe(true);
    expect(esTextoEditable("text/plain")).toBe(true);
    expect(esTextoEditable("application/octet-stream", "acta.docx")).toBe(true);
    expect(esTextoEditable(null, "notas.md")).toBe(true);
  });

  it("no ofrece editar lo que no es texto", () => {
    expect(esTextoEditable("application/pdf", "contrato.pdf")).toBe(false);
    expect(esTextoEditable("image/png", "foto.png")).toBe(false);
  });

  it("distingue el formato de salida", () => {
    expect(formatoTextoDe(DOCX_MIME)).toBe("docx");
    expect(formatoTextoDe("text/plain", "leeme.txt")).toBe("plano");
  });
});

describe("lectura de un .docx", () => {
  it("reconoce títulos, párrafos y listas", async () => {
    const { bloques } = await leerDocx(await docxDePrueba());
    expect(bloques.map((b) => b.tipo).slice(0, 4)).toEqual(["titulo", "subtitulo", "parrafo", "lista"]);
  });

  it("junta el texto partido en varios tramos", async () => {
    const { bloques } = await leerDocx(await docxDePrueba());
    expect(bloques[2].texto).toBe("El plazo es de 12 meses");
  });

  it("avisa cuál párrafo mezcla formatos antes de que lo editen", async () => {
    const { bloques } = await leerDocx(await docxDePrueba());
    expect(bloques[2].formatoMixto).toBe(true);  // "12 meses" va en negrita
    expect(bloques[0].formatoMixto).toBe(false);
  });

  it("marca los párrafos que viven dentro de una tabla", async () => {
    const { bloques } = await leerDocx(await docxDePrueba());
    expect(bloques.find((b) => b.texto === "Celda")?.enTabla).toBe(true);
    expect(bloques[0].enTabla).toBe(false);
  });
});

describe("guardar sin arruinar el documento", () => {
  it("EL CASO QUE IMPORTA: cambia un párrafo y el resto queda igual", async () => {
    const doc = await leerDocx(await docxDePrueba());
    const originales = doc.bloques.map((b) => ({ ...b }));
    const editados: BloqueTexto[] = doc.bloques.map((b) =>
      b.id === 2 ? { ...b, texto: "El plazo es de 24 meses" } : b);

    const { bloques } = await reabrir(await escribirDocx(doc, editados, originales));
    expect(bloques[2].texto).toBe("El plazo es de 24 meses");
    expect(bloques[0].texto).toBe("Contrato de alquiler");
    expect(bloques[3].texto).toBe("Pago mensual");
    expect(bloques[3].tipo).toBe("lista");           // la numeración sobrevive
    expect(bloques[0].tipo).toBe("titulo");          // los estilos también
  });

  it("no toca los otros archivos del paquete (membrete, estilos, viñetas)", async () => {
    const doc = await leerDocx(await docxDePrueba());
    const originales = doc.bloques.map((b) => ({ ...b }));
    const blob = await escribirDocx(doc, [...doc.bloques], originales);

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(await zip.file("word/header1.xml")?.async("string")).toBe("<hdr>Bodega San Martín</hdr>");
    expect(await zip.file("word/styles.xml")?.async("string")).toBe("<styles>membrete de la empresa</styles>");
    expect(await zip.file("word/numbering.xml")?.async("string")).toBe("<num>viñetas</num>");
  });

  it("un párrafo agregado sale con el formato del documento", async () => {
    const doc = await leerDocx(await docxDePrueba());
    const originales = doc.bloques.map((b) => ({ ...b }));
    const nuevoId = doc.bloques.length + 10; // id que no existe = párrafo nuevo
    const editados = [...doc.bloques, { id: nuevoId, tipo: "parrafo" as const, texto: "Cláusula adicional", negrita: false, cursiva: false, formatoMixto: false, enTabla: false }];

    const { bloques } = await reabrir(await escribirDocx(doc, editados, originales));
    expect(bloques.at(-1)?.texto).toBe("Cláusula adicional");
    expect(bloques).toHaveLength(originales.length + 1);
  });

  it("el sectPr queda último — si no, Word da el archivo por corrupto", async () => {
    const doc = await leerDocx(await docxDePrueba());
    const originales = doc.bloques.map((b) => ({ ...b }));
    const editados = [...doc.bloques, { id: 99, tipo: "parrafo" as const, texto: "Final", negrita: false, cursiva: false, formatoMixto: false, enTabla: false }];

    const zip = await JSZip.loadAsync(await (await escribirDocx(doc, editados, originales)).arrayBuffer());
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml.indexOf("sectPr")).toBeGreaterThan(xml.lastIndexOf("<w:p>"));
  });

  it("borrar un párrafo lo saca de verdad", async () => {
    const doc = await leerDocx(await docxDePrueba());
    const originales = doc.bloques.map((b) => ({ ...b }));
    const editados = doc.bloques.filter((b) => b.id !== 3); // fuera "Pago mensual"

    const { bloques } = await reabrir(await escribirDocx(doc, editados, originales));
    expect(bloques.map((b) => b.texto)).not.toContain("Pago mensual");
    expect(bloques.map((b) => b.texto)).toContain("Contrato de alquiler");
  });

  it("no se comen los espacios del principio ni del final", async () => {
    // Word los recorta si falta xml:space="preserve".
    const doc = await leerDocx(await docxDePrueba());
    const originales = doc.bloques.map((b) => ({ ...b }));
    const editados = doc.bloques.map((b) => (b.id === 5 ? { ...b, texto: "  con sangría  " } : b));

    const { bloques } = await reabrir(await escribirDocx(doc, editados, originales));
    expect(bloques[5].texto).toBe("  con sangría  ");
  });

  it("el salto de línea dentro de un párrafo sobrevive", async () => {
    const doc = await leerDocx(await docxDePrueba());
    const originales = doc.bloques.map((b) => ({ ...b }));
    const editados = doc.bloques.map((b) => (b.id === 5 ? { ...b, texto: "Firma\nAclaración" } : b));

    const { bloques } = await reabrir(await escribirDocx(doc, editados, originales));
    expect(bloques[5].texto).toBe("Firma\nAclaración");
  });

  it("los caracteres XML no rompen el archivo", async () => {
    const doc = await leerDocx(await docxDePrueba());
    const originales = doc.bloques.map((b) => ({ ...b }));
    const editados = doc.bloques.map((b) => (b.id === 5 ? { ...b, texto: 'Cláusula <5> & "final"' } : b));

    const { bloques } = await reabrir(await escribirDocx(doc, editados, originales));
    expect(bloques[5].texto).toBe('Cláusula <5> & "final"');
  });
});

describe("texto plano", () => {
  it("una línea por bloque, ida y vuelta sin cambios", () => {
    const original = "Lista de tareas\n- comprar arroz\n- pagar luz";
    expect(generarPlano(leerPlano(original).bloques)).toBe(original);
  });

  it("entiende los títulos y viñetas de Markdown", () => {
    const { bloques } = leerPlano("# Título\n## Sección\n- item\ntexto");
    expect(bloques.map((b) => b.tipo)).toEqual(["titulo", "subtitulo", "lista", "parrafo"]);
  });

  it("no se rompe con saltos de Windows", () => {
    expect(leerPlano("a\r\nb").bloques.map((b) => b.texto)).toEqual(["a", "b"]);
  });
});

describe("formato por párrafo", () => {
  it("negrita y cursiva del párrafo llegan al archivo y se releen", async () => {
    const doc = await leerDocx(await docxDePrueba());
    const originales = doc.bloques.map((b) => ({ ...b }));
    const editados = doc.bloques.map((b) => (b.id === 1 ? { ...b, negrita: true, cursiva: true } : b));

    const { bloques } = await reabrir(await escribirDocx(doc, editados, originales));
    expect(bloques[1].negrita).toBe(true);
    expect(bloques[1].cursiva).toBe(true);
    // Los demás párrafos ni se tocaron.
    expect(bloques[2].negrita).toBe(false);
  });

  it("cambiar el tipo escribe el estilo Heading y vuelve como subtítulo", async () => {
    const doc = await leerDocx(await docxDePrueba());
    const originales = doc.bloques.map((b) => ({ ...b }));
    const editados = doc.bloques.map((b) => (b.id === 2 ? { ...b, tipo: "subtitulo" as const } : b));

    const { bloques } = await reabrir(await escribirDocx(doc, editados, originales));
    expect(bloques[2].tipo).toBe("subtitulo");
  });

  it("volver un título a normal le quita el estilo", async () => {
    const doc = await leerDocx(await docxDePrueba());
    const titulo = doc.bloques.find((b) => b.tipo === "titulo");
    if (!titulo) return; // el fixture no trae título: nada que probar
    const originales = doc.bloques.map((b) => ({ ...b }));
    const editados = doc.bloques.map((b) => (b.id === titulo.id ? { ...b, tipo: "parrafo" as const } : b));

    const { bloques } = await reabrir(await escribirDocx(doc, editados, originales));
    expect(bloques[titulo.id].tipo).toBe("parrafo");
  });
});
