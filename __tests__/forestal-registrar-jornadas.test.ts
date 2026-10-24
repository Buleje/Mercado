import { describe, it, expect, vi } from "vitest";
import { registrarJornadas } from "@/lib/forestal/registrar-jornadas";
import type { Jornada } from "@/lib/forestal/consumo-en-jornadas";

/**
 * Qué queda en el libro cuando una de las diez escrituras falla (ADR-373).
 * «Falló» no es un desenlace: consumir sin declarar deja madera consumida y sin
 * producción, y hay que poder encontrarla por su N° de línea.
 */

const j = (dia: number): Jornada => ({
  dia,
  fecha: `2026-08-${String(9 + dia).padStart(2, "0")}`,
  trozaIds: [`t${dia}`],
  etiquetas: [`T-${dia}`],
  rollizaM3: 2,
  grupos: [],
  piezas: 10,
  pieTablar: 400,
  m3: 1,
});

describe("registrarJornadas", () => {
  it("con todo bien declara cada jornada", async () => {
    const r = await registrarJornadas([j(1), j(2)], {
      consumir: async (x) => ({ id: `c${x.dia}`, lineNo: 100 + x.dia }),
      declarar: async () => {},
    });
    expect(r.declaradas).toBe(2);
    expect(r.abiertas).toBe(0);
    expect(r.mensaje).toContain("2 de 2");
  });

  it("si declarar falla, nombra la corrida que quedó abierta", async () => {
    const r = await registrarJornadas([j(1), j(2)], {
      consumir: async (x) => ({ id: `c${x.dia}`, lineNo: 500 + x.dia }),
      declarar: async (_id, x) => {
        if (x.dia === 2) throw new Error("Supera el tope de rendimiento");
      },
    });
    expect(r.declaradas).toBe(1);
    expect(r.abiertas).toBe(1);
    /* El N° es lo único con lo que se encuentra esa madera después. */
    expect(r.mensaje).toContain("N° 502");
    expect(r.resultados[1]!.detalle).toContain("tope de rendimiento");
  });

  it("una jornada que no consume no bloquea a la siguiente", async () => {
    const r = await registrarJornadas([j(1), j(2)], {
      consumir: async (x) => {
        if (x.dia === 1) throw new Error("La troza T-1 ya se consumió");
        return { id: "c2", lineNo: 7 };
      },
      declarar: async () => {},
    });
    expect(r.fallidas).toBe(1);
    expect(r.declaradas).toBe(1);
  });

  it("dos fallos seguidos por el mismo motivo cortan el resto", async () => {
    const consumir = vi.fn(async () => {
      throw new Error("El mes está cerrado");
    });
    const r = await registrarJornadas([j(1), j(2), j(3), j(4)], { consumir, declarar: async () => {} });
    /* Se intentó dos veces, no cuatro: insistir sólo agrega líneas rojas iguales. */
    expect(consumir).toHaveBeenCalledTimes(2);
    expect(r.fallidas).toBe(4);
    expect(r.resultados[3]!.detalle).toContain("No se intentó");
  });

  it("motivos distintos no cortan: puede ser una troza puntual", async () => {
    const consumir = vi.fn(async (x: Jornada) => {
      throw new Error(`La troza T-${x.dia} ya se consumió`);
    });
    const r = await registrarJornadas([j(1), j(2), j(3)], { consumir, declarar: async () => {} });
    expect(consumir).toHaveBeenCalledTimes(3);
  });

  it("informa el avance para poder mostrarlo", async () => {
    const pasos: number[] = [];
    await registrarJornadas([j(1), j(2)], {
      consumir: async (x) => ({ id: `c${x.dia}`, lineNo: x.dia }),
      declarar: async () => {},
      onAvance: (hechas) => pasos.push(hechas),
    });
    expect(pasos).toEqual([0, 1, 2]);
  });
});
