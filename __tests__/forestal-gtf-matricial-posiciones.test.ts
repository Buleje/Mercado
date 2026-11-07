/**
 * «Posición de cada campo» del talonario (Brandon 16-10): el nombre como en el
 * papel, leer lo pegado de Excel, casar por N° o por nombre, y los límites
 * [−50, 1000] que el servidor exige para guardar.
 */
import { describe, expect, it } from "vitest";
import { CATALOGO, hojaDeFabrica, hojaSchema, type FormatoTalonario } from "@/lib/forestal/gtf-matricial-disposicion";
import {
  aplicarPegado,
  casarCampo,
  fijarEnHoja,
  fijarTabla,
  leerMm,
  leerPegado,
  nombreDeColumna,
  nombreDelCampo,
  nombreDeLaTabla,
  numeroDeCasillero,
  tsvDePosiciones,
} from "@/lib/forestal/gtf-matricial-posiciones";

const AUTORIDAD = "(2) Autoridad Regional Forestal y de Fauna Silvestre (ARFFS)";

describe("nombre del campo", () => {
  it("usa el rótulo del papel cuando dice más que el catálogo", () => {
    expect(nombreDelCampo("guia", "2")).toBe(AUTORIDAD);
    expect(nombreDelCampo("guia", "20")).toBe("(15) Tipo de Comprobante de Compra o Venta");
  });
  it("se queda con el del catálogo si distingue partes o si el papel es más corto", () => {
    expect(nombreDelCampo("guia", "15")).toBe("(13) DNI/RUC · el RUC");
    expect(nombreDelCampo("guia", "6")).toBe("(6) N° del título habilitante");
    expect(nombreDelCampo("lista", "guia")).toBe("(2) GTF N°");
  });
  it("lee el N° de casillero", () => {
    expect(numeroDeCasillero(AUTORIDAD)).toBe("2");
    expect(numeroDeCasillero("(11a) Departamento")).toBe("11a");
    expect(numeroDeCasillero("2")).toBe("2");
    expect(numeroDeCasillero("Titular")).toBeNull();
  });
});

describe("leer lo pegado", () => {
  it("números con coma, punto, «mm» y vacío", () => {
    expect(leerMm("12,5")).toBe(12.5);
    expect(leerMm(" 12.5 mm ")).toBe(12.5);
    expect(leerMm("−3")).toBe(-3);
    expect(leerMm("1.234,5")).toBe(1234.5);
    expect(leerMm("")).toBeNull();
    expect(leerMm("abc")).toBeNaN();
  });

  it("con cabecera en cualquier orden, separado por tabuladores", () => {
    const r = leerPegado(`Ancho (mm)\tCampo\tY\tX\r\n80\t${AUTORIDAD}\t40,1\t95\r\n\r\n`);
    expect(r).toEqual([{ campo: AUTORIDAD, x: 95, y: 40.1, anchoMm: 80 }]);
  });

  it("sin cabecera = Campo, X, Y, Ancho; con «;» de un CSV y comillas", () => {
    expect(leerPegado('"(2)";10;20\n(6);1,5;;7')).toEqual([
      { campo: "(2)", x: 10, y: 20, anchoMm: null },
      { campo: "(6)", x: 1.5, y: null, anchoMm: 7 },
    ]);
  });
});

describe("casar por N° o por nombre", () => {
  it("por N° de casillero si es único en la hoja", () => {
    expect(casarCampo("guia", "(2)")).toMatchObject({ tipo: "campo", id: "2" });
    expect(casarCampo("guia", "2")).toMatchObject({ tipo: "campo", id: "2" });
    expect(casarCampo("guia", "(34a)")).toMatchObject({ tipo: "columna", id: "37a" });
    expect(casarCampo("lista", "(3)")).toMatchObject({ tipo: "columna", id: "cientifico" });
  });
  it("por nombre exacto (papel, catálogo o corto), sin tildes ni dos puntos", () => {
    expect(casarCampo("guia", "(2) Autoridad Regional Forestal y de Fauna Silvestre (ARFFS):")).toMatchObject({ id: "2" });
    expect(casarCampo("guia", "(2) autoridad regional forestal (arffs)")).toMatchObject({ id: "2" });
    expect(casarCampo("guia", "(9) N° Resolución")).toMatchObject({ id: "8" });
  });
  it("por un pedazo del nombre que sólo tiene uno", () => {
    expect(casarCampo("guia", "Autoridad regional")).toMatchObject({ id: "2" });
    expect(casarCampo("guia", "(13) el RUC")).toMatchObject({ id: "15" });
  });
  it("empate = ambiguo; nada = null", () => {
    expect(casarCampo("guia", "(13)")).toBe("ambiguo");
    expect(casarCampo("guia", "Departamento")).toBe("ambiguo");
    expect(casarCampo("guia", "Cualquier cosa")).toBeNull();
  });
  it.each<FormatoTalonario>(["guia", "lista"])("cada nombre que copia la tabla vuelve a su campo (%s)", (f) => {
    for (const c of CATALOGO[f].campos) expect(casarCampo(f, nombreDelCampo(f, c.id))).toMatchObject({ tipo: "campo", id: c.id });
    for (const c of CATALOGO[f].columnas) expect(casarCampo(f, nombreDeColumna(f, c.id))).toMatchObject({ tipo: "columna", id: c.id });
    expect(casarCampo(f, nombreDeLaTabla(f))).toMatchObject({ tipo: "tabla" });
  });
});

describe("límites [−50, 1000]", () => {
  it("fijar acota X/Y, ancho [1, 1000] y la hoja sigue pasando el schema", () => {
    let h = hojaDeFabrica("guia");
    h = fijarEnHoja(h, "campo", "2", { x: 2000, y: -80, anchoMm: 0 });
    expect(h.campos["2"]).toMatchObject({ x: 1000, y: -50, anchoMm: 1 });
    h = fijarEnHoja(h, "columna", "37a", { x: -60, anchoMm: 5000 });
    expect(h.tabla.columnas["37a"]).toMatchObject({ x: -50, anchoMm: 1000 });
    h = fijarTabla(h, { y: 1500, altoFilaMm: 1 });
    expect(h.tabla).toMatchObject({ y: 1000, altoFilaMm: 2 });
    expect(hojaSchema.safeParse(h).success).toBe(true);
  });
});

describe("copiar y pegar la tabla", () => {
  it("lo copiado, pegado sin tocar, no cambia nada", () => {
    const h = hojaDeFabrica("guia");
    const r = aplicarPegado("guia", h, tsvDePosiciones("guia", h, ","));
    expect(r.cambiados).toEqual([]);
    expect(r.noReconocidos).toEqual([]);
    expect(r.hoja).toBe(h);
    expect(r.sinCambio).toBe(CATALOGO.guia.campos.length + CATALOGO.guia.columnas.length + 1);
  });

  it("el TSV usa el decimal del navegador y lleva la Y de la tabla", () => {
    const tsv = tsvDePosiciones("guia", fijarEnHoja(hojaDeFabrica("guia"), "campo", "2", { x: 92.25 }), ",");
    const lineas = tsv.split("\n");
    expect(lineas[0]).toBe("Campo\tX (mm)\tY (mm)\tAncho (mm)");
    expect(lineas.find((l) => l.startsWith(AUTORIDAD))).toMatch(/^[^\t]+\t92,25\t/);
    expect(lineas.find((l) => l.startsWith(nombreDeLaTabla("guia")))?.split("\t")[1]).toBe("");
  });

  it("cambia lo que trae, avisa lo que no reconoce, lo acotado y lo ilegible; gana el último", () => {
    const h = hojaDeFabrica("guia");
    const texto = [
      "Campo\tX\tY\tAncho",
      "(2)\t50\t30\t",
      "(6)\t2000\t\t",
      "(7)\tabc\t\t",
      "Columna (34a) N. científico\t20\t99\t40",
      `${nombreDeLaTabla("guia")}\t\t201,5\t`,
      "Casillero inventado\t1\t1\t1",
      "(2)\t55\t\t",
    ].join("\n");
    const r = aplicarPegado("guia", h, texto);
    expect(r.hoja.campos["2"]).toMatchObject({ x: 55, y: 30, anchoMm: h.campos["2"].anchoMm });
    expect(r.hoja.campos["6"].x).toBe(1000);
    expect(r.hoja.campos["7"]).toEqual(h.campos["7"]);
    expect(r.hoja.tabla.columnas["37a"]).toMatchObject({ x: 20, anchoMm: 40 });
    expect(r.hoja.tabla.y).toBe(201.5);
    expect(r.cambiados).toEqual([AUTORIDAD, "(6) N° del título habilitante", "Columna (34a) N. científico", nombreDeLaTabla("guia")]);
    expect(r.sinCambio).toBe(1);
    expect(r.noReconocidos).toEqual(["Casillero inventado"]);
    expect(r.acotados).toEqual(["(6) N° del título habilitante"]);
    expect(r.ilegibles).toEqual(["(7) Nombre del titular · X"]);
  });
});
