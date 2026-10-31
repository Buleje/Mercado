import { describe, expect, it } from "vitest";
import {
  contarGuiasTh,
  detalleChipGuiasTh,
  textoAvisoPapeles,
  textoChipGuiasTh,
} from "@/lib/forestal/aviso-guias-th";

describe("aviso de guías del Libro TH", () => {
  it("cuenta sólo las que se pueden traer", () => {
    expect(contarGuiasTh([{ lista: true }, { lista: false }, { lista: true }])).toEqual({ listas: 2, conMotivo: 1 });
    expect(contarGuiasTh([])).toEqual({ listas: 0, conMotivo: 0 });
  });
  it("singular y plural", () => {
    expect(textoChipGuiasTh(1)).toBe("1 guía de tu Libro TH por ingresar");
    expect(textoChipGuiasTh(3)).toBe("3 guías de tu Libro TH por ingresar");
    expect(textoAvisoPapeles(1)).toBe("1 guía sin sus papeles de ley");
    expect(textoAvisoPapeles(4)).toBe("4 guías sin sus papeles de ley");
  });
  it("el detalle nombra las que no se pueden traer", () => {
    expect(detalleChipGuiasTh({ listas: 1, conMotivo: 0 })).not.toMatch(/no se puede/);
    expect(detalleChipGuiasTh({ listas: 2, conMotivo: 1 })).toMatch(/1 más no se puede traer/);
    expect(detalleChipGuiasTh({ listas: 2, conMotivo: 2 })).toMatch(/2 más no se pueden traer/);
  });
});
