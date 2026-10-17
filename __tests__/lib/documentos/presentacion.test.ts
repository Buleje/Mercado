import { describe, it, expect } from "vitest";
import { esPresentacion, leerPresentacion, textoPlano, type ZipLeible } from "@/lib/documentos/presentacion";

/** Zip de mentira: el lector sólo necesita `files` y `file(nombre).async`. */
function zip(archivos: Record<string, string>): ZipLeible {
  return {
    files: archivos,
    file: (n) => (archivos[n] === undefined ? null : { async: async () => archivos[n] }),
  };
}

const slide = (titulo: string, ...lineas: string[]) =>
  `<p:sld><p:cSld><p:spTree>${[titulo, ...lineas]
    .map((t) => `<p:sp><p:txBody><a:p><a:r><a:rPr lang="es"/><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp>`)
    .join("")}</p:spTree></p:cSld></p:sld>`;

describe("esPresentacion", () => {
  it("reconoce pptx y odp por MIME y por nombre", () => {
    expect(esPresentacion("application/vnd.openxmlformats-officedocument.presentationml.presentation", "a")).toBe(true);
    expect(esPresentacion("", "charla.pptx")).toBe(true);
    expect(esPresentacion("", "charla.odp")).toBe(true);
    expect(esPresentacion("", "planilla.xlsx")).toBe(false);
  });
});

describe("leerPresentacion — pptx", () => {
  it("saca título y viñetas de cada diapositiva", async () => {
    const d = await leerPresentacion(zip({
      "ppt/slides/slide1.xml": slide("Ventas 2026", "Enero: S/ 12.000", "Febrero: S/ 9.500"),
      "ppt/slides/slide2.xml": slide("Metas"),
    }), "charla.pptx");

    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ numero: 1, titulo: "Ventas 2026", lineas: ["Enero: S/ 12.000", "Febrero: S/ 9.500"] });
    expect(d[1].titulo).toBe("Metas");
    expect(d[1].lineas).toEqual([]);
  });

  it("ordena 1, 2, … 10, 11 y no 1, 10, 11, 2", async () => {
    const archivos: Record<string, string> = {};
    for (const n of [1, 2, 10, 11, 3]) archivos[`ppt/slides/slide${n}.xml`] = slide(`Hoja ${n}`);
    const d = await leerPresentacion(zip(archivos), "x.pptx");
    expect(d.map((x) => x.titulo)).toEqual(["Hoja 1", "Hoja 2", "Hoja 3", "Hoja 10", "Hoja 11"]);
  });

  it("ignora el XML que no es una diapositiva", async () => {
    const d = await leerPresentacion(zip({
      "ppt/slides/slide1.xml": slide("Sí"),
      "ppt/slideLayouts/slideLayout1.xml": slide("No"),
      "ppt/notesSlides/notesSlide1.xml": slide("Tampoco"),
    }), "x.pptx");
    expect(d.map((x) => x.titulo)).toEqual(["Sí"]);
  });

  it("desarma las entidades XML y no deja etiquetas sueltas", async () => {
    const d = await leerPresentacion(zip({
      "ppt/slides/slide1.xml": `<a:t>Ventas &amp; costos &lt;2026&gt;</a:t>`,
    }), "x.pptx");
    expect(d[0].titulo).toBe("Ventas & costos <2026>");
  });

  it("una presentación vacía no rompe", async () => {
    expect(await leerPresentacion(zip({}), "x.pptx")).toEqual([]);
  });
});

describe("leerPresentacion — odp", () => {
  const contenido = `<office:document-content><office:body><office:presentation>
    <draw:page draw:name="page1"><draw:frame><draw:text-box>
      <text:p>Acopio de cacao</text:p><text:p>Tres productores nuevos</text:p>
    </draw:text-box></draw:frame></draw:page>
    <draw:page draw:name="page2"><draw:frame><draw:text-box>
      <text:p>Precios</text:p>
    </draw:text-box></draw:frame></draw:page>
  </office:presentation></office:body></office:document-content>`;

  it("parte por diapositiva y saca los textos", async () => {
    const d = await leerPresentacion(zip({ "content.xml": contenido }), "charla.odp");
    expect(d).toHaveLength(2);
    expect(d[0].titulo).toBe("Acopio de cacao");
    expect(d[0].lineas).toEqual(["Tres productores nuevos"]);
    expect(d[1].titulo).toBe("Precios");
  });

  it("detecta el formato aunque el nombre no diga .odp", async () => {
    const d = await leerPresentacion(zip({ "content.xml": contenido }), "sin-extension");
    expect(d).toHaveLength(2);
  });
});

describe("textoPlano", () => {
  it("junta todo para poder buscar dentro", async () => {
    const d = await leerPresentacion(zip({
      "ppt/slides/slide1.xml": slide("Ventas", "Enero"),
      "ppt/slides/slide2.xml": slide("Metas", "Duplicar"),
    }), "x.pptx");
    expect(textoPlano(d)).toBe("Ventas\nEnero\n\nMetas\nDuplicar");
  });
});
