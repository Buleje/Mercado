/**
 * ADR-494 — la hoja GTF sigue el formato de la RDE D000014-2024-MIDAGRI-SERFOR-DE.
 *
 * La tabla de mapeo es la ley de la hoja: cada casillero del Anexo I tiene la
 * clave interna que lo llena o dice por qué no se llena, y ninguna clave de
 * `casillerosGtf` (ni columna del detalle) se queda sin casillero, que sería
 * un dato que la guía tiene y el papel pierde.
 */
import { describe, expect, it } from "vitest";
import {
  CASILLEROS_GTF_2024,
  casillasOrigen,
  casillerosGtf,
  cuerpoGtfOficial,
  ORIGENES,
  ORIGENES_SIN_CASILLA_2024,
  filasDeLaGuia,
  type CuerpoGtfInput,
  type FilaDetalleGtf,
  type LineaProducto,
} from "@/lib/forestal/ctp-gtf-formato";
import { gtfDatosVacio } from "@/lib/forestal/ctp-gtf-datos";
import { emptyCtpFicha } from "@/lib/forestal/ctp-ficha-types";

/** Los números del Anexo I, copiados del formato y su instructivo (no del código). */
const ORACULO = [
  "1", "2", "3", "4",
  "5", "6", "7", "8", "9", "10", "11a", "11b", "11c",
  "12", "13", "14a", "14b", "14c", "14d", "15", "16",
  "17", "18", "19", "20a", "20b", "20c", "20d",
  "21", "22", "23", "24a", "24b", "24c", "24d",
  "25", "26", "27", "28", "29", "30", "31",
  "32", "33", "34", "34a", "34b", "34c", "34d", "34e", "34f", "34g", "34h", "35", "36",
  "37", "38", "39",
];

const COLUMNAS_DETALLE: ReadonlyArray<keyof FilaDetalleGtf> = ["37a", "37b", "37c", "37d", "37e", "37f", "37g"];

const base: CuerpoGtfInput = {
  ficha: { ...emptyCtpFicha(), razonSocial: "CC.NN. San Luis", arffs: "GORE Pasco", region: "Pasco" },
  datos: gtfDatosVacio(),
  lineas: [],
  numeroGtf: "019-001-0000004",
  fechaExpedicion: "2024-12-18",
  listasTrozas: "019-001-0000004",
  gtfOrigen: "",
};

describe("tabla de mapeo formato 2024 ↔ claves internas", () => {
  const fuentes = new Set<string>(CASILLEROS_GTF_2024.flatMap((c) => ("de" in c ? [...c.de] : [])));

  it("tiene los 58 casilleros del Anexo I, en su orden y sin repetir", () => {
    expect(CASILLEROS_GTF_2024.map((c) => c.n)).toEqual(ORACULO);
  });

  it("cada casillero tiene su clave o está marcado «no se llena» con el motivo", () => {
    for (const c of CASILLEROS_GTF_2024) {
      const de = "de" in c ? c.de.length : 0;
      const vacio = "vacio" in c ? c.vacio.trim() : "";
      expect({ n: c.n, llena: de > 0 || vacio.length > 0 }).toEqual({ n: c.n, llena: true });
      // Nunca las dos cosas: o lo llena el sistema o es de mano.
      expect({ n: c.n, ambas: de > 0 && vacio.length > 0 }).toEqual({ n: c.n, ambas: false });
    }
  });

  it("ninguna clave de casillerosGtf queda sin casillero (la hoja no pierde un dato)", () => {
    const claves = Object.keys(casillerosGtf(base));
    expect(claves.length).toBeGreaterThan(40);
    expect(claves.filter((k) => !fuentes.has(k))).toEqual([]);
  });

  it("las 7 columnas del detalle, el N° de la guía y el total también tienen casillero", () => {
    for (const k of [...COLUMNAS_DETALLE, "numeroGtf", "volumenTotal"]) expect(fuentes.has(k)).toBe(true);
  });

  it("cada clave llena UN solo casillero: un dato no se imprime dos veces con números distintos", () => {
    const todas = CASILLEROS_GTF_2024.flatMap((c) => ("de" in c ? [...c.de] : []));
    expect(todas.length).toBe(new Set(todas).size);
  });
});

describe("la hoja impresa", () => {
  const html = cuerpoGtfOficial(base);

  it("dibuja los 58 números del formato, del (1) al (39)", () => {
    const faltan = ORACULO.filter((n) => !html.includes(`(${n})`));
    expect(faltan).toEqual([]);
  });

  it("los rótulos son los del Anexo I", () => {
    for (const c of CASILLEROS_GTF_2024) {
      if (c.n === "34") continue; // título del cuadro: va como <caption>, no como casillero
      expect({ n: c.n, esta: html.includes(c.rotulo) }).toEqual({ n: c.n, esta: true });
    }
  });

  it("sin datos, los casilleros quedan en blanco con su número: no se inventa", () => {
    expect(html).toContain('<span class="n">(39)</span>');
    expect(html).toContain('<span class="n">(22)</span> <span class="l">N° Autorización:</span> <b></b>');
    expect(html).toContain('<span class="n">(17)</span> <span class="l">Punto de partida:</span> <b></b>');
  });

  it("el (13) DNI/RUC es un solo casillero: lleva el RUC de una empresa o el DNI de una persona", () => {
    const datos = gtfDatosVacio();
    const rotulo = '<span class="n">(13)</span> <span class="l">DNI/RUC N.º:</span>';
    datos.propietario = { ...datos.propietario, docTipo: "RUC", docNumero: "20601234567" };
    expect(cuerpoGtfOficial({ ...base, datos })).toContain(`${rotulo} <b>20601234567</b>`);
    datos.propietario = { ...datos.propietario, docTipo: "DNI", docNumero: "41234567" };
    expect(cuerpoGtfOficial({ ...base, datos })).toContain(`${rotulo} <b>41234567</b>`);
  });
});

/**
 * (36) «Anexos que forman parte integrante de la GTF» (Brandon 16-10: su guía
 * 19-000003 trae a mano la X en «Anexo 03: Listado de Trozas»). La lista del
 * (33) es el Anexo 03 si viaja madera en rollo y el 04 si son transformados;
 * el 01 y el 02 los marca quien emite.
 */
describe("(36) Anexos: la X sale de la lista del (33)", () => {
  const rollo: LineaProducto = { cientifico: "Cedrelinga cateniformis", comun: "Tornillo", tipoProducto: "Madera en rollo", presentacion: "Trozas", cantidad: 2, unidad: "m3", total: 2.126 };
  const tablas: LineaProducto = { ...rollo, tipoProducto: "Madera aserrada", presentacion: "Tablas", unidad: "pt" };
  const casilla = (html: string, rotulo: string) => html.match(new RegExp(`${rotulo}[^<]*</span><span class="bx">([^<]*)</span>`))?.[1];

  it("madera en rollo con N° de lista: X en el Anexo 03, nada en el 04", () => {
    const c = casillerosGtf({ ...base, lineas: [rollo] });
    expect([c["36a3"], c["36a4"]]).toEqual(["X", ""]);
    const html = cuerpoGtfOficial({ ...base, lineas: [rollo] });
    expect(casilla(html, "Anexo 03")).toBe("X");
    expect(casilla(html, "Anexo 04")).toBe("&nbsp;");
    expect(casilla(html, "Anexo 01")).toBe("&nbsp;");
    expect(casilla(html, "Anexo 02")).toBe("&nbsp;");
  });

  it("productos transformados con N° de lista: X en el Anexo 04", () => {
    const c = casillerosGtf({ ...base, lineas: [tablas] });
    expect([c["36a3"], c["36a4"]]).toEqual(["", "X"]);
    expect(casilla(cuerpoGtfOficial({ ...base, lineas: [tablas] }), "Anexo 04")).toBe("X");
  });

  it("sin N° de lista en el (33), ninguna X: no hay anexo que viaje", () => {
    const c = casillerosGtf({ ...base, lineas: [rollo], listasTrozas: "" });
    expect([c["36a3"], c["36a4"]]).toEqual(["", ""]);
    expect(cuerpoGtfOficial({ ...base, lineas: [rollo], listasTrozas: "" }).match(/class="bx">X</g)?.length ?? 0).toBe(
      cuerpoGtfOficial({ ...base, lineas: [], listasTrozas: "" }).match(/class="bx">X</g)?.length ?? 0,
    );
  });

  it("el (36) toma sus dos claves y nadie más las usa", () => {
    const de36 = CASILLEROS_GTF_2024.find((c) => c.n === "36");
    expect(de36 && "de" in de36 ? [...de36.de] : []).toEqual(["36a3", "36a4"]);
  });
});

/** (37f) Unidad de medida: como la escribe el talonario, «m3» (16-10). */
describe("unidad del detalle: m3", () => {
  it("una guía guardada con «Metros cúbicos» se imprime «m3»; otras unidades, tal cual", () => {
    const filas = filasDeLaGuia([
      { cientifico: "A", comun: "a", tipoProducto: "Madera en rollo", presentacion: "Trozas", cantidad: 1, unidad: "Metros cúbicos", total: 1 },
      { cientifico: "B", comun: "b", tipoProducto: "Madera en rollo", presentacion: "Trozas", cantidad: 1, unidad: "m³", total: 1 },
      { cientifico: "C", comun: "c", tipoProducto: "Madera aserrada", presentacion: "Tablas", cantidad: 1, unidad: "pt", total: 1 },
    ]);
    expect(filas.map((f) => f.unidad)).toEqual(["m3", "m3", "pt"]);
  });
});

describe("casillas del (5) del formato 2024", () => {
  it("son las 10 del Anexo I, en su orden", () => {
    expect(ORIGENES.map((o) => o.label)).toEqual([
      "Concesión", "Permiso", "Autorización", "Bosque local", "Desbosque", "Cambio de Uso", "Plantación",
      "Varios orígenes", "Centro de Transformación Primaria-CTP", "Cesión en Uso",
    ]);
  });

  it("una guía vieja con «Otros» o «Plan de Manejo Consolidado» no cruza ninguna: esas casillas ya no existen", () => {
    for (const o of ORIGENES_SIN_CASILLA_2024) {
      expect(casillasOrigen(o.clave).match(/>X</g)).toBeNull();
      expect(casillasOrigen(o.clave)).not.toContain(o.label);
    }
  });

  it("las nuevas se cruzan como cualquier otra", () => {
    expect(casillasOrigen("ctp")).toMatch(/Centro de Transformación Primaria-CTP<\/span><span class="bx">X<\/span>/);
  });
});
