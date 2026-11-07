import { describe, expect, it } from "vitest";
import { direccionSinLugar, planDeAutocompletado, ubigeoPorDistrito } from "@/lib/documento/autocompletar";
import { faltasDePersona, personasPorCompletar, resumenDeFaltas } from "@/lib/rrhh/fichas-por-completar";
import { faltasDeParte, partesPorCompletar, resumenDeFaltasParte } from "@/lib/forestal/fichas-por-completar";
import type { Parte, Vehiculo } from "@/lib/forestal/directorio";
import type { ColaboradorDTO } from "@/lib/rrhh/tipos";

describe("ubigeo por distrito (catálogo INEI)", () => {
  it("Puerto Bermúdez es 190306, no 190901", () => {
    expect(ubigeoPorDistrito("PASCO", "OXAPAMPA", "PUERTO BERMUDEZ")).toBe("190306");
  });
  it("tolera tildes y mayúsculas", () => {
    expect(ubigeoPorDistrito("Ucayali", "Coronel Portillo", "Callería")).toBe("250101");
  });
  it("sin departamento, resuelve si hay una sola coincidencia", () => {
    expect(ubigeoPorDistrito("", "Oxapampa", "Puerto Bermúdez")).toBe("190306");
  });
  it("sin certeza devuelve vacío en vez de inventar", () => {
    expect(ubigeoPorDistrito("PASCO", "OXAPAMPA", "NO EXISTE")).toBe("");
    expect(ubigeoPorDistrito("", "", "")).toBe("");
  });
});

describe("dirección de SUNAT", () => {
  it("quita distrito, provincia y departamento del final", () => {
    expect(direccionSinLugar("CAL. MORELLI NRO 181 INT. P-2, SAN BORJA, LIMA, LIMA", { departamento: "LIMA", provincia: "LIMA", distrito: "SAN BORJA" }))
      .toBe("CAL. MORELLI NRO 181 INT. P-2");
  });
  it("no deja la dirección vacía", () => {
    expect(direccionSinLugar("LIMA", { departamento: "LIMA" })).toBe("LIMA");
  });
});

describe("planDeAutocompletado", () => {
  it("llena lo vacío, ignora lo igual y pregunta lo distinto", () => {
    const plan = planDeAutocompletado(
      { nombre: "", direccion: "Jr. Lima 1", distrito: "Callería" },
      { nombre: "ACME SAC", direccion: "Av. Otra 5", distrito: "CALLERIA", provincia: "" },
    );
    expect(plan.llenar).toEqual({ nombre: "ACME SAC" });
    expect(plan.preguntar).toEqual([{ campo: "direccion", actual: "Jr. Lima 1", nuevo: "Av. Otra 5" }]);
  });
});

const persona = (o: Partial<ColaboradorDTO>): ColaboradorDTO =>
  ({ id: "1", nombre: "Ana", apodo: null, puesto: null, estado: "ACTIVO", fechaIngreso: null, fechaCese: null, eventual: false,
    tipoDocumento: null, documento: null, celular: null, direccion: null, contactoEmergencia: { nombre: null, celular: null },
    fotoUrl: null, ...o }) as ColaboradorDTO;

describe("fichas de personas", () => {
  it("lista lo que falta en el orden de revisión", () => {
    expect(faltasDePersona(persona({})).map((f) => f.clave)).toEqual(["documento", "celular", "fechaIngreso", "puesto", "emergencia", "foto"]);
  });
  it("una persona completa no aparece; un cesado tampoco", () => {
    const ok = persona({ documento: "•••• 5678", celular: "9", fechaIngreso: "2026-01-01", puesto: { id: "p", nombre: "Operario" }, contactoEmergencia: { nombre: "Mamá", celular: null }, fotoUrl: "x" });
    expect(personasPorCompletar([ok, persona({ id: "2", estado: "CESADO" })])).toEqual([]);
  });
  it("primer campo = primer casillero vacío; sólo foto → null", () => {
    const [a] = personasPorCompletar([persona({ documento: "1", celular: "9" })]);
    expect(a.primerCampo).toBe("fechaIngreso");
    const [b] = personasPorCompletar([persona({ documento: "1", celular: "9", fechaIngreso: "2026-01-01", puesto: { id: "p", nombre: "x" }, contactoEmergencia: { nombre: "m", celular: null } })]);
    expect(b.primerCampo).toBeNull();
  });
  it("resumen cuenta por falta, la más repetida primero", () => {
    const r = resumenDeFaltas(personasPorCompletar([persona({ id: "1" }), persona({ id: "2", documento: "1" })]));
    expect(r[0].n).toBe(2);
    expect(r.find((x) => x.clave === "documento")?.texto).toBe("1 sin DNI");
  });
});

const parte = (o: Partial<Parte>): Parte =>
  ({ id: "a", roles: ["proveedor"], nombre: "X", activo: true, docNumero: null, ubigeo: null, direccion: null, registroMtc: null, licencia: null, ...o }) as Parte;

describe("fichas del directorio por papel", () => {
  it("transportista: MTC y camión; proveedor: RUC, ubigeo y cuenta", () => {
    expect(faltasDeParte(parte({ roles: ["transportista"], docNumero: "20" })).map((f) => f.clave)).toEqual(["registroMtc", "placa"]);
    expect(faltasDeParte(parte({})).map((f) => f.clave)).toEqual(["documento", "ubigeo", "cuenta"]);
  });
  it("el camión activo del transportista cubre la placa", () => {
    const v = { id: "v", placa: "ABC123", activo: true, transportistaId: "a" } as Vehiculo;
    expect(faltasDeParte(parte({ roles: ["transportista"], docNumero: "20", registroMtc: "M1" }), [v])).toEqual([]);
  });
  it("transportistas primero y los inactivos no entran", () => {
    const lista = partesPorCompletar([parte({ id: "p", nombre: "Prov" }), parte({ id: "t", roles: ["transportista"], nombre: "Trans" }), parte({ id: "i", activo: false })]);
    expect(lista.map((x) => x.id)).toEqual(["t", "p"]);
    expect(resumenDeFaltasParte(lista).length).toBeGreaterThan(0);
  });
});
