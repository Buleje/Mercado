import { describe, expect, it } from "vitest";
import { datosListosDelGrupo } from "@/lib/forestal/datos-listos-grupo";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";

const t = (o: Partial<TrozaConsumible> & { id: string }): TrozaConsumible =>
  ({ especieComun: "Tornillo", volumenM3: 1, gtfNumber: "G1", permiso: "P-1", guiaRecepcionada: true, ...o }) as TrozaConsumible;

describe("datosListosDelGrupo", () => {
  it("todo en orden = listo", () => {
    const r = datosListosDelGrupo(["a", "b"], [t({ id: "a" }), t({ id: "b" })]);
    expect(r.listo).toBe(true);
    expect(r.trozas).toBe(2);
  });
  it("cuenta guías sin recepción y sin permiso por separado, sin repetir guías", () => {
    const r = datosListosDelGrupo(
      ["a", "b", "c"],
      [
        t({ id: "a", guiaRecepcionada: false, gtfNumber: "G2", volumenM3: 0.5 }),
        t({ id: "b", guiaRecepcionada: false, gtfNumber: "G2", volumenM3: 0.25 }),
        t({ id: "c", permiso: "  ", gtfNumber: "G10" }),
      ],
    );
    expect(r.sinRecepcion).toEqual({ trozas: 2, m3: 0.75, guias: ["G2"] });
    expect(r.sinPermiso).toEqual({ trozas: 1, m3: 1, guias: ["G10"] });
    expect(r.listo).toBe(false);
  });
  it("ignora trozas fuera del grupo y avisa las que el patio ya no trae", () => {
    const r = datosListosDelGrupo(["a", "x"], [t({ id: "a" }), t({ id: "z", permiso: null })]);
    expect(r.noEncontradas).toBe(1);
    expect(r.sinPermiso.trozas).toBe(0);
  });
});
