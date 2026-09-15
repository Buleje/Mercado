import { describe, it, expect } from "vitest";
import { parsearOds, parsearOdt, esOds, esOdt, leerOds } from "@/lib/documentos/odf";

const celda = (v: string, extra = "") => `<table:table-cell office:value-type="string"${extra}><text:p>${v}</text:p></table:table-cell>`;
const fila = (cs: string, extra = "") => `<table:table-row${extra}>${cs}</table:table-row>`;
const tabla = (nombre: string, filas: string) => `<table:table table:name="${nombre}">${filas}</table:table>`;
const documento = (interior: string) =>
  `<?xml version="1.0"?><office:document-content><office:body><office:spreadsheet>${interior}</office:spreadsheet></office:body></office:document-content>`;

describe("esOds / esOdt", () => {
  it("reconoce por MIME y por nombre", () => {
    expect(esOds("application/vnd.oasis.opendocument.spreadsheet", "x")).toBe(true);
    expect(esOds("", "caja.ods")).toBe(true);
    expect(esOdt("", "contrato.odt")).toBe(true);
    expect(esOds("", "contrato.odt")).toBe(false);
  });
});

describe("parsearOds", () => {
  it("saca las filas y el nombre de cada hoja", () => {
    const xml = documento(
      tabla("Ventas", fila(celda("Producto") + celda("Precio")) + fila(celda("Arroz") + celda("24.90"))) +
      tabla("Costos", fila(celda("Luz") + celda("120"))),
    );
    const hojas = parsearOds(xml);
    expect(hojas.map((h) => h.nombre)).toEqual(["Ventas", "Costos"]);
    expect(hojas[0].filas).toEqual([["Producto", "Precio"], ["Arroz", "24.90"]]);
    expect(hojas[1].filas).toEqual([["Luz", "120"]]);
  });

  it("⚠️ expande las celdas repetidas — 3 vacías se guardan como UNA", () => {
    // Así guarda LibreOffice "A,,,D": no hay 4 celdas en el XML.
    const xml = documento(tabla("H", fila(
      celda("A") + `<table:table-cell table:number-columns-repeated="3"/>` + celda("D"),
    )));
    expect(parsearOds(xml)[0].filas[0]).toEqual(["A", "", "", "", "D"]);
  });

  it("⚠️ no expande el relleno de 16.384 columnas del final", () => {
    const xml = documento(tabla("H", fila(
      celda("A") + `<table:table-cell table:number-columns-repeated="16384"/>`,
    )));
    const f = parsearOds(xml)[0].filas[0];
    // Se podan las vacías del final: queda sólo el dato real.
    expect(f).toEqual(["A"]);
  });

  it("⚠️ una fila VACÍA repetida mil veces cuenta como una sola", () => {
    const xml = documento(tabla("H",
      fila(celda("Dato")) +
      fila(`<table:table-cell/>`, ' table:number-rows-repeated="1000"') +
      fila(celda("Otro")),
    ));
    const filas = parsearOds(xml)[0].filas;
    expect(filas.length).toBeLessThan(5);
    expect(filas[0]).toEqual(["Dato"]);
    expect(filas.at(-1)).toEqual(["Otro"]);
  });

  it("una fila CON datos repetida sí se repite", () => {
    const xml = documento(tabla("H", fila(celda("Igual"), ' table:number-rows-repeated="3"')));
    expect(parsearOds(xml)[0].filas).toEqual([["Igual"], ["Igual"], ["Igual"]]);
  });

  it("marca las fórmulas (se muestra el resultado, no la fórmula)", () => {
    const xml = documento(tabla("H", fila(
      `<table:table-cell table:formula="of:=SUM([.A1:.A9])" office:value="42"><text:p>42</text:p></table:table-cell>`,
    )));
    const h = parsearOds(xml)[0];
    expect(h.tieneFormulas).toBe(true);
    expect(h.filas[0]).toEqual(["42"]);
  });

  it("resuelve entidades, espacios y saltos de línea del formato", () => {
    const xml = documento(tabla("H", fila(
      `<table:table-cell><text:p>Luz<text:s text:c="2"/>&amp;<text:line-break/>agua</text:p></table:table-cell>`,
    )));
    expect(parsearOds(xml)[0].filas[0][0]).toBe("Luz  &\nagua");
  });

  it("una hoja vacía no rompe", () => {
    expect(parsearOds(documento(tabla("Vacía", "")))[0].filas).toEqual([]);
  });
});

describe("parsearOdt", () => {
  const odt = (interior: string) =>
    `<?xml version="1.0"?><office:document-content><office:body><office:text>${interior}</office:text></office:body></office:document-content>`;

  it("distingue títulos, subtítulos y párrafos", () => {
    const b = parsearOdt(odt(
      `<text:h text:outline-level="1">Contrato de alquiler</text:h>` +
      `<text:h text:outline-level="2">Primera cláusula</text:h>` +
      `<text:p>El arrendatario pagará S/ 1500 mensuales.</text:p>`,
    ));
    expect(b.map((x) => x.tipo)).toEqual(["titulo", "subtitulo", "parrafo"]);
    expect(b[2].texto).toBe("El arrendatario pagará S/ 1500 mensuales.");
    expect(b.map((x) => x.id)).toEqual([0, 1, 2]);
  });

  it("saltea los párrafos vacíos (ODF los usa como separador)", () => {
    const b = parsearOdt(odt(`<text:p>Uno</text:p><text:p/><text:p></text:p><text:p>Dos</text:p>`));
    expect(b.map((x) => x.texto)).toEqual(["Uno", "Dos"]);
  });

  it("no confunde el contenido con los estilos del encabezado del archivo", () => {
    const conEstilos = `<office:automatic-styles><style:style style:name="P1"><text:p>NO</text:p></style:style></office:automatic-styles>` +
      `<office:body><office:text><text:p>SÍ</text:p></office:text></office:body>`;
    expect(parsearOdt(conEstilos).map((x) => x.texto)).toEqual(["SÍ"]);
  });
});

describe("leerOds", () => {
  it("avisa cuando el zip no tiene contenido", async () => {
    await expect(leerOds({ file: () => null })).rejects.toThrow(/válido/);
  });
});
