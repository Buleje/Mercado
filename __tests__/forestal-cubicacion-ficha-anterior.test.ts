import { describe, expect, it } from "vitest";
import { completarVacios, viajeAnterior, viajeDeLaPlaca } from "@/lib/forestal/cubicacion-ficha-anterior";

const g = (nombre: string, updatedAt: string, ficha?: Record<string, string>) => ({ nombre, fecha: updatedAt.slice(0, 10), updatedAt, ficha });

describe("viajeAnterior", () => {
  const lista = [
    g("vieja", "2026-10-20T10:00:00Z", { lugar: "Puerto", chofer: "Pedro" }),
    g("sin viaje", "2026-10-28T10:00:00Z", { comunidad: "CCNN San Luis" }),
    g("ayer", "2026-10-27T10:00:00Z", { lugar: " Patio ", placa: "ABC-123", cubicadoPor: "Juan" }),
  ];

  it("da la más reciente que tenga algún dato del viaje, sin espacios de más", () => {
    expect(viajeAnterior(lista)).toEqual({ nombre: "ayer", fecha: "2026-10-27", datos: { lugar: "Patio", placa: "ABC-123", cubicadoPor: "Juan" } });
  });

  it("no se copia a sí misma al actualizar", () => {
    expect(viajeAnterior(lista, "ayer")?.nombre).toBe("vieja");
  });

  it("sin datos del viaje en ninguna, no ofrece nada", () => {
    expect(viajeAnterior([g("x", "2026-10-28T10:00:00Z", { comunidad: "Y" }), g("z", "2026-10-28T09:00:00Z")])).toBeNull();
  });
});

describe("viajeDeLaPlaca", () => {
  const lista = [
    g("vieja", "2026-10-20T10:00:00Z", { placa: "ABC-123", chofer: "Pedro", transportista: "Trans Selva" }),
    g("nueva", "2026-10-27T10:00:00Z", { placa: "abc 123", chofer: "Mario" }),
  ];

  it("la misma placa escrita de otra forma trae el chofer de la última vez", () => {
    expect(viajeDeLaPlaca(lista, "ABC123")).toEqual({ chofer: "Mario" });
  });

  it("el transportista que falta sale de la ficha del camión en el Directorio", () => {
    expect(viajeDeLaPlaca(lista, "abc-123", [{ placa: "ABC123", transportistaNombre: "Trans Ucayali" }])).toEqual({ chofer: "Mario", transportista: "Trans Ucayali" });
  });

  it("el dueño-chofer: si el transportista también maneja, es el chofer", () => {
    expect(viajeDeLaPlaca([], "XYZ-999", [{ placa: "XYZ999", transportistaNombre: "Luis Ramos" }], ["Luis Ramos"])).toEqual({ transportista: "Luis Ramos", chofer: "Luis Ramos" });
  });

  it("una placa que nunca vino no trae nada", () => {
    expect(viajeDeLaPlaca(lista, "QQQ-111")).toEqual({});
    expect(viajeDeLaPlaca(lista, "")).toEqual({});
  });
});

describe("completarVacios", () => {
  it("llena sólo lo vacío y dice qué puso", () => {
    const r = completarVacios({ lugar: "Mi patio", chofer: " " }, { lugar: "Puerto", chofer: "Pedro", placa: "ABC-123" });
    expect(r.ficha).toEqual({ lugar: "Mi patio", chofer: "Pedro", placa: "ABC-123" });
    expect(r.puestos).toEqual(["placa", "chofer"]);
  });

  it("con todo escrito, no cambia nada", () => {
    const ficha = { placa: "ABC-123" };
    expect(completarVacios(ficha, { placa: "XYZ-999" })).toEqual({ ficha, puestos: [] });
  });
});
