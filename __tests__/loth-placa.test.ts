/**
 * «Foto de la placa» (28-09): el código leído en la placa del tocón se cruza
 * con el censo. Se elige solo lo inequívoco; lo dudoso se muestra para
 * confirmar. Sin IA: el lector se prueba aparte, acá sólo el cruce.
 */
import { describe, expect, it } from "vitest";
import type { ArbolParaElegir } from "@/lib/forestal/loth-censo-uso";
import {
  CONFIANZA_MINIMA,
  claveDeCodigo,
  cruzarPlacaConCenso,
  limpiarCodigoLeido,
  porcentajeConfianza,
} from "@/lib/forestal/loth-placa";

function arbol(treeCode: string, speciesCommon: string, extra: Partial<ArbolParaElegir> = {}): ArbolParaElegir {
  return {
    id: `id-${treeCode}`,
    treeCode,
    speciesCommon,
    speciesScientific: null,
    speciesNative: null,
    cites: false,
    dapM: 0.9,
    hcM: 14,
    volM3: 5,
    utmZona: "18L",
    utmX: 545060,
    utmY: 9012340,
    condicion: "Aprovechable",
    notes: null,
    estadoCenso: "en_pie",
    categoria: "aprovechable",
    dmcCm: 50,
    uso: null,
    disponibilidad: "disponible",
    motivoNoDisponible: null,
    reparo: null,
    desfase: null,
    ...extra,
  };
}

const leida = (codigo: string, confianza = 0.95) => ({ codigo, confianza });

/* El censo de Blas usa números pelados («114») y alguno con especie («001-TOR»);
   el de QA, «85-TOR», «1-SHI». */
const CENSO = [
  arbol("114", "Lupuna"),
  arbol("001-TOR", "Tornillo", { speciesScientific: "Cedrelinga cateniformis" }),
  arbol("85-TOR", "Tornillo"),
  arbol("2", "Shihuahuaco"),
];

describe("claveDeCodigo — cómo se compara un código", () => {
  it("mayúsculas, ceros a la izquierda, separadores y letra pegada al número", () => {
    expect(claveDeCodigo("0114")).toBe("114");
    expect(claveDeCodigo("114")).toBe("114");
    expect(claveDeCodigo("85 tor")).toBe("85-TOR");
    expect(claveDeCodigo("85tor")).toBe("85-TOR");
    expect(claveDeCodigo("85_TOR")).toBe("85-TOR");
    expect(claveDeCodigo("001-TOR")).toBe("1-TOR");
    expect(claveDeCodigo("N° 114")).toBe("114");
    expect(claveDeCodigo("Árbol 114")).toBe("114");
    expect(claveDeCodigo("000")).toBe("0");
  });
});

describe("limpiarCodigoLeido — lo que devuelve el lector", () => {
  it("saca el rótulo y los caracteres raros, pero deja los ceros y el guion", () => {
    expect(limpiarCodigoLeido("  N° 0114 ")).toBe("0114");
    expect(limpiarCodigoLeido("«85-TOR»")).toBe("85-TOR");
    expect(limpiarCodigoLeido("cód. 114-lup")).toBe("114-LUP");
  });

  it("sin un solo dígito es que no leyó nada: vacío, nunca adivinado", () => {
    for (const x of ["ilegible", "N/A", "", "   ", "TOR"]) expect(limpiarCodigoLeido(x)).toBe("");
  });

  it("topea el largo", () => {
    expect(limpiarCodigoLeido(`1${"A".repeat(80)}`).length).toBe(40);
  });
});

describe("cruzarPlacaConCenso", () => {
  it("«114» en la placa elige el 114 · Lupuna", () => {
    const r = cruzarPlacaConCenso(leida("114"), CENSO);
    expect(r.tipo).toBe("elegido");
    if (r.tipo === "elegido") {
      expect(r.arbol.treeCode).toBe("114");
      expect(r.como).toBe("igual");
    }
  });

  it("ceros a la izquierda: «0114» es el 114, y «1-TOR» es el 001-TOR", () => {
    const a = cruzarPlacaConCenso(leida("0114"), CENSO);
    expect(a.tipo === "elegido" && a.arbol.treeCode).toBe("114");
    const b = cruzarPlacaConCenso(leida("1-TOR"), CENSO);
    expect(b.tipo === "elegido" && b.arbol.treeCode).toBe("001-TOR");
  });

  it("mayúsculas y espacios: «85 tor» es el 85-TOR", () => {
    const r = cruzarPlacaConCenso(leida("85 tor"), CENSO);
    expect(r.tipo === "elegido" && r.arbol.treeCode).toBe("85-TOR");
  });

  it("guion con la especie: «114-LUP» es el 114 porque el 114 es Lupuna", () => {
    const r = cruzarPlacaConCenso(leida("114-LUP"), CENSO);
    expect(r.tipo).toBe("elegido");
    if (r.tipo === "elegido") {
      expect(r.arbol.treeCode).toBe("114");
      expect(r.como).toBe("numero");
    }
  });

  it("la placa sin la especie: «85» es el 85-TOR (TOR = Tornillo)", () => {
    const r = cruzarPlacaConCenso(leida("85"), CENSO);
    expect(r.tipo === "elegido" && r.arbol.treeCode).toBe("85-TOR");
  });

  it("letras que contradicen la especie NO eligen: «114-TOR» con el 114 Lupuna pide confirmar", () => {
    const r = cruzarPlacaConCenso(leida("114-TOR"), CENSO);
    expect(r.tipo).toBe("confirmar");
    if (r.tipo === "confirmar") {
      expect(r.motivo).toBe("letras");
      expect(r.candidatos.map((a) => a.treeCode)).toEqual(["114"]);
    }
  });

  it("dos árboles con el mismo número: pide elegir entre los dos", () => {
    const censo = [...CENSO, arbol("85-SHI", "Shihuahuaco")];
    const r = cruzarPlacaConCenso(leida("85"), censo);
    expect(r.tipo).toBe("confirmar");
    if (r.tipo === "confirmar") {
      expect(r.motivo).toBe("varios");
      expect(r.candidatos.map((a) => a.treeCode).sort()).toEqual(["85-SHI", "85-TOR"]);
    }
  });

  it("otro código con el mismo número y un prefijo que no es especie también lo vuelve dudoso", () => {
    const censo = [arbol("1-SHI", "Shihuahuaco"), arbol("QA-CENSO-1", "Tornillo")];
    const r = cruzarPlacaConCenso(leida("1"), censo);
    expect(r.tipo).toBe("confirmar");
    if (r.tipo === "confirmar") expect(r.candidatos.map((a) => a.treeCode)).toEqual(["1-SHI", "QA-CENSO-1"]);
  });

  it("con poca confianza nunca elige solo, aunque el código exista", () => {
    const r = cruzarPlacaConCenso(leida("114", CONFIANZA_MINIMA - 0.01), CENSO);
    expect(r.tipo).toBe("confirmar");
    if (r.tipo === "confirmar") {
      expect(r.motivo).toBe("confianza");
      expect(r.candidatos[0].treeCode).toBe("114");
    }
    expect(cruzarPlacaConCenso(leida("114", Number.NaN), CENSO).tipo).toBe("confirmar");
  });

  it("un árbol ya talado se muestra con su motivo y no se elige", () => {
    const censo = [arbol("114", "Lupuna", { disponibilidad: "talado", motivoNoDisponible: "Talado el lunes 28/09 · línea N° 3" })];
    const r = cruzarPlacaConCenso(leida("114"), censo);
    expect(r.tipo).toBe("no_disponible");
    if (r.tipo === "no_disponible") expect(r.arbol.motivoNoDisponible).toContain("línea N° 3");
  });

  it("un semillero del regente pide confirmar (como «Ver censo»)", () => {
    const censo = [arbol("114", "Lupuna", { reparo: { nivel: "infraccion", titulo: "El regente lo declaró semillero", detalle: "…" } })];
    const r = cruzarPlacaConCenso(leida("114"), censo);
    expect(r.tipo === "confirmar" && r.motivo).toBe("reparo");
  });

  it("un código que no está en el censo lo dice; uno vacío es ilegible", () => {
    expect(cruzarPlacaConCenso(leida("999"), CENSO).tipo).toBe("sin_censo");
    expect(cruzarPlacaConCenso(leida(""), CENSO).tipo).toBe("ilegible");
    expect(cruzarPlacaConCenso(leida("TOR"), CENSO).tipo).toBe("ilegible");
  });

  it("dos árboles con el MISMO código en el censo: pide elegir", () => {
    const censo = [arbol("114", "Lupuna"), arbol("0114", "Lupuna", { id: "otro" })];
    const r = cruzarPlacaConCenso(leida("114"), censo);
    expect(r.tipo === "confirmar" && r.motivo).toBe("varios");
  });
});

describe("porcentajeConfianza", () => {
  it("redondea y topea", () => {
    expect(porcentajeConfianza(0.934)).toBe("93 %");
    expect(porcentajeConfianza(2)).toBe("100 %");
    expect(porcentajeConfianza(Number.NaN)).toBe("0 %");
  });
});
