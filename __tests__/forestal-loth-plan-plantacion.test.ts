/**
 * Plan de manejo tipo Plantación (ADR-459): las reglas puras del registro.
 *
 * Brandon (2-10-2026): «cuando se crea en plan de manejo en tipo plantación se
 * tiene que hacer poniendo los datos generales del registro: la especie, nombre
 * científico, cantidad de m³ […] no es necesario poner el censo». Acá se
 * prueba lo que no dibuja nada: cómo se llama cada campo según el documento, y
 * cómo una fila tipeada se vuelve una especie que el servidor acepta.
 */

import { describe, expect, it } from "vitest";
import { esTipoPlantacion, rotulosDe, siglaDePlan } from "@/lib/forestal/loth-tipos-plan";
import {
  aEspecieParaGuardar,
  conCites,
  conNombre,
  especiesRepetidas,
  filaDesdeEspecie,
  filaEnBlanco,
  filaVacia,
  numeroDe,
  problemaDeFila,
  totalM3,
  type FilaEspecie,
} from "@/components/admin/forestal/loth-plan-especies-api";

const fila = (cambios: Partial<FilaEspecie>): FilaEspecie => ({ ...filaVacia(), ...cambios });

describe("rótulos por tipo de documento", () => {
  it("una plantación habla de registro, constancia e inscripción — nunca de «autorizado»", () => {
    const r = rotulosDe("PLANTACION");
    expect(r.numero).toBe("Código del registro de plantación");
    expect(r.resolucion).toBe("N° de constancia");
    expect(r.fechaResolucion).toBe("Fecha de inscripción");
    expect(r.area).toBe("Superficie total (ha)");
    expect(r.base).toBe("registrado");
    expect(r.vigenciaOpcional).toBe(true);
    expect(Object.values(r).filter((v) => typeof v === "string").join(" ").toLowerCase()).not.toContain("autoriz");
  });

  it("un PO, PMFI, DEMA o PGMF sigue con sus rótulos de siempre", () => {
    for (const t of ["PO", "PMFI", "DEMA", "PGMF", null, "raro"]) {
      const r = rotulosDe(t);
      expect(r.numero).toBe("N° de documento");
      expect(r.resolucion).toBe("N° resolución");
      expect(r.base).toBe("autorizado");
      expect(r.vigenciaOpcional).toBe(false);
    }
  });

  it("la sigla del selector: «Plantación» y no «PLANTACION»; un tipo fuera del catálogo NO se disfraza de PO", () => {
    expect(siglaDePlan("PLANTACION")).toBe("Plantación");
    expect(siglaDePlan("PMFI")).toBe("PMFI");
    expect(siglaDePlan("POA")).toBe("POA");
    expect(siglaDePlan(null)).toBe("");
  });

  it("reconoce la plantación aunque venga en minúscula o con espacios", () => {
    expect(esTipoPlantacion(" plantacion ")).toBe(true);
    expect(esTipoPlantacion("PO")).toBe(false);
    expect(esTipoPlantacion(undefined)).toBe(false);
  });
});

describe("la fila de una especie registrada", () => {
  it("lee «120,5» y «120.5» igual; vacío es null, no 0", () => {
    expect(numeroDe("120,5")).toBe(120.5);
    expect(numeroDe(" 120.5 ")).toBe(120.5);
    expect(numeroDe("")).toBeNull();
    expect(Number.isNaN(numeroDe("abc"))).toBe(true);
  });

  it("pide especie y volumen > 0; lo demás es opcional pero, si está, tiene que tener sentido", () => {
    expect(problemaDeFila(fila({ volumenM3: "10" }))).toBe("Falta la especie");
    expect(problemaDeFila(fila({ speciesCommon: "Bolaina" }))).toBe("Falta el volumen registrado");
    expect(problemaDeFila(fila({ speciesCommon: "Bolaina", volumenM3: "0" }))).toMatch(/mayor que 0/);
    expect(problemaDeFila(fila({ speciesCommon: "Bolaina", volumenM3: "120", arboles: "4.5" }))).toMatch(/entero/);
    expect(problemaDeFila(fila({ speciesCommon: "Bolaina", volumenM3: "120", anioInstalacion: "1850" }))).toMatch(/1900/);
    expect(problemaDeFila(fila({ speciesCommon: "Bolaina", volumenM3: "120", superficieHa: "-1" }))).toMatch(/negativa/);
    expect(problemaDeFila(fila({ speciesCommon: "Bolaina", volumenM3: "120", arboles: "450", anioInstalacion: "2018", superficieHa: "12,5" }))).toBeNull();
  });

  it("una fila sin nada escrito no es error: no se manda", () => {
    expect(filaEnBlanco(filaVacia())).toBe(true);
    expect(filaEnBlanco(fila({ superficieHa: "3" }))).toBe(false);
  });

  it("se convierte a lo que acepta el servidor: números, y null donde no se escribió", () => {
    const e = aEspecieParaGuardar(fila({ speciesCommon: " Bolaina ", speciesScientific: "Guazuma crinita", volumenM3: "120,5", anioInstalacion: "2018" }));
    expect(e).toEqual({
      speciesCommon: "Bolaina",
      speciesScientific: "Guazuma crinita",
      cites: false,
      volumenAutorizadoM3: 120.5,
      arbolesAutorizados: null,
      anioInstalacion: 2018,
      superficieHa: null,
      precioVentaSoles: null,
    });
  });

  it("el total en vivo suma sólo los volúmenes válidos", () => {
    expect(totalM3([fila({ volumenM3: "120" }), fila({ volumenM3: "80" }), fila({ volumenM3: "-3" }), fila({ volumenM3: "" })])).toBe(200);
  });

  it("detecta la especie escrita dos veces (y la que ya está registrada) por su clave, no por el texto", () => {
    expect(especiesRepetidas([fila({ speciesCommon: "Bolaina" }), fila({ speciesCommon: "bolaina " })])).toEqual(["bolaina"]);
    expect(especiesRepetidas([fila({ speciesCommon: "Capirona" })], ["CAPIRONA"])).toEqual(["Capirona"]);
    expect(especiesRepetidas([fila({ speciesCommon: "Bolaina" }), fila({ speciesCommon: "Capirona" })])).toEqual([]);
  });
});

describe("el nombre científico se completa solo y queda editable", () => {
  it("al elegir «Bolaina» trae el binomio del catálogo de SERFOR", () => {
    expect(conNombre(filaVacia(), "Bolaina").speciesScientific).toBe("Guazuma crinita");
  });

  it("encuentra la especie con o sin tilde («Marupá» de la lista de fábrica vs «Marupa» de SERFOR)", () => {
    expect(conNombre(filaVacia(), "Marupá").speciesScientific).toBe("Simarouba amara");
  });

  it("el del catálogo del negocio manda sobre el de fábrica", () => {
    expect(conNombre(filaVacia(), "Bolaina", "Guazuma crinita Mart.").speciesScientific).toBe("Guazuma crinita Mart.");
  });

  it("si la persona lo escribió, cambiar el nombre común NO se lo pisa", () => {
    const escrita = { ...conNombre(filaVacia(), "Bolaina"), speciesScientific: "Guazuma sp.", cientificoAuto: false };
    expect(conNombre(escrita, "Capirona").speciesScientific).toBe("Guazuma sp.");
  });

  it("mientras lo puso el sistema, lo sigue al nombre (y lo limpia si ya no hay match)", () => {
    const auto = conNombre(filaVacia(), "Bolaina");
    expect(conNombre(auto, "Bolaina blanca").speciesScientific).toBe("");
  });

  it("CITES se prende solo con una especie listada; lo que marcó la persona no se apaga solo", () => {
    expect(conNombre(filaVacia(), "Caoba").cites).toBe(true);
    // Lo prendió el sistema por el nombre → sigue al nombre final (revisión ADR-459, H1).
    expect(conNombre(conNombre(filaVacia(), "Caoba"), "Bolaina").cites).toBe(false);
    // Lo prendió la persona → se respeta.
    expect(conNombre(conCites(filaVacia(), true), "Bolaina").cites).toBe(true);
  });
});

describe("una especie guardada vuelta fila (corregir en la tabla)", () => {
  it("copia todos los números como texto, sin inventar ceros", () => {
    const f = filaDesdeEspecie({
      id: "s1", speciesCommon: "Bolaina", speciesScientific: "Guazuma crinita", cites: false,
      volumenAutorizadoM3: "120.0000", arbolesAutorizados: 450, anioInstalacion: 2018, superficieHa: "12.5000", precioVentaSoles: null,
    });
    expect(f).toMatchObject({ uid: "s1", volumenM3: "120.0000", arboles: "450", anioInstalacion: "2018", superficieHa: "12.5000", precioM3: "" });
    const sinDatos = filaDesdeEspecie({
      id: "s2", speciesCommon: "Capirona", speciesScientific: null, cites: false,
      volumenAutorizadoM3: "80", arbolesAutorizados: null, precioVentaSoles: null,
    });
    expect(sinDatos).toMatchObject({ arboles: "", anioInstalacion: "", superficieHa: "", speciesScientific: "" });
  });
});
