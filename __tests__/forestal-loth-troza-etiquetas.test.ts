import { describe, expect, it } from "vitest";
import {
  codigoDeEtiquetaLoth,
  esFichaDeTroza,
  esLineaDeFicha,
  codigoDeFichaTexto,
  partesDeMedidasLoth,
  textoFichaDeTrozaLoth,
} from "@/lib/forestal/ficha-texto-troza";
import { htmlEtiquetaLoth, trozasEtiquetablesLoth } from "@/lib/forestal/loth-troza-etiquetas";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";

/**
 * «Imprimir etiquetas» de Trozado (28-09): la ficha del Libro TH tiene que
 * abrirse con el MISMO lector que ya usa la recepción del Libro CTP —el que
 * lee la ficha en texto línea por línea, como la pistola 2D (ADR-436)— sin
 * tocar ese código: si estos tests fallan, la ficha del TH ya no es
 * compatible con esa pistola.
 */
const linea = (over: Partial<LothEntryDTO> = {}): LothEntryDTO => ({
  id: "l1",
  section: "trozado",
  lineNo: 901,
  entryDate: "2026-07-28",
  treeCode: "014-TOR",
  trozaCode: "DEMO-014-A",
  despachoCode: null,
  isRama: false,
  speciesCommon: "Tornillo",
  speciesScientific: "Cedrelinga cateniformis",
  cites: false,
  diamMayorM: "0.45",
  diamMenorM: "0.39",
  lengthM: "6.16",
  volumeM3: "3.215",
  productType: null,
  quantity: null,
  unit: null,
  pieces: null,
  gtfNumber: "EFDT-001-2026",
  discarded: false,
  consumoInterno: false,
  observations: null,
  status: "registrado",
  annulledReason: null,
  gpsLat: null,
  gpsLng: null,
  photoUrl: null,
  ...over,
});

describe("textoFichaDeTrozaLoth — misma ficha que lee la recepción del CTP", () => {
  it("empieza con TROZA <código>, igual que la del CTP", () => {
    const texto = textoFichaDeTrozaLoth(linea());
    expect(texto.startsWith("TROZA DEMO-014-A")).toBe(true);
  });

  it("el lector del CTP la reconoce como ficha y saca el código de la primera línea", () => {
    const texto = textoFichaDeTrozaLoth(linea());
    expect(esFichaDeTroza(texto)).toBe(true);
    expect(codigoDeFichaTexto(texto)).toBe("DEMO-014-A");
    // La pistola en modo teclado manda un Enter por salto de línea: la
    // primera lectura sola también tiene que dar el código.
    expect(codigoDeFichaTexto(texto.split("\n")[0])).toBe("DEMO-014-A");
  });

  it("cada línea después de la primera la reconoce el lector como parte de la ficha (no como un código suelto)", () => {
    const texto = textoFichaDeTrozaLoth(linea(), { tituloHabilitante: "CONT-UCA-2024-0087", planNumber: "PO-2026-001" });
    const lineas = texto.split("\n");
    expect(lineas.length).toBeGreaterThan(3);
    for (const l of lineas.slice(1)) {
      expect(esLineaDeFicha(l)).toBe(true);
    }
  });

  it("lleva especie común/científica, D1·D2·largo, volumen, árbol, permiso/título y plan", () => {
    const texto = textoFichaDeTrozaLoth(linea(), { tituloHabilitante: "CONT-UCA-2024-0087", planNumber: "PO-2026-001" });
    expect(texto).toContain("Tornillo");
    expect(texto).toContain("Cedrelinga cateniformis");
    expect(texto).toContain("D1 45");
    expect(texto).toContain("D2 39");
    expect(texto).toContain("L 6.16 m");
    expect(texto).toContain("3.215 m³");
    expect(texto).toContain("Árbol 014-TOR");
    expect(texto).toContain("Permiso CONT-UCA-2024-0087");
    expect(texto).toContain("Plan PO-2026-001");
    expect(texto).toContain("GTF EFDT-001-2026");
  });

  it("sin D1/D2/L declarados igual dice «—», nunca los esconde", () => {
    const texto = textoFichaDeTrozaLoth(linea({ diamMayorM: null, diamMenorM: null, lengthM: null }));
    expect(texto).toContain("D1 — · D2 —");
    expect(texto).toContain("L —");
  });

  it("sin árbol/permiso/plan/GTF no deja una raya sin nada debajo", () => {
    const texto = textoFichaDeTrozaLoth(linea({ treeCode: null, gtfNumber: null }));
    expect(texto).not.toContain("Árbol");
    expect(texto).not.toContain("──────\n\n");
  });
});

describe("partesDeMedidasLoth — convierte metros (LothEntryDTO) a cm, como la ficha del CTP", () => {
  it("0,45 m de diámetro mayor sale «D1 45 cm»", () => {
    const { diametros } = partesDeMedidasLoth({ diamMayorM: "0.45", diamMenorM: "0.39", lengthM: "6.16" });
    expect(diametros).toBe("D1 45 · D2 39 cm");
  });
});

describe("codigoDeEtiquetaLoth", () => {
  it("prefiere el código de la troza; si no hay, el del árbol", () => {
    expect(codigoDeEtiquetaLoth({ trozaCode: "DEMO-014-A", treeCode: "014-TOR" })).toBe("DEMO-014-A");
    expect(codigoDeEtiquetaLoth({ trozaCode: null, treeCode: "014-TOR" })).toBe("014-TOR");
    expect(codigoDeEtiquetaLoth({ trozaCode: null, treeCode: null })).toBe("—");
  });
});

describe("trozasEtiquetablesLoth", () => {
  it("sólo Trozado, sin anular y con algún código", () => {
    const tala = linea({ id: "tala1", section: "tala", trozaCode: null, treeCode: "014-TOR" });
    const anulada = linea({ id: "anulada", status: "anulado" });
    const sinCodigo = linea({ id: "sc", trozaCode: null, treeCode: null });
    const buena = linea({ id: "buena" });
    const r = trozasEtiquetablesLoth([tala, anulada, sinCodigo, buena]);
    expect(r.map((e) => e.id)).toEqual(["buena"]);
  });
});

describe("htmlEtiquetaLoth — la tarjeta trae el contenido pedido", () => {
  it("código, especie, medidas y pie con permiso/plan", () => {
    const html = htmlEtiquetaLoth(linea(), "<svg>QR</svg>", {
      formato: "a4-3x7",
      barras: true,
      tituloHabilitante: "CONT-UCA-2024-0087",
      planNumber: "PO-2026-001",
    });
    expect(html).toContain("DEMO-014-A");
    expect(html).toContain("Tornillo");
    expect(html).toContain("CONT-UCA-2024-0087");
    expect(html).toContain("PO-2026-001");
    expect(html).toContain("árbol 014-TOR");
  });
});
