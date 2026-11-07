/**
 * El acta del conteo del patio que llega al servidor. Revisión 26-09: una
 * fecha `2026-13-01` daba 500, `2026-02-31` se guardaba como 03-03 y `"1"` se
 * leía como el año 2001. Ahora se valida como ISO de verdad.
 */
import { describe, expect, it } from "vitest";
import { conteoPatioSchema } from "@/lib/forestal/conteo-patio-guardado";

const base = {
  v: 1,
  fecha: "2026-09-26",
  iniciadoEn: "2026-09-27T00:53:04.000Z",
  quien: "Juan",
  trozas: [],
  fotoEn: "2026-09-27T00:53:04.000Z",
  truncado: false,
  lecturas: [],
  terminadoEn: null,
};

describe("conteoPatioSchema — fechas", () => {
  it("acepta lo que manda el equipo (toISOString) y una hora con zona", () => {
    expect(conteoPatioSchema.safeParse(base).success).toBe(true);
    expect(conteoPatioSchema.safeParse({ ...base, iniciadoEn: "2026-09-26T19:53:04-05:00" }).success).toBe(true);
  });

  it("rechaza fechas que no existen o que no son ISO", () => {
    for (const fecha of ["2026-13-01", "2026-02-31", "26/09/2026"]) {
      expect(conteoPatioSchema.safeParse({ ...base, fecha }).success, fecha).toBe(false);
    }
    for (const iniciadoEn of ["1", "ayer", "2026-09-26"]) {
      expect(conteoPatioSchema.safeParse({ ...base, iniciadoEn }).success, iniciadoEn).toBe(false);
    }
  });
});
