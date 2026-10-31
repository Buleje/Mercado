/**
 * Los planes de manejo de un titular del Directorio (ADR-518): la ficha es la
 * entidad y sólo LISTA sus planes; el alta del plan los ata a ella.
 */

import { describe, it, expect } from "vitest";
import {
  anotadoEnLaFicha,
  numeroDeArea,
  permisoDesdePlan,
  planDesdeLaFicha,
  planesDelTitular,
  sigueSiendoElTitular,
  tipoPlanDeLaFicha,
  type PlanParaDirectorio,
} from "@/lib/forestal/directorio-planes";
import type { Contrato } from "@/lib/forestal/contratos";
import type { FormularioDePlan } from "@/lib/forestal/permisos-de-parte";

const contrato = (o: Partial<Contrato>): Contrato => ({
  id: "c1", codigo: "19-SEC/REG-PLT-2021-017", codigoNorm: "19-SEC/REG-PLT-2021-017", alias: null,
  titularNombre: "COMUNIDAD NATIVA SANTA ROSA DE CHIVIS", titularId: null, titularDoc: null, titularDocTipo: null,
  resolucionNumero: null, resolucionFecha: null, tipo: "REG-PLT", arffs: null, region: null, provincia: null,
  distrito: null, areaHa: 12.5, vigenciaDesde: null, vigenciaHasta: "2030-01-01T00:00:00.000Z", estado: "vigente",
  planId: null, notas: null, isActive: true, createdAt: "2026-01-01T00:00:00.000Z", ...o,
});

const plan = (o: Partial<PlanParaDirectorio>): PlanParaDirectorio => ({
  id: "p1", planType: "PLANTACION", planNumber: "19-SEC/REG-PLT-2021-017", tituloHabilitante: null,
  titularName: "Comunidad Santa Rosa de Chivis", areaHa: "30,25", vigenciaHasta: "2031-05-01", estado: "vigente",
  contratoId: null, ...o,
});

const vacio = (): FormularioDePlan => ({
  planType: "PO", titularName: "", representanteLegal: "", tituloHabilitante: "", resolucionNumber: "",
  resolucionDate: "", arffs: "", region: "Ucayali", areaHa: "", vigenciaDesde: "", vigenciaHasta: "",
});

describe("planesDelTitular", () => {
  it("lista primero lo atado a la ficha y une permiso y plan en una sola fila", () => {
    const filas = planesDelTitular(
      { id: "f1", nombre: "COMUNIDAD SANTA ROSA DE CHIVIS" },
      [contrato({ titularId: "f1", planId: "p1" })],
      [plan({})],
    );
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ planId: "p1", contratoId: "c1", atado: "ficha", documento: "Plantación", areaHa: 30.25 });
  });

  it("el documento lleva el N° del plan si no es el código de la fila", () => {
    const filas = planesDelTitular(
      { id: "f1", nombre: "X" },
      [contrato({ titularId: "f1", planId: "p1", codigo: "QA-DIRECTORIO-2026-001", tipo: "PO" })],
      [plan({ planType: "PO", planNumber: "QA-DIR-2610", tituloHabilitante: "QA-DIRECTORIO-2026-001" })],
    );
    expect(filas[0]).toMatchObject({ codigo: "QA-DIRECTORIO-2026-001", documento: "PO QA-DIR-2610" });
  });

  it("encuentra el plan por su contratoId aunque el permiso no tenga planId", () => {
    const filas = planesDelTitular({ id: "f1", nombre: "X" }, [contrato({ titularId: "f1" })], [plan({ contratoId: "c1" })]);
    expect(filas.map((f) => f.planId)).toEqual(["p1"]);
  });

  it("suma por nombre los planes y permisos viejos que nadie ató, marcados", () => {
    const filas = planesDelTitular(
      { id: "f1", nombre: "COMUNIDAD SANTA ROSA DE CHIVIS" },
      [contrato({ id: "c9", codigo: "10-HUA/PER-FMC-2026-001", planId: null })],
      [plan({ id: "p2" })],
    );
    expect(filas.map((f) => [f.clave, f.atado])).toEqual([
      ["plan:p2", "nombre"],
      ["permiso:c9", "nombre"],
    ]);
  });

  it("no se lleva por nombre un plan cuyo permiso es de OTRA ficha", () => {
    const filas = planesDelTitular(
      { id: "f1", nombre: "COMUNIDAD SANTA ROSA DE CHIVIS" },
      [contrato({ titularId: "otra", planId: "p1" })],
      [plan({})],
    );
    expect(filas).toEqual([]);
  });

  it("con un nombre de tres letras no adivina", () => {
    expect(planesDelTitular({ id: null, nombre: "ABC" }, [], [plan({ titularName: "ABC" })])).toHaveLength(1);
    expect(planesDelTitular({ id: null, nombre: "ABC" }, [], [plan({ titularName: "ABCDEF SAC" })])).toHaveLength(0);
  });
});

describe("anotadoEnLaFicha", () => {
  it("muestra lo que la ficha vieja guardó y dice si ya está en un plan", () => {
    const filas = planesDelTitular({ id: "f1", nombre: "X" }, [contrato({ titularId: "f1" })], []);
    const a = anotadoEnLaFicha({ tituloHabilitante: "19-sec/reg-plt-2021-017 ", arffs: "GERFOR Ucayali", tituloVigenciaHasta: "2030-02-01" }, filas);
    expect(a?.partes.map((p) => p.rotulo)).toEqual(["Título habilitante", "ARFFS", "Vence"]);
    expect(a?.partes[2].valor).toBe("01/02/2030");
    expect(a?.yaEnUnPlan).toBe(true);
  });

  it("sin nada anotado no dibuja nada", () => {
    expect(anotadoEnLaFicha({ tituloHabilitante: " ", resolucion: null }, [])).toBeNull();
  });
});

describe("planDesdeLaFicha", () => {
  it("pasa lo anotado al alta y dice qué completó, sin pisar lo escrito", () => {
    const { campos, completados } = planDesdeLaFicha(
      { ...vacio(), resolucionNumber: "RD 001" },
      { nombre: "SEPTIMO UNIDOS", tituloHabilitante: "19-SEC/REG-PLT-2026-117", resolucion: "otra", planManejo: "Plantación", tituloVigenciaHasta: "2031-12-31" },
      null,
      { tipoTocado: false, regionPorDefecto: "Ucayali" },
    );
    expect(campos).toMatchObject({
      titularName: "SEPTIMO UNIDOS", tituloHabilitante: "19-SEC/REG-PLT-2026-117", resolucionNumber: "RD 001",
      planType: "PLANTACION", vigenciaHasta: "2031-12-31",
    });
    expect(completados).toEqual(["título habilitante", "tipo de documento", "vigencia hasta"]);
  });

  it("el tipo que eligió una persona no se toca", () => {
    const { campos } = planDesdeLaFicha(vacio(), { nombre: "A", planManejo: "DEMA" }, null, { tipoTocado: true, regionPorDefecto: "Ucayali" });
    expect(campos.planType).toBe("PO");
  });

  it("sin documento anotado, lo deduce del título", () => {
    expect(tipoPlanDeLaFicha({ tituloHabilitante: "10-HUA-PUE/PER-FMP-2026-007" })).toBe("PMFI");
    expect(tipoPlanDeLaFicha({})).toBeNull();
  });
});

describe("permisoDesdePlan", () => {
  it("arma el permiso atado a la ficha; en plantación el código es el N° del registro", () => {
    const p = permisoDesdePlan(
      { ...vacio(), planType: "PLANTACION", planNumber: "19-SEC/REG-PLT-2026-117", areaHa: "4,5", titularName: "Septimo" },
      { id: "f1", nombre: "SEPTIMO UNIDOS", docTipo: "RUC", docNumero: "20601234567" },
      "p9",
    );
    expect(p).toMatchObject({
      codigo: "19-SEC/REG-PLT-2026-117", titularId: "f1", titularNombre: "SEPTIMO UNIDOS", titularDoc: "20601234567",
      tipo: "REG-PLT", areaHa: 4.5, planId: "p9", resolucionNumero: null,
    });
  });

  it("sin código no inventa un permiso", () => {
    expect(permisoDesdePlan(vacio(), { id: "f1", nombre: "A" }, "p1")).toBeNull();
  });

  it("el tipo sale del documento si el código no lo dice", () => {
    expect(permisoDesdePlan({ ...vacio(), planType: "DEMA", tituloHabilitante: "Permiso 2026-01" }, { id: "f1", nombre: "A" }, "p1")?.tipo).toBe("PER-FMC");
  });
});

describe("auxiliares", () => {
  it("numeroDeArea acepta coma y rechaza basura", () => {
    expect(numeroDeArea("12,5")).toBe(12.5);
    expect(numeroDeArea("")).toBeNull();
    expect(numeroDeArea("abc")).toBeNull();
  });

  it("si el titular se cambió a mano, ya no es la ficha traída", () => {
    // Mayúsculas, tildes y espacios de más no cambian de ficha.
    expect(sigueSiendoElTitular("  comunidad  santa rosa de chivís ", { nombre: "COMUNIDAD SANTA ROSA DE CHIVIS" })).toBe(true);
    expect(sigueSiendoElTitular("Maderera Ucayali SAC", { nombre: "COMUNIDAD SANTA ROSA DE CHIVIS" })).toBe(false);
    expect(sigueSiendoElTitular("", { nombre: "COMUNIDAD SANTA ROSA DE CHIVIS" })).toBe(false);
  });

  it("una palabra de más o de menos ya es otro titular (revisión ADR-518: el «se parece» de duplicados los daba por iguales)", () => {
    expect(sigueSiendoElTitular("Comunidad Campesina San Juan", { nombre: "Comunidad Nativa San Juan" })).toBe(false);
    expect(sigueSiendoElTitular("Juan Pérez", { nombre: "Juan Pérez Rojas" })).toBe(false);
    expect(sigueSiendoElTitular("Comunidad Nativa Santa Rosa de Chivis", { nombre: "COMUNIDAD SANTA ROSA DE CHIVIS" })).toBe(false);
  });
});
