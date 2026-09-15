import { describe, it, expect } from "vitest";
import {
  crearRonda, estadoDeRonda, turnoDe, puedeFirmar, registrarFirma, registrarRechazo,
  progreso, firmantePorToken, type Ronda,
} from "@/lib/documents/firma-multi";

const tres = () => crearRonda(
  [{ nombre: "Ana Torres", cargo: "Arrendataria" }, { nombre: "Luis Buleje", cargo: "Arrendador" }, { nombre: "Notaría", cargo: "Testigo" }],
  { enOrden: true, creadaPor: "qaadmin", ahora: "2026-07-27T10:00:00.000Z" },
);

describe("crear la ronda", () => {
  it("numera a los firmantes en el orden en que se cargaron", () => {
    const r = tres();
    expect(r.firmantes.map((f) => f.orden)).toEqual([1, 2, 3]);
    expect(r.firmantes.every((f) => f.estado === "pendiente")).toBe(true);
    expect(estadoDeRonda(r)).toBe("en-curso");
  });
});

describe("de quién es el turno", () => {
  it("con orden, sólo puede firmar el primero", () => {
    const r = tres();
    expect(turnoDe(r).map((f) => f.nombre)).toEqual(["Ana Torres"]);
    expect(puedeFirmar(r, "f1")).toBe(true);
    expect(puedeFirmar(r, "f2")).toBe(false);
    expect(puedeFirmar(r, "f3")).toBe(false);
  });

  it("sin orden, pueden firmar todos", () => {
    const r: Ronda = { ...tres(), enOrden: false };
    expect(turnoDe(r)).toHaveLength(3);
    expect(puedeFirmar(r, "f3")).toBe(true);
  });

  it("nadie firma en una ronda que no existe", () => {
    expect(turnoDe(null)).toEqual([]);
    expect(puedeFirmar(undefined, "f1")).toBe(false);
  });
});

describe("firmar", () => {
  it("al firmar el primero, le toca al segundo", () => {
    const r = tres();
    const { ronda, siguientes, completada } = registrarFirma(r, "f1", "2026-07-27T11:00:00.000Z");
    expect(ronda.firmantes[0].estado).toBe("firmado");
    expect(ronda.firmantes[0].firmadoEn).toBe("2026-07-27T11:00:00.000Z");
    expect(siguientes.map((f) => f.nombre)).toEqual(["Luis Buleje"]);
    expect(completada).toBe(false);
  });

  it("NO deja firmar a quien no le toca — es lo que hace válido al documento", () => {
    const r = tres();
    expect(() => registrarFirma(r, "f2")).toThrow(/todavía no es su turno/i);
  });

  it("no deja firmar dos veces", () => {
    const { ronda } = registrarFirma(tres(), "f1");
    expect(() => registrarFirma(ronda, "f1")).toThrow(/ya había firmado/i);
  });

  it("rechaza a un firmante que no es de la ronda", () => {
    expect(() => registrarFirma(tres(), "fX")).toThrow(/no es de esta ronda/i);
  });

  it("no muta la ronda original", () => {
    const r = tres();
    registrarFirma(r, "f1");
    expect(r.firmantes[0].estado).toBe("pendiente");
  });

  it("cuando firma el último, la ronda queda completada y sellada", () => {
    let r = tres();
    r = registrarFirma(r, "f1").ronda;
    r = registrarFirma(r, "f2").ronda;
    const fin = registrarFirma(r, "f3", "2026-07-28T09:00:00.000Z");
    expect(fin.completada).toBe(true);
    expect(fin.siguientes).toEqual([]);
    expect(estadoDeRonda(fin.ronda)).toBe("completada");
    expect(fin.ronda.completadaEn).toBe("2026-07-28T09:00:00.000Z");
  });
});

describe("rechazar", () => {
  it("frena la ronda: nadie más puede firmar", () => {
    const { ronda } = registrarRechazo(tres(), "f1", "El monto no es el acordado");
    expect(estadoDeRonda(ronda)).toBe("frenada");
    expect(turnoDe(ronda)).toEqual([]);
    expect(puedeFirmar(ronda, "f2")).toBe(false);
    expect(ronda.firmantes[0].motivo).toBe("El monto no es el acordado");
  });

  it("un rechazo a mitad de camino también frena, sin borrar lo firmado", () => {
    let r = tres();
    r = registrarFirma(r, "f1").ronda;
    r = registrarRechazo(r, "f2", "Falta el anexo").ronda;
    expect(estadoDeRonda(r)).toBe("frenada");
    expect(r.firmantes[0].estado).toBe("firmado");
    expect(progreso(r)).toEqual({ firmados: 1, total: 3, porcentaje: 33 });
  });
});

describe("progreso y enlaces", () => {
  it("cuenta cuántos firmaron", () => {
    expect(progreso(tres())).toEqual({ firmados: 0, total: 3, porcentaje: 0 });
    const { ronda } = registrarFirma(tres(), "f1");
    expect(progreso(ronda)).toEqual({ firmados: 1, total: 3, porcentaje: 33 });
  });

  it("encuentra al firmante por su enlace", () => {
    const r = tres();
    r.firmantes[1].token = "abc123";
    expect(firmantePorToken(r, "abc123")?.nombre).toBe("Luis Buleje");
    expect(firmantePorToken(r, "otro")).toBeNull();
  });
});
