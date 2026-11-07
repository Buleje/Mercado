/**
 * Leer la constancia del registro de plantación (ronda 3 de ADR-459): lo que
 * vuelve de la IA se tolera, se valida y se aplica al alta SIN pisar lo escrito.
 */
import { describe, expect, it } from "vitest";
import {
  JSON_SCHEMA_CONSTANCIA,
  LecturaCrudaSchema,
  aNumero,
  completarPlanDesdeConstancia,
  especiesParaAgregar,
  fechaIso,
  lecturaVacia,
  normalizarLectura,
  sumarEspeciesLeidas,
  textoDeFila,
  type LecturaConstancia,
} from "@/lib/forestal/loth-constancia-ocr";

const REGION = "Ucayali";

/** `safeParse` también en el test: si el schema dejara de tolerar algo, que falle diciendo qué. */
function crudo(x: unknown) {
  const r = LecturaCrudaSchema.safeParse(x);
  if (!r.success) throw new Error(r.error.message);
  return r.data;
}

/** Los campos del alta que toca la constancia, como arrancan (región por defecto incluida). Sin importar el componente: el test queda puro. */
const formularioVacio = () => ({
  planNumber: "", resolucionNumber: "", resolucionDate: "", titularName: "", arffs: "",
  areaHa: "", region: REGION, provincia: "", distrito: "", sector: "", notes: "",
});

function lectura(parcial: Partial<LecturaConstancia> = {}): LecturaConstancia {
  return {
    codigoRegistro: "19-SEC/REG-PLT-2025-096",
    numeroConstancia: "096-2025-GOREU",
    fechaInscripcion: "2025-03-14",
    titular: "INVERSIONES AGROFORESTALES BLAS S.A.",
    autoridad: "ATFFS Selva Central",
    superficieHa: 12.5,
    departamento: "PASCO",
    provincia: "OXAPAMPA",
    distrito: "CONSTITUCION",
    sector: "Sector Santa Rosa",
    especies: [],
    nota: "",
    ...parcial,
  };
}

describe("lo que devuelve la IA, tolerado", () => {
  it("nulls, números en texto y campos de menos no tumban la lectura", () => {
    const r = LecturaCrudaSchema.safeParse({ titular: null, superficieHa: "12,5", especies: [{ nombreComun: "Bolaina", volumenM3: "120,350" }] });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.superficieHa).toBe(12.5);
    expect(r.data.especies[0]).toMatchObject({ nombreComun: "Bolaina", volumenM3: 120.35, arboles: null });
    expect(r.data.codigoRegistro).toBeNull();
  });

  it("aNumero: una sola coma es decimal (14,853 m³ no son catorce mil); con los dos separadores manda el último", () => {
    expect(aNumero("14,853")).toBe(14.853);
    expect(aNumero("1.234,56")).toBe(1234.56);
    expect(aNumero("1,234.56")).toBe(1234.56);
    expect(aNumero("1,234,567")).toBe(1234567);
    expect(aNumero("120 m³")).toBe(120);
    expect(aNumero("—")).toBeNull();
  });

  it("fechaIso: AAAA-MM-DD o DD/MM/AAAA de una fecha que existe; si no, null", () => {
    expect(fechaIso("2025-03-14")).toBe("2025-03-14");
    expect(fechaIso("14/03/2025")).toBe("2025-03-14");
    expect(fechaIso("31/02/2025")).toBeNull();
    expect(fechaIso("14 de marzo")).toBeNull();
  });

  it("normalizar: rangos reales, filas sin nombre fuera, nada se completa", () => {
    const entrada = crudo({
      superficieHa: -3,
      especies: [
        { nombreComun: "  Bolaina  blanca ", volumenM3: 120, arboles: 450.5, anioInstalacion: 2018 },
        { nombreComun: null, nombreCientifico: null, volumenM3: 30 },
        { nombreComun: "Capirona", volumenM3: 0, anioInstalacion: 18 },
      ],
    });
    const n = normalizarLectura(entrada);
    expect(n.superficieHa).toBeNull();
    expect(n.especies).toHaveLength(2);
    expect(n.especies[0]).toMatchObject({ nombreComun: "Bolaina blanca", volumenM3: 120, arboles: null, anioInstalacion: 2018 });
    expect(n.especies[1]).toMatchObject({ nombreComun: "Capirona", volumenM3: null, anioInstalacion: null });
  });

  it("una foto de otra cosa (todo null) es una lectura vacía", () => {
    expect(lecturaVacia(normalizarLectura(crudo({})))).toBe(true);
    expect(lecturaVacia(lectura())).toBe(false);
  });

  it("el JSON Schema cumple lo que pide la salida estructurada: additionalProperties false y todo requerido", () => {
    const raiz = JSON_SCHEMA_CONSTANCIA as { properties: Record<string, { items?: { properties: object; required: string[]; additionalProperties: boolean } }>; required: string[]; additionalProperties: boolean };
    expect(raiz.additionalProperties).toBe(false);
    expect([...raiz.required].sort()).toEqual(Object.keys(raiz.properties).sort());
    const item = raiz.properties.especies.items;
    expect(item?.additionalProperties).toBe(false);
    expect([...(item?.required ?? [])].sort()).toEqual(Object.keys(item?.properties ?? {}).sort());
    /* Sin mínimos ni máximos: la API no los soporta (skill claude-api). */
    expect(JSON.stringify(JSON_SCHEMA_CONSTANCIA)).not.toMatch(/minimum|maximum|minLength|maxLength/);
  });
});

describe("completar el alta sin pisar", () => {
  it("completa lo vacío, con la ubicación oficial del padrón, y lo dice", () => {
    const { campos, completados, avisos } = completarPlanDesdeConstancia(formularioVacio(), lectura(), { regionPorDefecto: REGION });
    expect(campos).toMatchObject({
      planNumber: "19-SEC/REG-PLT-2025-096",
      resolucionNumber: "096-2025-GOREU",
      resolucionDate: "2025-03-14",
      titularName: "INVERSIONES AGROFORESTALES BLAS S.A.",
      arffs: "ATFFS Selva Central",
      areaHa: "12.5",
      region: "Pasco",
      provincia: "Oxapampa",
      sector: "Sector Santa Rosa",
    });
    /* «CONSTITUCION» entra con su nombre del padrón INEI, no en mayúsculas. */
    expect(campos.distrito).not.toBe("");
    expect(campos.distrito).not.toBe("CONSTITUCION");
    expect(completados).toEqual(expect.arrayContaining(["código del registro", "N° de constancia", "titular", "departamento", "provincia", "distrito"]));
    expect(avisos).toEqual([]);
  });

  it("lo escrito no se toca; la región elegida a mano manda y se avisa la diferencia", () => {
    const prev = { ...formularioVacio(), titularName: "Blas", planNumber: "MI-CODIGO", region: "Junín", provincia: "Satipo" };
    const { campos, completados, avisos } = completarPlanDesdeConstancia(prev, lectura(), { regionPorDefecto: REGION });
    expect(campos.titularName).toBe("Blas");
    expect(campos.planNumber).toBe("MI-CODIGO");
    expect(campos.region).toBe("Junín");
    expect(campos.provincia).toBe("Satipo");
    expect(completados).not.toContain("titular");
    expect(avisos.join(" ")).toMatch(/Pasco/);
  });

  it("un departamento que no está en el padrón no entra: se avisa", () => {
    const { campos, avisos } = completarPlanDesdeConstancia(formularioVacio(), lectura({ departamento: "Constitución", provincia: null, distrito: null }), { regionPorDefecto: REGION });
    expect(campos.region).toBe(REGION);
    expect(avisos[0]).toMatch(/no está en el padrón/);
  });

  it("lo que no se leyó (null) deja el campo como estaba", () => {
    const vacia = lectura({ codigoRegistro: null, titular: null, superficieHa: null, departamento: null, provincia: null, distrito: null, sector: null });
    const { campos, completados } = completarPlanDesdeConstancia(formularioVacio(), vacia, { regionPorDefecto: REGION });
    expect(campos.planNumber).toBe("");
    expect(campos.titularName).toBe("");
    expect(campos.region).toBe(REGION);
    expect(completados).not.toContain("titular");
  });
});

describe("especies leídas", () => {
  const bolaina = { nombreComun: "Bolaina", nombreCientifico: "Guazuma crinita", arboles: 450, volumenM3: 120, anioInstalacion: 2018, superficieHa: 12.5 };

  it("separa las ya escritas (sin tilde ni mayúsculas que valgan) de las nuevas", () => {
    const capirona = { ...bolaina, nombreComun: "Capirona", nombreCientifico: null };
    const { nuevas, existentes } = especiesParaAgregar([bolaina, capirona], ["bolaina "]);
    expect(nuevas.map((e) => e.nombreComun)).toEqual(["Capirona"]);
    expect(existentes.map((e) => e.nombreComun)).toEqual(["Bolaina"]);
  });

  it("sólo con el científico: el común sale del catálogo de SERFOR, no se inventa", () => {
    const { nuevas } = especiesParaAgregar([{ ...bolaina, nombreComun: null, nombreCientifico: "Calycophyllum spruceanum" }], []);
    expect(nuevas[0].nombreComun).toBe("Capirona");
    const { nuevas: sinCatalogo } = especiesParaAgregar([{ ...bolaina, nombreComun: null, nombreCientifico: "Especie inexistente" }], []);
    expect(sinCatalogo[0].nombreComun).toBeNull();
  });

  it("textoDeFila: los números como los escribe un input; null = vacío, nunca 0", () => {
    expect(textoDeFila(bolaina)).toEqual({ nombre: "Bolaina", cientifico: "Guazuma crinita", arboles: "450", volumenM3: "120", anioInstalacion: "2018", superficieHa: "12.5" });
    expect(textoDeFila({ ...bolaina, volumenM3: null, arboles: null }).volumenM3).toBe("");
  });

  describe("sumar a las filas del formulario", () => {
    type Fila = { uid: string; speciesCommon: string; arboles: string; volumenM3: string; anioInstalacion: string; superficieHa: string };
    let n = 0;
    const fila = (speciesCommon = "", celdas: Partial<Fila> = {}): Fila => ({ uid: `f${++n}`, speciesCommon, arboles: "", volumenM3: "", anioInstalacion: "", superficieHa: "", ...celdas });
    const nueva = (e: typeof bolaina | { nombreComun: string | null }) => fila(e.nombreComun ?? "", { volumenM3: textoDeFila({ ...bolaina, ...e }).volumenM3 });
    const enBlanco = (f: Fila) => !f.speciesCommon && !f.volumenM3;

    it("la escrita se COMPLETA en lo vacío y no se pisa lo escrito; la nueva entra; la fila en blanco se va", () => {
      const escrita = fila("Bolaina", { volumenM3: "100" });
      const r = sumarEspeciesLeidas([escrita, fila()], [bolaina, { ...bolaina, nombreComun: "Capirona", volumenM3: 80 }], nueva, enBlanco);
      expect(r.filas).toHaveLength(2);
      expect(r.filas[0]).toMatchObject({ uid: escrita.uid, volumenM3: "100", arboles: "450", anioInstalacion: "2018", superficieHa: "12.5" });
      expect(r.filas[1]).toMatchObject({ speciesCommon: "Capirona", volumenM3: "80" });
      expect(r.completadas).toEqual(["Bolaina (árboles, año, superficie)"]);
      expect(r.nuevas).toEqual(["Capirona"]);
      expect(r.uidsLeidos).toEqual([escrita.uid, r.filas[1].uid]);
    });

    it("una escrita sin nada vacío se nombra como «ya estaba» y no se marca", () => {
      const llena = fila("Bolaina", { volumenM3: "1", arboles: "1", anioInstalacion: "2000", superficieHa: "1" });
      const r = sumarEspeciesLeidas([llena], [bolaina], nueva, enBlanco);
      expect(r.filas).toEqual([llena]);
      expect(r.yaEstaban).toEqual(["Bolaina"]);
      expect(r.uidsLeidos).toEqual([]);
    });

    it("la misma especie dos veces en el PAPEL entra dos veces (el formulario avisa); no se junta en silencio", () => {
      const r = sumarEspeciesLeidas([fila()], [bolaina, { ...bolaina, volumenM3: 80, anioInstalacion: 2019 }], nueva, enBlanco);
      expect(r.filas.map((f) => f.volumenM3)).toEqual(["120", "80"]);
    });
  });
});
