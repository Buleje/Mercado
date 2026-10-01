/**
 * Tests — «Carátula en 2 minutos» (lo puro): validaciones, «qué falta» y lo que
 * el sistema propone. Fallan con HEAD 2bf18ca0 (el módulo no existía).
 *
 * El RUC de ejemplo 20123456786 cierra el módulo 11 (suma 148 → resto 5 → 6);
 * 20123456789 tiene el mismo prefijo y el dígito final mal, que es justo el
 * error de tipeo que `validateRUC` (sólo formato) deja pasar.
 */

import { describe, it, expect } from "vitest";
import {
  EJEMPLO_TITULO,
  avisoDeTitulo,
  claveDeFecha,
  errorDeDni,
  errorDeFechaResolucion,
  errorDeRuc,
  erroresDeCaratula,
  estadoDePasos,
  primerPasoIncompleto,
  progresoDeCaratula,
  proponerCaratula,
  puedeGuardar,
  queFalta,
  soloDigitos,
  type CaratulaValores,
} from "@/lib/forestal/loth-caratula-pasos";

const VACIA: CaratulaValores = {
  tituloHabilitante: "", resolucionNumber: "", resolucionDate: "", titularName: "", ruc: "", dni: "",
  representanteLegal: "", registroNumber: "", tomo: "", docGestionType: "PO", docGestionName: "",
  domicilio: "", departamento: "Ucayali", provincia: "", distrito: "", telefono: "", email: "",
};
const HOY = "2026-09-30";

describe("validaciones", () => {
  it("RUC: 11 dígitos y dígito verificador; vacío no es error", () => {
    expect(errorDeRuc("")).toBeNull();
    expect(errorDeRuc("20123456786")).toBeNull();
    expect(errorDeRuc("20123456789")).toMatch(/dígito verificador/);
    expect(errorDeRuc("2012345678")).toMatch(/11 dígitos \(llevas 10\)/);
    expect(errorDeRuc("2012345678A")).toMatch(/sólo números/);
  });

  it("DNI: exactamente 8 dígitos", () => {
    expect(errorDeDni("")).toBeNull();
    expect(errorDeDni("05040151")).toBeNull();
    expect(errorDeDni("0504015")).toMatch(/8 dígitos \(llevas 7\)/);
    expect(errorDeDni("050401511")).toMatch(/8 dígitos/);
    expect(errorDeDni("0504015X")).toMatch(/sólo números/);
  });

  it("fecha de la resolución: hoy sí, mañana no, basura no", () => {
    expect(errorDeFechaResolucion("2026-03-20", HOY)).toBeNull();
    expect(errorDeFechaResolucion(HOY, HOY)).toBeNull();
    expect(errorDeFechaResolucion("2026-10-01", HOY)).toMatch(/futura/);
    expect(errorDeFechaResolucion("2026-13-45", HOY)).toMatch(/no es válida/);
    expect(errorDeFechaResolucion("", HOY)).toBeNull();
  });

  it("título habilitante: acepta los formatos reales y sólo avisa, nunca bloquea", () => {
    expect(avisoDeTitulo(EJEMPLO_TITULO)).toBeNull();
    expect(avisoDeTitulo("10-HUA-PUE/PER-FMP-2026-007")).toBeNull();
    expect(avisoDeTitulo("17-CPO/C-J-001-02")).toBeNull();
    expect(avisoDeTitulo("contrato de blas")).toContain(EJEMPLO_TITULO);
    expect(avisoDeTitulo("")).toBeNull();
    // un aviso no entra en los errores que bloquean el guardado
    expect(erroresDeCaratula({ ...VACIA, tituloHabilitante: "contrato de blas" }, HOY)).toEqual({});
  });

  it("soloDigitos limpia lo que se pega con espacios o guiones", () => {
    expect(soloDigitos("20 12345678-6")).toBe("20123456786");
  });
});

describe("qué falta", () => {
  it("carátula vacía: las 8 cosas de los pasos 1-3, en orden, y el paso 4 nunca", () => {
    const f = queFalta(VACIA);
    expect(f.map((x) => x.campo)).toEqual([
      "tituloHabilitante", "resolucionNumber", "resolucionDate", "titularName", "ruc", "registroNumber", "tomo", "docGestionName",
    ]);
    expect(f.map((x) => x.paso)).toEqual([1, 1, 1, 2, 2, 3, 3, 3]);
    expect(f.some((x) => x.paso === 4)).toBe(false);
  });

  it("sin carátula (null) falta todo y abre en el paso 1", () => {
    expect(queFalta(null)).toHaveLength(8);
    expect(primerPasoIncompleto(null)).toBe(1);
  });

  it("el primer paso incompleto salta los completos", () => {
    const paso1 = { ...VACIA, tituloHabilitante: EJEMPLO_TITULO, resolucionNumber: "RDE 1-2026", resolucionDate: "2026-03-20" };
    expect(primerPasoIncompleto(paso1)).toBe(2);
    const paso2 = { ...paso1, titularName: "Blas SAC", ruc: "20123456786" };
    expect(primerPasoIncompleto(paso2)).toBe(3);
    const todo = { ...paso2, registroNumber: "001", tomo: "I", docGestionName: "PO 2026" };
    expect(queFalta(todo)).toEqual([]);
    expect(primerPasoIncompleto(todo)).toBe(1);
  });

  it("acepta una fecha Date (la ficha la recibe así) y espacios cuentan como vacío", () => {
    expect(queFalta({ resolucionDate: new Date("2026-03-20T00:00:00Z"), tomo: "   " }).map((x) => x.campo)).not.toContain("resolucionDate");
    expect(queFalta({ tomo: "   " }).map((x) => x.campo)).toContain("tomo");
  });

  it("progreso: cuenta los 3 pasos obligatorios; el opcional ni suma ni resta", () => {
    expect(progresoDeCaratula(VACIA, HOY)).toEqual({ hechos: 0, total: 3, pct: 0 });
    const p1 = { ...VACIA, tituloHabilitante: EJEMPLO_TITULO, resolucionNumber: "RDE 1", resolucionDate: "2026-03-20" };
    expect(progresoDeCaratula(p1, HOY)).toEqual({ hechos: 1, total: 3, pct: 33 });
    // un paso con un error no cuenta como listo aunque esté lleno
    expect(progresoDeCaratula({ ...p1, resolucionDate: "2026-12-31" }, HOY).hechos).toBe(0);
    expect(estadoDePasos({ ...p1, resolucionDate: "2026-12-31" }, HOY)[0]).toMatchObject({ completo: false, conError: true });
    expect(estadoDePasos(p1, HOY)[3]).toMatchObject({ opcional: true, completo: false });
  });
});

describe("guardar con lo mínimo", () => {
  it("alcanza con el titular; sin él o con un error no se guarda", () => {
    expect(puedeGuardar(VACIA, HOY)).toBe(false);
    expect(puedeGuardar({ ...VACIA, titularName: "B" }, HOY)).toBe(false);
    expect(puedeGuardar({ ...VACIA, titularName: "Blas SAC" }, HOY)).toBe(true);
    expect(puedeGuardar({ ...VACIA, titularName: "Blas SAC", ruc: "20123456789" }, HOY)).toBe(false);
    expect(puedeGuardar({ ...VACIA, titularName: "Blas SAC", dni: "123" }, HOY)).toBe(false);
  });
});

describe("lo que el sistema propone", () => {
  const negocio = { nombre: "Blas", razonSocial: "Inversiones Agroforestales Blas S.A.", ruc: "20 12345678-6", email: "a@b.pe", telefono: "992696555", direccion: "Km 15" };
  const plan = { planType: "PMFI", planNumber: "PMFI 2026-01", tituloHabilitante: "10-HUA-PUE/PER-FMP-2026-007", resolucionNumber: "RDE 001-2026", resolucionDate: "2026-03-20T00:00:00.000Z", titularName: "Blas SAC" };

  it("rellena lo vacío y dice de dónde salió cada dato", () => {
    const { valores, propuestos } = proponerCaratula(VACIA, negocio, plan);
    expect(valores).toMatchObject({
      tituloHabilitante: "10-HUA-PUE/PER-FMP-2026-007", resolucionNumber: "RDE 001-2026", resolucionDate: "2026-03-20",
      titularName: "Blas SAC", ruc: "20123456786", docGestionType: "PMFI", docGestionName: "PMFI 2026-01",
      domicilio: "Km 15", telefono: "992696555", email: "a@b.pe",
    });
    expect(propuestos).toMatchObject({ tituloHabilitante: "plan", resolucionDate: "plan", titularName: "plan", ruc: "negocio", email: "negocio", docGestionType: "plan" });
  });

  it("sin plan, el titular sale de la razón social y luego del nombre del negocio", () => {
    expect(proponerCaratula(VACIA, negocio, null).valores.titularName).toBe("Inversiones Agroforestales Blas S.A.");
    expect(proponerCaratula(VACIA, { nombre: "Bodega San Martín" }, null).valores.titularName).toBe("Bodega San Martín");
  });

  it("nunca pisa lo que ya estaba cargado", () => {
    const actual = { ...VACIA, titularName: "Otro SAC", ruc: "20999999999", tituloHabilitante: "17-CPO/C-J-001-02", docGestionName: "PO 2019", docGestionType: "PO" };
    const { valores, propuestos } = proponerCaratula(actual, negocio, plan);
    expect(valores).toMatchObject({ titularName: "Otro SAC", ruc: "20999999999", tituloHabilitante: "17-CPO/C-J-001-02", docGestionName: "PO 2019", docGestionType: "PO" });
    expect(propuestos.titularName).toBeUndefined();
    expect(propuestos.tituloHabilitante).toBeUndefined();
    expect(propuestos.docGestionType).toBeUndefined();
    expect(propuestos.resolucionNumber).toBe("plan");
  });

  it("sin negocio ni plan no inventa nada", () => {
    const { valores, propuestos } = proponerCaratula(VACIA, null, null);
    expect(valores).toEqual(VACIA);
    expect(propuestos).toEqual({});
  });

  it("claveDeFecha lee date-only en UTC", () => {
    expect(claveDeFecha("2026-03-20T00:00:00.000Z")).toBe("2026-03-20");
    expect(claveDeFecha(new Date("2026-03-20T00:00:00Z"))).toBe("2026-03-20");
    expect(claveDeFecha(null)).toBe("");
    expect(claveDeFecha("basura")).toBe("");
  });
});
